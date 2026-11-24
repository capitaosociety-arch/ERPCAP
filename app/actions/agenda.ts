'use server';

import { requirePermission } from '../../lib/auth-guard';
import { loadAgendaData, type AgendaDataParams } from '../../lib/agenda-data';
import type { AgendaData } from '../../lib/agenda';

export async function getAgendaDataAction(params: AgendaDataParams = {}): Promise<{ success: true; data: AgendaData } | { success: false; error: string }> {
  try {
    await requirePermission('permInteligencia');
    const data = await loadAgendaData(params);
    return { success: true, data };
  } catch (error: any) {
    console.error('ERRO_AGENDA_DATA:', error);
    return { success: false, error: error?.message || 'Não foi possível carregar a Agenda.' };
  }
}
