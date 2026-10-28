import "server-only";
import { and, desc, eq, gt, isNull, ne } from "drizzle-orm";
import { db, schema } from "@/db";
import { hashToken, newToken, safeEqual } from "@/lib/security/tokens";

/**
 * Sign-in sessions. The cookie carries a random 256-bit token; the database keeps only its SHA-256,
 * so neither a database leak nor a log line can be replayed as a login. Sessions end after
 * 30 days without use (idle) and 90 days after sign-in (absolute), or when revoked.
 */
export const SESSION_IDLE_MS = 30 * 86_400_000;
export const SESSION_MAX_MS = 90 * 86_400_000;
/** Don't write lastSeenAt on every request. */
const TOUCH_EVERY_MS = 10 * 60_000;

export type SessionMethod = "signup" | "key" | "passkey" | "device_link" | "dev";
export type AuthSession = typeof schema.authSessions.$inferSelect;

export async function createSession(userId: string, opts: { deviceLabel: string; method: SessionMethod }, now = new Date()) {
  const token = newToken();
  const [session] = await db
    .insert(schema.authSessions)
    .values({ userId, tokenHash: hashToken(token), deviceLabel: opts.deviceLabel, method: opts.method, createdAt: now, lastSeenAt: now, expiresAt: new Date(now.getTime() + SESSION_MAX_MS) })
    .returning();
  return { token, session };
}

/** The session and user behind a cookie token, or null if unknown, revoked or expired. */
export async function resolveSession(token: string | undefined | null, now = new Date()) {
  if (!token || token.length > 128) return null;
  const tokenHash = hashToken(token);
  const [row] = await db
    .select({ session: schema.authSessions, user: schema.users })
    .from(schema.authSessions)
    .innerJoin(schema.users, eq(schema.users.id, schema.authSessions.userId))
    .where(eq(schema.authSessions.tokenHash, tokenHash));
  // The index lookup already matched; the constant-time check is defence in depth.
  if (!row || !safeEqual(row.session.tokenHash, tokenHash) || row.session.revokedAt) return null;
  const s = row.session;
  if (now >= s.expiresAt) {
    await endSession(s.id, "expired", now);
    return null;
  }
  if (now.getTime() - s.lastSeenAt.getTime() > SESSION_IDLE_MS) {
    await endSession(s.id, "idle", now);
    return null;
  }
  if (now.getTime() - s.lastSeenAt.getTime() > TOUCH_EVERY_MS) {
    await db.update(schema.authSessions).set({ lastSeenAt: now }).where(eq(schema.authSessions.id, s.id));
    s.lastSeenAt = now;
  }
  return row;
}

async function endSession(id: string, reason: string, now = new Date()) {
  await db.update(schema.authSessions).set({ revokedAt: now, revokedReason: reason }).where(and(eq(schema.authSessions.id, id), isNull(schema.authSessions.revokedAt)));
}

/** Revoke one of the user's own sessions. False if it isn't theirs or already ended. */
export async function revokeSession(userId: string, sessionId: string, reason: string) {
  const rows = await db
    .update(schema.authSessions)
    .set({ revokedAt: new Date(), revokedReason: reason })
    .where(and(eq(schema.authSessions.id, sessionId), eq(schema.authSessions.userId, userId), isNull(schema.authSessions.revokedAt)))
    .returning({ id: schema.authSessions.id });
  return rows.length > 0;
}

/** Sign out everywhere (optionally keeping one session, e.g. the current one). Returns how many ended. */
export async function revokeAllSessions(userId: string, opts: { except?: string; reason: string }) {
  const rows = await db
    .update(schema.authSessions)
    .set({ revokedAt: new Date(), revokedReason: opts.reason })
    .where(and(eq(schema.authSessions.userId, userId), isNull(schema.authSessions.revokedAt), opts.except ? ne(schema.authSessions.id, opts.except) : undefined))
    .returning({ id: schema.authSessions.id });
  return rows.length;
}

/** Active sessions for the devices list. */
export async function listSessions(userId: string, currentId: string | null, now = new Date()) {
  const rows = await db
    .select()
    .from(schema.authSessions)
    .where(and(eq(schema.authSessions.userId, userId), isNull(schema.authSessions.revokedAt), gt(schema.authSessions.expiresAt, now)))
    .orderBy(desc(schema.authSessions.lastSeenAt));
  return rows
    .filter((s) => now.getTime() - s.lastSeenAt.getTime() <= SESSION_IDLE_MS)
    .map((s) => ({
      id: s.id,
      deviceLabel: s.deviceLabel,
      method: s.method,
      createdAt: s.createdAt.toISOString(),
      lastSeenAt: s.lastSeenAt.toISOString(),
      current: s.id === currentId,
    }));
}
export type DeviceSession = Awaited<ReturnType<typeof listSessions>>[number];
