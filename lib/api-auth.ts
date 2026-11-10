import { NextResponse } from "next/server";
import {
  getAuthUser,
  hasPermission,
  type AuthUser,
  type Permission
} from "@/lib/auth-guard";

export type ApiAuthResult =
  | { user: AuthUser; response?: undefined }
  | { user?: undefined; response: NextResponse };

export async function requireApiUser(): Promise<ApiAuthResult> {
  const user = await getAuthUser();

  if (!user) {
    return {
      response: NextResponse.json(
        { success: false, error: "Não autenticado" },
        { status: 401 }
      )
    };
  }

  return { user };
}

export async function requireApiPermission(
  permission: Permission | Permission[]
): Promise<ApiAuthResult> {
  const auth = await requireApiUser();
  if (auth.response) return auth;

  const permissions = Array.isArray(permission) ? permission : [permission];
  if (!permissions.some((p) => hasPermission(auth.user, p))) {
    return {
      response: NextResponse.json(
        { success: false, error: "Acesso negado" },
        { status: 403 }
      )
    };
  }

  return auth;
}

export async function requireApiAdmin(): Promise<ApiAuthResult> {
  const auth = await requireApiUser();
  if (auth.response) return auth;

  if (auth.user.role !== "ADMIN") {
    return {
      response: NextResponse.json(
        { success: false, error: "Acesso restrito a administradores" },
        { status: 403 }
      )
    };
  }

  return auth;
}
