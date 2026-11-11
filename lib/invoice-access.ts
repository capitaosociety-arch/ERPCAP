import { prisma } from "@/lib/prisma";
import {
  getAuthUser,
  hasPermission,
  type AuthUser,
  type Permission
} from "@/lib/auth-guard";
import { isStoragePath } from "@/lib/storage";

export type InvoiceType = "stock" | "depot";

export type InvoiceAccessResult =
  | { ok: true; path: string; user: AuthUser }
  | { ok: false; status: 400 | 401 | 403 | 404; error: string };

export async function authorizeInvoiceAccess(
  type: string,
  id: string
): Promise<InvoiceAccessResult> {
  if (type !== "stock" && type !== "depot") {
    return { ok: false, status: 400, error: "Tipo de documento invalido" };
  }

  const user = await getAuthUser();
  if (!user) {
    return { ok: false, status: 401, error: "Nao autenticado" };
  }

  const permission: Permission = type === "stock" ? "permStock" : "permDepot";
  if (!hasPermission(user, permission)) {
    return { ok: false, status: 403, error: "Acesso negado" };
  }

  if (!id || id.length > 100) {
    return { ok: false, status: 404, error: "Documento nao encontrado" };
  }

  const row = type === "stock"
    ? await prisma.stockMovement.findUnique({
        where: { id },
        select: { imageUrl: true }
      })
    : await prisma.depotMovement.findUnique({
        where: { id },
        select: { imageUrl: true }
      });

  if (!row?.imageUrl || !isStoragePath(row.imageUrl)) {
    return { ok: false, status: 404, error: "Documento nao encontrado" };
  }

  return { ok: true, path: row.imageUrl, user };
}
