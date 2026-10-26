import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { db, schema } from "@/db";
import { USER_COOKIE } from "@/lib/server/user";

/**
 * Development only: sign in as an existing user (e.g. the seeded demo account).
 * GET /api/dev/login?uid=<user id> → sets the session cookie and redirects to the dashboard.
 * Returns 404 in production builds.
 */
export async function GET(req: Request) {
  if (process.env.NODE_ENV === "production") return new Response("Not found", { status: 404 });
  const uid = new URL(req.url).searchParams.get("uid") ?? "";
  if (!/^[0-9a-f-]{36}$/.test(uid)) return new Response("Bad uid", { status: 400 });
  const [user] = await db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.id, uid));
  if (!user) return new Response("No such user", { status: 404 });
  (await cookies()).set(USER_COOKIE, user.id, { httpOnly: true, sameSite: "lax", path: "/" });
  return Response.redirect(new URL("/dashboard", req.url), 302);
}
