import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { db, schema } from "@/db";
import { signinLimiter } from "@/lib/security/rateLimit";
import { migrateTestDb } from "@/test/db";
import { cookieOptions, jar, newRequest } from "@/test/nextHeaders";

vi.mock("next/headers", () => import("@/test/nextHeaders"));

const { POST: onboard } = await import("@/app/api/onboard/route");
const { POST: signin } = await import("@/app/api/signin/route");
const { POST: signout } = await import("@/app/api/signout/route");
const { POST: newKey } = await import("@/app/api/me/signin-key/route");
const { DELETE: deleteMe } = await import("@/app/api/me/route");
const { GET: exportMe } = await import("@/app/api/me/export/route");
const { getCurrentUser } = await import("@/lib/server/user");
const { listSecurityEvents } = await import("@/lib/server/audit");

const json = (body: unknown) => new Request("http://localhost/api", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
const COOKIE = "ai4b_session";
const signupBody = (over: Record<string, unknown> = {}) => ({
  displayName: "Chaima",
  consents: { data_processing: true, behavioural_signals: true, llm_coaching: false, age_18_plus: true },
  goal: "reasoning",
  ...over,
});

async function signUp() {
  newRequest({}, { fresh: true });
  const res = await onboard(json(signupBody()));
  expect(res.status).toBe(200);
  const body = await res.json();
  return { ...body, token: jar.get(COOKIE)!.value } as { id: string; signinKey: string; token: string };
}

describe("signup, sign-in and sign-out with opaque sessions", () => {
  beforeAll(migrateTestDb);

  it("signup sets an opaque HttpOnly SameSite=Lax session cookie, never the user id", async () => {
    const { id, token } = await signUp();
    expect(token).not.toContain(id);
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(cookieOptions(COOKIE)).toMatchObject({ httpOnly: true, sameSite: "lax", path: "/" });
    expect((await getCurrentUser())?.displayName).toBe("Chaima");
    const events = await listSecurityEvents(id);
    expect(events[0].type).toBe("sign_up");
  });

  it("signup requires confirming 18 or over", async () => {
    newRequest({}, { fresh: true });
    const res = await onboard(json(signupBody({ consents: { data_processing: true, behavioural_signals: false, llm_coaching: false } })));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/18/);
  });

  it("an old raw-user-id cookie no longer signs anyone in", async () => {
    const { id } = await signUp();
    newRequest({}, { fresh: true });
    jar.set("ai4b_uid", id);
    jar.set(COOKIE, id);
    expect(await getCurrentUser()).toBeNull();
  });

  it("sign-in with the key rotates the session token and logs the event", async () => {
    const { id, signinKey, token: first } = await signUp();
    newRequest();
    const res = await signin(json({ key: signinKey.toLowerCase() }));
    expect(res.status).toBe(200);
    expect((await res.json()).displayName).toBe("Chaima");
    const second = jar.get(COOKIE)!.value;
    expect(second).not.toBe(first);
    // The token the browser had before is now dead (no session fixation).
    jar.set(COOKIE, first);
    expect(await getCurrentUser()).toBeNull();
    jar.set(COOKIE, second);
    expect((await getCurrentUser())?.id).toBe(id);
    expect((await listSecurityEvents(id)).map((e) => e.type)).toContain("sign_in");
  });

  it("sign-out revokes the session on the server, not just in the browser", async () => {
    const { id, token } = await signUp();
    newRequest();
    await signout();
    expect(jar.get(COOKIE)).toBeUndefined();
    jar.set(COOKIE, token);
    expect(await getCurrentUser()).toBeNull();
    expect((await listSecurityEvents(id))[0].type).toBe("sign_out");
  });

  it("rate-limits wrong keys per address with a growing delay, then locks out", async () => {
    const pauses: number[] = [];
    signinLimiter.pause = async (ms) => void pauses.push(ms);
    const statuses: number[] = [];
    for (let i = 0; i < 12; i++) {
      newRequest({ "x-forwarded-for": "203.0.113.9" }, { fresh: true });
      statuses.push((await signin(json({ key: "AAAA-BBBB-CCCC-DDDD" }))).status);
    }
    expect(statuses.slice(0, 10).every((s) => s === 401)).toBe(true);
    expect(statuses.slice(10)).toEqual([429, 429]);
    expect(pauses).toEqual([250, 500, 1000, 2000, 4000, 8000, 8000]);
    // Another address is unaffected.
    newRequest({ "x-forwarded-for": "198.51.100.1" }, { fresh: true });
    expect((await signin(json({ key: "AAAA-BBBB-CCCC-DDDD" }))).status).toBe(401);
  });

  it("rejects oversized sign-in bodies", async () => {
    newRequest({ "x-forwarded-for": "192.0.2.50" }, { fresh: true });
    const res = await signin(json({ key: "x".repeat(10_000) }));
    expect(res.status).toBe(413);
  });

  it("replacing the key signs out every other device", async () => {
    const { id, signinKey } = await signUp();
    const phone = jar.get(COOKIE)!.value;
    newRequest({}, { fresh: true });
    await signin(json({ key: signinKey }));
    const laptop = jar.get(COOKIE)!.value;
    newRequest();
    const res = await newKey();
    expect(res.status).toBe(200);
    expect((await getCurrentUser())?.id).toBe(id); // this device stays signed in
    jar.set(COOKIE, phone);
    expect(await getCurrentUser()).toBeNull();
    jar.set(COOKIE, laptop);
    expect((await listSecurityEvents(id)).map((e) => e.type)).toContain("signin_key_replaced");
  });

  it("export is decrypted for the user and lists the new security tables; delete removes everything", async () => {
    const { id } = await signUp();
    newRequest();
    const exp = await exportMe();
    const data = await exp.json();
    expect(data.user.displayName).toBe("Chaima");
    expect(data.user.signinKeyHash).toBeUndefined();
    expect(data.authSessions).toHaveLength(1);
    expect(data.authSessions[0].tokenHash).toBeUndefined();
    expect(data.securityEvents.map((e: { type: string }) => e.type)).toEqual(expect.arrayContaining(["sign_up", "data_exported"]));
    expect(data).toHaveProperty("passkeys");
    expect(data.encryption).toMatchObject({ algorithm: "AES-256-GCM" });

    const del = await deleteMe();
    expect(del.status).toBe(200);
    expect(jar.get(COOKIE)).toBeUndefined();
    expect(await db.select().from(schema.users).where(eq(schema.users.id, id))).toHaveLength(0);
    expect(await db.select().from(schema.userKeys).where(eq(schema.userKeys.userId, id))).toHaveLength(0);
  });
});
