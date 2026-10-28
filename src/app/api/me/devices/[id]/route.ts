import { logSecurityEvent } from "@/lib/server/audit";
import { revokeSession } from "@/lib/server/auth";
import { clearSessionCookie, handle, HttpError, requireAuth } from "@/lib/server/user";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Sign out one device. Only the user's own sessions can be found here. */
export const DELETE = handle(async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { user, session } = await requireAuth();
  const { id } = await ctx.params;
  if (!UUID.test(id) || !(await revokeSession(user.id, id, "user"))) throw new HttpError(404, "That device isn't signed in.");
  await logSecurityEvent(user.id, "session_revoked", { current: id === session.id });
  if (id === session.id) await clearSessionCookie();
  return Response.json({ ok: true, current: id === session.id });
});
