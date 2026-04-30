'use server'

import { prisma } from '../../lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '../api/auth/[...nextauth]/route';
import { revalidatePath } from 'next/cache';
import { createAuditLog } from './audit';

export async function getQuadrasData() {
    const session = await getServerSession(authOptions);
    if (!session) throw new Error('Unauthorized');

    const mensalistas = await prisma.mensalista.findMany({
        orderBy: { nome: 'asc' }
    });

    // Pega o mês e ano atuais
    const dataAtual = new Date();
    const inicioMes = new Date(dataAtual.getFullYear(), dataAtual.getMonth(), 1);
    const fimMes = new Date(dataAtual.getFullYear(), dataAtual.getMonth() + 1, 0, 23, 59, 59);

    const pagamentosMensalistas = await prisma.pagamentoLocacao.findMany({
        where: { tipo: 'MENSALISTA', data: { gte: inicioMes, lte: fimMes } },
        include: { mensalista: true },
        orderBy: { data: 'asc' }
    });

    const pagamentosHoristas = await prisma.pagamentoLocacao.findMany({
        where: { tipo: 'HORISTA', data: { gte: inicioMes, lte: fimMes } },
        orderBy: { data: 'desc' }
    });

    // Calcular "Total a Receber (Mensalidades)"
    const totalAReceberMensalidades = pagamentosMensalistas
        .filter(p => p.status === 'PENDENTE')
        .reduce((acc, p) => acc + p.valor, 0);

    // Calcular "Total Recebido no Mês" (Mensalistas + Horistas pagos neste mês)
    const todosPagamentosMes = await prisma.pagamentoLocacao.findMany({
        where: { status: 'PAGO', data: { gte: inicioMes, lte: fimMes } }
    });
    
    // Na verdade, a métrica mais exata de recebido no mês seria pela updatedAt ou algo assim,
    // mas usando a 'data' do registro de locação simplifica.
    const totalRecebidoMes = todosPagamentosMes.reduce((acc, p) => acc + p.valor, 0);

    return JSON.parse(JSON.stringify({
        mensalistas,
        pagamentosMensalistas,
        pagamentosHoristas,
        totalAReceberMensalidades,
        totalRecebidoMes
    }));
}

export async function createMensalista(data: { nome: string, telefone?: string, dia_semana: string, horario: string, valor_mensal: number }) {
    const session = await getServerSession(authOptions);
    if (!session) throw new Error('Unauthorized');

    const mensalista = await prisma.mensalista.create({
        data: {
            nome: data.nome,
            telefone: data.telefone,
            dia_semana: data.dia_semana,
            horario: data.horario,
            valor_mensal: data.valor_mensal
        }
    });

    await createAuditLog("Criação de Mensalista", `Criou mensalista ${data.nome} para ${data.dia_semana} às ${data.horario}.`);
    
    revalidatePath('/quadras');
    return { success: true, id: mensalista.id };
}

export async function toggleMensalistaStatus(id: string, isActive: boolean) {
    const session = await getServerSession(authOptions);
    if (!session) throw new Error('Unauthorized');

    await prisma.mensalista.update({
        where: { id },
        data: { isActive }
    });

    revalidatePath('/quadras');
    return { success: true };
}

export async function deleteMensalista(id: string) {
    const session = await getServerSession(authOptions);
    if (!session) throw new Error('Unauthorized');

    // Remove pagamentos pendentes/horistas relacionados se existirem (Pode usar OnDelete Cascade depois, mas seguro fazer aqui)
    await prisma.pagamentoLocacao.deleteMany({
        where: { mensalistaId: id }
    });

    await prisma.mensalista.delete({
        where: { id }
    });

    await createAuditLog("Exclusão de Mensalista", `Excluiu o mensalista ID: ${id.substring(0,6)} e seus registros.`);

    revalidatePath('/quadras');
    return { success: true };
}

export async function gerarMensalidadesMes(ano: number, mes: number) { // mes 0-11
    const session = await getServerSession(authOptions);
    if (!session) throw new Error('Unauthorized');

    const mensalistasAtivos = await prisma.mensalista.findMany({
        where: { isActive: true }
    });

    const refData = new Date(ano, mes, 5); // Define data de vencimento no dia 5 do mes, por ex.
    
    // Verifica quais já foram gerados pra não duplicar
    const inicioMes = new Date(ano, mes, 1);
    const fimMes = new Date(ano, mes + 1, 0, 23, 59, 59);

    const gerados = await prisma.pagamentoLocacao.findMany({
        where: {
            tipo: 'MENSALISTA',
            data: { gte: inicioMes, lte: fimMes }
        }
    });

    const idsGerados = new Set(gerados.map(g => g.mensalistaId));

    let countGerados = 0;

    for (const m of mensalistasAtivos) {
        if (!idsGerados.has(m.id)) {
            // Cria Entrada Financeira PENDENTE
            const entry = await prisma.financialEntry.create({
                data: {
                    description: `Mensalidade Quadra: ${m.nome}`,
                    type: 'RECEIVABLE',
                    amount: m.valor_mensal,
                    dueDate: refData,
                    status: 'PENDING',
                    category: 'Aluguel de Campo',
                    reference: `${String(mes + 1).padStart(2, '0')}/${ano}`,
                    notes: `Gerado automaticamente via Gestão de Quadras para ${m.dia_semana} às ${m.horario}`
                }
            });

            // Cria o Pagamento de Locação vinculado
            await prisma.pagamentoLocacao.create({
                data: {
                    mensalistaId: m.id,
                    data: refData,
                    valor: m.valor_mensal,
                    tipo: 'MENSALISTA',
                    status: 'PENDENTE',
                    financialEntryId: entry.id
                }
            });

            countGerados++;
        }
    }

    if (countGerados > 0) {
        await createAuditLog("Geração de Mensalidades", `Gerou ${countGerados} faturas de mensalistas para o mês ${mes + 1}/${ano}.`);
        revalidatePath('/quadras');
        revalidatePath('/financeiro');
    }

    return { success: true, count: countGerados };
}

