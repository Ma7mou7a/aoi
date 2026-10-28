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

/** Plain request cap for endpoints that create rows without a session (passkey challenges): 30 a minute per address. */
export const challengeLimiter = createLimiter({ windowMs: 60_000, maxFailures: 30, freeFailures: 30, baseDelayMs: 0, maxDelayMs: 0 });

/**
 * Server-wide cap on failed guesses of typed secrets (sign-in key, device code), whatever address they
 * come from: spreading guesses over many addresses buys nothing past ~2 a second. Passkeys skip it (they
 * can't be guessed), so someone flooding this can slow typed sign-ins down but never lock passkeys out.
 */
export const floodLimiter = createLimiter({ windowMs: 60_000, maxFailures: 120, freeFailures: 120, baseDelayMs: 0, maxDelayMs: 0 });
export const FLOOD_KEY = "all";

/**
 * The client address as seen by the app, as a rate-limit key. Never stored.
 *
 * X-Forwarded-For is written by whoever sent the request, so only the hops added by our own proxies can
 * be trusted: set AI4B_TRUSTED_PROXIES to how many sit in front of the app (1 behind nginx or Vercel)
 * and the entry the outermost one added is used. With none set, Next.js fills the header from the socket
 * only when the client didn't send one, so the value may be forged; the flood cap above still holds then.
 * IPv6 addresses are grouped by /64, the block one home connection usually gets.
 */
export function clientAddress(h: Headers, trustedProxies = Number(process.env.AI4B_TRUSTED_PROXIES ?? 0)) {
  const hops = (h.get("x-forwarded-for") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const n = Number.isInteger(trustedProxies) && trustedProxies > 0 ? trustedProxies : 0;
  const ip = n > 0 ? (hops[Math.max(0, hops.length - n)] ?? h.get("x-real-ip")) : hops[hops.length - 1];
  return ip ? addressKey(ip) : "local";
}

/** Normalise one address: IPv4 as is, IPv6 cut to its /64 prefix (so a host can't rotate through its block). */
export function addressKey(raw: string) {
  let ip = raw.trim().toLowerCase();
  const bracketed = /^\[([^\]]+)\](?::\d+)?$/.exec(ip);
  if (bracketed) ip = bracketed[1];
  else if (/^\d+\.\d+\.\d+\.\d+:\d+$/.test(ip)) ip = ip.slice(0, ip.lastIndexOf(":"));
  ip = ip.replace(/%.*$/, "");
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(ip);
  if (mapped) return mapped[1];
  if (!ip.includes(":")) return ip;
  const [head, tail = ""] = ip.split("::");
  const left = head ? head.split(":") : [];
  const right = ip.includes("::") && tail ? tail.split(":") : [];
  const groups = ip.includes("::") ? [...left, ...Array(Math.max(0, 8 - left.length - right.length)).fill("0"), ...right] : left;
  return `${groups.slice(0, 4).map((g) => parseInt(g || "0", 16).toString(16)).join(":")}::/64`;
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
