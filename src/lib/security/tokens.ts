import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

/** A 256-bit random, URL-safe secret (session cookies, device links, WebAuthn challenges). */
export const newToken = () => randomBytes(32).toString("base64url");

/** Tokens are stored only as SHA-256: a database leak gives nothing that can be replayed. */
export const hashToken = (token: string) => createHash("sha256").update(`ai4brain-token:${token}`).digest("hex");

/** Constant-time string comparison (length is not secret here: both sides are fixed-size hashes). */
export function safeEqual(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** "Chrome on Windows": enough to recognise a device in the list, without keeping a fingerprint. */
export function describeDevice(ua: string | null | undefined): string {
  if (!ua) return "Unknown browser";
  const browser = /Edg\//.test(ua) ? "Edge"
    : /OPR\/|Opera/.test(ua) ? "Opera"
    : /Firefox\//.test(ua) ? "Firefox"
    : /Chrome\/|CriOS\//.test(ua) ? "Chrome"
    : /Safari\//.test(ua) ? "Safari"
    : null;
  const os = /iPhone/.test(ua) ? "iPhone"
    : /iPad/.test(ua) ? "iPad"
    : /Android/.test(ua) ? "Android"
    : /Windows/.test(ua) ? "Windows"
    : /Mac OS X|Macintosh/.test(ua) ? "Mac"
    : /CrOS/.test(ua) ? "ChromeOS"
    : /Linux/.test(ua) ? "Linux"
    : null;
  if (!browser) return "Unknown browser";
  return os ? `${browser} on ${os}` : browser;
}