export async function createHorista(data: { clienteAvulso: string, data: string, hora: string, valor: number, metodo?: string }) {
    const session = await getServerSession(authOptions);
    if (!session) throw new Error('Unauthorized');

    const dataLocacao = new Date(data.data + 'T12:00:00'); // T12 para evitar bugs de fuso horario
    const refDateStr = `${String(dataLocacao.getMonth() + 1).padStart(2, '0')}/${dataLocacao.getFullYear()}`;

    // Cria a Entrada Financeira PAGA direto se já assumirmos que horista paga na hora ou pendente?
    // A logica pede: "lançar aluguéis avulsos" e depois "confirmar". Vamos criar como PENDENTE ou PAGO dependendo de um status? 
    // Vamos criar como PENDENTE e eles apertam 'Confirmar' na tabela, igual mensalidade.
    
    const entry = await prisma.financialEntry.create({
        data: {
            description: `Aluguel Avulso (Horista): ${data.clienteAvulso}`,
            type: 'RECEIVABLE',
            amount: data.valor,
            dueDate: dataLocacao,
            status: 'PENDING',
            category: 'Aluguel de Campo',
            reference: refDateStr,
            notes: `Reserva avulsa para ${data.data} às ${data.hora}`
        }
    });

    const locacao = await prisma.pagamentoLocacao.create({
        data: {
            clienteAvulso: data.clienteAvulso,
            data: dataLocacao,
            hora: data.hora,
            valor: data.valor,
            tipo: 'HORISTA',
            status: 'PENDENTE',
            financialEntryId: entry.id
        }
    });

    await createAuditLog("Reserva Avulsa Quadra", `Lançou reserva para ${data.clienteAvulso} dia ${data.data} às ${data.hora} (Valor: ${data.valor}).`);

    revalidatePath('/quadras');
    revalidatePath('/financeiro');
    return { success: true };
}

export async function confirmarPagamentoLocacao(id: string, metodoPagamento: string = 'PIX') {
    const session = await getServerSession(authOptions);
    if (!session) throw new Error('Unauthorized');

    const locacao = await prisma.pagamentoLocacao.findUnique({
        where: { id }
    });

    if (!locacao) throw new Error('Locação não encontrada');

    await prisma.$transaction(async (tx) => {
        // Marca locação como PAGO
        await tx.pagamentoLocacao.update({
            where: { id },
            data: { status: 'PAGO' }
        });

        // Atualiza a entrada financeira associada
        if (locacao.financialEntryId) {
            await tx.financialEntry.update({
                where: { id: locacao.financialEntryId },
                data: {
                    status: 'PAID',
                    paymentDate: new Date(),
                    method: metodoPagamento
                }
            });
        } else {
             // Caso não tivesse financialEntryId por algum motivo, criar agora
             const entry = await tx.financialEntry.create({
                data: {
                    description: locacao.tipo === 'MENSALISTA' ? `Mensalidade Quadra Recebida (ID: ${locacao.mensalistaId})` : `Aluguel Avulso Recebido: ${locacao.clienteAvulso}`,
                    type: 'RECEIVABLE',
                    amount: locacao.valor,
                    dueDate: locacao.data,
                    status: 'PAID',
                    category: 'Aluguel de Campo',
                    paymentDate: new Date(),
                    method: metodoPagamento,
                    reference: `${String(locacao.data.getMonth() + 1).padStart(2, '0')}/${locacao.data.getFullYear()}`
                }
            });
            await tx.pagamentoLocacao.update({
                where: { id },
                data: { financialEntryId: entry.id }
            });
        }
    });

    await createAuditLog("Confirmação de Pagamento Quadra", `Confirmou recebimento de R$ ${locacao.valor.toFixed(2)} (${locacao.tipo}).`);

    revalidatePath('/quadras');
    revalidatePath('/financeiro');
    revalidatePath('/dashboard');
    return { success: true };
}

export async function cancelarLocacao(id: string) {
    const session = await getServerSession(authOptions);
    if (!session) throw new Error('Unauthorized');

    const locacao = await prisma.pagamentoLocacao.findUnique({
        where: { id }
    });

    if (!locacao) throw new Error('Locação não encontrada');

    await prisma.$transaction(async (tx) => {
        await tx.pagamentoLocacao.delete({
            where: { id }
        });

        if (locacao.financialEntryId) {
            await tx.financialEntry.delete({
                where: { id: locacao.financialEntryId }
            });
        }
    });

    await createAuditLog("Cancelamento de Locação", `Cancelou cobrança de locação de R$ ${locacao.valor.toFixed(2)} (${locacao.tipo}).`);

    revalidatePath('/quadras');
    revalidatePath('/financeiro');
    return { success: true };
}
