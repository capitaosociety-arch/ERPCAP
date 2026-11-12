'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle, LoaderCircle, Landmark, Pencil, Plus, Trash2 } from 'lucide-react';
import {
  deleteCostAllocationAction,
  deleteOperatingCostRuleAction,
  getCostCenterAdminDataAction,
  getCostCenterReportAction,
  upsertCostAllocationAction,
  upsertOperatingCostRuleAction,
} from '../../actions/cost-centers';
import type {
  CostCenterAdminData,
  CostCenterReport,
} from '../../../lib/cost-centers';

function money(value: number | null) {
  if (value == null) return '-';
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function dateLabel(value: Date | string | null) {
  if (!value) return '-';
  return new Date(value).toLocaleDateString('pt-BR', { timeZone: 'America/Cuiaba' });
}

const DRIVERS = [
  { value: 'MANUAL', label: 'Manual' },
  { value: 'HOURS_REGULAR', label: 'Horas regulares' },
  { value: 'HOURS_EXTRA', label: 'Horas extraordinarias' },
  { value: 'HOURS_TOTAL', label: 'Horas totais' },
  { value: 'REVENUE', label: 'Receita' },
  { value: 'SHARED', label: 'Compartilhado' },
];

const emptyAllocation = { id: '', financialEntryId: '', costCenterId: '', amount: '', driver: 'MANUAL', note: '' };
const emptyRule = {
  id: '',
  costCenterId: '',
  type: 'FIXED_MONTHLY',
  amount: '',
  ratePerHour: '',
  driver: 'HOURS_TOTAL',
  effectiveFrom: '',
  effectiveTo: '',
  isActive: true,
};

export default function CostsClient({ period, canManage }: { period: string; canManage: boolean }) {
  const [data, setData] = useState<CostCenterReport | null>(null);
  const [admin, setAdmin] = useState<CostCenterAdminData | null>(null);
  const [error, setError] = useState<string | undefined>();
  const [adminError, setAdminError] = useState<string | undefined>();
  const [loading, setLoading] = useState(true);
  const [adminLoading, setAdminLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<string | undefined>();
  const [refreshKey, setRefreshKey] = useState(0);
  const [allocationForm, setAllocationForm] = useState(emptyAllocation);
  const [ruleForm, setRuleForm] = useState(emptyRule);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(undefined);
    setFeedback(undefined);
    getCostCenterReportAction(period).then((res) => {
      if (!active) return;
      setLoading(false);
      if (res.success) setData(res.data ?? null);
      else {
        setData(null);
        setError(res.error);
      }
    }).catch((err) => {
      if (!active) return;
      setLoading(false);
      setError(err?.message || 'Falha ao carregar custos por centro.');
    });
    return () => { active = false; };
  }, [period, refreshKey]);

  useEffect(() => {
    if (!canManage) {
      setAdmin(null);
      return;
    }
    let active = true;
    setAdminLoading(true);
    setAdminError(undefined);
    getCostCenterAdminDataAction(period).then((res) => {
      if (!active) return;
      setAdminLoading(false);
      if (res.success) setAdmin(res.data ?? null);
      else {
        setAdmin(null);
        setAdminError(res.error);
      }
    }).catch((err) => {
      if (!active) return;
      setAdminLoading(false);
      setAdmin(null);
      setAdminError(err?.message || 'Falha ao carregar dados administrativos.');
    });
    return () => { active = false; };
  }, [period, canManage, refreshKey]);

  useEffect(() => {
    setAllocationForm(emptyAllocation);
    setRuleForm(emptyRule);
  }, [period]);

  const refresh = () => setRefreshKey((value) => value + 1);

  const allocationEntry = admin?.entries.find(entry => entry.id === allocationForm.financialEntryId);
  const selectedAllocation = admin?.allocations.find(item => item.id === allocationForm.id);

  const chooseEntry = (entryId: string) => {
    const entry = admin?.entries.find(item => item.id === entryId);
    setAllocationForm(current => ({
      ...current,
      financialEntryId: entryId,
      amount: entry ? String(entry.available.toFixed(2)) : current.amount,
    }));
  };

  const saveAllocation = async () => {
    setFeedback(undefined);
    const amount = Number(allocationForm.amount);
    if (!allocationForm.financialEntryId || !allocationForm.costCenterId || !Number.isFinite(amount) || amount <= 0) {
      setFeedback('Informe lancamento, centro de custo e valor positivo.');
      return;
    }
    setSaving(true);
    try {
      const res = await upsertCostAllocationAction({
        financialEntryId: allocationForm.financialEntryId,
        costCenterId: allocationForm.costCenterId,
        period,
        amount,
        driver: allocationForm.driver,
        note: allocationForm.note || undefined,
      });
      if (!res.success) {
        setFeedback(res.error);
        return;
      }
      setFeedback(allocationForm.id ? 'Alocacao atualizada.' : 'Alocacao criada.');
      setAllocationForm(emptyAllocation);
      refresh();
    } catch (error: any) {
      setFeedback(error?.message || 'Falha ao salvar alocacao.');
    } finally {
      setSaving(false);
    }
  };

  const editAllocation = (id: string) => {
    const item = admin?.allocations.find(allocation => allocation.id === id);
    if (!item) return;
    setFeedback(undefined);
    setAllocationForm({
      id: item.id,
      financialEntryId: item.financialEntryId,
      costCenterId: item.costCenterId,
      amount: String(item.amount.toFixed(2)),
      driver: item.driver,
      note: item.note || '',
    });
  };

  const removeAllocation = async (id: string) => {
    if (!confirm('Excluir esta alocacao de custo? A despesa original no Financeiro nao sera alterada.')) return;
    setFeedback(undefined);
    try {
      const res = await deleteCostAllocationAction(id);
      if (!res.success) {
        setFeedback(res.error);
        return;
      }
      setFeedback('Alocacao excluida. A despesa original permanece no Financeiro.');
      if (allocationForm.id === id) setAllocationForm(emptyAllocation);
      refresh();
    } catch (error: any) {
      setFeedback(error?.message || 'Falha ao excluir alocacao.');
    }
  };

  const saveRule = async () => {
    setFeedback(undefined);
    const amount = Number(ruleForm.amount);
    const rate = ruleForm.ratePerHour === '' ? undefined : Number(ruleForm.ratePerHour);
    if (!ruleForm.costCenterId || !Number.isFinite(amount) || amount < 0) {
      setFeedback('Informe centro de custo e valor valido para a regra.');
      return;
    }
    if (ruleForm.type === 'VARIABLE_PER_HOUR' && (!Number.isFinite(rate) || Number(rate) < 0)) {
      setFeedback('Informe custo por hora valido.');
      return;
    }
    setSaving(true);
    try {
      const res = await upsertOperatingCostRuleAction({
        id: ruleForm.id || undefined,
        costCenterId: ruleForm.costCenterId,
        type: ruleForm.type as 'FIXED_MONTHLY' | 'VARIABLE_PER_HOUR' | 'SHARED',
        amount,
        ratePerHour: rate,
        driver: ruleForm.driver,
        effectiveFrom: ruleForm.effectiveFrom || undefined,
        effectiveTo: ruleForm.effectiveTo || undefined,
        isActive: ruleForm.isActive,
      });
      if (!res.success) {
        setFeedback(res.error);
        return;
      }
      setFeedback(ruleForm.id ? 'Regra atualizada.' : 'Regra criada.');
      setRuleForm(emptyRule);
      refresh();
    } catch (error: any) {
      setFeedback(error?.message || 'Falha ao salvar regra.');
    } finally {
      setSaving(false);
    }
  };

  const editRule = (id: string) => {
    const rule = admin?.rules.find(item => item.id === id);
    if (!rule) return;
    setFeedback(undefined);
    setRuleForm({
      id: rule.id,
      costCenterId: rule.costCenterId,
      type: rule.type,
      amount: String(rule.amount.toFixed(2)),
      ratePerHour: rule.ratePerHour == null ? '' : String(rule.ratePerHour.toFixed(2)),
      driver: rule.driver || 'MANUAL',
      effectiveFrom: rule.effectiveFrom ? new Date(rule.effectiveFrom).toISOString().slice(0, 10) : '',
      effectiveTo: rule.effectiveTo ? new Date(rule.effectiveTo).toISOString().slice(0, 10) : '',
      isActive: rule.isActive,
    });
  };

  const removeRule = async (id: string) => {
    if (!confirm('Excluir esta regra de custo planejado? Ela nao altera despesas financeiras.')) return;
    setFeedback(undefined);
    try {
      const res = await deleteOperatingCostRuleAction(id);
      if (!res.success) {
        setFeedback(res.error);
        return;
      }
      setFeedback('Regra excluida.');
      if (ruleForm.id === id) setRuleForm(emptyRule);
      refresh();
    } catch (error: any) {
      setFeedback(error?.message || 'Falha ao excluir regra.');
    }
  };

  if (loading) {
    return (
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8 flex items-center justify-center gap-3 text-gray-500 font-bold">
        <LoaderCircle className="animate-spin" /> Carregando custos por centro...
      </div>
    );
  }

  if (error) {
    return <div className="bg-red-50 border border-red-200 text-red-700 rounded-2xl p-4 font-medium text-sm">{error}</div>;
  }

  if (!data) return null;

  return (
    <div className="space-y-4">
      {feedback && (
        <div className="bg-blue-50 border border-blue-200 text-blue-800 rounded-2xl p-3 text-sm font-medium">{feedback}</div>
      )}

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-black uppercase tracking-wider text-slate-600 flex items-center gap-2">
              <Landmark size={16} className="text-mrts-blue" /> Custos por centro
            </h2>
            <p className="text-xs text-gray-500 mt-1">{data.period} - receita das quadras, custo alocado e margem de contribuicao.</p>
          </div>
          {data.totalResultadoQuadras == null && <span className="text-[10px] font-bold uppercase tracking-wider text-amber-600 bg-amber-50 border border-amber-200 rounded-full px-2 py-1">Rentabilidade indisponivel</span>}
        </div>
        {data.totalResultadoQuadras == null && (
          <div className="mt-3 flex items-start gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-xl p-3">
            <AlertTriangle size={15} className="shrink-0 mt-0.5" />
            <span>{data.rulesVersion === 'LEGACY' ? data.reason : data.hasAllocation ? 'Custo alocado insuficiente para as duas quadras. A rentabilidade total fica indisponivel.' : 'Sem alocacao de custo no periodo. A rentabilidade fica indisponivel; regras planejadas nao sao tratadas como custo realizado.'}</span>
          </div>
        )}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-4">
          <div className="bg-slate-50 rounded-xl p-3">
            <p className="text-[10px] uppercase tracking-wider font-bold text-gray-400">Receita quadras</p>
            <p className="text-lg font-black text-slate-800 mt-1">{money(data.totalReceitaQuadras)}</p>
          </div>
          <div className="bg-slate-50 rounded-xl p-3">
            <p className="text-[10px] uppercase tracking-wider font-bold text-gray-400">Custo alocado</p>
            <p className="text-lg font-black text-slate-800 mt-1">{money(data.totalCustoAlocado)}</p>
          </div>
          <div className="bg-slate-50 rounded-xl p-3">
            <p className="text-[10px] uppercase tracking-wider font-bold text-gray-400">Resultado quadras</p>
            <p className={`text-lg font-black mt-1 ${data.totalResultadoQuadras == null || data.totalResultadoQuadras >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
              {money(data.totalResultadoQuadras)}
            </p>
          </div>
          <div className="bg-slate-50 rounded-xl p-3">
            <p className="text-[10px] uppercase tracking-wider font-bold text-gray-400">Horas quadras</p>
            <p className="text-lg font-black text-slate-800 mt-1">{data.totalHorasQuadras.toFixed(1).replace('.', ',')} h</p>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[10px] uppercase tracking-wider text-gray-400 border-b border-gray-100">
              <th className="p-3">Centro</th>
              <th className="p-3">Receita</th>
              <th className="p-3">Horas</th>
              <th className="p-3">Custo alocado</th>
              <th className="p-3">Custo planejado</th>
              <th className="p-3">Margem</th>
              <th className="p-3">%</th>
            </tr>
          </thead>
          <tbody>
            {data.rows.map((row) => (
              <tr key={row.code} className="border-b border-gray-50 last:border-0">
                <td className="p-3 font-bold text-slate-700">{row.name} <span className="text-[10px] text-gray-400">{row.code}</span></td>
                <td className="p-3 text-slate-600">{money(row.receita)}</td>
                <td className="p-3 text-slate-600">{row.horas.toFixed(1).replace('.', ',')}</td>
                <td className="p-3 text-slate-600">{money(row.custoAlocado)}</td>
                <td className="p-3 text-slate-600">{money(row.custoPlanejado)}</td>
                <td className={`p-3 font-bold ${row.margemContribuicao == null ? 'text-gray-400' : row.margemContribuicao >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{money(row.margemContribuicao)}</td>
                <td className="p-3 text-slate-600">{row.margemPct == null ? '-' : `${row.margemPct.toFixed(1).replace('.', ',')}%`}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-gray-400">{data.note}</p>

      {canManage && data.rulesVersion === 'NEW_RULES' && (
        <div className="space-y-4 pt-2">
          <div className="flex items-center gap-2">
            <Landmark size={16} className="text-rose-600" />
            <h2 className="text-sm font-black uppercase tracking-wider text-slate-600">Administrar alocacoes - competencia {period}</h2>
          </div>
          {adminError && <div className="bg-red-50 border border-red-200 text-red-700 rounded-2xl p-3 text-sm">{adminError}</div>}
          {adminLoading && <div className="text-sm text-gray-500 flex items-center gap-2"><LoaderCircle className="animate-spin" size={15}/> Carregando...</div>}

          {admin && (
            <>
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
                  <h3 className="text-sm font-black text-slate-700 flex items-center gap-2"><Plus size={15}/> {allocationForm.id ? 'Editar alocacao' : 'Nova alocacao'}</h3>
                  <p className="text-[11px] text-gray-500 mt-1">A despesa continua unica no Financeiro; aqui apenas rateamos parte dela ao centro.</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
                    <label className="sm:col-span-2 text-xs font-bold text-gray-500">Lancamento a pagar
                      <select
                        value={allocationForm.financialEntryId}
                        onChange={(e) => chooseEntry(e.target.value)}
                        disabled={!!allocationForm.id}
                        className="mt-1 w-full border border-gray-200 rounded-xl p-2.5 text-sm font-normal text-slate-800 bg-white disabled:bg-gray-50"
                      >
                        <option value="">Selecione...</option>
                        {admin.entries.map((entry) => (
                          <option key={entry.id} value={entry.id} disabled={!allocationForm.id && entry.available <= 0}>
                            {entry.description} - disponivel {money(entry.available)} de {money(entry.amount)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="text-xs font-bold text-gray-500">Centro de custo
                      <select
                        value={allocationForm.costCenterId}
                        onChange={(e) => setAllocationForm({ ...allocationForm, costCenterId: e.target.value })}
                        disabled={!!allocationForm.id}
                        className="mt-1 w-full border border-gray-200 rounded-xl p-2.5 text-sm font-normal text-slate-800 bg-white disabled:bg-gray-50"
                      >
                        <option value="">Selecione...</option>
                        {admin.centers.map((center) => <option key={center.id} value={center.id}>{center.code} - {center.name}</option>)}
                      </select>
                    </label>
                    <label className="text-xs font-bold text-gray-500">Valor
                      <input
                        type="number" min="0.01" step="0.01"
                        value={allocationForm.amount}
                        onChange={(e) => setAllocationForm({ ...allocationForm, amount: e.target.value })}
                        className="mt-1 w-full border border-gray-200 rounded-xl p-2.5 text-sm font-normal text-slate-800"
                      />
                    </label>
                    <label className="text-xs font-bold text-gray-500">Criterio / rateio
                      <select
                        value={allocationForm.driver}
                        onChange={(e) => setAllocationForm({ ...allocationForm, driver: e.target.value })}
                        className="mt-1 w-full border border-gray-200 rounded-xl p-2.5 text-sm font-normal text-slate-800 bg-white"
                      >
                        {DRIVERS.map((driver) => <option key={driver.value} value={driver.value}>{driver.label}</option>)}
                      </select>
                    </label>
                    <label className="text-xs font-bold text-gray-500">Observacao
                      <input value={allocationForm.note} onChange={(e) => setAllocationForm({ ...allocationForm, note: e.target.value })} className="mt-1 w-full border border-gray-200 rounded-xl p-2.5 text-sm font-normal text-slate-800" />
                    </label>
                  </div>
                  {allocationEntry && (
                    <p className="text-[11px] text-gray-500 mt-2">Disponivel neste lancamento: {money(allocationEntry.available)}. Total ja alocado: {money(allocationEntry.allocated)}.</p>
                  )}
                  {selectedAllocation && <p className="text-[11px] text-gray-400 mt-2">Alocacao atual: {money(selectedAllocation.amount)} em {selectedAllocation.costCenterCode}.</p>}
                  <div className="flex gap-2 mt-3">
                    <button onClick={saveAllocation} disabled={saving} className="bg-slate-900 text-white rounded-xl px-4 py-2 text-sm font-bold disabled:opacity-50">{saving ? 'Salvando...' : allocationForm.id ? 'Salvar alteracao' : 'Cadastrar alocacao'}</button>
                    {allocationForm.id && <button onClick={() => setAllocationForm(emptyAllocation)} className="border border-gray-200 rounded-xl px-4 py-2 text-sm font-bold text-gray-600">Cancelar</button>}
                  </div>
                </div>

                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
                  <h3 className="text-sm font-black text-slate-700 flex items-center gap-2"><Plus size={15}/> {ruleForm.id ? 'Editar regra de rateio' : 'Nova regra de rateio'}</h3>
                  <p className="text-[11px] text-gray-500 mt-1">Regra e planejamento; nao vira despesa nem rentabilidade realizada.</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
                    <label className="text-xs font-bold text-gray-500">Centro de custo
                      <select value={ruleForm.costCenterId} onChange={(e) => setRuleForm({ ...ruleForm, costCenterId: e.target.value })} className="mt-1 w-full border border-gray-200 rounded-xl p-2.5 text-sm font-normal text-slate-800 bg-white">
                        <option value="">Selecione...</option>
                        {admin.centers.map((center) => <option key={center.id} value={center.id}>{center.code} - {center.name}</option>)}
                      </select>
                    </label>
                    <label className="text-xs font-bold text-gray-500">Tipo
                      <select value={ruleForm.type} onChange={(e) => setRuleForm({ ...ruleForm, type: e.target.value })} className="mt-1 w-full border border-gray-200 rounded-xl p-2.5 text-sm font-normal text-slate-800 bg-white">
                        <option value="FIXED_MONTHLY">Fixo mensal</option>
                        <option value="VARIABLE_PER_HOUR">Variavel por hora</option>
                        <option value="SHARED">Compartilhado</option>
                      </select>
                    </label>
                    <label className="text-xs font-bold text-gray-500">Valor fixo / mensal
                      <input type="number" min="0" step="0.01" value={ruleForm.amount} onChange={(e) => setRuleForm({ ...ruleForm, amount: e.target.value })} className="mt-1 w-full border border-gray-200 rounded-xl p-2.5 text-sm font-normal text-slate-800" />
                    </label>
                    <label className="text-xs font-bold text-gray-500">Custo por hora
                      <input type="number" min="0" step="0.01" value={ruleForm.ratePerHour} onChange={(e) => setRuleForm({ ...ruleForm, ratePerHour: e.target.value })} className="mt-1 w-full border border-gray-200 rounded-xl p-2.5 text-sm font-normal text-slate-800" />
                    </label>
                    <label className="text-xs font-bold text-gray-500">Criterio
                      <select value={ruleForm.driver} onChange={(e) => setRuleForm({ ...ruleForm, driver: e.target.value })} className="mt-1 w-full border border-gray-200 rounded-xl p-2.5 text-sm font-normal text-slate-800 bg-white">
                        {DRIVERS.map((driver) => <option key={driver.value} value={driver.value}>{driver.label}</option>)}
                      </select>
                    </label>
                    <label className="text-xs font-bold text-gray-500">Ativa
                      <span className="flex items-center gap-2 mt-2 text-sm font-normal"><input type="checkbox" checked={ruleForm.isActive} onChange={(e) => setRuleForm({ ...ruleForm, isActive: e.target.checked })} /> Regra ativa</span>
                    </label>
                    <label className="text-xs font-bold text-gray-500">Inicio
                      <input type="date" value={ruleForm.effectiveFrom} onChange={(e) => setRuleForm({ ...ruleForm, effectiveFrom: e.target.value })} className="mt-1 w-full border border-gray-200 rounded-xl p-2.5 text-sm font-normal text-slate-800" />
                    </label>
                    <label className="text-xs font-bold text-gray-500">Fim
                      <input type="date" value={ruleForm.effectiveTo} onChange={(e) => setRuleForm({ ...ruleForm, effectiveTo: e.target.value })} className="mt-1 w-full border border-gray-200 rounded-xl p-2.5 text-sm font-normal text-slate-800" />
                    </label>
                  </div>
                  <div className="flex gap-2 mt-3">
                    <button onClick={saveRule} disabled={saving} className="bg-rose-600 text-white rounded-xl px-4 py-2 text-sm font-bold disabled:opacity-50">{saving ? 'Salvando...' : ruleForm.id ? 'Salvar regra' : 'Cadastrar regra'}</button>
                    {ruleForm.id && <button onClick={() => setRuleForm(emptyRule)} className="border border-gray-200 rounded-xl px-4 py-2 text-sm font-bold text-gray-600">Cancelar</button>}
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-x-auto">
                <div className="p-4 border-b border-gray-100"><h3 className="text-sm font-black text-slate-700">Alocacoes do periodo</h3></div>
                <table className="w-full text-sm">
                  <thead><tr className="text-left text-[10px] uppercase tracking-wider text-gray-400 border-b border-gray-100"><th className="p-3">Lancamento</th><th className="p-3">Centro</th><th className="p-3">Valor</th><th className="p-3">Criterio</th><th className="p-3">Obs.</th><th className="p-3">Acoes</th></tr></thead>
                  <tbody>
                    {admin.allocations.length === 0 ? (
                      <tr><td colSpan={6} className="p-4 text-sm text-gray-400">Nenhuma alocacao neste periodo.</td></tr>
                    ) : admin.allocations.map((item) => (
                      <tr key={item.id} className="border-b border-gray-50 last:border-0">
                        <td className="p-3 text-slate-600 max-w-[260px] truncate">{item.financialEntryDescription}</td>
                        <td className="p-3 font-bold text-slate-700">{item.costCenterCode}</td>
                        <td className="p-3 text-slate-600">{money(item.amount)}</td>
                        <td className="p-3 text-slate-600">{item.driver}</td>
                        <td className="p-3 text-slate-500 max-w-[180px] truncate">{item.note || '-'}</td>
                        <td className="p-3"><div className="flex gap-1"><button onClick={() => editAllocation(item.id)} className="p-1.5 rounded-lg text-blue-600 hover:bg-blue-50" title="Editar"><Pencil size={15}/></button><button onClick={() => removeAllocation(item.id)} className="p-1.5 rounded-lg text-red-600 hover:bg-red-50" title="Excluir"><Trash2 size={15}/></button></div></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-x-auto">
                <div className="p-4 border-b border-gray-100"><h3 className="text-sm font-black text-slate-700">Regras de rateio cadastradas</h3></div>
                <table className="w-full text-sm">
                  <thead><tr className="text-left text-[10px] uppercase tracking-wider text-gray-400 border-b border-gray-100"><th className="p-3">Centro</th><th className="p-3">Tipo</th><th className="p-3">Valor/Hora</th><th className="p-3">Criterio</th><th className="p-3">Vigencia</th><th className="p-3">Status</th><th className="p-3">Acoes</th></tr></thead>
                  <tbody>
                    {admin.rules.length === 0 ? (
                      <tr><td colSpan={7} className="p-4 text-sm text-gray-400">Nenhuma regra cadastrada.</td></tr>
                    ) : admin.rules.map((rule) => (
                      <tr key={rule.id} className="border-b border-gray-50 last:border-0">
                        <td className="p-3 font-bold text-slate-700">{rule.costCenterCode}</td>
                        <td className="p-3 text-slate-600">{rule.type}</td>
                        <td className="p-3 text-slate-600">{money(rule.amount)}{rule.ratePerHour != null ? ` / ${money(rule.ratePerHour)}/h` : ''}</td>
                        <td className="p-3 text-slate-600">{rule.driver || '-'}</td>
                        <td className="p-3 text-slate-600">{dateLabel(rule.effectiveFrom)} - {dateLabel(rule.effectiveTo)}</td>
                        <td className="p-3">{rule.isActive ? <span className="text-emerald-600 font-bold">Ativa</span> : <span className="text-gray-400 font-bold">Inativa</span>}</td>
                        <td className="p-3"><div className="flex gap-1"><button onClick={() => editRule(rule.id)} className="p-1.5 rounded-lg text-blue-600 hover:bg-blue-50" title="Editar"><Pencil size={15}/></button><button onClick={() => removeRule(rule.id)} className="p-1.5 rounded-lg text-red-600 hover:bg-red-50" title="Excluir"><Trash2 size={15}/></button></div></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
