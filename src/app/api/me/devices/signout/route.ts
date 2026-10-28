import { z } from "zod";
import { readJson } from "@/lib/security/body";
import { logSecurityEvent } from "@/lib/server/audit";
import { revokeAllSessions } from "@/lib/server/auth";
import { clearSessionCookie, handle, requireAuth } from "@/lib/server/user";

const body = z.object({ scope: z.enum(["others", "all"]) }).strict();

/** "Sign out every other device" (scope: others) or "sign out everywhere" (scope: all, this browser too). */
export const POST = handle(async (req: Request) => {
  const { user, session } = await requireAuth();
  const { scope } = await readJson(req, body, { maxBytes: 256 });
  const signedOut = await revokeAllSessions(user.id, { except: scope === "others" ? session.id : undefined, reason: scope === "all" ? "signed_out_everywhere" : "signed_out_others" });
  await logSecurityEvent(user.id, "signed_out_everywhere", { scope, count: signedOut });
  if (scope === "all") await clearSessionCookie();
  return Response.json({ signedOut });
});
