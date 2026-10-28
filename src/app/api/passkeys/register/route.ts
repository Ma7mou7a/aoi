import { headers } from "next/headers";
import { z } from "zod";
import { readJson } from "@/lib/security/body";
import { describeDevice } from "@/lib/security/tokens";
import { WebAuthnError } from "@/lib/security/webauthn";
import { logSecurityEvent } from "@/lib/server/audit";
import { finishRegistration, relyingParty } from "@/lib/server/passkeys";
import { handle, HttpError, requireUser } from "@/lib/server/user";

const b64u = z.string().max(16_384).regex(/^[A-Za-z0-9_-]*$/);
const body = z.object({
  credential: z.object({
    id: b64u.max(1400),
    rawId: b64u.max(1400).optional(),
    type: z.literal("public-key").optional(),
    response: z.object({ clientDataJSON: b64u, attestationObject: b64u, transports: z.array(z.string().max(32)).max(8).optional() }),
  }),
  label: z.string().trim().min(1).max(40).regex(/^[^\p{C}<>]+$/u).optional(),
});

/** Step 2 of adding a passkey: verify the authenticator's response and store its public key. */
export const POST = handle(async (req: Request) => {
  const user = await requireUser();
  const { credential, label } = await readJson(req, body, { maxBytes: 32 * 1024 });
  const h = await headers();
  try {
    const pk = await finishRegistration(user.id, credential, relyingParty(h, req.url), label ?? `Passkey on ${describeDevice(h.get("user-agent"))}`);
    await logSecurityEvent(user.id, "passkey_added", { label: pk.label });
    return Response.json({ id: pk.id, label: pk.label });
  } catch (e) {
    if (e instanceof WebAuthnError) throw new HttpError(400, `This passkey couldn't be added: ${e.message}.`);
    throw e;
  }
});
