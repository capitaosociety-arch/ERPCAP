// ===========================================================================
// Resolução de ambiente da camada de IA.
//
// Variáveis (todas opcionais, com compatibilidade com as legadas):
//   AI_PROVIDER   = 'google' | 'anthropic'   (padrão: 'google')
//   AI_API_KEY    = chave genérica (usada por qualquer provedor, fallback)
//   AI_MODEL      = modelo a usar (padrão por provedor, sobrescreve)
//   GOOGLE_API_KEY / GEMINI_API_KEY = chaves legadas do Google
//   ANTHROPIC_API_KEY = chave do Claude
//
// Nunca imprime nem expõe o valor da chave: apenas prefixo curto p/ debug.
// ===========================================================================

export type AIProviderId = 'google' | 'anthropic';

export interface AIEnv {
  provider: AIProviderId;
  apiKey: string;
  model: string;
}

const DEFAULT_MODELS: Record<AIProviderId, string> = {
  google: 'gemini-2.5-flash',
  anthropic: 'claude-sonnet-4-5'
};

export function isProviderId(v: string): v is AIProviderId {
  return v === 'google' || v === 'anthropic';
}

export function resolveAIEnv(): AIEnv {
  const raw = (process.env.AI_PROVIDER || 'google').toLowerCase().trim();
  const provider: AIProviderId = isProviderId(raw) ? raw : 'google';

  let apiKey = '';
  if (provider === 'anthropic') {
    apiKey = process.env.ANTHROPIC_API_KEY || process.env.AI_API_KEY || '';
  } else {
    apiKey = process.env.AI_API_KEY || process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY || '';
  }

  const model = process.env.AI_MODEL?.trim() || DEFAULT_MODELS[provider];

  return { provider, apiKey, model };
}

/** Apenas prefixo para diagnóstico — nunca a chave completa. */
export function maskKey(key: string): string {
  if (!key) return '(vazia)';
  return key.length <= 12 ? key.slice(0, 4) + '…' : key.slice(0, 8) + '…';
}
