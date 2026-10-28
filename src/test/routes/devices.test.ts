import { beforeAll, describe, expect, it, vi } from "vitest";
import { migrateTestDb } from "@/test/db";
import { jar, newRequest } from "@/test/nextHeaders";

vi.mock("next/headers", () => import("@/test/nextHeaders"));

const { POST: onboard } = await import("@/app/api/onboard/route");
const { POST: signin } = await import("@/app/api/signin/route");
const { GET: listDevices } = await import("@/app/api/me/devices/route");
const { DELETE: revokeDevice } = await import("@/app/api/me/devices/[id]/route");
const { POST: signoutScope } = await import("@/app/api/me/devices/signout/route");
const { GET: security } = await import("@/app/api/me/security/route");
const { getCurrentUser } = await import("@/lib/server/user");

const COOKIE = "ai4b_session";
const json = (body: unknown) => new Request("http://localhost/api", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
const params = (id: string) => ({ params: Promise.resolve({ id }) });

/** One profile signed in on three browsers; returns each browser's token. */
async function threeDevices() {
  newRequest({ "user-agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Version/18.0 Mobile/15E148 Safari/604.1" }, { fresh: true });
  const { signinKey } = await (await onboard(json({ displayName: "D", consents: { data_processing: true, behavioural_signals: false, llm_coaching: false, age_18_plus: true } }))).json();
  const phone = jar.get(COOKIE)!.value;
  newRequest({ "user-agent": "Mozilla/5.0 (X11; Linux x86_64; rv:131.0) Gecko/20100101 Firefox/131.0" }, { fresh: true });
  await signin(json({ key: signinKey }));
  const linux = jar.get(COOKIE)!.value;
  newRequest({}, { fresh: true });
  await signin(json({ key: signinKey }));
  const windows = jar.get(COOKIE)!.value;
  return { phone, linux, windows };
}

const as = (token: string) => {
  newRequest({}, { fresh: true });
  jar.set(COOKIE, token);
};

describe("devices: see and sign out sessions", () => {
  beforeAll(migrateTestDb);

  it("lists every signed-in browser with a coarse label, marking this one", async () => {
    const { windows } = await threeDevices();
    as(windows);
    const { sessions } = await (await listDevices()).json();
    expect(sessions.map((s: { deviceLabel: string }) => s.deviceLabel).sort()).toEqual(["Chrome on Windows", "Firefox on Linux", "Safari on iPhone"]);
    expect(sessions.find((s: { current: boolean }) => s.current).deviceLabel).toBe("Chrome on Windows");
  });

  it("signs out one device", async () => {
    const { phone, windows } = await threeDevices();
    as(windows);
    const { sessions } = await (await listDevices()).json();
    const iphone = sessions.find((s: { deviceLabel: string }) => s.deviceLabel === "Safari on iPhone");
    expect((await revokeDevice(new Request("http://localhost/x", { method: "DELETE" }), params(iphone.id))).status).toBe(200);
    as(phone);
    expect(await getCurrentUser()).toBeNull();
  });

  it("can't sign out someone else's device", async () => {
    const a = await threeDevices();
    as(a.windows);
    const { sessions } = await (await listDevices()).json();
    const b = await threeDevices();
    as(b.windows);
    const res = await revokeDevice(new Request("http://localhost/x", { method: "DELETE" }), params(sessions[0].id));
    expect(res.status).toBe(404);
    expect((await revokeDevice(new Request("http://localhost/x", { method: "DELETE" }), params("not-a-uuid"))).status).toBe(404);
  });

  it("signs out every other device, or everywhere", async () => {
    const { phone, linux, windows } = await threeDevices();
    as(windows);
    expect((await (await signoutScope(json({ scope: "others" }))).json()).signedOut).toBe(2);
    as(phone);
    expect(await getCurrentUser()).toBeNull();
    as(linux);
    expect(await getCurrentUser()).toBeNull();
    as(windows);
    expect(await getCurrentUser()).not.toBeNull();
    await signoutScope(json({ scope: "all" }));
    expect(jar.get(COOKIE)).toBeUndefined();
    as(windows);
    expect(await getCurrentUser()).toBeNull();
  });

  it("the security overview reports encryption, devices, activity and an intact log", async () => {
    const { windows } = await threeDevices();
    as(windows);
    const data = await (await security()).json();
    expect(data.encryption).toMatchObject({ on: true, algorithm: "AES-256-GCM" });
    expect(data.devices).toHaveLength(3);
    expect(data.activity.map((e: { type: string }) => e.type)).toEqual(expect.arrayContaining(["sign_up", "sign_in"]));
    expect(data.logCheck.ok).toBe(true);
    expect(data.passkeys).toEqual([]);
  });

  it("refuses all of this without a session", async () => {
    newRequest({}, { fresh: true });
    expect((await listDevices()).status).toBe(401);
    expect((await security()).status).toBe(401);
  });
});
