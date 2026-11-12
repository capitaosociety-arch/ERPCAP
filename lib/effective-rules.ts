export type RulesVersion = 'LEGACY' | 'NEW_RULES';

export const NEW_RULES_EFFECTIVE_PERIOD = '2026-11';
export const NEW_RULES_EFFECTIVE_START = new Date('2026-11-01T00:00:00-04:00');
export const NEW_RULES_EFFECTIVE_LABEL = '01/11/2026';

export function isNewRulesPeriod(period: string | null | undefined): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(String(period || '')) && String(period) >= NEW_RULES_EFFECTIVE_PERIOD;
}

export function rulesVersionForPeriod(period: string): RulesVersion {
  return isNewRulesPeriod(period) ? 'NEW_RULES' : 'LEGACY';
}

export function isNewRulesDate(value: Date | string | null | undefined): boolean {
  if (!value) return false;
  const date = typeof value === 'string'
    ? new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00-04:00` : value)
    : value;
  return !Number.isNaN(date.getTime()) && date.getTime() >= NEW_RULES_EFFECTIVE_START.getTime();
}

export function methodologyNoteForPeriod(period: string): string {
  return isNewRulesPeriod(period)
    ? `Metodologia de serviços, custos, rateio e rentabilidade vigente desde ${NEW_RULES_EFFECTIVE_LABEL}.`
    : `Metodologia histórica anterior a ${NEW_RULES_EFFECTIVE_LABEL}; períodos fechados permanecem no snapshot e não são recalculados pelas novas regras.`;
}
