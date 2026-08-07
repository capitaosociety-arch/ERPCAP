// ===========================================================================
// Extração robusta de JSON de respostas de IA. Centraliza o que antes estava
// duplicado em ocr/route.ts, invoice-ai.ts e import-actions.ts.
// ===========================================================================

/** Extrai o primeiro valor JSON (objeto ou array) do texto e faz o parse. */
export function extractJson<T = any>(text: string): T {
  const clean = text
    .replace(/```json/gi, '')
    .replace(/```/g, '')
    .trim();

  const objStart = clean.indexOf('{');
  const arrStart = clean.indexOf('[');
  const starts = [objStart, arrStart].filter(i => i !== -1);
  if (starts.length === 0) {
    throw new Error('A resposta da IA não contém JSON válido.');
  }
  const start = Math.min(...starts);
  const isObject = clean[start] === '{';
  const end = clean.lastIndexOf(isObject ? '}' : ']');
  if (end === -1 || end < start) {
    throw new Error('A resposta da IA não contém JSON válido.');
  }
  const jsonStr = clean.substring(start, end + 1);
  try {
    return JSON.parse(jsonStr) as T;
  } catch {
    throw new Error('Falha ao interpretar o JSON retornado pela IA.');
  }
}
