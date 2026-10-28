import { beforeAll, describe, expect, it, vi } from "vitest";
import { signinLimiter } from "@/lib/security/rateLimit";
import { migrateTestDb } from "@/test/db";
import { jar, newRequest } from "@/test/nextHeaders";

vi.mock("next/headers", () => import("@/test/nextHeaders"));

const { POST: onboard } = await import("@/app/api/onboard/route");
const { POST: createLink } = await import("@/app/api/me/devices/link/route");
const { POST: redeem } = await import("@/app/api/signin/link/route");
const { getCurrentUser } = await import("@/lib/server/user");
const { listSecurityEvents } = await import("@/lib/server/audit");

const COOKIE = "ai4b_session";
const json = (body: unknown, url = "http://localhost:3000/api") => new Request(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

describe("sign in on another device: routes", () => {
  beforeAll(migrateTestDb);

  it("a signed-in device makes a QR link and code; a new device redeems it and gets its own session", async () => {
    newRequest({ host: "localhost:3000" }, { fresh: true });
    const { id } = await (await onboard(json({ displayName: "Q", consents: { data_processing: true, behavioural_signals: false, llm_coaching: false, age_18_plus: true } }))).json();
    const res = await createLink(json({}, "http://localhost:3000/api/me/devices/link"));
    expect(res.status).toBe(200);
    const link = await res.json();
    expect(link.url).toMatch(/^http:\/\/localhost:3000\/link#[A-Za-z0-9_-]{43}$/);
    expect(link.qrSvg).toContain("<svg");
    expect(link.code).toMatch(/^.{5}-.{5}$/);
    expect((await listSecurityEvents(id))[0].type).toBe("device_link_created");

    newRequest({ "user-agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Version/18.0 Mobile/15E148 Safari/604.1" }, { fresh: true });
    const token = link.url.split("#")[1];
    const ok = await redeem(json({ token }));
    expect(ok.status).toBe(200);
    expect((await getCurrentUser())?.id).toBe(id);
    expect((await listSecurityEvents(id))[0]).toMatchObject({ type: "sign_in", details: { method: "device_link", device: "Safari on iPhone" } });

    newRequest({}, { fresh: true });
    expect((await redeem(json({ token }))).status).toBe(401);
  });

  it("needs a signed-in device to create a link", async () => {
    newRequest({}, { fresh: true });
    expect((await createLink(json({}))).status).toBe(401);
  });

  it("wrong codes count against the sign-in rate limit", async () => {
    signinLimiter.pause = async () => {};
    const statuses: number[] = [];
    for (let i = 0; i < 11; i++) {
      newRequest({ "x-forwarded-for": "203.0.113.77" }, { fresh: true });
      statuses.push((await redeem(json({ code: "ZZZZZ-ZZZZZ" }))).status);
    }
    expect(statuses.at(-1)).toBe(429);
    expect(jar.get(COOKIE)).toBeUndefined();
  });
});
