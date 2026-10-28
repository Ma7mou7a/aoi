import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { db, schema } from "@/db";
import { EMPTY_MEMORY } from "@/lib/coach/memory";
import { normaliseSigninKey } from "@/lib/signinKey";
import { migrateTestDb } from "@/test/db";
import { listSecurityEvents, logSecurityEvent, verifySecurityLog } from "./audit";
import { createSession } from "./auth";
import { createAccount, deleteAccount, findUserBySigninKey, loadUser, replaceSigninKey, saveCoachMemory } from "./accounts";
import { cipherFor, FIELDS, forgetCachedKeys } from "./vault";

const consents = { data_processing: true, behavioural_signals: false, llm_coaching: true, planted_flaws: false, age_18_plus: true };

describe("accounts with encrypted personal fields", () => {
  beforeAll(migrateTestDb);

  it("stores the display name and coach memory encrypted, and reads them back in clear", async () => {
    const { user, signinKey } = await createAccount({ displayName: "Chaima", retentionDays: 180, coachMemory: { ...EMPTY_MEMORY, goal: "reasoning" }, consents });
    const [raw] = await db.select().from(schema.users).where(eq(schema.users.id, user.id));
    expect(raw.displayName).toMatch(/^enc:v1:/);
    expect(JSON.stringify(raw.coachMemory)).not.toContain("reasoning");
    expect(user.displayName).toBe("Chaima");
    forgetCachedKeys();
    const loaded = await loadUser(user.id);
    expect(loaded?.displayName).toBe("Chaima");
    expect(loaded?.coachMemory.goal).toBe("reasoning");
    expect((await findUserBySigninKey(normaliseSigninKey(signinKey)!))?.id).toBe(user.id);
  });

  it("records every consent, including the 18+ confirmation, with the policy version", async () => {
    const { user } = await createAccount({ displayName: "A", retentionDays: 90, coachMemory: EMPTY_MEMORY, consents });
    const rows = await db.select().from(schema.consents).where(eq(schema.consents.userId, user.id));
    expect(rows.find((r) => r.kind === "age_18_plus")?.granted).toBe(true);
    expect(rows).toHaveLength(5);
  });

  it("saves coach memory encrypted", async () => {
    const { user } = await createAccount({ displayName: "B", retentionDays: 90, coachMemory: EMPTY_MEMORY, consents });
    await saveCoachMemory(user.id, { ...EMPTY_MEMORY, recentTopics: ["my memory worries"] });
    const [raw] = await db.select().from(schema.users).where(eq(schema.users.id, user.id));
    expect(JSON.stringify(raw.coachMemory)).not.toContain("worries");
    expect((await loadUser(user.id))?.coachMemory.recentTopics).toEqual(["my memory worries"]);
  });

  it("reads legacy plaintext rows written before encryption", async () => {
    const [u] = await db.insert(schema.users).values({ displayName: "Demo" }).returning();
    expect((await loadUser(u.id))?.displayName).toBe("Demo");
  });

  it("replacing the sign-in key invalidates the old one", async () => {
    const { user, signinKey } = await createAccount({ displayName: "C", retentionDays: 90, coachMemory: EMPTY_MEMORY, consents });
    const fresh = await replaceSigninKey(user.id);
    expect(await findUserBySigninKey(normaliseSigninKey(signinKey)!)).toBeNull();
    expect((await findUserBySigninKey(normaliseSigninKey(fresh)!))?.id).toBe(user.id);
  });

  it("one-click delete removes every user table, shreds the key and redacts the security log", async () => {
    const { user } = await createAccount({ displayName: "Gone", retentionDays: 90, coachMemory: EMPTY_MEMORY, consents });
    const c = await cipherFor(user.id);
    await db.insert(schema.coachMessages).values({ userId: user.id, role: "user", content: c.text("is my memory ok", FIELDS.coachContent) });
    await createSession(user.id, { deviceLabel: "d", method: "signup" });
    await db.insert(schema.passkeys).values({ userId: user.id, credentialId: `cred-${user.id}`, publicKey: "pk", algorithm: -7, userHandle: "h", label: "Laptop" });
    await db.insert(schema.authChallenges).values({ kind: "device_link", userId: user.id, tokenHash: `t-${user.id}`, expiresAt: new Date(Date.now() + 60_000) });
    await logSecurityEvent(user.id, "sign_in", { method: "key" });

    const { rowsDeleted } = await deleteAccount(user.id);
    expect(rowsDeleted).toMatchObject({ coach_messages: 1, auth_sessions: 1, passkeys: 1, auth_challenges: 1, user_keys: 1, consents: 5, security_events_redacted: 1 });
    for (const t of [schema.coachMessages, schema.authSessions, schema.passkeys, schema.consents, schema.authChallenges]) {
      expect(await db.select().from(t).where(eq(t.userId, user.id))).toHaveLength(0);
    }
    expect(await db.select().from(schema.userKeys).where(eq(schema.userKeys.userId, user.id))).toHaveLength(0);
    expect(await listSecurityEvents(user.id)).toHaveLength(0);
    expect((await verifySecurityLog()).ok).toBe(true);
    const logs = await db.select().from(schema.deletionLog);
    expect(JSON.stringify(logs)).not.toContain(user.id);
  });
});
