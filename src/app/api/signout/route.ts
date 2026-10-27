import { cookies } from "next/headers";
import { USER_COOKIE } from "@/lib/server/user";

/** Sign out of this browser (the profile itself stays; sign back in with the sign-in key). */
export async function POST() {
  (await cookies()).delete(USER_COOKIE);
  return Response.json({ ok: true });
}
