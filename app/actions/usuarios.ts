'use server'

import { prisma } from '../../lib/prisma';
import bcrypt from 'bcryptjs';
import { revalidatePath } from 'next/cache';
import { createAuditLog, formatChangeLog } from './audit';

export async function getUsers() {
    return await prisma.user.findMany({
        orderBy: { createdAt: 'desc' }
    });
}

export async function createUser(data: any) {
    if (!data.name || !data.email || !data.password) {
        throw new Error("Preencha os campos obrigatórios (Nome, Email, Senha).");
    }

    const exists = await prisma.user.findUnique({ where: { email: data.email } });
    if (exists) {
        throw new Error("Este e-mail já está em uso por outro usuário.");
    }

    const hashedPassword = await bcrypt.hash(data.password, 10);

    await prisma.user.create({
        data: {
            name: data.name,
            email: data.email,
            phone: data.phone || null,
            password: hashedPassword,
            role: data.role || 'WAITER',
            isActive: true
        }
    });

    await createAuditLog("Matrícula de Usuário", `Cadastrou o usuário ${data.name} (${data.role}).`);

    revalidatePath('/usuarios');
}

export async function updateUserRole(id: string, role: string) {
    const user = await prisma.user.findUnique({ where: { id } });
    await prisma.user.update({
        where: { id },
        data: { role }
    });

    if (user) {
        await createAuditLog("Cargo de Usuário", `Alterou cargo de ${user.name}: ${user.role} → ${role}`);
    }

    revalidatePath('/usuarios');
}

export async function updateUserDetails(id: string, name: string, email: string, phone: string, newPassword?: string) {
    const oldUser = await prisma.user.findUnique({ where: { id } });
    const dataToUpdate: any = { name, email, phone };
    
    if (newPassword && newPassword.trim().length > 0) {
        dataToUpdate.password = await bcrypt.hash(newPassword, 10);
    }

    await prisma.user.update({
        where: { id },
        data: dataToUpdate
    });

    if (oldUser) {
        let details = formatChangeLog(oldUser, dataToUpdate, {
            name: "Nome",
            email: "E-mail",
            phone: "Telefone"
        });
        if (newPassword) details += " | Senha: Alterada";
        await createAuditLog("Edição de Perfil", `Alterou dados de ${oldUser.name}: ${details}`);
    }

    revalidatePath('/usuarios');
}

export async function toggleUserPermission(id: string, field: string) {
    const user = await prisma.user.findUnique({ where: { id } }) as any;
    if (!user) throw new Error("Usuário não encontrado.");
    
    const newValue = !user[field];
    await prisma.user.update({
        where: { id },
        data: { [field]: newValue }
    });

    const fieldNames: any = {
        permDashboard: "Dashboard",
        permPDV: "PDV/Vendas",
        permComandas: "Comandas",
        permProducts: "Produtos",
        permStock: "Estoque",
        permCustomers: "Clientes",
        permFinance: "Financeiro",
        permUsers: "Usuários",
        permDepot: "Depósito"
    };

    const action = newValue ? "CONCEDIDA" : "REVOGADA";
    await createAuditLog("Alteração de Permissão", `Permissão [${fieldNames[field] || field}] ${action} para o usuário ${user.name}.`);

    revalidatePath('/usuarios');
}

export async function toggleUserStatus(id: string) {
    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) throw new Error("Usuário não encontrado.");

    await prisma.user.update({
        where: { id },
        data: { isActive: !user.isActive }
    });

    await createAuditLog("Status de Acesso", `Alterou status de acesso de ${user.name} para ${!user.isActive ? 'ATIVO' : 'BLOQUEADO'}.`);

    revalidatePath('/usuarios');
}

export async function deleteUser(id: string) {
    try {
        const user = await prisma.user.findUnique({ 
            where: { id },
            include: {
                orders: true,
                cashRegisters: true
            }
        });

        if (!user) return { success: false, error: "Usuário não encontrado." };

        // Check if user has related records that would prevent deletion (integrity)
        if (user.orders.length > 0 || user.cashRegisters.length > 0) {
            return { 
                success: false, 
                error: "Não é possível excluir este usuário pois ele possui históricos de pedidos ou registros de caixa vinculados. Recomenda-se apenas desativar o acesso." 
            };
        }

        await prisma.user.delete({
            where: { id }
        });
        
        revalidatePath('/usuarios');
        return { success: true };
    } catch (error: any) {
        console.error("ERRO_DELETE_USER:", error);
        return { success: false, error: "Erro ao excluir usuário: " + (error.message || "Erro desconhecido") };
    }
}
