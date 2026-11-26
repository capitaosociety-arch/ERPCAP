export function isValidOperationKey(key: unknown): key is string {
  return typeof key === 'string' && /^[A-Za-z0-9-]{16,100}$/.test(key.trim());
}

export function buildOperationMarker(namespace: string, key: string): string {
  return `${namespace}:${key.trim()}`;
}

export function buildOperationDetail(marker: string, resource: string, id: string): string {
  return `${marker}#${resource}:${id}`;
}

export function readOperationResourceId(
  details: string | null | undefined,
  resource: string,
): string | null {
  if (!details) return null;
  const token = `#${resource}:`;
  const index = details.indexOf(token);
  if (index < 0) return null;
  const id = details.slice(index + token.length).trim();
  return id || null;
}
