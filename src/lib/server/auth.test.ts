import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { db, schema } from "@/db";
import { hashToken } from "@/lib/security/tokens";
import { migrateTestDb } from "@/test/db";
import { createSession, listSessions, resolveSession, revokeAllSessions, revokeSession, SESSION_IDLE_MS, SESSION_MAX_MS } from "./auth";

async function newUser() {
  const [u] = await db.insert(schema.users).values({ displayName: "x" }).returning();
  return u.id;
}
const T0 = new Date("2026-10-01T10:00:00Z");
const later = (ms: number) => new Date(T0.getTime() + ms);

describe("sign-in sessions", () => {
  beforeAll(migrateTestDb);

  it("issues an opaque token and stores only its hash", async () => {
    const uid = await newUser();
    const { token, session } = await createSession(uid, { deviceLabel: "Chrome on Windows", method: "key" }, T0);
    expect(token).not.toContain(uid);
    expect(session.tokenHash).toBe(hashToken(token));
    const [row] = await db.select().from(schema.authSessions).where(eq(schema.authSessions.id, session.id));
    expect(JSON.stringify(row)).not.toContain(token);
    expect(row.expiresAt.getTime()).toBe(T0.getTime() + SESSION_MAX_MS);
  });

  it("resolves a valid token to its user, and nothing else", async () => {
    const uid = await newUser();
    const { token } = await createSession(uid, { deviceLabel: "d", method: "key" }, T0);
    expect((await resolveSession(token, later(60_000)))?.user.id).toBe(uid);
    expect(await resolveSession(`${token}x`, later(60_000))).toBeNull();
    expect(await resolveSession(uid, later(60_000))).toBeNull(); // the old raw-UUID cookie no longer works
    expect(await resolveSession("", later(60_000))).toBeNull();
  });

  it("expires after the idle limit, even before the absolute limit", async () => {
    const uid = await newUser();
    const { token, session } = await createSession(uid, { deviceLabel: "d", method: "key" }, T0);
    expect(await resolveSession(token, later(SESSION_IDLE_MS + 1000))).toBeNull();
    const [row] = await db.select().from(schema.authSessions).where(eq(schema.authSessions.id, session.id));
    expect(row.revokedReason).toBe("idle");
  });

  it("activity extends the idle window but never the absolute one", async () => {
    const uid = await newUser();
    const { token } = await createSession(uid, { deviceLabel: "d", method: "key" }, T0);
    let t = 0;
    while (t + SESSION_IDLE_MS / 2 < SESSION_MAX_MS) {
      t += SESSION_IDLE_MS / 2;
      expect(await resolveSession(token, later(t))).not.toBeNull();
    }
    expect(await resolveSession(token, later(SESSION_MAX_MS + 1000))).toBeNull();
  });

  it("can be revoked one by one or everywhere", async () => {
    const uid = await newUser();
    const a = await createSession(uid, { deviceLabel: "Phone", method: "key" }, T0);
    const b = await createSession(uid, { deviceLabel: "Laptop", method: "passkey" }, T0);
    const c = await createSession(uid, { deviceLabel: "Tablet", method: "device_link" }, T0);
    const list = await listSessions(uid, a.session.id, later(1000));
    expect(list.map((s) => s.deviceLabel).sort()).toEqual(["Laptop", "Phone", "Tablet"]);
    expect(list.find((s) => s.current)?.deviceLabel).toBe("Phone");

    expect(await revokeSession(uid, b.session.id, "user")).toBe(true);
    expect(await resolveSession(b.token, later(1000))).toBeNull();
    // Another user can't revoke this user's session.
    expect(await revokeSession(await newUser(), c.session.id, "user")).toBe(false);

    expect(await revokeAllSessions(uid, { except: a.session.id, reason: "user" })).toBe(1);
    expect(await resolveSession(c.token, later(1000))).toBeNull();
    expect(await resolveSession(a.token, later(1000))).not.toBeNull();
    expect(await listSessions(uid, a.session.id, later(1000))).toHaveLength(1);
  });
});
