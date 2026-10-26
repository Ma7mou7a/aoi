import "server-only";
import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { db, schema } from "@/db";

export const USER_COOKIE = "ai4b_uid";
/** Version of the consent text shown at onboarding; stored with every consent row. */
export const POLICY_VERSION = "2026-10-26";

/** Anonymous, cookie-identified users: no email or password is ever collected. */
export async function getCurrentUser() {
  const id = (await cookies()).get(USER_COOKIE)?.value;
  if (!id || !/^[0-9a-f-]{36}$/.test(id)) return null;
  const [user] = await db.select().from(schema.users).where(eq(schema.users.id, id));
  return user ?? null;
}

export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) throw new HttpError(401, "No profile yet: complete onboarding first.");
  return user;
}

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

/** Wrap a route handler so HttpErrors become JSON responses. */
export function handle<A extends unknown[]>(fn: (...args: A) => Promise<Response>) {
  return async (...args: A) => {
    try {
      return await fn(...args);
    } catch (e) {
      if (e instanceof HttpError) return Response.json({ error: e.message }, { status: e.status });
      console.error(e);
      return Response.json({ error: "Internal error" }, { status: 500 });
    }
  };
}
