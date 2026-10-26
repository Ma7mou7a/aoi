import { regeneratePlan } from "@/lib/server/dashboard";
import { handle, requireUser } from "@/lib/server/user";

/** Rebuild this week's plan from the current Brain Twin (the old plan is kept as "superseded"). */
export const POST = handle(async () => {
  const user = await requireUser();
  const plan = await regeneratePlan(user.id);
  return Response.json({ id: plan.id });
});
