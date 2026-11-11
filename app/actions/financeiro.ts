'use server'

import { prisma } from "../../lib/prisma";
import { revalidatePath } from "next/cache";
import { requirePermission } from "../../lib/auth-guard";
import { createAuditLog } from "./audit";
import { inferFinancialEntryKind } from "../../lib/financial-classification";
import { assertFinancialPeriodOpen } from "./financial-periods";

export async function getFinancialEntries() {
    await requirePermission("permFinance");

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
    await requirePermission("permFinance");

    await assertFinancialPeriodOpen(data.dueDate);

    const installmentsCount = data.installments || 1;
    const installmentGroup = installmentsCount > 1 ? `GRP-${Date.now()}-${Math.floor(Math.random() * 1000)}` : null;
    const entryKind = inferFinancialEntryKind({
        type: data.type,
        category: data.category,
        description: data.description,
        notes: data.notes,
    });
    
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
                entryKind,
                competenceDate: dueDate,
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
                entryKind,
                competenceDate: new Date(data.dueDate),
                notes: data.notes,
                method: data.method,
                reference: data.reference,
                status: 'PENDING'
            }
        });
    }

    await createAuditLog(
        "Lançamento Financeiro Criado",
        `${data.type === 'PAYABLE' ? 'Conta a pagar' : 'Conta a receber'} "${data.description}" | Valor: R$ ${data.amount.toFixed(2)} | Vencimento: ${data.dueDate} | Categoria: ${data.category} | Parcelas: ${installmentsCount}`
    );
    
    revalidatePath('/financeiro');
    return { success: true };
}

export async function updateFinancialStatus(id: string, status: 'PAID' | 'PENDING' | 'CANCELED', method?: string, paymentDate?: string) {
    await requirePermission("permFinance");

    const before = await prisma.financialEntry.findUnique({
        where: { id },
        select: { description: true, status: true, amount: true, dueDate: true }
    });
    if (before?.dueDate) await assertFinancialPeriodOpen(before.dueDate);

    const entry = await prisma.financialEntry.update({
        where: { id },
        data: {
            status,
            method: method || undefined,
            paymentDate: paymentDate ? new Date(paymentDate) : (status === 'PAID' ? new Date() : null)
        }
    });

    await createAuditLog(
        "Status Financeiro Alterado",
        `"${entry.description}" | R$ ${Number(entry.amount).toFixed(2)} | ${before?.status ?? '?'} -> ${status}${method ? ` | Método: ${method}` : ''}${paymentDate ? ` | Pagamento: ${paymentDate}` : ''}`
    );
    
    revalidatePath('/financeiro');
    return entry;
}

export async function updateFinancialEntry(id: string, data: {
    description: string;
    type: 'PAYABLE' | 'RECEIVABLE';
    amount: number;
    dueDate: string;
    category: string;
    notes?: string;
    method?: string;
    reference?: string;
}) {
    await requirePermission("permFinance");

    const before = await prisma.financialEntry.findUnique({
        where: { id }
    });
    if (before?.dueDate) await assertFinancialPeriodOpen(before.dueDate);
    await assertFinancialPeriodOpen(data.dueDate);
    const entryKind = inferFinancialEntryKind({
        type: data.type,
        category: data.category,
        description: data.description,
        notes: data.notes,
    });

    const entry = await prisma.financialEntry.update({
        where: { id },
        data: {
            description: data.description,
            type: data.type,
            amount: data.amount,
            dueDate: new Date(data.dueDate),
            category: data.category,
            entryKind,
            competenceDate: new Date(data.dueDate),
            notes: data.notes || null,
            method: data.method || null,
            reference: data.reference || null
        }
    });

    await createAuditLog(
        "Lançamento Financeiro Editado",
        `"${before?.description ?? entry.description}" -> "${entry.description}" | R$ ${Number(before?.amount ?? 0).toFixed(2)} -> R$ ${Number(entry.amount).toFixed(2)} | Vencimento: ${before?.dueDate ? new Date(before.dueDate).toLocaleDateString('sv-SE') : '?'} -> ${new Date(entry.dueDate).toLocaleDateString('sv-SE')} | Categoria: ${entry.category}`
    );

    revalidatePath('/financeiro');
    return { success: true, entry };
}

export async function deleteFinancialEntry(id: string) {
    await requirePermission("permFinance");

    const before = await prisma.financialEntry.findUnique({
        where: { id }
    });
    if (before?.dueDate) await assertFinancialPeriodOpen(before.dueDate);

    await prisma.financialEntry.delete({
        where: { id }
    });

    await createAuditLog(
        "Lançamento Financeiro Excluído",
        before
            ? `"${before.description}" | ${before.type} | R$ ${Number(before.amount).toFixed(2)} | Vencimento: ${new Date(before.dueDate).toLocaleDateString('sv-SE')} | Status: ${before.status}`
            : `ID ${id}`
    );
    
    revalidatePath('/financeiro');
    return { success: true };
}
