import "server-only";
import { headers } from "next/headers";
import { clientAddress, signinLimiter } from "@/lib/security/rateLimit";
import { HttpError } from "./user";

/**
 * Gate for anything that checks a secret (sign-in key, device code, passkey): refuses locked-out
 * addresses, waits the progressive delay, and returns callbacks to record the outcome.
 */
export async function guardAttempt() {
  const ip = clientAddress(await headers());
  const c = signinLimiter.check(ip);
  if (!c.allowed) {
    const secs = Math.ceil(c.retryAfterMs / 1000);
    throw new HttpError(429, `Too many tries. Please wait ${Math.ceil(secs / 60)} minutes and try again.`, { "retry-after": String(secs) });
  }
  if (c.delayMs) await signinLimiter.pause(c.delayMs);
  return { fail: () => signinLimiter.fail(ip), succeed: () => signinLimiter.succeed(ip) };
}
