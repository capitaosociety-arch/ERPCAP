'use server'

// ===========================================================================
// Ações da Inteligência de Ocupação (página /ocupacao) e apoio às decisões
// de preço do Copiloto.
//
// Segurança:
//  - Nenhuma ação altera preço sem ADMIN (role === 'ADMIN').
//  - Alterações de preço exigem ação explícita do administrador e geram
//    registro em PriceChange (histórico de decisões / elasticidade).
//  - Nenhuma ação aceita SQL livre.
// ===========================================================================

import { prisma } from '../../lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '../api/auth/[...nextauth]/route';
import { createAuditLog } from './audit';
import {
  carregarDadosOcupacao,
  computarReporte,
  analisarElasticidade,
  medirFaixa,
  type CampoId,
  type OcupacaoConfig
} from '../../lib/ocupacao';
import { buildPeriods, round2, type PeriodoKey } from '../../lib/analytics';

const dayMs = 24 * 60 * 60 * 1000;

async function requireAdmin(): Promise<{ id: string; name: string; role: string } | null> {
  const session = await getServerSession(authOptions) as { user?: { id?: string } } | null;
  if (!session?.user?.id) return null;
  const user = await prisma.user.findUnique({ where: { id: session.user.id } });
  if (!user || user.role !== 'ADMIN') return null;
  return { id: user.id, name: user.name, role: user.role };
}

async function requireAccess(): Promise<{ id: string; name: string; role: string; permInteligencia: boolean } | null> {
  const session = await getServerSession(authOptions) as { user?: { id?: string } } | null;
  if (!session?.user?.id) return null;
  const user = await prisma.user.findUnique({ where: { id: session.user.id } });
  if (!user) return null;
  if (user.role !== 'ADMIN' && !user.permInteligencia) return null;
  return { id: user.id, name: user.name, role: user.role, permInteligencia: user.permInteligencia };
}

export interface FiltrosOcupacao {
  periodo?: PeriodoKey;
  campo?: 'fut5' | 'fut7' | 'ambos';
  diaSemana?: number | null;
  faixa?: string | null; // chave 'startHour-endHour'
  simularPrecoNovo?: number | null;
  simularCampo?: 'fut5' | 'fut7' | null;
  simularHora?: number | null;
}

