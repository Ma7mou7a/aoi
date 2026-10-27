import { award, getRewards } from "@/lib/server/rewards";
import { handle, requireUser } from "@/lib/server/user";

/** Open today's gift: 5 bamboo, once per UTC day (a second open is a no-op). */
export const POST = handle(async () => {
  const user = await requireUser();
  const awarded = await award(user.id, "daily_visit");
  return Response.json({ awarded, rewards: await getRewards(user.id) });
});
