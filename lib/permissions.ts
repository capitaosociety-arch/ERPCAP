export type SystemPermission =
  | 'permDashboard'
  | 'permPDV'
  | 'permComandas'
  | 'permProducts'
  | 'permStock'
  | 'permCustomers'
  | 'permFinance'
  | 'permUsers'
  | 'permDepot'
  | 'permInteligencia'
  | 'permAgenda'
  | 'permCopilot';

export function permissionGranted(
  user: ({ role?: string | null; isActive?: boolean } & Record<string, any>) | null | undefined,
  permission: SystemPermission
): boolean {
  if (!user || user.isActive === false) return false;
  return user.role === 'ADMIN' || user[permission] === true;
}
