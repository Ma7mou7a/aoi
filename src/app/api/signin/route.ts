import { eq } from "drizzle-orm";
import { cookies, headers } from "next/headers";
import { z } from "zod";
import { db, schema } from "@/db";
import { hashSigninKey, normaliseSigninKey } from "@/lib/signinKey";
import { handle, HttpError, USER_COOKIE } from "@/lib/server/user";

const body = z.object({ key: z.string().max(64) });

// Gentle brake on guessing (keys have 80 random bits, so this is belt and braces): 10 tries a minute per address.
const attempts = new Map<string, number[]>();
function allow(ip: string) {
  const now = Date.now();
  const recent = (attempts.get(ip) ?? []).filter((t) => now - t < 60_000);
  recent.push(now);
  attempts.set(ip, recent);
  return recent.length <= 10;
}

/** Sign in on this browser with a sign-in key. */
export const POST = handle(async (req: Request) => {
  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  if (!allow(ip)) throw new HttpError(429, "Too many attempts. Wait a minute and try again.");
  const parsed = body.safeParse(await req.json());
  const key = parsed.success ? normaliseSigninKey(parsed.data.key) : null;
  if (!key) throw new HttpError(400, "A sign-in key has 16 letters and digits, like K7QM-2XRP-9TFD-W4HN.");
  const [user] = await db.select({ id: schema.users.id, retentionDays: schema.users.retentionDays, displayName: schema.users.displayName })
    .from(schema.users).where(eq(schema.users.signinKeyHash, hashSigninKey(key)));
  if (!user) throw new HttpError(401, "That key doesn't match a profile. Check it and try again.");
  (await cookies()).set(USER_COOKIE, user.id, { httpOnly: true, sameSite: "lax", path: "/", maxAge: user.retentionDays * 86_400 });
  return Response.json({ displayName: user.displayName });
});
