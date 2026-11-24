import { requirePagePermission } from '../../../lib/auth-guard';
import { formatRentalDateInput } from '../../../lib/rental-time';
import { DEFAULT_AGENDA_FILTERS } from '../../../lib/agenda';
import { getAgendaDataAction } from '../../actions/agenda';
import AgendaClient from './AgendaClient';

export default async function AgendaPage() {
  await requirePagePermission('permInteligencia');

  const anchor = formatRentalDateInput(new Date());
  const result = await getAgendaDataAction({
    view: 'day',
    anchor,
    filters: DEFAULT_AGENDA_FILTERS,
  });

  if (!result.success) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-6">
        <h1 className="text-lg font-black text-red-800">Agenda indisponível</h1>
        <p className="mt-1 text-sm font-medium text-red-700">{result.error}</p>
      </div>
    );
  }

  return (
    <div className="animate-in fade-in duration-500">
      <AgendaClient initialData={result.data} />
    </div>
  );
}
