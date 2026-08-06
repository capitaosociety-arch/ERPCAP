// ===========================================================================
// Motor de Score de Clientes — Capitão Society
//
// O score varia de 0 a 100 e é a soma ponderada de 9 fatores, cada um
// normalizado de 0 a 100:
//
//   score = ROUND( Σ (peso_i × fator_i) / 100 )
//
// Classificações:
//   80–100  PREMIUM
//   60–79   FREQUENTE
//   40–59   REGULAR
//   20–39   EM_RISCO
//   0–19    INATIVO
//
// Regras transversais:
//   - Cancelamento feito DENTRO do prazo permitido (>= prazoCancelamentoHoras
//     antes do início da reserva) NÃO reduz o score.
//   - Cliente inadimplente (mensalidade vencida e sem pagamento recente) é
//     limitado ao teto capInadimplente (classificação "Inativo ou inadimplente").
//   - Fatores "não aplicáveis" contribuem 0 (ex.: sem assinatura, sem pagamentos,
//     nunca reservou), exceto cancelamentos e faltas, que são puros descontos
//     (100 quando não há ocorrências).
//   - O cálculo usa apenas métricas de negócio — nunca dados pessoais sensíveis.
// ===========================================================================

export type FatorKey =
  | 'frequencia'
  | 'gastoAluguel'
  | 'consumoBar'
  | 'pontualidade'
  | 'cancelamentos'
  | 'faltas'
  | 'recencia'
  | 'recorrencia'
  | 'inadimplencia';

export type ScorePesos = {
  [k in FatorKey]: number;
};

export interface ScoreLimiares {
  reservasRef: number;                 // nº reservas no período para frequência = 100
  aluguelRef: number;                  // R$ gasto em aluguel no período para = 100
  barRef: number;                      // R$ consumo no bar no período para = 100
  prazoCancelamentoHoras: number;      // cancelar com >= Xh antes do início não penaliza
  diasInatividade: number;             // recência decai a 0 após X dias
  mesesAnalise: number;                // janela de análise
  graceDiasMensalidade: number;        // tolerância de atraso da mensalidade (dias)
  capInadimplente: number;             // teto do score quando inadimplente
  descontoCancelamentoForaPrazo: number; // desconto por cancelamento fora do prazo
  descontoFalta: number;               // desconto por no-show
}

export const DEFAULT_PESOS: ScorePesos = {
  frequencia: 20,
  gastoAluguel: 20,
  consumoBar: 15,
  pontualidade: 10,
  cancelamentos: 5,
  faltas: 10,
  recencia: 10,
  recorrencia: 5,
  inadimplencia: 5
};

export const DEFAULT_LIMIARES: ScoreLimiares = {
  reservasRef: 8,
  aluguelRef: 5000,
  barRef: 3000,
  prazoCancelamentoHoras: 24,
  diasInatividade: 120,
  mesesAnalise: 12,
  graceDiasMensalidade: 5,
  capInadimplente: 19,
  descontoCancelamentoForaPrazo: 25,
  descontoFalta: 33
};

export interface FatorScore {
  fator: FatorKey;
  rotulo: string;
  peso: number;
  normalizado: number; // 0..100
  motivo: string;
}

export interface ScoreResultado {
  score: number;
  classificacao: string; // PREMIUM | FREQUENTE | REGULAR | EM_RISCO | INATIVO
  fatores: FatorScore[];
  recomendacao: string;
  flagInadimplente: boolean;
}

export interface ScoreInput {
  hoje: Date;
  inicioJanela: Date;
  reservasPeriodo: number;             // reservas não canceladas/no-show no período
  mesesAtivos: number;                 // meses com >=1 reserva no período
  gastoAluguel: number;                // soma totalAmount das reservas válidas no período
  consumoBar: number;                  // consumo no bar (comandas vinculadas) no período
  pagamentosMensalidade: { paymentDate: Date; referenceMonth: Date }[];
  temMensalidade: boolean;
  mensalidadeVencida: boolean;         // nextDueDate vencido (sem tolerância)
  semPagamentoRecente: boolean;        // sem pagamento há 60+ dias
  ultimaReserva: Date | null;
  canceladosForaPrazo: number;         // cancelamentos fora do prazo permitido
  faltas: number;                      // no-shows (NO_SHOW)
}

