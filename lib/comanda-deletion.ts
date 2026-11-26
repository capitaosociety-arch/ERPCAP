import { permissionGranted, type SystemPermission } from './permissions';

export const COMANDAS_ACCESS: readonly SystemPermission[] = ['permPDV', 'permComandas'];

export const COMANDA_PERMISSION_DENIED_MESSAGE =
  'Você não possui permissão para realizar esta operação.';
export const COMANDA_NOT_FOUND_MESSAGE = 'Comanda não encontrada.';
export const COMANDA_NOT_OPEN_MESSAGE = 'Apenas comandas abertas podem ser excluídas.';
export const COMANDA_HAS_PAYMENTS_MESSAGE =
  'Esta comanda possui pagamentos registrados e não pode ser excluída.';
export const COMANDA_DELETE_FALLBACK_MESSAGE =
  'Não foi possível excluir a comanda. Tente novamente.';
export const COMANDA_DELETED_MESSAGE = 'Comanda excluída com sucesso.';

export const COMANDA_ITEM_NOT_FOUND_MESSAGE = 'Item não encontrado.';
export const COMANDA_ITEM_NOT_OPEN_MESSAGE =
  'Apenas itens de comandas abertas podem ser excluídos.';
export const COMANDA_ITEM_HAS_PAYMENTS_MESSAGE =
  'Comanda possui pagamentos registrados. Estorne o valor recebido antes de excluir itens.';
export const COMANDA_ITEM_DELETE_FALLBACK_MESSAGE =
  'Não foi possível excluir o item. Tente novamente.';

export type PermissionCheckUser = {
  role?: string | null;
  isActive?: boolean;
} & Record<string, unknown>;

export type DeletionDecision =
  | { allowed: true }
  | { allowed: false; message: string };

export type ComandaDeletionInput = {
  found: boolean;
  status?: string | null;
  receivedAmount?: number;
};

export type ComandaItemDeletionInput = {
  found: boolean;
  orderStatus?: string | null;
  receivedAmount?: number;
};

export function canOperateComandas(user: PermissionCheckUser | null | undefined): boolean {
  return COMANDAS_ACCESS.some((permission) => permissionGranted(user, permission));
}

export function evaluateComandaDeletion(input: ComandaDeletionInput): DeletionDecision {
  if (!input.found) return { allowed: false, message: COMANDA_NOT_FOUND_MESSAGE };
  if (input.status !== 'OPEN') return { allowed: false, message: COMANDA_NOT_OPEN_MESSAGE };
  if ((Number(input.receivedAmount) || 0) > 0.01) {
    return { allowed: false, message: COMANDA_HAS_PAYMENTS_MESSAGE };
  }
  return { allowed: true };
}

export function evaluateComandaItemDeletion(input: ComandaItemDeletionInput): DeletionDecision {
  if (!input.found) return { allowed: false, message: COMANDA_ITEM_NOT_FOUND_MESSAGE };
  if (input.orderStatus !== 'OPEN') {
    return { allowed: false, message: COMANDA_ITEM_NOT_OPEN_MESSAGE };
  }
  if ((Number(input.receivedAmount) || 0) > 0.01) {
    return { allowed: false, message: COMANDA_ITEM_HAS_PAYMENTS_MESSAGE };
  }
  return { allowed: true };
}

export function isPermissionError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const candidate = error as { name?: unknown; status?: unknown; message?: unknown };
  if (candidate.status === 401 || candidate.status === 403) return true;
  if (candidate.name === 'AuthError') return true;
  return /acesso negado|não autenticado|nao autenticado/i.test(String(candidate.message || ''));
}

export function comandaActionErrorMessage(error: unknown, fallback: string): string {
  return isPermissionError(error) ? COMANDA_PERMISSION_DENIED_MESSAGE : fallback;
}
