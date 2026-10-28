import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { db, schema } from "@/db";
import { resetKeyring } from "@/lib/security/keyring";
import { migrateTestDb } from "@/test/db";
import { cipherFor, forgetCachedKeys, rotateAllKeys } from "./vault";

async function newUser() {
  const [u] = await db.insert(schema.users).values({ displayName: "x" }).returning();
  return u.id;
}

describe("vault: per-user data keys", () => {
  beforeAll(migrateTestDb);
  afterEach(() => {
    delete process.env.AI4B_MASTER_KEYS;
    resetKeyring();
    forgetCachedKeys();
  });

  it("creates one wrapped data key per user on first use and reuses it", async () => {
    const uid = await newUser();
    const c1 = await cipherFor(uid);
    const sealed = c1.text("Chaima", "users.display_name");
    forgetCachedKeys();
    const c2 = await cipherFor(uid);
    expect(c2.openText(sealed, "users.display_name")).toBe("Chaima");
    const rows = await db.select().from(schema.userKeys).where(eq(schema.userKeys.userId, uid));
    expect(rows).toHaveLength(1);
    expect(rows[0].wrappedKey).toMatch(/^kw:v1:0:/);
  });

  it("gives different users different keys", async () => {
    const [a, b] = [await newUser(), await newUser()];
    const ca = await cipherFor(a);
    const sealed = ca.text("hi", "f");
    const cb = await cipherFor(b);
    expect(() => cb.openText(sealed, "f")).toThrow();
  });

  it("crypto-shreds: once the user is deleted, a backup copy of the ciphertext can't be opened", async () => {
    const uid = await newUser();
    const backup = (await cipherFor(uid)).text("my private question", "coach_messages.content");
    await db.delete(schema.users).where(eq(schema.users.id, uid)); // cascades to user_keys
    forgetCachedKeys();
    expect(await db.select().from(schema.userKeys).where(eq(schema.userKeys.userId, uid))).toHaveLength(0);
    // Restoring just the user row from a backup does not bring the key back.
    await db.insert(schema.users).values({ id: uid, displayName: "restored" });
    const fresh = await cipherFor(uid);
    expect(() => fresh.openText(backup, "coach_messages.content")).toThrow();
  });

  it("rotation re-wraps every data key under the new master key without touching the data", async () => {
    const uid = await newUser();
    const sealed = (await cipherFor(uid)).text("keep me", "f");
    process.env.AI4B_MASTER_KEYS = `1:${randomBytes(32).toString("base64")}`;
    resetKeyring();
    forgetCachedKeys();
    const report = await rotateAllKeys();
    expect(report.rewrapped).toBeGreaterThanOrEqual(1);
    const [row] = await db.select().from(schema.userKeys).where(eq(schema.userKeys.userId, uid));
    expect(row.keyVersion).toBe(1);
    expect(row.rotatedAt).not.toBeNull();
    forgetCachedKeys();
    expect((await cipherFor(uid)).openText(sealed, "f")).toBe("keep me");
    expect((await rotateAllKeys()).rewrapped).toBe(0); // idempotent
  });
});
