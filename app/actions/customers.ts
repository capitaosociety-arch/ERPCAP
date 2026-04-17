'use server'

import { prisma } from "../../lib/prisma";
import { revalidatePath } from "next/cache";
import { createAuditLog } from "./audit";

export async function upsertCustomer(data: {
    id?: string;
    name: string;
    phone: string;
    notes: string;
    subscription?: { planName: string, amount: number, dueDate: number } | null
}) {
    if (!data.name) throw new Error("Nome é obrigatório.");

    await prisma.$transaction(async (tx) => {
        let custId = data.id;

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
    return { success: true };
}

export async function paySubscription(subscriptionId: string, amount: number) {
    if (!subscriptionId) throw new Error("ID inválido");

    await prisma.$transaction(async (tx) => {
        const sub = await tx.subscription.findUnique({ where: { id: subscriptionId }});
        if (!sub) throw new Error("Assinatura não existe");

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
    return { success: true };
}

export async function createRental(customerId: string, resource: string, date: string, startHour: string, endHour: string, amount: number) {
    if (!customerId || !resource) throw new Error("Faltam dados do agendamento.");

    const [sy, sm, sd] = date.split('-').map(Number);
    const [sh, smin] = startHour.split(':').map(Number);
    const [eh, emin] = endHour.split(':').map(Number);

    const startTime = new Date(sy, sm-1, sd, sh, smin);
    const endTime = new Date(sy, sm-1, sd, eh, emin);

    await prisma.rental.create({
        data: { customerId, resource, startTime, endTime, totalAmount: amount, status: 'PENDING' }
    });

    revalidatePath("/clientes");
    return { success: true };
}

export async function deleteCustomer(id: string) {
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
