import { headers } from "next/headers";
import { WebAuthnError } from "@/lib/security/webauthn";
import { registrationOptions, relyingParty } from "@/lib/server/passkeys";
import { handle, HttpError, requireUser } from "@/lib/server/user";

/** Step 1 of adding a passkey: a fresh single-use challenge and the creation options. */
export const POST = handle(async (req: Request) => {
  const user = await requireUser();
  try {
    return Response.json(await registrationOptions(user, relyingParty(await headers(), req.url)), { headers: { "cache-control": "no-store" } });
  } catch (e) {
    if (e instanceof WebAuthnError) throw new HttpError(400, e.message);
    throw e;
  }
});
