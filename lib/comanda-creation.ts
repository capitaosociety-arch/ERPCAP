import { normalizeComandaIdentifier } from './comanda-input';
import { COMANDA_PERMISSION_DENIED_MESSAGE, isPermissionError } from './comanda-deletion';

export const COMANDA_CREATION_ACTION = 'ComandaCreationIdempotency';
export const COMANDA_CREATE_FALLBACK_MESSAGE =
  'Não foi possível criar a comanda. Tente novamente.';
export const COMANDA_IDENTIFIER_REQUIRED_MESSAGE = 'Identificador obrigatório.';
export const COMANDA_CUSTOMER_NOT_FOUND_MESSAGE = 'Cliente não encontrado.';
export const COMANDA_CASH_REGISTER_CLOSED_MESSAGE =
  'Nenhum caixa aberto! Abra o caixa antes de criar novas comandas.';

export type ComandaCreationInput = {
  name: string;
  customerExists?: boolean | null;
};

export type ComandaCreationDecision =
  | { valid: true; name: string }
  | { valid: false; error: string };

export function validateComandaCreation(input: ComandaCreationInput): ComandaCreationDecision {
  const name = normalizeComandaIdentifier(input.name);
  if (!name) return { valid: false, error: COMANDA_IDENTIFIER_REQUIRED_MESSAGE };
  if (input.customerExists === false) {
    return { valid: false, error: COMANDA_CUSTOMER_NOT_FOUND_MESSAGE };
  }
  return { valid: true, name };
}

export function isValidComandaCreationKey(key: unknown): key is string {
  return typeof key === 'string' && /^[A-Za-z0-9-]{16,100}$/.test(key.trim());
}

export function buildComandaCreationMarker(idempotencyKey: string): string {
  return `comanda-create:${idempotencyKey.trim()}`;
}

export function buildComandaCreationDetails(marker: string, orderId: string): string {
  return `${marker}#order:${orderId}`;
}

export function orderIdFromCreationDetails(details: string | null | undefined): string | null {
  if (!details) return null;
  const index = details.indexOf('#order:');
  if (index < 0) return null;
  const orderId = details.slice(index + '#order:'.length).trim();
  return orderId || null;
}

export function comandaCreationErrorMessage(error: unknown): string {
  return isPermissionError(error) ? COMANDA_PERMISSION_DENIED_MESSAGE : COMANDA_CREATE_FALLBACK_MESSAGE;
}

export { COMANDA_PERMISSION_DENIED_MESSAGE };
