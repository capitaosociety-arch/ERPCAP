'use client';

import { useState } from 'react';
import { X } from 'lucide-react';
import { defaultRentalDateInput } from '../lib/rental-time';

export type RentalBookingDraft = {
  customerId?: string;
  customerName: string;
  resource: string;
  date: string;
  start: string;
  end: string;
  amount: number;
};

type CustomerOption = {
  id: string;
  name: string;
  phone?: string | null;
};

type Props = {
  productName: string;
  suggestedResource: string;
  amount: number;
  customerName?: string;
  customerId?: string;
  customers?: CustomerOption[];
  onConfirm: (draft: RentalBookingDraft) => Promise<void> | void;
  onWithoutOccupancy: () => Promise<void> | void;
  onClose: () => void;
  saving?: boolean;
};

export default function RentalBookingModal({
  productName,
  suggestedResource,
  amount,
  customerName = '',
  customerId,
  customers = [],
  onConfirm,
  onWithoutOccupancy,
  onClose,
  saving = false,
}: Props) {
  const [draft, setDraft] = useState<RentalBookingDraft>({
    customerId,
    customerName,
    resource: suggestedResource,
    date: defaultRentalDateInput(),
    start: '20:00',
    end: '21:00',
    amount,
  });
  const [selectedCustomerId, setSelectedCustomerId] = useState(customerId || '');
  const [newCustomerName, setNewCustomerName] = useState(customerId ? customerName : '');
  const [error, setError] = useState('');

  const lockedCustomer = Boolean(customerId);
  const creatingCustomer = !lockedCustomer && selectedCustomerId === '__new__';

  const submit = async () => {
    if (!draft.resource.trim()) return setError('Informe o campo.');
    if (!lockedCustomer && !selectedCustomerId) return setError('Selecione o cliente ou escolha novo cliente avulso.');
    if (creatingCustomer && !newCustomerName.trim()) return setError('Informe o nome do novo cliente.');
    setError('');
    await onConfirm({
      ...draft,
      customerId: lockedCustomer ? customerId : (creatingCustomer ? undefined : selectedCustomerId),
      customerName: creatingCustomer ? newCustomerName.trim() : (customerName || ''),
      resource: draft.resource.trim(),
    });
  };

  return (
    <div className="fixed inset-0 z-[95] flex items-center justify-center bg-slate-900/70 p-2 sm:p-4 backdrop-blur-sm">
      <div className="w-full max-w-md max-h-[90vh] overflow-hidden rounded-2xl bg-white shadow-2xl flex flex-col">
        <div className="flex items-start justify-between gap-3 border-b border-gray-100 bg-gray-50 p-4">
          <div className="min-w-0">
            <h3 className="font-black text-slate-800 text-base">Ocupacao do campo</h3>
            <p className="text-xs text-gray-500 font-medium truncate mt-0.5">{productName}</p>
          </div>
          <button onClick={onClose} disabled={saving} className="w-8 h-8 shrink-0 rounded-full bg-white border border-gray-200 flex items-center justify-center disabled:opacity-50">
            <X size={16} className="text-gray-500" />
          </button>
        </div>

        <div className="p-4 overflow-y-auto space-y-3">
          <div>
            <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Cliente</label>
            {lockedCustomer ? (
              <div className="w-full rounded-xl border-2 border-gray-100 bg-gray-50 px-3 py-2 text-sm font-bold text-slate-700">
                {customerName || 'Cliente vinculado à comanda'}
              </div>
            ) : (
              <>
                <select
                  value={selectedCustomerId}
                  onChange={e => setSelectedCustomerId(e.target.value)}
                  className="w-full rounded-xl border-2 border-gray-200 px-3 py-2 text-sm font-bold text-slate-700 bg-white outline-none focus:border-mrts-blue"
                >
                  <option value="">Selecione o cliente</option>
                  {customers.map(customer => (
                    <option key={customer.id} value={customer.id}>{customer.name}</option>
                  ))}
                  <option value="__new__">Novo cliente avulso</option>
                </select>
                {creatingCustomer && (
                  <input
                    value={newCustomerName}
                    onChange={e => setNewCustomerName(e.target.value)}
                    placeholder="Nome do novo cliente"
                    className="mt-2 w-full rounded-xl border-2 border-gray-200 px-3 py-2 text-sm font-bold text-slate-700 outline-none focus:border-mrts-blue"
                  />
                )}
                {!creatingCustomer && selectedCustomerId && (
                  <p className="text-[10px] text-gray-400 font-medium mt-1">A reserva será vinculada ao cliente selecionado.</p>
                )}
              </>
            )}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Campo</label>
              <select value={draft.resource} onChange={e => setDraft({ ...draft, resource: e.target.value })} className="w-full rounded-xl border-2 border-gray-200 px-3 py-2 text-sm font-bold text-slate-700 bg-white outline-none focus:border-mrts-blue">
                <option value="FUT5">FUT5</option>
                <option value="FUT7">FUT7</option>
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Data</label>
              <input type="date" value={draft.date} onChange={e => setDraft({ ...draft, date: e.target.value })} className="w-full rounded-xl border-2 border-gray-200 px-2 py-2 text-sm font-bold text-slate-700 outline-none focus:border-mrts-blue" />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Inicio</label>
              <input type="time" value={draft.start} onChange={e => setDraft({ ...draft, start: e.target.value })} className="w-full rounded-xl border-2 border-gray-200 px-2 py-2 text-sm font-bold text-slate-700 outline-none focus:border-mrts-blue" />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Fim</label>
              <input type="time" value={draft.end} onChange={e => setDraft({ ...draft, end: e.target.value })} className="w-full rounded-xl border-2 border-gray-200 px-2 py-2 text-sm font-bold text-slate-700 outline-none focus:border-mrts-blue" />
            </div>
          </div>
          <p className="text-[11px] text-gray-500 font-medium">A reserva existente só é reutilizada quando o cliente selecionado, campo, data e horário coincidem. Caso não exista, uma nova reserva pendente será criada.</p>
          {error && <p className="text-xs text-red-600 font-bold">{error}</p>}
        </div>

        <div className="p-4 border-t border-gray-100 bg-white shrink-0 flex flex-col sm:flex-row gap-2">
          <button onClick={onWithoutOccupancy} disabled={saving} className="flex-1 rounded-xl border-2 border-gray-200 px-3 py-2.5 text-xs font-bold text-gray-600 hover:bg-gray-50 disabled:opacity-50">Sem ocupacao</button>
          <button onClick={submit} disabled={saving} className="flex-[1.5] rounded-xl bg-mrts-blue px-3 py-2.5 text-xs font-bold text-white hover:bg-mrts-hover disabled:opacity-50">{saving ? 'Salvando...' : 'Vincular e adicionar'}</button>
        </div>
      </div>
    </div>
  );
}
