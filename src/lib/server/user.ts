import "server-only";
import { cookies, headers } from "next/headers";
import { cache } from "react";
import { BodyError } from "@/lib/security/body";
import { describeDevice } from "@/lib/security/tokens";
import { decryptUser, POLICY_VERSION } from "./accounts";
import { logSecurityEvent } from "./audit";
import { createSession, resolveSession, revokeSession, type SessionMethod } from "./auth";

export { POLICY_VERSION };

const PRODUCTION = process.env.NODE_ENV === "production";
/**
 * The sign-in cookie: an opaque random token (see ./auth.ts), HttpOnly, SameSite=Lax, and in production
 * Secure with the __Host- prefix (which the browser only accepts over HTTPS, for this exact host, path /).
 */
export const SESSION_COOKIE = PRODUCTION ? "__Host-ai4b_session" : "ai4b_session";
/** The old cookie held the raw user id; it is no longer accepted and is cleared on sign-in. */
const LEGACY_COOKIE = "ai4b_uid";

export const sessionCookieOptions = (expires: Date) => ({ httpOnly: true, sameSite: "lax" as const, secure: PRODUCTION, path: "/", expires });

/** Resolve the cookie once per request (layout and page both ask). */
const currentAuth = cache(async () => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const row = await resolveSession(token);
  if (!row) return null;
  return { user: await decryptUser(row.user), session: row.session };
});

/** Anonymous users: no email or password is ever collected. Personal fields come back decrypted. */
export async function getCurrentUser() {
  return (await currentAuth())?.user ?? null;
}

export async function getCurrentSession() {
  return (await currentAuth())?.session ?? null;
}

export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) throw new HttpError(401, "No profile yet: complete onboarding first.");
  return user;
}

export async function requireAuth() {
  const auth = await currentAuth();
  if (!auth) throw new HttpError(401, "No profile yet: complete onboarding first.");
  return auth;
}

/**
 * Sign this browser in as `userId`. Always issues a brand-new token (session rotation): any session the
 * browser already had is revoked, so a token planted before sign-in (session fixation) is worthless.
 */
export async function startSession(userId: string, method: SessionMethod) {
  const jar = await cookies();
  const previous = await resolveSession(jar.get(SESSION_COOKIE)?.value);
  if (previous) await revokeSession(previous.user.id, previous.session.id, "rotated");
  const deviceLabel = describeDevice((await headers()).get("user-agent"));
  const { token, session } = await createSession(userId, { deviceLabel, method });
  jar.set(SESSION_COOKIE, token, sessionCookieOptions(session.expiresAt));
  jar.delete(LEGACY_COOKIE);
  await logSecurityEvent(userId, method === "signup" ? "sign_up" : "sign_in", { method, device: deviceLabel });
  return session;
}

/** Sign this browser out: the session is revoked server-side, not just forgotten by the browser. */
export async function endCurrentSession() {
  const jar = await cookies();
  const current = await resolveSession(jar.get(SESSION_COOKIE)?.value);
  if (current) {
    await revokeSession(current.user.id, current.session.id, "signed_out");
    await logSecurityEvent(current.user.id, "sign_out", { device: current.session.deviceLabel });
  }
  jar.delete(SESSION_COOKIE);
  jar.delete(LEGACY_COOKIE);
}

/** Forget the cookie only (after the session was already revoked, e.g. sign out everywhere). */
export async function clearSessionCookie() {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
  jar.delete(LEGACY_COOKIE);
}

export class HttpError extends Error {
  constructor(public status: number, message: string, public headers?: Record<string, string>) {
    super(message);
  }
}

/** Wrap a route handler so HttpErrors become JSON responses. */
export function handle<A extends unknown[]>(fn: (...args: A) => Promise<Response>) {
  return async (...args: A) => {
    try {
      return await fn(...args);
    } catch (e) {
      if (e instanceof HttpError) return Response.json({ error: e.message }, { status: e.status, headers: e.headers });
      if (e instanceof BodyError) return Response.json({ error: e.message }, { status: e.status });
      console.error(e);
      return Response.json({ error: "Internal error" }, { status: 500 });
    }
  };
}
