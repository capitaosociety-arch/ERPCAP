'use server'

import { prisma } from "../../lib/prisma";
import { revalidatePath } from "next/cache";

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
