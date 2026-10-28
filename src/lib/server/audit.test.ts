import { eq, sql } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { db, schema } from "@/db";
import { migrateTestDb } from "@/test/db";
import { listSecurityEvents, logSecurityEvent, redactUserEvents, verifySecurityLog } from "./audit";

const uid = () => crypto.randomUUID();

describe("security log (append-only, hash-chained)", () => {
  beforeAll(migrateTestDb);

  it("appends entries in sequence and verifies", async () => {
    const u = uid();
    await logSecurityEvent(u, "sign_in", { method: "key", device: "Chrome on Windows" });
    await logSecurityEvent(u, "sign_out", {});
    const events = await listSecurityEvents(u);
    expect(events.map((e) => e.type)).toEqual(["sign_out", "sign_in"]);
    expect(events[1].label).toMatch(/signed in/i);
    expect(await verifySecurityLog()).toMatchObject({ ok: true });
  });

  it("keeps the chain linear under concurrent writes", async () => {
    const u = uid();
    await Promise.all(Array.from({ length: 12 }, (_, i) => logSecurityEvent(u, "consent_changed", { n: i })));
    const v = await verifySecurityLog();
    expect(v.ok).toBe(true);
  });

  it("detects tampering done directly in the database", async () => {
    const u = uid();
    await logSecurityEvent(u, "data_exported", {});
    const [row] = await db.select().from(schema.securityEvents).where(eq(schema.securityEvents.userId, u));
    await db.update(schema.securityEvents).set({ type: "sign_in" }).where(eq(schema.securityEvents.seq, row.seq));
    const v = await verifySecurityLog();
    expect(v).toMatchObject({ ok: false, brokenAt: row.seq });
    // Put it back so later tests see an intact chain.
    await db.update(schema.securityEvents).set({ type: "data_exported" }).where(eq(schema.securityEvents.seq, row.seq));
    expect((await verifySecurityLog()).ok).toBe(true);
  });

  it("detects a deleted entry", async () => {
    const u = uid();
    await logSecurityEvent(u, "sign_in", {});
    await logSecurityEvent(u, "sign_out", {});
    await logSecurityEvent(u, "sign_in", {});
    const rows = await db.select().from(schema.securityEvents).where(eq(schema.securityEvents.userId, u));
    const middle = rows.sort((a, b) => a.seq - b.seq)[1];
    await db.delete(schema.securityEvents).where(eq(schema.securityEvents.seq, middle.seq));
    expect((await verifySecurityLog()).ok).toBe(false);
    await db.insert(schema.securityEvents).values(middle);
    expect((await verifySecurityLog()).ok).toBe(true);
  });

  it("redacts a deleted user's entries without breaking the chain", async () => {
    const u = uid();
    await logSecurityEvent(u, "sign_in", { device: "Safari on iPhone" });
    await logSecurityEvent(uid(), "sign_in", {});
    await redactUserEvents(u);
    expect(await listSecurityEvents(u)).toHaveLength(0);
    const [{ n }] = await db.execute<{ n: number }>(sql`select count(*)::int as n from security_events where redacted_at is not null and user_id is null and details is null`).then((r) => (r as unknown as { rows: Array<{ n: number }> }).rows);
    expect(n).toBeGreaterThanOrEqual(1);
    expect((await verifySecurityLog()).ok).toBe(true);
  });
});
