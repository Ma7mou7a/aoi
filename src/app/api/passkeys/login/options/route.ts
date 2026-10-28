import { headers } from "next/headers";
import { challengeLimiter, clientAddress } from "@/lib/security/rateLimit";
import { authenticationOptions, relyingParty } from "@/lib/server/passkeys";
import { handle, HttpError } from "@/lib/server/user";

/** Step 1 of signing in with a passkey: a fresh single-use challenge (no user is named). */
export const POST = handle(async (req: Request) => {
  const h = await headers();
  // Each call stores a (hashed, 5-minute) challenge, so cap how fast one address can ask.
  const ip = clientAddress(h);
  if (!challengeLimiter.check(ip).allowed) throw new HttpError(429, "Too many tries. Please wait a minute.", { "retry-after": "60" });
  challengeLimiter.fail(ip);
  return Response.json(await authenticationOptions(relyingParty(h, req.url)), { headers: { "cache-control": "no-store" } });
});
