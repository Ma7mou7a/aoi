import { headers } from "next/headers";
import { z } from "zod";
import { readJson } from "@/lib/security/body";
import { WebAuthnError } from "@/lib/security/webauthn";
import { loadUser } from "@/lib/server/accounts";
import { guardAttempt } from "@/lib/server/attempts";
import { finishAuthentication, relyingParty } from "@/lib/server/passkeys";
import { handle, HttpError, startSession } from "@/lib/server/user";

const b64u = z.string().max(16_384).regex(/^[A-Za-z0-9_-]*$/);
const body = z.object({
  credential: z.object({
    id: b64u.max(1400),
    rawId: b64u.max(1400).optional(),
    type: z.literal("public-key").optional(),
    response: z.object({ clientDataJSON: b64u, authenticatorData: b64u, signature: b64u, userHandle: b64u.max(128).nullable().optional() }),
  }),
});

/** Step 2 of signing in with a passkey: verify the signature, then open a session. */
export const POST = handle(async (req: Request) => {
  const attempt = await guardAttempt();
  const { credential } = await readJson(req, body, { maxBytes: 32 * 1024 });
  try {
    const { userId } = await finishAuthentication(credential, relyingParty(await headers(), req.url));
    const user = await loadUser(userId);
    if (!user) throw new WebAuthnError("Profile not found");
    attempt.succeed();
    await startSession(user.id, "passkey");
    return Response.json({ displayName: user.displayName });
  } catch (e) {
    if (e instanceof WebAuthnError) {
      attempt.fail();
      throw new HttpError(401, "That passkey didn't work here. Try again, or use your sign-in key.");
    }
    throw e;
  }
});
