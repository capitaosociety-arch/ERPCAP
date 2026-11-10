import { supabaseAdmin } from "@/lib/supabase";

export const INVOICE_BUCKET = "notas-fiscais";
export const INVOICE_SIGNED_URL_TTL = 60 * 60; // 1 hora

/**
 * Registros novos guardam o caminho do objeto (ex.: "nf-123-arquivo.jpg").
 * Registros legados guardam uma URL pública completa.
 */
export function isStoragePath(value: string | null | undefined): value is string {
  return typeof value === "string" && value.length > 0 && !/^https?:\/\//i.test(value);
}

export async function createInvoiceSignedUrl(
  path: string,
  expiresIn: number = INVOICE_SIGNED_URL_TTL
): Promise<string | null> {
  if (!isStoragePath(path)) return null;

  const { data, error } = await supabaseAdmin.storage
    .from(INVOICE_BUCKET)
    .createSignedUrl(path, expiresIn);

  if (error) {
    console.error("Erro ao gerar URL assinada da nota fiscal:", error.message);
    return null;
  }

  return data?.signedUrl ?? null;
}

/**
 * Converte um valor armazenado em URL utilizável no navegador.
 * - Caminho novo -> URL assinada de curta duração.
 * - URL legada (http/https) -> devolve como está.
 */
export async function resolveInvoiceImageUrl(
  value: string | null | undefined
): Promise<string | null> {
  if (!value) return null;
  if (!isStoragePath(value)) return value;
  return createInvoiceSignedUrl(value);
}

export async function attachSignedInvoiceUrls<T extends { imageUrl?: string | null }>(
  rows: T[]
): Promise<T[]> {
  return Promise.all(
    rows.map(async (row) => ({
      ...row,
      imageUrl: await resolveInvoiceImageUrl(row.imageUrl)
    }))
  );
}
