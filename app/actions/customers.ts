'use server'

import { prisma } from "../../lib/prisma";
import { revalidatePath } from "next/cache";
import { requirePermission } from "../../lib/auth-guard";
import { buildRentalWindow, formatRentalPeriod } from "../../lib/rental-time";
import { createAuditLog } from "./audit";
import { recalcScore } from "./score";

function validateRentalStatus(status?: string) {
    if (status && !['PENDING', 'CONFIRMED', 'PAID', 'CANCELED', 'NO_SHOW'].includes(status)) {
        throw new Error("Status invalido.");
    }
    return status || 'PENDING';
}

function validateRentalAmount(amount: number) {
    if (!Number.isFinite(amount) || amount < 0) throw new Error("Valor da reserva invalido.");
    return amount;
}

function nextDueDateForDay(day: number): Date {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const candidate = new Date(now.getFullYear(), now.getMonth(), day);
    if (candidate < today) candidate.setMonth(candidate.getMonth() + 1);
    return candidate;
}

async function assertRentalAvailable(
    tx: any,
    resource: string,
    startTime: Date,
    endTime: Date,
    excludeIds: string[] = []
) {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${resource}))`;
    const conflict = await tx.rental.findFirst({
        where: {
            resource,
            status: { not: 'CANCELED' },
            startTime: { lt: endTime },
            endTime: { gt: startTime },
            ...(excludeIds.length > 0 ? { id: { notIn: excludeIds } } : {}),
        },
        select: { id: true, resource: true, startTime: true, endTime: true },
    });
    if (conflict) {
        throw new Error(`Horario indisponivel para ${resource}: ${formatRentalPeriod(conflict.startTime, conflict.endTime)}.`);
    }
}

export type CustomerDossierRental = {
    id?: string;
    resource: string;
    date: string;
    start: string;
    end: string;
    amount: number;
    status?: string;
};

export type CustomerDossierPaymentUpdate = {
    id: string;
    amount: number;
    paymentDate?: string;
};

export type CustomerDossierInput = {
    idempotencyKey: string;
    customer: {
        id?: string;
        name: string;
        phone: string;
        notes: string;
        subscription?: { planName: string; amount: number; dueDate: number } | null;
    };
    rentals: CustomerDossierRental[];
    rentalDeleteIds: string[];
    paymentUpdates: CustomerDossierPaymentUpdate[];
    paymentDeleteIds: string[];
    subscriptionPaymentAmount?: number | null;
};

export async function saveCustomerDossier(data: CustomerDossierInput) {
    const actor = await requirePermission("permCustomers");
    const idempotencyKey = String(data.idempotencyKey || '').trim();
    if (!/^[A-Za-z0-9-]{16,100}$/.test(idempotencyKey)) {
        throw new Error("Chave idempotente invalida.");
    }
    const idempotencyMarker = `dossie-idempotency:${idempotencyKey}`;

    const name = String(data.customer?.name || '').trim();
    if (!name) throw new Error("Nome e obrigatorio.");

    const subscription = data.customer.subscription;
    if (subscription) {
        if (!subscription.planName?.trim()) throw new Error("Nome do plano e obrigatorio.");
        if (!Number.isFinite(subscription.amount) || subscription.amount < 0) throw new Error("Valor da mensalidade invalido.");
        if (!Number.isInteger(subscription.dueDate) || subscription.dueDate < 1 || subscription.dueDate > 31) {
            throw new Error("Dia de vencimento invalido.");
        }
    }

    let customerId = data.customer.id;
    let alreadyApplied = false;
    const auditActions: string[] = [];

    await prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${idempotencyMarker}))`;
        const prior = await tx.auditLog.findFirst({
            where: {
                userId: actor.id,
                action: 'DossieIdempotency',
                details: idempotencyMarker,
            },
            select: { id: true },
        });
        if (prior) {
            alreadyApplied = true;
            return;
        }

        if (customerId) {
            const existing = await tx.customer.findUnique({ where: { id: customerId }, select: { id: true } });
            if (!existing) throw new Error("Cliente nao encontrado.");
            await tx.customer.update({
                where: { id: customerId },
                data: { name, phone: data.customer.phone || '', notes: data.customer.notes || '' },
            });
            auditActions.push('dados cadastrais');
        } else {
            const created = await tx.customer.create({
                data: { name, phone: data.customer.phone || '', notes: data.customer.notes || '' },
            });
            customerId = created.id;
            auditActions.push('cadastro');
        }

        if (subscription) {
            const existingSubscription = await tx.subscription.findUnique({ where: { customerId: customerId! } });
            const dueDayChanged = !!existingSubscription && existingSubscription.dueDate !== subscription.dueDate;
            let nextDue = existingSubscription?.nextDueDate;
            if (!nextDue || dueDayChanged) {
                nextDue = nextDueDateForDay(subscription.dueDate);
            }
            await tx.subscription.upsert({
                where: { customerId: customerId! },
                update: {
                    planName: subscription.planName.trim(),
                    amount: subscription.amount,
                    dueDate: subscription.dueDate,
                    ...(dueDayChanged ? { nextDueDate: nextDue } : {}),
                },
                create: {
                    customerId: customerId!,
                    planName: subscription.planName.trim(),
                    amount: subscription.amount,
                    dueDate: subscription.dueDate,
                    nextDueDate: nextDue,
                },
            });
            auditActions.push('plano/mensalidade');
        }

        const existingRentals = await tx.rental.findMany({
            where: { customerId: customerId! },
            select: { id: true, resource: true, status: true, startTime: true, endTime: true, totalAmount: true },
        });
        const existingById = new Map(existingRentals.map((rental: any) => [rental.id, rental]));
        const deleteIds = Array.from(new Set((data.rentalDeleteIds || []).map(String)));

        const preparedRentals = (data.rentals || []).map((rental) => {
            const resource = String(rental.resource || '').trim();
            if (!resource) throw new Error("Informe o espaco/mesa da reserva.");
            const status = validateRentalStatus(rental.status);
            const amount = validateRentalAmount(Number(rental.amount));
            const { startTime, endTime } = buildRentalWindow(rental.date, rental.start, rental.end);
            if (endTime <= startTime) throw new Error("Horario final invalido.");
            if (rental.id && !existingById.has(rental.id)) throw new Error("Reserva nao pertence a este cliente.");
            const previous: any = rental.id ? existingById.get(rental.id) : null;
            const timeChanged = !previous
                || resource !== String(previous.resource || '')
                || startTime.getTime() !== new Date(previous.startTime).getTime()
                || endTime.getTime() !== new Date(previous.endTime).getTime();
            const changed = timeChanged || !previous || status !== previous.status || amount !== Number(previous.totalAmount);
            return { ...rental, resource, status, amount, startTime, endTime, changed, timeChanged };
        });
        const changedIds = preparedRentals
            .filter((rental) => rental.timeChanged && rental.id)
            .map((rental) => rental.id!);
        const excludedIds = [...changedIds, ...deleteIds];

        const conflictsToCheck = preparedRentals
            .filter((rental) => rental.timeChanged && rental.status !== 'CANCELED')
            .sort((a, b) => a.resource.localeCompare(b.resource));
        for (const rental of conflictsToCheck) {
            await assertRentalAvailable(tx, rental.resource, rental.startTime, rental.endTime, excludedIds);
        }
        for (let i = 0; i < preparedRentals.length; i++) {
            for (let j = i + 1; j < preparedRentals.length; j++) {
                const a = preparedRentals[i];
                const b = preparedRentals[j];
                if ((!a.timeChanged && !b.timeChanged) || a.status === 'CANCELED' || b.status === 'CANCELED' || a.resource !== b.resource) continue;
                if (a.startTime < b.endTime && a.endTime > b.startTime) {
                    throw new Error(`Conflito de horario entre reservas de ${a.resource}.`);
                }
            }
        }

        for (const id of deleteIds) {
            if (!existingById.has(id)) throw new Error("Reserva para exclusao nao pertence a este cliente.");
            await tx.rental.delete({ where: { id } });
        }
        for (const rental of preparedRentals) {
            if (rental.id) {
                if (!rental.changed) continue;
                const previous = existingById.get(rental.id)!;
                await tx.rental.update({
                    where: { id: rental.id },
                    data: {
                        resource: rental.resource,
                        startTime: rental.startTime,
                        endTime: rental.endTime,
                        totalAmount: rental.amount,
                        status: rental.status,
                        cancelledAt: rental.status === 'CANCELED' ? (previous.status === 'CANCELED' ? undefined : new Date()) : null,
                    },
                });
            } else {
                await tx.rental.create({
                    data: {
                        customerId: customerId!,
                        resource: rental.resource,
                        startTime: rental.startTime,
                        endTime: rental.endTime,
                        totalAmount: rental.amount,
                        status: rental.status,
                        cancelledAt: rental.status === 'CANCELED' ? new Date() : null,
                    },
                });
            }
        }
        if (preparedRentals.length || deleteIds.length) auditActions.push('reservas');

        const subscriptionRow = await tx.subscription.findUnique({ where: { customerId: customerId! } });
        const allowedPaymentIds = new Set(
            subscriptionRow
                ? (await tx.subscriptionPayment.findMany({ where: { subscriptionId: subscriptionRow.id }, select: { id: true } })).map((p: any) => p.id)
                : []
        );
        for (const payment of data.paymentUpdates || []) {
            if (!allowedPaymentIds.has(payment.id)) throw new Error("Pagamento nao pertence a este cliente.");
            if (!Number.isFinite(payment.amount) || payment.amount <= 0) throw new Error("Valor do pagamento invalido.");
            await tx.subscriptionPayment.update({
                where: { id: payment.id },
                data: {
                    amount: payment.amount,
                    paymentDate: payment.paymentDate ? new Date(payment.paymentDate) : undefined,
                },
            });
        }
        for (const id of Array.from(new Set(data.paymentDeleteIds || []))) {
            if (!allowedPaymentIds.has(id)) throw new Error("Pagamento para exclusao nao pertence a este cliente.");
            await tx.subscriptionPayment.delete({ where: { id } });
        }
        if ((data.paymentUpdates || []).length || (data.paymentDeleteIds || []).length) auditActions.push('historico de mensalidades');

        if (data.subscriptionPaymentAmount != null) {
            if (!subscriptionRow) throw new Error("O cliente nao possui assinatura para pagamento.");
            if (!Number.isFinite(data.subscriptionPaymentAmount) || data.subscriptionPaymentAmount <= 0) {
                throw new Error("Valor do pagamento da mensalidade invalido.");
            }
            await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`subscription-payment:${subscriptionRow.id}`}))`;
            const currentSubscription = await tx.subscription.findUnique({ where: { id: subscriptionRow.id } });
            if (!currentSubscription) throw new Error("Assinatura nao encontrada.");
            const existingPayment = await tx.subscriptionPayment.findFirst({
                where: {
                    subscriptionId: currentSubscription.id,
                    referenceMonth: currentSubscription.nextDueDate,
                },
                select: { id: true },
            });
            if (existingPayment) throw new Error("Ja existe pagamento registrado para este vencimento.");
            await tx.subscriptionPayment.create({
                data: {
                    subscriptionId: currentSubscription.id,
                    amount: data.subscriptionPaymentAmount,
                    referenceMonth: currentSubscription.nextDueDate,
                },
            });
            const newDueDate = new Date(currentSubscription.nextDueDate);
            newDueDate.setMonth(newDueDate.getMonth() + 1);
            await tx.subscription.update({
                where: { id: currentSubscription.id },
                data: { nextDueDate: newDueDate },
            });
            auditActions.push('pagamento de mensalidade');
        }

        await tx.auditLog.create({
            data: {
                userId: actor.id,
                action: 'DossieIdempotency',
                details: idempotencyMarker,
            },
        });
    });

    if (alreadyApplied) {
        return { success: true, customerId, idempotent: true };
    }

    revalidatePath("/clientes");
    if (customerId) await recalcScore(customerId).catch(() => {});
    if (auditActions.length > 0) {
        await createAuditLog("Dossie do Cliente", `Cliente ${name}: ${auditActions.join(', ')}.`).catch(() => {});
    }
    return { success: true, customerId };
}

export async function upsertCustomer(data: {
    id?: string;
    name: string;
    phone: string;
    notes: string;
    subscription?: { planName: string, amount: number, dueDate: number } | null
}) {
    await requirePermission("permCustomers");

    if (!data.name) throw new Error("Nome é obrigatório.");

    let custId = data.id;

    await prisma.$transaction(async (tx) => {

        if (custId) {
            await tx.customer.update({
                where: { id: custId },
                data: { name: data.name, phone: data.phone, notes: data.notes }
            });
        } else {
            const newCust = await tx.customer.create({
                data: { name: data.name, phone: data.phone, notes: data.notes }
            });
            custId = newCust.id;
        }

        if (data.subscription) {
            const nextDue = new Date();
            nextDue.setDate(data.subscription.dueDate);
            if (nextDue < new Date()) {
                nextDue.setMonth(nextDue.getMonth() + 1);
            }

            await tx.subscription.upsert({
                where: { customerId: custId },
                update: {
                    planName: data.subscription.planName,
                    amount: data.subscription.amount,
                    dueDate: data.subscription.dueDate
                },
                create: {
                    customerId: custId,
                    planName: data.subscription.planName,
                    amount: data.subscription.amount,
                    dueDate: data.subscription.dueDate,
                    nextDueDate: nextDue
                }
            })
        }
    });

    revalidatePath("/clientes");
    if (custId) await recalcScore(custId).catch(() => {});
    return { success: true };
}

export async function createCustomerQuick(name: string) {
    // Usado também pelas Comandas/PDV para cadastro rápido de cliente.
    await requirePermission(["permCustomers", "permComandas", "permPDV"]);

    if (!name || !name.trim()) throw new Error("Nome é obrigatório.");

    const customer = await prisma.customer.create({
        data: { name: name.trim(), phone: "", notes: "" }
    });

    revalidatePath("/clientes");
    revalidatePath("/mesas");
    return { success: true, customer: { id: customer.id, name: customer.name } };
}

export async function paySubscription(subscriptionId: string, amount: number) {
    await requirePermission("permCustomers");

    if (!subscriptionId) throw new Error("ID inválido");

    let customerId: string | null = null;

    await prisma.$transaction(async (tx) => {
        const sub = await tx.subscription.findUnique({ where: { id: subscriptionId }});
        if (!sub) throw new Error("Assinatura não existe");
        customerId = sub.customerId;

        const refMonth = new Date(sub.nextDueDate);

        await tx.subscriptionPayment.create({
            data: { subscriptionId, amount, referenceMonth: refMonth }
        });

        const newDueDate = new Date(sub.nextDueDate);
        newDueDate.setMonth(newDueDate.getMonth() + 1);

        await tx.subscription.update({
            where: { id: subscriptionId },
            data: { nextDueDate: newDueDate }
        });
    });

    revalidatePath("/clientes");
    if (customerId) await recalcScore(customerId).catch(() => {});
    return { success: true };
}

export async function createRental(customerId: string, resource: string, date: string, startHour: string, endHour: string, amount: number) {
    await requirePermission("permCustomers");

    if (!customerId || !resource) throw new Error("Faltam dados do agendamento.");

    const validAmount = validateRentalAmount(Number(amount));
    const { startTime, endTime } = buildRentalWindow(date, startHour, endHour);

    await prisma.$transaction(async (tx) => {
        await assertRentalAvailable(tx, resource.trim(), startTime, endTime);
        await tx.rental.create({
            data: { customerId, resource: resource.trim(), startTime, endTime, totalAmount: validAmount, status: 'PENDING' }
        });
    });

    revalidatePath("/clientes");
    await recalcScore(customerId).catch(() => {});
    return { success: true };
}

export async function setRentalStatus(rentalId: string, status: string) {
    await requirePermission("permCustomers");

    if (!rentalId) throw new Error("ID inválido");

    const allowed = ['PENDING', 'CONFIRMED', 'PAID', 'CANCELED', 'NO_SHOW'];
    if (!allowed.includes(status)) throw new Error("Status inválido.");

    const rental = await prisma.rental.findUnique({ where: { id: rentalId } });
    if (!rental) throw new Error("Reserva não encontrada.");

    await prisma.rental.update({
        where: { id: rentalId },
        data: {
            status,
            cancelledAt: status === 'CANCELED' ? new Date() : null
        }
    });

    revalidatePath("/clientes");
    if (rental.customerId) await recalcScore(rental.customerId).catch(() => {});
    return { success: true };
}

export async function updateSubscriptionPayment(paymentId: string, amount: number, paymentDate?: string) {
    await requirePermission("permCustomers");

    if (!paymentId) throw new Error("ID inválido");

    await prisma.subscriptionPayment.update({
        where: { id: paymentId },
        data: {
            amount,
            paymentDate: paymentDate ? new Date(paymentDate) : undefined
        }
    });

    revalidatePath("/clientes");
    const p = await prisma.subscriptionPayment.findUnique({
        where: { id: paymentId },
        include: { subscription: { select: { customerId: true } } }
    });
    if (p?.subscription?.customerId) await recalcScore(p.subscription.customerId).catch(() => {});
    return { success: true };
}

export async function deleteSubscriptionPayment(paymentId: string) {
    await requirePermission("permCustomers");

    if (!paymentId) throw new Error("ID inválido");

    const payment = await prisma.subscriptionPayment.findUnique({
        where: { id: paymentId },
        include: { subscription: { select: { customerId: true } } }
    });

    await prisma.subscriptionPayment.delete({
        where: { id: paymentId }
    });

    revalidatePath("/clientes");
    if (payment?.subscription?.customerId) await recalcScore(payment.subscription.customerId).catch(() => {});
    return { success: true };
}

export async function updateRental(rentalId: string, resource: string, date: string, startHour: string, endHour: string, amount: number) {
    await requirePermission("permCustomers");

    if (!rentalId || !resource) throw new Error("Faltam dados do agendamento.");

    const validAmount = validateRentalAmount(Number(amount));
    const { startTime, endTime } = buildRentalWindow(date, startHour, endHour);

    await prisma.$transaction(async (tx) => {
        const current = await tx.rental.findUnique({ where: { id: rentalId }, select: { id: true } });
        if (!current) throw new Error("Reserva nao encontrada.");
        await assertRentalAvailable(tx, resource.trim(), startTime, endTime, [rentalId]);
        await tx.rental.update({
            where: { id: rentalId },
            data: { resource: resource.trim(), startTime, endTime, totalAmount: validAmount }
        });
    });

    revalidatePath("/clientes");
    const r = await prisma.rental.findUnique({ where: { id: rentalId }, select: { customerId: true } });
    if (r?.customerId) await recalcScore(r.customerId).catch(() => {});
    return { success: true };
}

export async function deleteRental(rentalId: string) {
    await requirePermission("permCustomers");

    if (!rentalId) throw new Error("ID inválido");

    const rental = await prisma.rental.findUnique({ where: { id: rentalId } });
    await prisma.rental.delete({
        where: { id: rentalId }
    });

    revalidatePath("/clientes");
    if (rental?.customerId) await recalcScore(rental.customerId).catch(() => {});
    return { success: true };
}

export async function deleteCustomer(id: string) {
    await requirePermission("permCustomers");

    if (!id) return { success: false, error: "ID inválido." };

    try {
        const customer = await prisma.customer.findUnique({
            where: { id },
            include: {
                orders: true,
                services: true
            }
        });

        if (!customer) return { success: false, error: "Cliente não encontrado." };

        // Integridade: Não excluir se houver pedidos ou serviços
        if (customer.orders.length > 0 || customer.services.length > 0) {
            return {
                success: false,
                error: "Não é possível excluir este cliente pois ele possui histórico de pedidos ou serviços vinculados. Recomendamos apenas desativar o registro para manter a integridade financeira."
            };
        }

        await prisma.customer.delete({
            where: { id }
        });

        // Registrar Log de Auditoria
        await createAuditLog("Exclusão de Cliente", `O cliente ${customer.name} foi removido permanentemente.`);

        revalidatePath("/clientes");
        return { success: true };
    } catch (error: any) {
        console.error("ERRO_DELETE_CUSTOMER:", error);
        return { success: false, error: "Erro ao excluir cliente: " + (error.message || "Erro desconhecido") };
    }
}
