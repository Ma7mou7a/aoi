import "server-only";
import { and, desc, eq, inArray, isNotNull, lt, or } from "drizzle-orm";
import { db, schema } from "@/db";
import { keyring } from "@/lib/security/keyring";
import { listSecurityEvents, redactUserEvents } from "./audit";
import { loadUser } from "./accounts";
import { cipherFor, FIELDS } from "./vault";

export const RETENTION_OPTIONS = [30, 90, 180, 365] as const;

/** Consents the user can change after onboarding. data_processing is withdrawn by deleting all data. */
export const EDITABLE_CONSENTS = ["behavioural_signals", "llm_coaching", "planted_flaws", "microphone"] as const;
export type EditableConsent = (typeof EDITABLE_CONSENTS)[number];

export async function getConsentState(userId: string) {
  const rows = await db
    .select()
    .from(schema.consents)
    .where(eq(schema.consents.userId, userId))
    .orderBy(desc(schema.consents.createdAt));
  const latest = new Map<string, (typeof rows)[number]>();
  for (const r of rows) if (!latest.has(r.kind)) latest.set(r.kind, r);
  return {
    current: Object.fromEntries(schema.consentKind.enumValues.map((k) => [k, latest.get(k)?.granted ?? false])) as Record<(typeof schema.consentKind.enumValues)[number], boolean>,
    history: rows.map((r) => ({ kind: r.kind, granted: r.granted, policyVersion: r.policyVersion, at: r.createdAt.toISOString() })),
  };
}

/**
 * Delete everything older than the user's retention window. Profile snapshots go too, so the
 * Brain Twin history really is limited to the window (the latest estimate is rebuilt from what remains).
 * Ended sign-in sessions are removed, and the user's security-log entries older than the window are
 * redacted (their hashes stay so the chain remains verifiable).
 */
export async function purgeExpired(userId: string, retentionDays: number, now = new Date()) {
  const cutoff = new Date(now.getTime() - retentionDays * 86_400_000);
  const s = schema;
  await db.transaction(async (tx) => {
    await tx.delete(s.taskRuns).where(and(eq(s.taskRuns.userId, userId), lt(s.taskRuns.startedAt, cutoff))); // trials cascade
    await tx.delete(s.profileSnapshots).where(and(eq(s.profileSnapshots.userId, userId), lt(s.profileSnapshots.createdAt, cutoff)));
    await tx.delete(s.projections).where(and(eq(s.projections.userId, userId), lt(s.projections.createdAt, cutoff)));
    await tx.delete(s.coachMessages).where(and(eq(s.coachMessages.userId, userId), lt(s.coachMessages.createdAt, cutoff)));
    await tx.delete(s.collabEvents).where(and(eq(s.collabEvents.userId, userId), lt(s.collabEvents.createdAt, cutoff)));
    await tx.delete(s.collabScores).where(and(eq(s.collabScores.userId, userId), lt(s.collabScores.createdAt, cutoff)));
    await tx.delete(s.rewardEvents).where(and(eq(s.rewardEvents.userId, userId), lt(s.rewardEvents.createdAt, cutoff)));
    await tx.delete(s.sessions).where(and(eq(s.sessions.userId, userId), lt(s.sessions.startedAt, cutoff)));
    await tx.delete(s.authSessions).where(and(eq(s.authSessions.userId, userId), or(isNotNull(s.authSessions.revokedAt), lt(s.authSessions.expiresAt, now), lt(s.authSessions.lastSeenAt, cutoff))));
    await redactUserEvents(userId, tx, cutoff);
  });
}

/**
 * The retention job: enforce every user's window, including people who never come back (purgeExpired
 * alone only ran when a user was active), and drop expired one-time challenges.
 * Runs at server start and every few hours (src/instrumentation.ts), or by hand: `npm run purge`.
 */
