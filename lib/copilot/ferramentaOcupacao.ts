// ===========================================================================
// Ferramenta segura "analisar_ocupacao_precos" do Copiloto.
//
// Analisa ocupação e precificação dos campos com base APENAS nos dados reais
// do sistema, reutilizando o motor lib/ocupacao.ts (que por sua vez reutiliza
// lib/analytics.ts). Não executa SQL livre, não altera preços e toda
// recomendação é rastreável (periodo, origem, nota, justificativa).
// ===========================================================================

import { buildPeriods, round2 } from '../analytics';
import {
  carregarDadosOcupacao,
  computarReporte,
  analisarElasticidade,
  persistirRecomendacoes,
  type CampoId,
  type ReporteOcupacao
} from '../ocupacao';
import type { CopilotTool } from './types';
import { isAdmin } from './types';

const dayMs = 24 * 60 * 60 * 1000;

const ferramenta: CopilotTool = {
  name: 'analisar_ocupacao_precos',
  description: [
    'Análise de ocupação e precificação dos campos de futebol (FUT5 campo menor / FUT7 campo maior).',
    'Retorna: ocupação por horário, dia da semana e faixa de preço; receita de aluguel e consumo de bar associado às reservas;',
    'classificação automática dos horários (muito ocioso, ocioso, saudável, alta demanda, saturado);',
    'preço praticado vs preço sugerido com justificativa e nível de confiança; comparativos (30/60/90 dias, mês atual x anterior);',
    'análise de elasticidade de alterações de preço; e simulação de preço quando informado um novo valor.',
    'Use para responder perguntas como "quais horários estão ociosos", "posso aumentar o preço das 20h",',
    '"qual preço recomendo para o campo maior às 17h", "quanto estou deixando de faturar com horários vazios", "vale reduzir o preço ou dar crédito no bar".',
    'O sistema NUNCA altera preços sozinho: tudo é sugestão.'
  ].join(' '),
  parameters: {
    type: 'object',
    properties: {
      periodo: { type: 'string', enum: ['month', '7d', '30d', '90d'], description: 'month = mês atual (padrão)' },
      campo: { type: 'string', enum: ['fut5', 'fut7', 'ambos'], description: 'Campo menor (fut5) ou maior (fut7). Padrão: ambos.' },
      diaSemana: { type: 'number', minimum: 0, maximum: 6, description: 'Filtro por dia da semana (0=Domingo ... 6=Sábado). Opcional.' },
      horaInicio: { type: 'number', minimum: 0, maximum: 23, description: 'Filtro por horário inicial (hora cheia). Opcional.' },
      horaFim: { type: 'number', minimum: 1, maximum: 24, description: 'Filtro por horário final (hora cheia, exclusiva). Opcional.' },
      simularPrecoNovo: { type: 'number', description: 'Novo preço (R$) para simulação. Opcional — nunca aplica o preço.' },
      simularCampo: { type: 'string', enum: ['fut5', 'fut7'], description: 'Campo da simulação (padrão: fut5).' },
      simularHoraInicio: { type: 'number', description: 'Hora inicial da faixa simulada (padrão: 17).' }
    }
  },
  requiredPerm: 'permInteligencia',
  async execute(ctx, args) {
    if (!isAdmin(ctx) && !ctx.user.permInteligencia) {
      return { ok: false, error: 'Sem permissão para analisar ocupação e preços.' };
    }

    const raw = String(args.periodo || 'month');
    const key: 'month' | '7d' | '30d' | '90d' = raw === '7d' || raw === '30d' || raw === '90d' ? raw : 'month';
    const P = buildPeriods(key);

    // Carrega uma janela ampla para os comparativos (30/60/90 dias + mês atual x anterior)
    const loadFrom = new Date(P.to.getTime() - 179 * dayMs);

    const data = await carregarDadosOcupacao(loadFrom, P.to);

    const campoArg = String(args.campo || 'ambos');
    const campo: CampoId | 'ambos' = campoArg === 'fut5' || campoArg === 'fut7' ? campoArg : 'ambos';
    const dowArg = args.diaSemana == null ? null : Math.min(6, Math.max(0, Number(args.diaSemana)));
    const horaIni = args.horaInicio == null ? null : Math.max(0, Number(args.horaInicio));
    const horaFim = args.horaFim == null ? null : Math.min(24, Number(args.horaFim));

    const opts: { simularPrecoNovo?: number; simularCampo?: CampoId; simularStartHour?: number } = {};
    if (args.simularPrecoNovo && Number(args.simularPrecoNovo) > 0) {
      opts.simularPrecoNovo = round2(Number(args.simularPrecoNovo));
      opts.simularCampo = args.simularCampo === 'fut7' ? 'fut7' : 'fut5';
      opts.simularStartHour = args.simularHoraInicio == null ? 17 : Number(args.simularHoraInicio);
    }

    const reporte = computarReporte(data, P.from, P.to, opts);

    // Filtros
    const filtrar = <T extends { campo: CampoId; startHour: number }>(rows: T[]): T[] => {
      return rows.filter(r => {
        if (campo !== 'ambos' && r.campo !== campo) return false;
        if (horaIni != null && r.startHour < horaIni) return false;
        if (horaFim != null && r.startHour >= horaFim) return false;
        return true;
      });
    };

    const porHorario = filtrar(reporte.porHorario);
    const porFaixa = filtrar(reporte.porFaixa);
    const porDiaSemana = dowArg == null
      ? filtrar(reporte.porDiaSemana)
      : filtrar(reporte.porDiaSemana).filter(r => r.rotulo === ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'][dowArg]);
    const recomendacoes = filtrar(reporte.recomendacoes);

    // Registra recomendações no histórico de decisões (upsert — não duplica).
    let registradas = 0;
    try {
      registradas = await persistirRecomendacoes(recomendacoes.slice(0, 12), ctx.userId);
    } catch (e) {
      console.error('[Copiloto] falha ao registrar recomendações:', e);
    }

    const elasticidade = await analisarElasticidade(P.from, P.to);

    const resumo = {
      periodo: reporte.periodo,
      dias: reporte.dias,
      semDados: reporte.semDados,
      config: {
        capacidade: { fut5: reporte.config.capacidadeFut5, fut7: reporte.config.capacidadeFut7 },
        abertura: reporte.config.abertura,
        fechamento: reporte.config.fechamento,
        limiares: {
          ocioso: reporte.config.ociosoLimite,
          saudavel: reporte.config.saudavelLimite,
          altaDemanda: reporte.config.altaDemandaLimite,
          saturado: reporte.config.saturadoLimite
        },
        diasAvaliacaoElasticidade: reporte.config.diasAvaliacaoElasticidade
      },
      indicadores: reporte.indicadores,
      porHorario,
      porDiaSemana,
      porFaixa,
      comparativos: reporte.comparativos,
      recomendacoes: recomendacoes.slice(0, 12),
      elasticidade,
      simulacao: (reporte as ReporteOcupacao & { simulacao?: unknown }).simulacao || null,
      recomendacoesRegistradas: registradas
    };

    return {
      ok: true,
      data: resumo,
      meta: {
        periodo: reporte.periodo,
        origem: ['Rental', 'Order', 'OrderItem', 'PricingBand', 'OccupationSettings', 'PriceChange', 'RecommendationHistory'],
        nota: [
          'Ocupação = horas alugadas / horas disponíveis (capacidade por campo × abertura/fechamento configurados).',
          'Receita de aluguel = itens de aluguel/campo/serviço das comandas associadas à reserva (mesmo cliente, 2h antes a 3h depois).',
          'Consumo do bar = itens de produto dessas mesmas comandas. Receita total da reserva = aluguel + bar.',
          'Recomendações são SUGESTÕES: o sistema nunca altera preços automaticamente. Preço aplicado exige aprovação de administrador.',
          'Simulação é PREVISÃO (cenários conservador/provável/otimista), nunca garantia.'
        ].join(' ')
      }
    };
  }
};

export default ferramenta;
