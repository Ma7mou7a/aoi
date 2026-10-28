/**
 * Failure-based rate limiting with progressive delay, for anything that checks a secret
 * (sign-in key, device-link code, passkey assertion). The first `freeFailures` mistakes cost nothing
 * (typos happen); after that each failure doubles the wait before the next attempt is even evaluated;
 * after `maxFailures` within the window the address is locked out until the window passes.
 *
 * In memory, per server process: enough for one instance. Several instances behind a load balancer
 * would need a shared store (documented in docs/security.md).
 */
export type LimitCheck = { allowed: true; delayMs: number } | { allowed: false; retryAfterMs: number };

export function createLimiter(opts: { windowMs: number; maxFailures: number; freeFailures: number; baseDelayMs: number; maxDelayMs: number; clock?: () => number }) {
  const now = opts.clock ?? Date.now;
  const failures = new Map<string, number[]>();

  const recent = (key: string) => {
    const t = now();
    const list = (failures.get(key) ?? []).filter((at) => t - at < opts.windowMs);
    if (list.length) failures.set(key, list);
    else failures.delete(key);
    return list;
  };

  const sweep = () => {
    for (const key of [...failures.keys()]) recent(key);
  };

  return {
    check(key: string): LimitCheck {
      const list = recent(key);
      if (list.length >= opts.maxFailures) return { allowed: false, retryAfterMs: opts.windowMs - (now() - list[0]) };
      const extra = list.length - opts.freeFailures;
      return { allowed: true, delayMs: extra < 0 ? 0 : Math.min(opts.baseDelayMs * 2 ** extra, opts.maxDelayMs) };
    },
    fail(key: string) {
      if (failures.size > 500) sweep();
      failures.set(key, [...recent(key), now()]);
    },
    succeed(key: string) {
      failures.delete(key);
    },
    size: () => failures.size,
    /** Wait before evaluating an attempt (replaceable in tests). */
    pause: (ms: number) => sleep(ms),
  };
}

/** Shared limiter for every secret-checking endpoint (sign-in key, device code, passkey). */
export const signinLimiter = createLimiter({ windowMs: 15 * 60_000, maxFailures: 10, freeFailures: 3, baseDelayMs: 250, maxDelayMs: 8000 });

/** The client address as seen by the app (first X-Forwarded-For hop when behind a proxy). Never stored. */
export function clientAddress(h: Headers) {
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "local";
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