const CLAMP = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

export function classificar(score: number): string {
  if (score >= 80) return 'PREMIUM';
  if (score >= 60) return 'FREQUENTE';
  if (score >= 40) return 'REGULAR';
  if (score >= 20) return 'EM_RISCO';
  return 'INATIVO';
}

export function recomendacao(classificacao: string, flagInadimplente: boolean): string {
  if (flagInadimplente || classificacao === 'INATIVO') {
    return 'Reative o relacionamento e regularize pendências (mensalidade em aberto / sem reservas recentes).';
  }
  if (classificacao === 'EM_RISCO') {
    return 'Cliente em risco de perda — aja com oferta de reativação e avise sobre horários livres.';
  }
  if (classificacao === 'REGULAR') {
    return 'Aumente a frequência com combos, pacotes de jogos e convites para eventos.';
  }
  if (classificacao === 'FREQUENTE') {
    return 'Mantenha o engajamento; ofereça pacote de horário fixo e benefícios de fidelidade.';
  }
  return 'Cliente de alto valor — recompense com fidelidade, prioridade em horários e atenção especial.';
}

function fmtBr(v: number): string {
  return v.toLocaleString('pt-BR');
}

export function computeScore(input: ScoreInput, pesos: ScorePesos = DEFAULT_PESOS, limiares: ScoreLimiares = DEFAULT_LIMIARES): ScoreResultado {
  const hoje = input.hoje.getTime();
  const dayMs = 24 * 60 * 60 * 1000;

  // 1. Frequência de reservas
  const freqNorm = CLAMP((input.reservasPeriodo / limiares.reservasRef) * 100, 0, 100);
  const freqMotivo = `${fmtBr(input.reservasPeriodo)} reserva(s) nos últimos ${limiares.mesesAnalise} meses (meta ${limiares.reservasRef})`;

  // 2. Valor gasto em aluguel
  const aluguelNorm = CLAMP((input.gastoAluguel / limiares.aluguelRef) * 100, 0, 100);
  const aluguelMotivo = `R$ ${fmtBr(Math.round(input.gastoAluguel))} em aluguéis no período (referência R$ ${fmtBr(limiares.aluguelRef)})`;

  // 3. Consumo no bar
  const barNorm = CLAMP((input.consumoBar / limiares.barRef) * 100, 0, 100);
  const barMotivo = `R$ ${fmtBr(Math.round(input.consumoBar))} de consumo no bar vinculado às comandas (referência R$ ${fmtBr(limiares.barRef)})`;

  // 4. Pontualidade nos pagamentos (mensalidades)
  const totalPag = input.pagamentosMensalidade.length;
  let pontNorm = 0;
  let pontMotivo = 'Sem histórico de pagamentos de mensalidade';
  if (totalPag > 0) {
    let emDia = 0;
    input.pagamentosMensalidade.forEach(p => {
      const fimRef = new Date(p.referenceMonth.getFullYear(), p.referenceMonth.getMonth() + 1, 0);
      fimRef.setDate(fimRef.getDate() + limiares.graceDiasMensalidade);
      if (p.paymentDate.getTime() <= fimRef.getTime()) emDia++;
    });
    pontNorm = (emDia / totalPag) * 100;
    pontMotivo = `${emDia} de ${totalPag} mensalidades pagas em dia (tolerância ${limiares.graceDiasMensalidade} dias)`;
  }

  // 5. Cancelamentos (fora do prazo permitido)
  const cancDeduc = Math.min(50, input.canceladosForaPrazo * limiares.descontoCancelamentoForaPrazo);
  const cancNorm = 100 - cancDeduc;
  const cancMotivo = input.canceladosForaPrazo === 0
    ? 'Sem cancelamentos fora do prazo permitido'
    : `${input.canceladosForaPrazo} cancelamento(s) fora do prazo (${limiares.prazoCancelamentoHoras}h antes do início). Dentro do prazo não penaliza`;

  // 6. Faltas (no-shows)
  const faltaNorm = CLAMP(100 - input.faltas * limiares.descontoFalta, 0, 100);
  const faltaMotivo = input.faltas === 0
    ? 'Sem faltas (no-shows)'
    : `${input.faltas} falta(s) registrada(s)`;

  // 7. Recência (tempo desde a última reserva)
  let recNorm = 0;
  let recMotivo = 'Sem reservas registradas';
  if (input.ultimaReserva) {
    const dias = Math.max(0, Math.floor((hoje - input.ultimaReserva.getTime()) / dayMs));
    recNorm = CLAMP(100 - (dias / limiares.diasInatividade) * 100, 0, 100);
    recMotivo = `${dias} dia(s) desde a última reserva (decai a 0 após ${limiares.diasInatividade} dias)`;
  }

  // 8. Recorrência (meses ativos no período)
  const recorrNorm = CLAMP((input.mesesAtivos / limiares.mesesAnalise) * 100, 0, 100);
  const recorrMotivo = `${input.mesesAtivos} de ${limiares.mesesAnalise} meses com pelo menos 1 reserva`;

  // 9. Inadimplência
  let inadNorm = 0;
  let inadMotivo = 'Sem assinatura ativa — fator não se aplica';
  if (input.temMensalidade) {
    if (input.semPagamentoRecente) {
      inadNorm = 40;
      inadMotivo = 'Mensalidade vencida e sem pagamento há 60+ dias';
    } else if (input.mensalidadeVencida) {
      inadNorm = 60;
      inadMotivo = 'Mensalidade vencida (dentro da tolerância)';
    } else {
      inadNorm = 100;
      inadMotivo = 'Mensalidade em dia';
    }
  }

  const flagInadimplente = input.temMensalidade && input.semPagamentoRecente;

  const fatores: FatorScore[] = [
    { fator: 'frequencia', rotulo: 'Frequência de reservas', peso: pesos.frequencia, normalizado: Math.round(freqNorm), motivo: freqMotivo },
    { fator: 'gastoAluguel', rotulo: 'Valor gasto em aluguel', peso: pesos.gastoAluguel, normalizado: Math.round(aluguelNorm), motivo: aluguelMotivo },
    { fator: 'consumoBar', rotulo: 'Consumo no bar', peso: pesos.consumoBar, normalizado: Math.round(barNorm), motivo: barMotivo },
    { fator: 'pontualidade', rotulo: 'Pontualidade nos pagamentos', peso: pesos.pontualidade, normalizado: Math.round(pontNorm), motivo: pontMotivo },
    { fator: 'cancelamentos', rotulo: 'Cancelamentos', peso: pesos.cancelamentos, normalizado: Math.round(cancNorm), motivo: cancMotivo },
    { fator: 'faltas', rotulo: 'Faltas (no-shows)', peso: pesos.faltas, normalizado: Math.round(faltaNorm), motivo: faltaMotivo },
    { fator: 'recencia', rotulo: 'Tempo desde a última reserva', peso: pesos.recencia, normalizado: Math.round(recNorm), motivo: recMotivo },
    { fator: 'recorrencia', rotulo: 'Recorrência', peso: pesos.recorrencia, normalizado: Math.round(recorrNorm), motivo: recorrMotivo },
    { fator: 'inadimplencia', rotulo: 'Inadimplência', peso: pesos.inadimplencia, normalizado: Math.round(inadNorm), motivo: inadMotivo }
  ];

  let score = Math.round(fatores.reduce((acc, f) => acc + f.peso * f.normalizado, 0) / 100);
  score = CLAMP(score, 0, 100);
  if (flagInadimplente) score = Math.min(score, limiares.capInadimplente);

  const classificacao = classificar(score);

  return {
    score,
    classificacao,
    fatores,
    recomendacao: recomendacao(classificacao, flagInadimplente),
    flagInadimplente
  };
}
