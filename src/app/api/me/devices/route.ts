import { listSessions } from "@/lib/server/auth";
import { handle, requireAuth } from "@/lib/server/user";

/** The browsers and devices currently signed in to this profile. */
export const GET = handle(async () => {
  const { user, session } = await requireAuth();
  return Response.json({ sessions: await listSessions(user.id, session.id) });
});
