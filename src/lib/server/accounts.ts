import "server-only";
import { createHash } from "node:crypto";
import { count, eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { EMPTY_MEMORY, type CoachMemory } from "@/lib/coach/memory";
import { generateSigninKey, hashSigninKey, normaliseSigninKey } from "@/lib/signinKey";
import { logSecurityEvent, redactUserEvents } from "./audit";
import { cipherFor, FIELDS, forgetCachedKeys } from "./vault";

/** Version of the consent text shown at onboarding; stored with every consent row. */
export const POLICY_VERSION = "2026-10-28";

type UserRow = typeof schema.users.$inferSelect;
export type User = UserRow & { coachMemory: CoachMemory };
type ConsentKind = (typeof schema.consentKind.enumValues)[number];

/** Decrypt the encrypted columns of a user row (legacy plaintext passes through). */
export async function decryptUser(row: UserRow): Promise<User> {
  const c = await cipherFor(row.id);
  return {
    ...row,
    displayName: c.openText(row.displayName, FIELDS.displayName),
    coachMemory: { ...EMPTY_MEMORY, ...(c.openJson<CoachMemory>(row.coachMemory, FIELDS.coachMemory) ?? {}) },
  };
}

export async function loadUser(userId: string): Promise<User | null> {
  const [row] = await db.select().from(schema.users).where(eq(schema.users.id, userId));
  return row ? decryptUser(row) : null;
}

/**
 * Create an anonymous profile: display name and coach memory encrypted under a fresh per-user data key,
 * every consent choice recorded (granted or not) with the policy version, and a sign-in key whose hash
 * only is stored. The key itself is returned once.
 */
export async function createAccount(input: { displayName: string; retentionDays: number; coachMemory: CoachMemory; consents: Partial<Record<ConsentKind, boolean>> }) {
  const signinKey = generateSigninKey();
  const user = await db.transaction(async (tx) => {
    // Insert first (the data key references the user), then seal the personal fields with that key.
    const [u] = await tx.insert(schema.users).values({ displayName: "", retentionDays: input.retentionDays, signinKeyHash: hashSigninKey(normaliseSigninKey(signinKey)!) }).returning();
    const c = await cipherFor(u.id, tx);
    const [sealed] = await tx
      .update(schema.users)
      .set({ displayName: c.text(input.displayName, FIELDS.displayName), coachMemory: c.json(input.coachMemory, FIELDS.coachMemory) as unknown as CoachMemory })
      .where(eq(schema.users.id, u.id))
      .returning();
    await tx.insert(schema.consents).values(
      (Object.entries(input.consents) as [ConsentKind, boolean][]).map(([kind, granted]) => ({ userId: u.id, kind, granted, policyVersion: POLICY_VERSION })),
    );
    return sealed;
  });
  return { user: await decryptUser(user), signinKey };
}

export async function saveCoachMemory(userId: string, memory: CoachMemory) {
  const c = await cipherFor(userId);
  await db.update(schema.users).set({ coachMemory: c.json(memory, FIELDS.coachMemory) as unknown as CoachMemory }).where(eq(schema.users.id, userId));
}

export async function findUserBySigninKey(normalisedKey: string): Promise<User | null> {
  const [row] = await db.select().from(schema.users).where(eq(schema.users.signinKeyHash, hashSigninKey(normalisedKey)));
  return row ? decryptUser(row) : null;
}

/** New sign-in key (returned once); the old one stops working immediately. */
export async function replaceSigninKey(userId: string) {
  const key = generateSigninKey();
  await db.update(schema.users).set({ signinKeyHash: hashSigninKey(normaliseSigninKey(key)!) }).where(eq(schema.users.id, userId));
  return key;
}

/** Every table holding the user's rows (all cascade from users). Used for delete counts and checked by tests. */
export const USER_TABLES = {
  trials: schema.trials,
  task_runs: schema.taskRuns,
  profile_snapshots: schema.profileSnapshots,
  projections: schema.projections,
  sessions: schema.sessions,
  consents: schema.consents,
  coach_messages: schema.coachMessages,
  collab_events: schema.collabEvents,
  collab_scores: schema.collabScores,
  goals: schema.goals,
  plans: schema.plans,
  reward_events: schema.rewardEvents,
  auth_sessions: schema.authSessions,
  auth_challenges: schema.authChallenges,
  passkeys: schema.passkeys,
  user_keys: schema.userKeys,
} as const;

/**
 * One-click delete. Every user-owned row goes (FK cascade), including the user's data key, which
 * crypto-shreds any copy of their encrypted fields (backups, replicas). Security-log entries are
 * redacted rather than removed so the chain stays verifiable. Only a salted hash and row counts remain.
 */
export async function deleteAccount(userId: string, reason: "user_request" | "retention_expired" = "user_request") {
  const rowsDeleted: Record<string, number> = {};
  await db.transaction(async (tx) => {
    for (const [name, t] of Object.entries(USER_TABLES)) {
      const [{ n }] = await tx.select({ n: count() }).from(t).where(eq(t.userId, userId));
      rowsDeleted[name] = n;
    }
    const [{ n: events }] = await tx.select({ n: count() }).from(schema.securityEvents).where(eq(schema.securityEvents.userId, userId));
    rowsDeleted.security_events_redacted = events;
    await redactUserEvents(userId, tx);
    await tx.delete(schema.users).where(eq(schema.users.id, userId));
    await tx.insert(schema.deletionLog).values({
      userHash: createHash("sha256").update(`ai4brain:${userId}`).digest("hex"),
      reason,
      rowsDeleted,
    });
  });
  forgetCachedKeys(userId);
  await logSecurityEvent(null, "account_deleted", { reason });
  return { rowsDeleted };
}

/** Rows per table for a user (used by tests and the export summary). */
export async function countUserRows(userId: string) {
  const out: Record<string, number> = {};
  for (const [name, t] of Object.entries(USER_TABLES)) {
    const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(t).where(eq(t.userId, userId));
    out[name] = n;
  }
  return out;
}
