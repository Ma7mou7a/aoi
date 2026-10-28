import { beforeAll, describe, expect, it, vi } from "vitest";
import { signinLimiter } from "@/lib/security/rateLimit";
import { fakeAuthenticator } from "@/test/authenticator";
import { migrateTestDb } from "@/test/db";
import { jar, newRequest } from "@/test/nextHeaders";

vi.mock("next/headers", () => import("@/test/nextHeaders"));

const { POST: onboard } = await import("@/app/api/onboard/route");
const { POST: regOptions } = await import("@/app/api/passkeys/register/options/route");
const { POST: register } = await import("@/app/api/passkeys/register/route");
const { POST: loginOptions } = await import("@/app/api/passkeys/login/options/route");
const { POST: login } = await import("@/app/api/passkeys/login/route");
const { DELETE: removePk } = await import("@/app/api/passkeys/[id]/route");
const { GET: security } = await import("@/app/api/me/security/route");
const { getCurrentUser } = await import("@/lib/server/user");
const { listSecurityEvents } = await import("@/lib/server/audit");

const ORIGIN = "http://localhost:3000";
const rp = { origin: ORIGIN, rpId: "localhost" };
const post = (body: unknown = {}) => new Request(`${ORIGIN}/api/passkeys`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

async function signedUpWithPasskey() {
  newRequest({ host: "localhost:3000" }, { fresh: true });
  const { id } = await (await onboard(post({ displayName: "Pia", consents: { data_processing: true, behavioural_signals: false, llm_coaching: false, age_18_plus: true } }))).json();
  const opts = await (await regOptions(post())).json();
  const auth = fakeAuthenticator(-7);
  const res = await register(post({ credential: auth.create({ challenge: opts.challenge, ...rp }), label: "My laptop" }));
  return { id, auth, opts, res };
}

describe("passkeys: register, sign in, remove", () => {
  beforeAll(migrateTestDb);

  it("offers creation options with a random handle, discoverable credential and no attestation", async () => {
    const { id, opts, res } = await signedUpWithPasskey();
    expect(opts.rp).toEqual({ id: "localhost", name: "AI4Brain" });
    expect(opts.user.id).not.toContain(id);
    expect(opts.attestation).toBe("none");
    expect(opts.authenticatorSelection.residentKey).toBe("required");
    expect(opts.pubKeyCredParams.map((p: { alg: number }) => p.alg)).toEqual([-7, -8, -257]);
    expect(res.status).toBe(200);
    expect((await listSecurityEvents(id))[0].type).toBe("passkey_added");
  });

  it("signs in on a fresh browser with the passkey alone (no name, no key)", async () => {
    const { id, auth, opts } = await signedUpWithPasskey();
    newRequest({ host: "localhost:3000" }, { fresh: true });
    const lo = await (await loginOptions(post())).json();
    expect(lo.allowCredentials).toEqual([]);
    const res = await login(post({ credential: auth.get({ challenge: lo.challenge, ...rp, userHandle: opts.user.id }) }));
    expect(res.status).toBe(200);
    expect((await getCurrentUser())?.id).toBe(id);
    expect((await listSecurityEvents(id))[0].details).toMatchObject({ method: "passkey" });
  });

  it("each challenge works once", async () => {
    const { auth } = await signedUpWithPasskey();
    newRequest({ host: "localhost:3000" }, { fresh: true });
    const lo = await (await loginOptions(post())).json();
    const cred = auth.get({ challenge: lo.challenge, ...rp });
    expect((await login(post({ credential: cred }))).status).toBe(200);
    newRequest({ host: "localhost:3000" }, { fresh: true });
    expect((await login(post({ credential: cred }))).status).toBe(401);
  });

  it("a passkey for a phishing origin is refused", async () => {
    signinLimiter.pause = async () => {};
    const { auth } = await signedUpWithPasskey();
    newRequest({ host: "localhost:3000", "x-forwarded-for": "198.51.100.33" }, { fresh: true });
    const lo = await (await loginOptions(post())).json();
    const res = await login(post({ credential: auth.get({ challenge: lo.challenge, rpId: "localhost", origin: "https://ai4brain.evil" }) }));
    expect(res.status).toBe(401);
    expect(jar.get("ai4b_session")).toBeUndefined();
  });

  it("registration needs a signed-in profile", async () => {
    newRequest({ host: "localhost:3000" }, { fresh: true });
    expect((await regOptions(post())).status).toBe(401);
  });

  it("is listed in the security overview and can be removed", async () => {
    const { id, auth } = await signedUpWithPasskey();
    const { passkeys } = await (await security()).json();
    expect(passkeys).toHaveLength(1);
    expect(passkeys[0]).toMatchObject({ label: "My laptop" });
    expect(JSON.stringify(passkeys)).not.toContain(auth.credentialId);
    const res = await removePk(new Request(`${ORIGIN}/api/passkeys/x`, { method: "DELETE" }), { params: Promise.resolve({ id: passkeys[0].id }) });
    expect(res.status).toBe(200);
    expect((await (await security()).json()).passkeys).toHaveLength(0);
    expect((await listSecurityEvents(id))[0].type).toBe("passkey_removed");
    // Removed means it no longer signs in.
    newRequest({ host: "localhost:3000", "x-forwarded-for": "198.51.100.34" }, { fresh: true });
    const lo = await (await loginOptions(post())).json();
    expect((await login(post({ credential: auth.get({ challenge: lo.challenge, ...rp }) }))).status).toBe(401);
  });
});
