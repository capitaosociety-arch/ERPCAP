// ===========================================================================
// Helpers de retry/backoff para chamadas de IA (rate limit etc.).
// ===========================================================================

export const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export function isRateLimitError(err: any): boolean {
  const msg = err?.message || String(err || '');
  return /RESOURCE_EXHAUSTED|quota|429|rate.?limit/i.test(msg);
}

export function isModelNotFoundError(err: any): boolean {
  const msg = err?.message || String(err || '');
  return /404|not found|does not exist|model.*not/i.test(msg);
}

/**
 * Executa `fn` com retry em rate limit (backoff progressivo) e pula erros de
 * modelo não encontrado (propaga como code NOT_FOUND p/ o caller decidir).
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  opts: { attempts?: number; baseMs?: number; label?: string } = {}
): Promise<T> {
  const attempts = opts.attempts ?? 3;
  const baseMs = opts.baseMs ?? 2000;

  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await fn();
    } catch (err: any) {
      if (isModelNotFoundError(err)) throw err; // caller decide fallback
      if (isRateLimitError(err) && attempt < attempts) {
        await sleep(baseMs * attempt);
        continue;
      }
      throw err;
    }
  }
  throw new Error(`Falha na chamada de IA (${opts.label || 'sem rótulo'}).`);
}
