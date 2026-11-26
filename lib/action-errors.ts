import { COMANDA_PERMISSION_DENIED_MESSAGE, isPermissionError } from './comanda-deletion';

export function isInternalActionError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const candidate = error as { code?: unknown; name?: unknown; message?: unknown };
  if (candidate.code) return true;
  return /prisma|transaction|timeout|connection|database/i.test(
    `${candidate.name || ''} ${candidate.message || ''}`,
  );
}

export function publicActionErrorMessage(error: unknown, fallback: string): string {
  if (isPermissionError(error)) return COMANDA_PERMISSION_DENIED_MESSAGE;
  if (isInternalActionError(error)) return fallback;
  const message = error instanceof Error ? error.message.trim() : '';
  return message || fallback;
}