export async function getOcupacaoReport(filtros: FiltrosOcupacao = {}) {
  try {
    const user = await requireAccess();
    if (!user) return { success: false, error: 'Sem permissão para acessar a Inteligência de Ocupação.' };

    const periodo = (filtros.periodo || '30d') as PeriodoKey;
    const P = buildPeriods(periodo);
    const loadFrom = new Date(P.to.getTime() - 179 * dayMs);
    const data = await carregarDadosOcupacao(loadFrom, P.to);

    const campo = filtros.campo === 'fut5' || filtros.campo === 'fut7' ? filtros.campo : 'ambos';
    const dow = filtros.diaSemana == null ? null : Math.min(6, Math.max(0, Number(filtros.diaSemana)));
    const faixa = filtros.faixa || null;

    const opts: { simularPrecoNovo?: number; simularCampo?: CampoId; simularStartHour?: number } = {};
    if (filtros.simularPrecoNovo && Number(filtros.simularPrecoNovo) > 0) {
      opts.simularPrecoNovo = round2(Number(filtros.simularPrecoNovo));
      opts.simularCampo = filtros.simularCampo === 'fut7' ? 'fut7' : 'fut5';
      opts.simularStartHour = filtros.simularHora == null ? 17 : Number(filtros.simularHora);
    }

    const reporte = computarReporte(data, P.from, P.to, opts);

    const filtrar = <T extends { campo: CampoId; startHour: number }>(rows: T[]): T[] => {
      return rows.filter(r => {
        if (campo !== 'ambos' && r.campo !== campo) return false;
        if (faixa) {
          const [sh] = faixa.split('-').map(Number);
          if (r.startHour !== sh) return false;
        }
        return true;
      });
    };

    const porHorario = filtrar(reporte.porHorario);
    const porDiaSemana = dow == null ? reporte.porDiaSemana : reporte.porDiaSemana.filter(r => r.rotulo === ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'][dow]);
    const porFaixa = faixa ? filtrar(reporte.porFaixa) : reporte.porFaixa;
    const recomendacoes = faixa ? filtrar(reporte.recomendacoes) : reporte.recomendacoes;

    const elasticidade = await analisarElasticidade(P.from, P.to);
    const historico = await prisma.recommendationHistory.findMany({
      orderBy: { createdAt: 'desc' },
      take: 20,
      include: { admin: { select: { name: true } } }
    });

    return {
      success: true,
      report: {
        ...reporte,
        porHorario,
        porDiaSemana,
        porFaixa,
        recomendacoes,
        simulacao: reporte.simulacao || null,
        elasticidade,
        historico: historico.map(h => ({
          id: h.id,
          campo: h.campo,
          faixa: h.horaInicio != null && h.horaFim != null ? `${String(h.horaInicio).padStart(2, '0')}:00 às ${String(h.horaFim).padStart(2, '0')}:00` : null,
          categoria: h.categoria,
          precoAtual: h.precoAtual,
          precoSugerido: h.precoSugerido,
          nivelConfianca: h.nivelConfianca,
          motivo: h.motivo,
          decisao: h.decisao,
          decisaoNota: h.decisaoNota,
          precoAplicado: h.precoAplicado,
          periodoTesteDias: h.periodoTesteDias,
          resultado: h.resultado,
          resultadoNota: h.resultadoNota,
          adminName: h.admin?.name || null,
          createdAt: h.createdAt.toISOString()
        }))
      }
    };
  } catch (e: any) {
    console.error('ERRO_OCUPACAO_REPORT:', e);
    return { success: false, error: 'Falha ao gerar o relatório de ocupação: ' + (e?.message || 'erro interno') };
  }
}

export interface DecisaoInput {
  recomendacaoId: string;
  decisao: 'ACEITA' | 'REJEITADA';
  nota?: string;
  precoAplicado?: number | null;
  periodoTesteDias?: number | null;
}

export async function registrarDecisaoRecomendacao(input: DecisaoInput) {
  try {
    const admin = await requireAdmin();
    if (!admin) return { success: false, error: 'Apenas administradores podem aprovar ou rejeitar recomendações.' };

    const rec = await prisma.recommendationHistory.findUnique({ where: { id: input.recomendacaoId } });
    if (!rec) return { success: false, error: 'Recomendação não encontrada.' };

    if (input.decisao === 'ACEITA' && input.precoAplicado != null && input.precoAplicado > 0) {
      const precoNovo = round2(Number(input.precoAplicado));
      const campo = (rec.campo === 'fut7' ? 'fut7' : 'fut5') as CampoId;
      const startHour = rec.horaInicio ?? 17;
      const endHour = rec.horaFim ?? startHour + 1;
      const dias = Math.max(7, input.periodoTesteDias || 30);

      // Snapshot "antes" (rastreável) da faixa afetada.
      const antes = await medirFaixa(campo, startHour, endHour, new Date(Date.now() - dias * dayMs), new Date());

      await prisma.$transaction(async (tx) => {
        await tx.pricingBand.updateMany({
          where: { campo: rec.campo, startHour, endHour },
          data: campo === 'fut5' ? { minPrice: precoNovo } : { maxPrice: precoNovo }
        });

        await tx.priceChange.create({
          data: {
            campo: rec.campo,
            startHour,
            endHour,
            precoAnterior: rec.precoAtual,
            precoNovo,
            autorId: admin.id,
            ocupacaoAntes: antes.ocupacao,
            receitaAntes: antes.receita,
            consumoBarAntes: antes.bar,
            nota: `Aprovada via recomendação ${rec.fingerprint}`.slice(0, 300)
          }
        });

        await tx.recommendationHistory.update({
          where: { id: rec.id },
          data: {
            decisao: 'ACEITA',
            decisaoNota: input.nota?.slice(0, 300) || null,
            adminId: admin.id,
            precoAplicado: precoNovo,
            periodoTesteDias: dias,
            resultado: 'EM_AVALIACAO'
          }
        });
      });

      await createAuditLog('Ocupação', `Preço ${campo === 'fut5' ? 'campo menor' : 'campo maior'} ${String(startHour).padStart(2, '0')}h -> R$ ${precoNovo} (aprovado por ${admin.name})`).catch(() => {});
      return { success: true, mensagem: 'Recomendação aprovada e preço aplicado com registro de decisão.' };
    }

    await prisma.recommendationHistory.update({
      where: { id: rec.id },
      data: {
        decisao: input.decisao,
        decisaoNota: input.nota?.slice(0, 300) || null,
        adminId: admin.id
      }
    });
    await createAuditLog('Ocupação', `${input.decisao === 'ACEITA' ? 'Aceita' : 'Rejeitada'} recomendação ${rec.fingerprint}`).catch(() => {});
    return { success: true, mensagem: 'Decisão registrada no histórico.' };
  } catch (e: any) {
    console.error('ERRO_DECISAO:', e);
    return { success: false, error: 'Falha ao registrar decisão: ' + (e?.message || 'erro interno') };
  }
}

export interface AlteracaoPrecoInput {
  campo: 'fut5' | 'fut7';
  startHour: number;
  endHour: number;
  precoNovo: number;
  nota?: string;
}

export async function registrarAlteracaoPreco(input: AlteracaoPrecoInput) {
  try {
    const admin = await requireAdmin();
    if (!admin) return { success: false, error: 'Apenas administradores podem registrar alterações de preço.' };

    const campo = (input.campo === 'fut7' ? 'fut7' : 'fut5') as CampoId;
    const startHour = Math.max(0, Number(input.startHour));
    const endHour = Math.min(24, Number(input.endHour) || startHour + 1);
    const precoNovo = round2(Number(input.precoNovo));
    if (precoNovo <= 0) return { success: false, error: 'Preço inválido.' };

    const band = await prisma.pricingBand.findFirst({ where: { campo, startHour, endHour } });
    const precoAnterior = band ? (campo === 'fut5' ? band.minPrice : band.maxPrice) : 0;
    const dias = 30;
    const antes = await medirFaixa(campo, startHour, endHour, new Date(Date.now() - dias * dayMs), new Date());

    await prisma.$transaction(async (tx) => {
      await tx.pricingBand.updateMany({
        where: { campo, startHour, endHour },
        data: campo === 'fut5' ? { minPrice: precoNovo } : { maxPrice: precoNovo }
      });
      await tx.priceChange.create({
        data: {
          campo,
          startHour,
          endHour,
          precoAnterior: precoAnterior || precoNovo,
          precoNovo,
          autorId: admin.id,
          ocupacaoAntes: antes.ocupacao,
          receitaAntes: antes.receita,
          consumoBarAntes: antes.bar,
          nota: input.nota?.slice(0, 300) || null
        }
      });
    });

    await createAuditLog('Ocupação', `Preço ${campoLabel2(campo)} ${String(startHour).padStart(2, '0')}h: R$ ${precoAnterior} -> R$ ${precoNovo} (por ${admin.name})`).catch(() => {});
    return { success: true, mensagem: 'Alteração de preço registrada e aplicada.' };
  } catch (e: any) {
    console.error('ERRO_ALTERACAO_PRECO:', e);
    return { success: false, error: 'Falha ao registrar alteração de preço: ' + (e?.message || 'erro interno') };
  }
}

const campoLabel2 = (c: CampoId) => (c === 'fut5' ? 'campo menor' : 'campo maior');

export async function getConfigOcupacao() {
  try {
    const user = await requireAccess();
    if (!user) return { success: false, error: 'Sem permissão.' };
    const row = await prisma.occupationSettings.findUnique({ where: { id: 'default' } });
    return {
      success: true,
      config: row ? {
        capacidadeFut5: row.capacidadeFut5,
        capacidadeFut7: row.capacidadeFut7,
        abertura: row.abertura,
        fechamento: row.fechamento,
        ociosoLimite: row.ociosoLimite,
        saudavelLimite: row.saudavelLimite,
        altaDemandaLimite: row.altaDemandaLimite,
        saturadoLimite: row.saturadoLimite,
        diasAvaliacaoElasticidade: row.diasAvaliacaoElasticidade
      } : null
    };
  } catch (e: any) {
    return { success: false, error: e?.message || 'Erro' };
  }
}

export async function atualizarConfigOcupacao(config: Partial<OcupacaoConfig>) {
  try {
    const admin = await requireAdmin();
    if (!admin) return { success: false, error: 'Apenas administradores podem alterar a configuração.' };

    const sane = (v: unknown, def: number) => {
      const n = Number(v);
      return Number.isFinite(n) && n > 0 ? Math.round(n) : def;
    };
    const c = {
      capacidadeFut5: sane(config.capacidadeFut5, 2),
      capacidadeFut7: sane(config.capacidadeFut7, 1),
      abertura: Math.max(0, Math.min(23, sane(config.abertura, 6))),
      fechamento: Math.max(1, Math.min(24, sane(config.fechamento, 24))),
      ociosoLimite: Math.max(0, Math.min(100, sane(config.ociosoLimite, 25))),
      saudavelLimite: Math.max(0, Math.min(100, sane(config.saudavelLimite, 50))),
      altaDemandaLimite: Math.max(0, Math.min(100, sane(config.altaDemandaLimite, 80))),
      saturadoLimite: Math.max(0, Math.min(100, sane(config.saturadoLimite, 95))),
      diasAvaliacaoElasticidade: Math.max(7, Math.min(180, sane(config.diasAvaliacaoElasticidade, 30)))
    };
    if (c.saudavelLimite <= c.ociosoLimite || c.altaDemandaLimite <= c.saudavelLimite || c.saturadoLimite <= c.altaDemandaLimite) {
      return { success: false, error: 'Limiares devem ser crescentes: ocioso < saudável < alta demanda < saturado.' };
    }

    await prisma.occupationSettings.upsert({
      where: { id: 'default' },
      update: c,
      create: { id: 'default', ...c }
    });
    await createAuditLog('Ocupação', `Configuração de ocupação atualizada por ${admin.name}`).catch(() => {});
    return { success: true, mensagem: 'Configuração atualizada.' };
  } catch (e: any) {
    return { success: false, error: e?.message || 'Erro' };
  }
}

export async function getFaixasPreco() {
  try {
    const user = await requireAccess();
    if (!user) return { success: false, error: 'Sem permissão.' };
    const bands = await prisma.pricingBand.findMany({ orderBy: [{ campo: 'asc' }, { startHour: 'asc' }] });
    return {
      success: true,
      faixas: bands.map(b => ({
        id: b.id,
        campo: b.campo,
        startHour: b.startHour,
        endHour: b.endHour,
        minPrice: b.minPrice,
        maxPrice: b.maxPrice,
        rotulo: `${String(b.startHour).padStart(2, '0')}:00 às ${String(b.endHour).padStart(2, '0')}:00`
      }))
    };
  } catch (e: any) {
    return { success: false, error: e?.message || 'Erro' };
  }
}
