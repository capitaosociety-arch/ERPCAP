// ===========================================================================
// Visão (imagem -> texto) com fallback de modelos — usado pelo OCR e pelo
// leitor de notas fiscais. Centraliza o comportamento que antes vivia dentro
// do route.ts (MODELS_FALLBACK + retry).
// ===========================================================================

import { createAIProvider } from './provider';
import { AIProviderError, type AIVisionImage } from './types';
import { sleep } from './retry';

// Modelos Google ordenados por prioridade (mais estável primeiro).
export const GOOGLE_VISION_MODELS = [
  'gemini-2.5-flash-preview-04-17', // Preview datado de Abril 2026 - confirmado funcional
  'gemini-2.5-flash',               // Versão estável 2.5
  'gemini-2.5-pro',                 // Pro 2.5 (maior cota de entrada)
  'gemini-2.5-flash-lite',          // Lite sem data de preview
  'gemini-1.5-pro-latest',          // Fallback legado Pro
  'gemini-1.5-flash-002',           // Variante 002 legada
];

/**
 * Gera texto a partir de uma imagem usando o provider ativo.
 * No provedor Google tenta os modelos de GOOGLE_VISION_MODELS em ordem,
 * pulando modelos inexistentes e aguardando em rate limit. Nos demais
 * provedores usa apenas o modelo padrão.
 */
export async function visionWithFallback(prompt: string, image: AIVisionImage): Promise<string> {
  const provider = createAIProvider();
  if (!provider.vision) {
    throw new AIProviderError('UNSUPPORTED', 'O provedor de IA configurado não suporta leitura de imagens.');
  }

  if (provider.id !== 'google') {
    if (image.mimeType === 'application/pdf') {
      throw new AIProviderError('UNSUPPORTED', 'O provedor de IA configurado não aceita PDF na leitura de notas. Use uma imagem (JPG/PNG).');
    }
    return provider.vision({ prompt, image });
  }

  let lastErr: unknown = null;
  for (const model of GOOGLE_VISION_MODELS) {
    try {
      return await provider.vision({ prompt, image, model });
    } catch (e: any) {
      lastErr = e;
      const code = e?.code as string | undefined;
      if (code === 'NOT_FOUND') {
        console.warn(`Modelo ${model} não encontrado, tentando próximo...`);
        continue;
      }
      if (code === 'RATE_LIMIT' || e?.message?.includes('quota') || e?.message?.includes('429')) {
        console.warn(`Rate limit no modelo ${model}. Aguardando 3s...`);
        await sleep(3000);
        try {
          return await provider.vision({ prompt, image, model });
        } catch (e2: any) {
          lastErr = e2;
          console.warn(`Falha no modelo ${model}:`, e2?.message || e2);
          continue;
        }
      }
      console.warn(`Falha no modelo ${model}:`, e?.message || e);
      continue;
    }
  }

  throw new Error(`Todos os modelos de IA falharam. ${(lastErr as any)?.message || 'Verifique sua chave de API.'}`);
}
