import { endCurrentSession, handle } from "@/lib/server/user";

/** Sign out of this browser: the session is revoked server-side (the profile stays; sign back in with the key). */
export const POST = handle(async () => {
  await endCurrentSession();
  return Response.json({ ok: true });
});
