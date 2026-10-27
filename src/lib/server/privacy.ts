import "server-only";
import { and, desc, eq, lt } from "drizzle-orm";
import { db, schema } from "@/db";

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
 */
export async function purgeExpired(userId: string, retentionDays: number) {
  const cutoff = new Date(Date.now() - retentionDays * 86_400_000);
  const s = schema;
  await db.transaction(async (tx) => {
    await tx.delete(s.taskRuns).where(and(eq(s.taskRuns.userId, userId), lt(s.taskRuns.startedAt, cutoff))); // trials cascade
    await tx.delete(s.profileSnapshots).where(and(eq(s.profileSnapshots.userId, userId), lt(s.profileSnapshots.createdAt, cutoff)));
    await tx.delete(s.coachMessages).where(and(eq(s.coachMessages.userId, userId), lt(s.coachMessages.createdAt, cutoff)));
    await tx.delete(s.collabEvents).where(and(eq(s.collabEvents.userId, userId), lt(s.collabEvents.createdAt, cutoff)));
    await tx.delete(s.collabScores).where(and(eq(s.collabScores.userId, userId), lt(s.collabScores.createdAt, cutoff)));
    await tx.delete(s.rewardEvents).where(and(eq(s.rewardEvents.userId, userId), lt(s.rewardEvents.createdAt, cutoff)));
    await tx.delete(s.sessions).where(and(eq(s.sessions.userId, userId), lt(s.sessions.startedAt, cutoff)));
  });
}

/** Everything stored about the user, as one JSON document (data portability). */
export async function exportUserData(userId: string) {
  const [user] = await db.select().from(schema.users).where(eq(schema.users.id, userId));
  return {
    exportedAt: new Date().toISOString(),
    user,
    consents: await db.select().from(schema.consents).where(eq(schema.consents.userId, userId)),
    sessions: await db.select().from(schema.sessions).where(eq(schema.sessions.userId, userId)),
    taskRuns: await db.select().from(schema.taskRuns).where(eq(schema.taskRuns.userId, userId)),
    trials: await db.select().from(schema.trials).where(eq(schema.trials.userId, userId)),
    profileSnapshots: await db.select().from(schema.profileSnapshots).where(eq(schema.profileSnapshots.userId, userId)),
    coachMessages: await db.select().from(schema.coachMessages).where(eq(schema.coachMessages.userId, userId)),
    collabEvents: await db.select().from(schema.collabEvents).where(eq(schema.collabEvents.userId, userId)),
    collabScores: await db.select().from(schema.collabScores).where(eq(schema.collabScores.userId, userId)),
    rewardEvents: await db.select().from(schema.rewardEvents).where(eq(schema.rewardEvents.userId, userId)),
  };
}
