import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";

export type Permission =
  | "permDashboard"
  | "permPDV"
  | "permComandas"
  | "permProducts"
  | "permStock"
  | "permCustomers"
  | "permFinance"
  | "permUsers"
  | "permDepot"
  | "permInteligencia"
  | "permCopilot";

export interface AuthUser {
  id: string;
  name: string;
  email: string | null;
  role: string;
  isActive: boolean;
  permDashboard: boolean;
  permPDV: boolean;
  permComandas: boolean;
  permProducts: boolean;
  permStock: boolean;
  permCustomers: boolean;
  permFinance: boolean;
  permUsers: boolean;
  permDepot: boolean;
  permInteligencia: boolean;
  permCopilot: boolean;
}

export class AuthError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "AuthError";
    this.status = status;
  }
}

/**
 * Carrega o usuário da sessão e confirma no banco que ele ainda existe e
 * está ativo. Isso evita que um JWT antigo continue válido após desativação
 * ou mudança de permissões.
 */
export async function getAuthUser(): Promise<AuthUser | null> {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) return null;

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || !user.isActive) return null;

  return user as unknown as AuthUser;
}

export async function requireUser(): Promise<AuthUser> {
  const user = await getAuthUser();
  if (!user) throw new AuthError("Não autenticado", 401);
  return user;
}

export function hasPermission(user: AuthUser, permission: Permission): boolean {
  return user.role === "ADMIN" || Boolean(user[permission]);
}

export async function requirePermission(
  permission: Permission | Permission[]
): Promise<AuthUser> {
  const user = await requireUser();
  const permissions = Array.isArray(permission) ? permission : [permission];

  if (!permissions.some((p) => hasPermission(user, p))) {
    throw new AuthError("Acesso negado", 403);
  }

  return user;
}

/**
 * Guard para Server Components (páginas) que exigem apenas login ativo.
 */
export async function requirePageAuth(): Promise<AuthUser> {
  const user = await getAuthUser();
  if (!user) redirect("/login");
  return user;
}

/**
 * Guard para Server Components (páginas). Redireciona em vez de lançar erro.
 */
export async function requirePagePermission(
  permission: Permission | Permission[]
): Promise<AuthUser> {
  const user = await getAuthUser();
  if (!user) redirect("/login");

  const permissions = Array.isArray(permission) ? permission : [permission];
  if (!permissions.some((p) => hasPermission(user, p))) {
    redirect("/dashboard");
  }

  return user;
}
