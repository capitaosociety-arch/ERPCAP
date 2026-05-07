'use server'

import { prisma } from "../../lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "../api/auth/[...nextauth]/route";
import { revalidatePath } from "next/cache";

export async function createAuditLog(action: string, details?: string) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user) return { success: false, error: "Usuário não autenticado" };

        const userId = (session.user as any).id;
        if (!userId) return { success: false, error: "ID do usuário não encontrado na sessão" };

        await prisma.auditLog.create({
            data: {
                userId,
                action,
                details: details || "Sem detalhes adicionais"
            }
        });

        return { success: true };
    } catch (error) {
        console.error("ERRO_CREATE_AUDIT_LOG:", error);
        return { success: false, error: "Falha ao registrar log" };
    }
}

// Utilitário para gerar texto de mudanças
export async function formatChangeLog(oldData: any, newData: any, fields: Record<string, string>) {
    const changes: string[] = [];
    
    for (const key in fields) {
        const oldValue = oldData[key];
        const newValue = newData[key];

        if (oldValue !== newValue) {
            changes.push(`${fields[key]}: "${oldValue ?? 'vazio'}" → "${newValue ?? 'vazio'}"`);
        }
    }

    return changes.length > 0 ? changes.join(" | ") : "Nenhuma alteração detectada";
}

export async function getAuditLogs() {
    try {
        const logs = await prisma.auditLog.findMany({
            orderBy: { timestamp: 'desc' },
            take: 50,
            include: {
                user: {
                    select: {
                        name: true,
                        role: true
                    }
                }
            }
        });
        return { success: true, logs: JSON.parse(JSON.stringify(logs)) };
    } catch (error) {
        console.error("ERRO_GET_AUDIT_LOGS:", error);
        return { success: false, error: "Falha ao buscar logs" };
    }
}
