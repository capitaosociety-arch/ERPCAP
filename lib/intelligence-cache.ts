type CacheEntry<T> = {
  value: T;
  expiresAt: number;
};

const store = new Map<string, CacheEntry<unknown>>();
const inflight = new Map<string, Promise<unknown>>();
let revision = 0;

export function cacheGet<T>(key: string): T | undefined {
  const entry = store.get(key);
  if (!entry) return undefined;
  if (entry.expiresAt <= Date.now()) {
    store.delete(key);
    return undefined;
  }
  return entry.value as T;
}

export function cacheSet<T>(key: string, value: T, ttlMs: number): T {
  store.set(key, { value, expiresAt: Date.now() + Math.max(1000, ttlMs) });
  return value;
}

export async function cacheWrap<T>(key: string, ttlMs: number, loader: () => Promise<T>): Promise<T> {
  const cached = cacheGet<T>(key);
  if (cached !== undefined) return cached;
  const pending = inflight.get(key);
  if (pending) return pending as Promise<T>;
  const loadRevision = revision;
  const promise = loader().then((value) => {
    if (loadRevision === revision) cacheSet(key, value, ttlMs);
    return value;
  }).finally(() => {
    if (inflight.get(key) === promise) inflight.delete(key);
  });
  inflight.set(key, promise);
  return promise;
}

export function invalidateCache(prefix?: string): void {
  revision++;
  if (!prefix) {
    store.clear();
    inflight.clear();
    return;
  }
  for (const key of store.keys()) {
    if (key.startsWith(prefix)) store.delete(key);
  }
  for (const key of inflight.keys()) {
    if (key.startsWith(prefix)) inflight.delete(key);
  }
}

export function invalidateOperationalCaches(): void {
  for (const prefix of ['strategy-', 'management-', 'pricing-report:', 'financial-', 'commercial-', 'copilot-answer:']) {
    invalidateCache(prefix);
  }
}

export function managementTtlMs(period: string, currentPeriod: string): number {
  return period === currentPeriod ? 30_000 : 5 * 60_000;
}

export function copilotAnswerTtlMs(): number {
  const parsed = Number(process.env.COPILOT_CACHE_TTL_MS || 120_000);
  return Number.isFinite(parsed) ? Math.max(5_000, Math.floor(parsed)) : 120_000;
}
