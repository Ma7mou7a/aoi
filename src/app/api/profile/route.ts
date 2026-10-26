import { getProfileView } from "@/lib/server/profile";
import { handle, requireUser } from "@/lib/server/user";

export const GET = handle(async () => {
  const user = await requireUser();
  return Response.json(await getProfileView(user.id));
});
