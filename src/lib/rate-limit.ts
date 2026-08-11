type RateLimitEntry = {
  count: number;
  resetAt: number;
};

type RateLimitStore = Map<string, RateLimitEntry>;

const globalRateLimit = globalThis as typeof globalThis & {
  __omnininjaRateLimits?: RateLimitStore;
};

const store = globalRateLimit.__omnininjaRateLimits ?? new Map<string, RateLimitEntry>();
globalRateLimit.__omnininjaRateLimits = store;

function clientAddress(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  return (
    request.headers.get('cf-connecting-ip') ||
    request.headers.get('x-real-ip') ||
    forwarded ||
    'unknown'
  ).slice(0, 120);
}

function pruneExpired(now: number) {
  if (store.size < 10_000) return;
  for (const [key, entry] of store) {
    if (entry.resetAt <= now) store.delete(key);
  }
  if (store.size >= 10_000) store.clear();
}

export function checkRateLimit(
  request: Request,
  scope: string,
  limit: number,
  windowMs: number,
  discriminator = '',
): { ok: true } | { ok: false; retryAfterSeconds: number } {
  const now = Date.now();
  pruneExpired(now);

  const key = [scope, clientAddress(request), discriminator.toLowerCase().slice(0, 320)].join(':');
  const current = store.get(key);
  if (!current || current.resetAt <= now) {
    store.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true };
  }

  if (current.count >= limit) {
    return {
      ok: false,
      retryAfterSeconds: Math.max(1, Math.ceil((current.resetAt - now) / 1000)),
    };
  }

  current.count += 1;
  return { ok: true };
}

export function rateLimitResponse(retryAfterSeconds: number): Response {
  return Response.json(
    { error: 'Muitas tentativas. Aguarde um pouco e tente novamente.' },
    {
      status: 429,
      headers: { 'retry-after': String(retryAfterSeconds) },
    },
  );
}
