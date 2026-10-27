import { getRewards } from "@/lib/server/rewards";
import { handle, requireUser } from "@/lib/server/user";

export const GET = handle(async () => {
  const user = await requireUser();
  return Response.json(await getRewards(user.id));
});