export async function purgeAllExpired(now = new Date()) {
  const users = await db.select({ id: schema.users.id, retentionDays: schema.users.retentionDays }).from(schema.users);
  for (const u of users) await purgeExpired(u.id, u.retentionDays, now);
  const challenges = await db
    .delete(schema.authChallenges)
    .where(or(lt(schema.authChallenges.expiresAt, now), isNotNull(schema.authChallenges.usedAt)))
    .returning({ id: schema.authChallenges.id });
  return { users: users.length, challenges: challenges.length, at: now.toISOString() };
}

/** Everything stored about the user, as one JSON document (data portability), decrypted for them. */
export async function exportUserData(userId: string) {
  const user = await loadUser(userId);
  if (!user) throw new Error("No such user");
  const c = await cipherFor(userId);
  const { signinKeyHash, ...profile } = user;
  const plans = await db.select().from(schema.plans).where(eq(schema.plans.userId, userId));
  const planItems = plans.length ? await db.select().from(schema.planItems).where(inArray(schema.planItems.planId, plans.map((p) => p.id))) : [];
  return {
    exportedAt: new Date().toISOString(),
    encryption: {
      algorithm: "AES-256-GCM",
      note: "Your name, coach messages, coach memory, behaviour signals and fatigue/frustration guesses are stored encrypted with a key that belongs to you alone. They are decrypted in this file so you can read them.",
      masterKeyVersion: keyring().current,
    },
    user: { ...profile, hasSigninKey: signinKeyHash != null },
    consents: await db.select().from(schema.consents).where(eq(schema.consents.userId, userId)),
    sessions: await db.select().from(schema.sessions).where(eq(schema.sessions.userId, userId)),
    taskRuns: (await db.select().from(schema.taskRuns).where(eq(schema.taskRuns.userId, userId))).map((r) => ({ ...r, affect: c.openJson(r.affect, FIELDS.affect) })),
    trials: (await db.select().from(schema.trials).where(eq(schema.trials.userId, userId))).map((t) => ({ ...t, behaviour: c.openJson(t.behaviour, FIELDS.behaviour) })),
    profileSnapshots: await db.select().from(schema.profileSnapshots).where(eq(schema.profileSnapshots.userId, userId)),
    projections: await db.select().from(schema.projections).where(eq(schema.projections.userId, userId)),
    coachMessages: (await db.select().from(schema.coachMessages).where(eq(schema.coachMessages.userId, userId))).map((m) => ({ ...m, content: c.openText(m.content, FIELDS.coachContent) })),
    collabEvents: await db.select().from(schema.collabEvents).where(eq(schema.collabEvents.userId, userId)),
    collabScores: await db.select().from(schema.collabScores).where(eq(schema.collabScores.userId, userId)),
    goals: await db.select().from(schema.goals).where(eq(schema.goals.userId, userId)),
    plans: plans.map((p) => ({ ...p, items: planItems.filter((i) => i.planId === p.id) })),
    rewardEvents: await db.select().from(schema.rewardEvents).where(eq(schema.rewardEvents.userId, userId)),
    // Security data: never the stored token hashes, the wrapped data key or one-time secrets.
    authSessions: (await db.select().from(schema.authSessions).where(eq(schema.authSessions.userId, userId))).map(({ tokenHash, ...s }) => (void tokenHash, s)),
    passkeys: (await db.select().from(schema.passkeys).where(eq(schema.passkeys.userId, userId))).map(({ id, label, credentialId, algorithm, backedUp, transports, createdAt, lastUsedAt }) => ({ id, label, credentialId, algorithm, backedUp, transports, createdAt, lastUsedAt })),
    pendingSignInCodes: (await db.select().from(schema.authChallenges).where(eq(schema.authChallenges.userId, userId))).map((a) => ({ kind: a.kind, createdAt: a.createdAt, expiresAt: a.expiresAt, usedAt: a.usedAt })),
    securityEvents: await listSecurityEvents(userId, 10_000),
  };
}
