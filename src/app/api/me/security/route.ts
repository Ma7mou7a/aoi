import { getSecurityOverview } from "@/lib/server/security";
import { handle, requireAuth } from "@/lib/server/user";

/** Settings → Security & privacy: encryption status, devices, passkeys, recent activity, log check. */
export const GET = handle(async () => {
  const { user, session } = await requireAuth();
  return Response.json(await getSecurityOverview(user.id, session.id), { headers: { "cache-control": "no-store" } });
});
