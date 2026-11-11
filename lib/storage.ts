import { supabaseAdmin } from "@/lib/supabase";

export const INVOICE_BUCKET = "notas-fiscais";

/**
 * Registros novos guardam o caminho do objeto (ex.: "nf-123-arquivo.jpg").
 * URLs publicas legadas (http/https) nao sao aceitas para acesso server-side.
 */
export function isStoragePath(value: string | null | undefined): value is string {
  if (typeof value !== "string" || value.length === 0 || value.length > 1024) return false;
  if (/^https?:\/\//i.test(value)) return false;
  if (value.includes("\\")) return false;
  if (/[\u0000-\u001F]/.test(value)) return false;
  if (value.startsWith("/")) return false;
  if (value.split("/").includes("..")) return false;
  return true;
}

export async function downloadInvoiceObject(
  path: string
): Promise<{ data: ArrayBuffer; contentType: string } | null> {
  if (!isStoragePath(path)) return null;

  const { data, error } = await supabaseAdmin.storage
    .from(INVOICE_BUCKET)
    .download(path);

  if (error || !data) return null;

  return {
    data: await data.arrayBuffer(),
    contentType: data.type || "application/octet-stream"
  };
}
