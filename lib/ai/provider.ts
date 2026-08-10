// ===========================================================================
// Camada de provider de IA — ponto único de entrada.
//
// Uso:
//   const ai = createAIProvider();          // resolve env (AI_PROVIDER etc.)
//   const res = await ai.chat({ system, messages, tools });
//
// Trocar de provedor = mudar AI_PROVIDER + chave correspondente. O restante
// do sistema (Copiloto, OCR, importação) não muda.
// ===========================================================================

import type { AIProvider } from './types';
import { resolveAIEnv, type AIEnv } from './env';
import { GoogleProvider } from './providers/google';
import { AnthropicProvider } from './providers/anthropic';

export * from './types';
export { resolveAIEnv, maskKey, type AIEnv } from './env';
export { extractJson } from './json';
export { isRateLimitError, isModelNotFoundError, withRetry } from './retry';

let cached: AIProvider | null = null;

/** Cria (ou devolve em cache) o provider ativo, conforme as env vars. */
export function createAIProvider(env?: AIEnv): AIProvider {
  const e = env || resolveAIEnv();

  if (!e.apiKey) {
    // Sem chave: retorna um provider que lança erro claro ao ser usado.
    return new GoogleProvider('', e.model);
  }

  if (e.provider === 'anthropic') {
    return new AnthropicProvider(e.apiKey, e.model);
  }

  return new GoogleProvider(e.apiKey, e.model);
}

/** Obtém o provider em cache (útil para manter 1 instância por request). */
export function getAIProvider(): AIProvider {
  if (!cached) cached = createAIProvider();
  return cached;
}

/** True quando há chave configurada no ambiente atual. */
export function isAIEnabled(): boolean {
  return resolveAIEnv().apiKey.length > 0;
}
