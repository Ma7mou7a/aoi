import { describe, expect, it } from "vitest";
import { fakeAuthenticator, FLAGS } from "@/test/authenticator";
import { verifyAssertion, verifyRegistration, WebAuthnError } from "./webauthn";

const rp = { rpId: "localhost", origin: "http://localhost:3000" };
const challenge = "q8w3Xr0lJ9mKk1-yH4n2ZQ";

describe.each([
  [-7, "ES256 (P-256)"],
  [-8, "EdDSA (Ed25519)"],
  [-257, "RS256"],
] as const)("WebAuthn with %s %s", (alg, name) => {
  it("registers a passkey and then verifies a sign-in signature", () => {
    expect(name).toBeTruthy();
    const auth = fakeAuthenticator(alg);
    const reg = verifyRegistration(auth.create({ challenge, ...rp }).response, { expectedChallenge: challenge, expectedOrigin: rp.origin, rpId: rp.rpId });
    expect(reg.credentialId).toBe(auth.credentialId);
    expect(reg.algorithm).toBe(alg);
    const res = verifyAssertion(auth.get({ challenge: "c2", ...rp }).response, { expectedChallenge: "c2", expectedOrigin: rp.origin, rpId: rp.rpId, publicKey: reg.publicKey, algorithm: reg.algorithm, storedCounter: 0 });
    expect(res.userVerified).toBe(true);
  });
});

describe("WebAuthn checks", () => {
  const auth = fakeAuthenticator(-7);
  const reg = verifyRegistration(auth.create({ challenge, ...rp }).response, { expectedChallenge: challenge, expectedOrigin: rp.origin, rpId: rp.rpId });
  const verify = (resp: ReturnType<typeof auth.get>["response"], over: Partial<Parameters<typeof verifyAssertion>[1]> = {}) =>
    verifyAssertion(resp, { expectedChallenge: "c", expectedOrigin: rp.origin, rpId: rp.rpId, publicKey: reg.publicKey, algorithm: reg.algorithm, storedCounter: 0, ...over });

  it("rejects a phishing origin", () => {
    expect(() => verify(auth.get({ challenge: "c", rpId: rp.rpId, origin: "https://ai4brain-login.evil" }).response)).toThrow(/origin/);
  });

  it("rejects a credential scoped to another site", () => {
    expect(() => verify(auth.get({ challenge: "c", origin: rp.origin, rpId: "evil.example" }).response)).toThrow(/relying party/);
  });

  it("rejects a replayed or wrong challenge", () => {
    expect(() => verify(auth.get({ challenge: "old", ...rp }).response)).toThrow(/challenge/);
  });

  it("rejects a registration response used to sign in (wrong ceremony type)", () => {
    expect(() => verify(auth.get({ challenge: "c", ...rp, type: "webauthn.create" }).response)).toThrow(/type/);
  });

  it("requires the user to be present", () => {
    expect(() => verify(auth.get({ challenge: "c", ...rp, flags: FLAGS.UV & ~FLAGS.UP }).response)).toThrow(/present/);
  });

  it("rejects a tampered signature or authenticator data", () => {
    const r = auth.get({ challenge: "c", ...rp }).response;
    const data = Buffer.from(r.authenticatorData, "base64url");
    data[32] ^= FLAGS.UV; // flip the "user verified" bit
    expect(() => verify({ ...r, authenticatorData: data.toString("base64url") })).toThrow(/signature/);
    const other = fakeAuthenticator(-7);
    expect(() => verify(other.get({ challenge: "c", ...rp }).response)).toThrow(/signature/);
  });

  it("detects a cloned authenticator by its signature counter going backwards", () => {
    const a = fakeAuthenticator(-7);
    const r = verifyRegistration(a.create({ challenge, ...rp }).response, { expectedChallenge: challenge, expectedOrigin: rp.origin, rpId: rp.rpId });
    a.setCounter(5);
    const resp = a.get({ challenge: "c", ...rp }).response; // counter 6
    expect(verifyAssertion(resp, { expectedChallenge: "c", expectedOrigin: rp.origin, rpId: rp.rpId, publicKey: r.publicKey, algorithm: r.algorithm, storedCounter: 5 }).counter).toBe(6);
    expect(() => verifyAssertion(resp, { expectedChallenge: "c", expectedOrigin: rp.origin, rpId: rp.rpId, publicKey: r.publicKey, algorithm: r.algorithm, storedCounter: 6 })).toThrow(/counter/);
  });

  it("registration: rejects the wrong origin, a sign-in response, or missing credential data", () => {
    const a = fakeAuthenticator(-7);
    expect(() => verifyRegistration(a.create({ challenge, rpId: rp.rpId, origin: "https://evil.example" }).response, { expectedChallenge: challenge, expectedOrigin: rp.origin, rpId: rp.rpId })).toThrow(WebAuthnError);
    expect(() => verifyRegistration(a.create({ challenge, ...rp, type: "webauthn.get" }).response, { expectedChallenge: challenge, expectedOrigin: rp.origin, rpId: rp.rpId })).toThrow(/type/);
    expect(() => verifyRegistration(a.create({ challenge, ...rp, flags: FLAGS.UP }).response, { expectedChallenge: challenge, expectedOrigin: rp.origin, rpId: rp.rpId })).toThrow(/credential data/);
  });

  it("rejects garbage input without crashing", () => {
    expect(() => verify({ clientDataJSON: "x", authenticatorData: "y", signature: "z", userHandle: null })).toThrow(WebAuthnError);
  });
});
