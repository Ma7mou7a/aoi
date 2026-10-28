import "server-only";
import { headers } from "next/headers";
import { clientAddress, FLOOD_KEY, floodLimiter, signinLimiter } from "@/lib/security/rateLimit";
import { HttpError } from "./user";

/**
 * Gate for anything that checks a secret (sign-in key, device code, passkey): refuses locked-out
 * addresses, waits the progressive delay, and returns callbacks to record the outcome. Typed secrets
 * also count against the server-wide flood cap; passkeys don't, so they keep working during a flood.
 */
export async function guardAttempt(kind: "typed" | "passkey" = "typed") {
  const ip = clientAddress(await headers());
  const c = signinLimiter.check(ip);
  if (!c.allowed) {
    const secs = Math.ceil(c.retryAfterMs / 1000);
    throw new HttpError(429, `Too many tries. Please wait ${Math.ceil(secs / 60)} minutes and try again.`, { "retry-after": String(secs) });
  }
  if (kind === "typed" && !floodLimiter.check(FLOOD_KEY).allowed) {
    throw new HttpError(429, "Sign-in by key or code is busy right now. Please try again in a minute, or use your passkey.", { "retry-after": "60" });
  }
  if (c.delayMs) await signinLimiter.pause(c.delayMs);
  return {
    fail: () => {
      signinLimiter.fail(ip);
      if (kind === "typed") floodLimiter.fail(FLOOD_KEY);
    },
    succeed: () => signinLimiter.succeed(ip),
  };
}
