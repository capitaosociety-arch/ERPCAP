'use server'

import { prisma } from '../../lib/prisma';
import bcrypt from 'bcryptjs';
import { revalidatePath } from 'next/cache';
import { requirePermission } from '../../lib/auth-guard';
import { createAuditLog, formatChangeLog } from './audit';

export async function getUsers() {
    await requirePermission('permUsers');

    return await prisma.user.findMany({
        omit: { password: true },
        orderBy: { createdAt: 'desc' }
    });
}

const ALLOWED_ROLES = ['ADMIN', 'MANAGER', 'CASHIER', 'WAITER'] as const;
const ALLOWED_PERMISSION_FIELDS = new Set([
    'permDashboard', 'permPDV', 'permComandas', 'permProducts', 'permStock',
    'permCustomers', 'permFinance', 'permUsers', 'permDepot', 'permInteligencia', 'permCopilot'
]);

export async function createUser(data: any) {
    const actor = await requirePermission('permUsers');
    const role = data.role || 'WAITER';
    if (!ALLOWED_ROLES.includes(role)) {
        throw new Error('Perfil inválido.');
    }
    if (role === 'ADMIN' && actor.role !== 'ADMIN') {
        throw new Error('Apenas administradores podem criar usuários com perfil ADMIN.');
    }

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
            role,
            isActive: true
        }
    });

    await createAuditLog("Matrícula de Usuário", `Cadastrou o usuário ${data.name} (${data.role}).`);

    revalidatePath('/usuarios');
}

export async function updateUserRole(id: string, role: string) {
    const actor = await requirePermission('permUsers');
    if (!ALLOWED_ROLES.includes(role as any)) {
        throw new Error('Perfil inválido.');
    }

    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) throw new Error('Usuário não encontrado.');

    if (actor.role !== 'ADMIN' && (role === 'ADMIN' || user.role === 'ADMIN')) {
        throw new Error('Apenas administradores podem conceder ou remover o perfil ADMIN.');
    }

    await prisma.user.update({
        where: { id },
        data: { role }
    });

    await createAuditLog("Cargo de Usuário", `Alterou cargo de ${user.name}: ${user.role} → ${role}`);

    revalidatePath('/usuarios');
}

export async function updateUserDetails(id: string, name: string, email: string, phone: string, newPassword?: string) {
    await requirePermission('permUsers');

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
        let details = await formatChangeLog(oldUser, dataToUpdate, {
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
    const actor = await requirePermission('permUsers');
    if (actor.role !== 'ADMIN') {
        throw new Error('Apenas administradores podem alterar permissões de usuários.');
    }
    if (!ALLOWED_PERMISSION_FIELDS.has(field)) {
        throw new Error('Permissão inválida.');
    }

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
        permDepot: "Depósito",
        permInteligencia: "Central de Inteligência",
        permCopilot: "Copiloto IA"
    };

    const action = newValue ? "CONCEDIDA" : "REVOGADA";
    await createAuditLog("Alteração de Permissão", `Permissão [${fieldNames[field] || field}] ${action} para o usuário ${user.name}.`);

    revalidatePath('/usuarios');
}

export async function toggleUserStatus(id: string) {
    const actor = await requirePermission('permUsers');
    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) throw new Error("Usuário não encontrado.");

    if (user.role === 'ADMIN' && actor.role !== 'ADMIN') {
        throw new Error('Apenas administradores podem alterar o status de um ADMIN.');
    }

    await prisma.user.update({
        where: { id },
        data: { isActive: !user.isActive }
    });

    await createAuditLog("Status de Acesso", `Alterou status de acesso de ${user.name} para ${!user.isActive ? 'ATIVO' : 'BLOQUEADO'}.`);

    revalidatePath('/usuarios');
}

export async function deleteUser(id: string) {
    const actor = await requirePermission('permUsers');
    if (id === actor.id) {
        return { success: false, error: "Você não pode excluir o próprio usuário." };
    }

    try {
        const user = await prisma.user.findUnique({ 
            where: { id },
            include: {
                orders: true,
                cashRegisters: true
            }
        });

        if (!user) return { success: false, error: "Usuário não encontrado." };
        if (user.role === 'ADMIN' && actor.role !== 'ADMIN') {
            return { success: false, error: "Apenas administradores podem excluir um ADMIN." };
        }

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
