import { logSecurityEvent } from "@/lib/server/audit";
import { removePasskey } from "@/lib/server/passkeys";
import { handle, HttpError, requireUser } from "@/lib/server/user";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Remove one of the user's passkeys (it stops working here; the device may still list it until deleted there). */
export const DELETE = handle(async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  const removed = UUID.test(id) ? await removePasskey(user.id, id) : null;
  if (!removed) throw new HttpError(404, "Passkey not found");
  await logSecurityEvent(user.id, "passkey_removed", { label: removed.label });
  return Response.json({ ok: true });
});
