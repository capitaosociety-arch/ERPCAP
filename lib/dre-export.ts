export type DreRegime = 'cash' | 'competence';

export function buildDreExportRows(month: any, regime: DreRegime) {
  const expenseCats = Object.entries(month?.despesas || {});
  const totalReceitas = Number(month?.totalReceitas || 0);

  return [
    { 'Conta': 'Regime', 'Valor': regime === 'competence' ? 'Competência' : 'Caixa', 'Percentual': '' },
    { 'Conta': 'Versão do fechamento', 'Valor': month?.closeVersion ? `v${month.closeVersion}` : 'Em aberto', 'Percentual': '' },
    { 'Conta': 'Receita de Vendas (PDV/Comandas)', 'Valor': month?.receitasVendas || 0, 'Percentual': '' },
    { 'Conta': 'Outras Receitas', 'Valor': month?.receitasOutras || 0, 'Percentual': '' },
    { 'Conta': 'Receita Bruta Total', 'Valor': month?.totalReceitas || 0, 'Percentual': '100%' },
    { 'Conta': '(-) CMV (Custo das Mercadorias Vendidas)', 'Valor': -(month?.cmv || 0), 'Percentual': totalReceitas > 0 ? `${((month.cmv / totalReceitas) * 100).toFixed(1)}%` : '0%' },
    { 'Conta': 'Lucro Bruto', 'Valor': month?.lucroBruto || 0, 'Percentual': `${month?.margemBruta || 0}%` },
    ...expenseCats.map(([category, value]: any) => ({
      'Conta': `(-) ${category}`,
      'Valor': -value,
      'Percentual': totalReceitas > 0 ? `${((value / totalReceitas) * 100).toFixed(1)}%` : '0%',
    })),
    { 'Conta': '(-) Despesas Financeiras', 'Valor': -(month?.despesasFinanceiras || 0), 'Percentual': '' },
    { 'Conta': '(-) Impostos', 'Valor': -(month?.impostos || 0), 'Percentual': '' },
    { 'Conta': 'EBITDA', 'Valor': month?.ebitda || 0, 'Percentual': `${month?.margemEbitda || 0}%` },
    { 'Conta': 'Resultado Líquido', 'Valor': month?.resultadoLiquido || 0, 'Percentual': `${month?.margemLiquida || 0}%` },
  ];
}
