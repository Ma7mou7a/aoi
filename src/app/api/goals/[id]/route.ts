import { dropGoal } from "@/lib/server/dashboard";
import { handle, HttpError, requireUser } from "@/lib/server/user";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Drop a goal (kept in the database as "dropped", hidden from the dashboard). */
export const DELETE = handle(async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  if (!UUID.test(id)) throw new HttpError(404, "Goal not found");
  await dropGoal(user.id, id);
  return Response.json({ ok: true });
});
