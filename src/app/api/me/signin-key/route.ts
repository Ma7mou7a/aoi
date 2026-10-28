import { replaceSigninKey } from "@/lib/server/accounts";
import { logSecurityEvent } from "@/lib/server/audit";
import { revokeAllSessions } from "@/lib/server/auth";
import { handle, requireAuth } from "@/lib/server/user";

/**
 * Create (or replace) this profile's sign-in key. The key is returned once; only its hash is stored.
 * Replacing a key is what you do when it may have leaked, so every other device is signed out too.
 */
export const POST = handle(async () => {
  const { user, session } = await requireAuth();
  const key = await replaceSigninKey(user.id);
  const ended = await revokeAllSessions(user.id, { except: session.id, reason: "key_replaced" });
  await logSecurityEvent(user.id, "signin_key_replaced", { otherDevicesSignedOut: ended });
  return Response.json({ key, otherDevicesSignedOut: ended });
});
