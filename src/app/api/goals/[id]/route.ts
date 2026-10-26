import { dropGoal } from "@/lib/server/dashboard";
import { handle, requireUser } from "@/lib/server/user";

/** Drop a goal (kept in the database as "dropped", hidden from the dashboard). */
export const DELETE = handle(async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const user = await requireUser();
  await dropGoal(user.id, (await ctx.params).id);
  return Response.json({ ok: true });
});
