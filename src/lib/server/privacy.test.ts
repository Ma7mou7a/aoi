import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { db, schema } from "@/db";
import { EMPTY_MEMORY } from "@/lib/coach/memory";
import { migrateTestDb } from "@/test/db";
import { createAccount } from "./accounts";
import { listSecurityEvents, logSecurityEvent, verifySecurityLog } from "./audit";
import { createSession } from "./auth";
import { exportUserData, purgeAllExpired } from "./privacy";
import { cipherFor, FIELDS } from "./vault";

const consents = { data_processing: true, behavioural_signals: true, llm_coaching: false, age_18_plus: true };
const DAY = 86_400_000;

async function userWithData(retentionDays: number) {
  const { user } = await createAccount({ displayName: "R", retentionDays, coachMemory: EMPTY_MEMORY, consents });
  const c = await cipherFor(user.id);
  const [s] = await db.insert(schema.sessions).values({ userId: user.id, mode: "assessment" }).returning();
  const [run] = await db.insert(schema.taskRuns).values({ sessionId: s.id, userId: user.id, dimensionId: "working_memory", taskId: "nback", configVersion: 1, difficultyLevel: 1, params: {} }).returning();
  await db.insert(schema.trials).values({ taskRunId: run.id, userId: user.id, trialIndex: 0, stimulus: {}, outcome: "response", behaviour: c.json({ focusLost: true }, FIELDS.behaviour) as never, shownAt: new Date() });
  await db.insert(schema.coachMessages).values({ userId: user.id, role: "user", content: c.text("why is my focus low?", FIELDS.coachContent) });
  await createSession(user.id, { deviceLabel: "Old phone", method: "key" }, new Date(Date.now() - 100 * DAY));
  await logSecurityEvent(user.id, "sign_in", { method: "key" });
  return user.id;
}

const rows = async (uid: string) => ({
  runs: (await db.select().from(schema.taskRuns).where(eq(schema.taskRuns.userId, uid))).length,
  trials: (await db.select().from(schema.trials).where(eq(schema.trials.userId, uid))).length,
  messages: (await db.select().from(schema.coachMessages).where(eq(schema.coachMessages.userId, uid))).length,
  sessions: (await db.select().from(schema.sessions).where(eq(schema.sessions.userId, uid))).length,
  authSessions: (await db.select().from(schema.authSessions).where(eq(schema.authSessions.userId, uid))).length,
  events: (await listSecurityEvents(uid)).length,
});

describe("retention purge for every user, active or not", () => {
  beforeAll(migrateTestDb);

  it("enforces each user's own window, including users who never come back", async () => {
    const short = await userWithData(30);
    const long = await userWithData(365);
    const report = await purgeAllExpired(new Date(Date.now() + 40 * DAY));
    expect(report.users).toBeGreaterThanOrEqual(2);
    expect(await rows(short)).toEqual({ runs: 0, trials: 0, messages: 0, sessions: 0, authSessions: 0, events: 0 });
    // 365 days: the data stays; only the session that expired (90-day absolute limit) is cleaned up.
    expect(await rows(long)).toEqual({ runs: 1, trials: 1, messages: 1, sessions: 1, authSessions: 0, events: 1 });
    expect((await verifySecurityLog()).ok).toBe(true);
  });

  it("removes expired one-time challenges", async () => {
    await db.insert(schema.authChallenges).values({ kind: "webauthn_login", tokenHash: `old-${crypto.randomUUID()}`, expiresAt: new Date(Date.now() - 2 * DAY) });
    const report = await purgeAllExpired();
    expect(report.challenges).toBeGreaterThanOrEqual(1);
  });
});

describe("export", () => {
  beforeAll(migrateTestDb);

  it("is readable for the user: encrypted fields come back decrypted, secrets are left out", async () => {
    const uid = await userWithData(180);
    const data = await exportUserData(uid);
    expect(data.user.displayName).toBe("R");
    expect(data.coachMessages[0].content).toBe("why is my focus low?");
    expect(data.trials[0].behaviour).toEqual({ focusLost: true });
    expect(JSON.stringify(data)).not.toMatch(/enc:v1:|token_hash|tokenHash|wrappedKey/);
    expect(data.authSessions[0].deviceLabel).toBe("Old phone");
    expect(data.securityEvents.length).toBeGreaterThanOrEqual(1);
    expect(data).toHaveProperty("goals");
    expect(data).toHaveProperty("plans");
    expect(data).toHaveProperty("projections");
  });
});
