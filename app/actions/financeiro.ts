'use server'

import { prisma } from "../../lib/prisma";
import { revalidatePath } from "next/cache";

export async function getFinancialEntries() {
    return await prisma.financialEntry.findMany({
        orderBy: { dueDate: 'asc' }
    });
}

export async function createFinancialEntry(data: {
    description: string;
    type: 'PAYABLE' | 'RECEIVABLE';
    amount: number;
    dueDate: string;
    category: string;
    notes?: string;
    method?: string;
    reference?: string;
    installments?: number;
}) {
    const installmentsCount = data.installments || 1;
    const installmentGroup = installmentsCount > 1 ? `GRP-${Date.now()}-${Math.floor(Math.random() * 1000)}` : null;
    
    // Se parcelado, criar N lançamentos
    if (installmentsCount > 1) {
        const baseDate = new Date(data.dueDate);
        const entries = [];
        
        for (let i = 1; i <= installmentsCount; i++) {
            const dueDate = new Date(baseDate);
            dueDate.setMonth(baseDate.getMonth() + (i - 1));
            
            entries.push({
                description: `${data.description} (${i}/${installmentsCount})`,
                type: data.type,
                amount: data.amount / installmentsCount,
                dueDate: dueDate,
                category: data.category,
                notes: data.notes,
                method: data.method,
                reference: data.reference,
                installmentGroup,
                installmentNum: i,
                installmentTotal: installmentsCount,
                status: 'PENDING'
            });
        }
        
        await prisma.financialEntry.createMany({
            data: entries
        });
    } else {
        await prisma.financialEntry.create({
            data: {
                description: data.description,
                type: data.type,
                amount: data.amount,
                dueDate: new Date(data.dueDate),
                category: data.category,
                notes: data.notes,
                method: data.method,
                reference: data.reference,
                status: 'PENDING'
            }
        });
    }
    
    revalidatePath('/financeiro');
    return { success: true };
}

export async function updateFinancialStatus(id: string, status: 'PAID' | 'PENDING' | 'CANCELED', method?: string, paymentDate?: string) {
    const entry = await prisma.financialEntry.update({
        where: { id },
        data: {
            status,
            method: method || undefined,
            paymentDate: paymentDate ? new Date(paymentDate) : (status === 'PAID' ? new Date() : null)
        }
    });
    
    revalidatePath('/financeiro');
    return entry;
}

export async function deleteFinancialEntry(id: string) {
    await prisma.financialEntry.delete({
        where: { id }
    });
    
    revalidatePath('/financeiro');
    return { success: true };
}
