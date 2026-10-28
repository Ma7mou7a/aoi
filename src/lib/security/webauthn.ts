import { createHash, createPublicKey, verify, type JsonWebKey } from "node:crypto";
import { decodeCbor, decodeCborPrefix, type Cbor } from "./cbor";
import { safeEqual } from "./tokens";

/**
 * WebAuthn (passkeys) relying-party verification with Node's crypto only, following the W3C
 * WebAuthn Level 2 verification steps (§7.1 registration, §7.2 authentication). Supported keys:
 * ES256 (P-256), EdDSA (Ed25519) and RS256. Attestation is requested as "none" and not verified:
 * the app doesn't need to know which device model someone uses (less fingerprinting).
 */

export class WebAuthnError extends Error {}

const b64u = (s: string) => Buffer.from(s, "base64url");
const sha256 = (b: Uint8Array) => createHash("sha256").update(b).digest();
export const ALGORITHMS = [-7, -8, -257] as const;

type ClientData = { type: string; challenge: string; origin: string; crossOrigin?: boolean };

function parseClientData(b64: string, expectedType: string, expectedChallenge: string, expectedOrigin: string) {
  let cd: ClientData;
  const raw = b64u(b64);
  try {
    cd = JSON.parse(raw.toString("utf8"));
  } catch {
    throw new WebAuthnError("Client data is not valid JSON");
  }
  if (cd.type !== expectedType) throw new WebAuthnError(`Wrong ceremony type: ${cd.type}`);
  if (typeof cd.challenge !== "string" || !safeEqual(cd.challenge, expectedChallenge)) throw new WebAuthnError("Wrong or expired challenge");
  // The browser writes the real origin here, so a look-alike phishing site can never pass.
  if (cd.origin !== expectedOrigin) throw new WebAuthnError(`Unexpected origin: ${cd.origin}`);
  if (cd.crossOrigin === true) throw new WebAuthnError("Cross-origin ceremonies are not allowed");
  return { raw, clientData: cd };
}

/** Read the challenge from client data without verifying anything (to look the challenge up first). */
export function challengeOf(clientDataB64: string): string | null {
  try {
    const c = JSON.parse(b64u(clientDataB64).toString("utf8")).challenge;
    return typeof c === "string" && c.length <= 128 ? c : null;
  } catch {
    return null;
  }
}

export type AuthData = {
  rpIdHash: Buffer;
  flags: { up: boolean; uv: boolean; backupEligible: boolean; backedUp: boolean; attested: boolean };
  counter: number;
  credentialId?: Buffer;
  cosePublicKey?: Map<Cbor, Cbor>;
};

export function parseAuthData(buf: Buffer): AuthData {
  if (buf.length < 37) throw new WebAuthnError("Authenticator data too short");
  const f = buf[32];
  const flags = { up: !!(f & 0x01), uv: !!(f & 0x04), backupEligible: !!(f & 0x08), backedUp: !!(f & 0x10), attested: !!(f & 0x40) };
  const out: AuthData = { rpIdHash: buf.subarray(0, 32), flags, counter: buf.readUInt32BE(33) };
  if (flags.attested) {
    if (buf.length < 55) throw new WebAuthnError("Attested credential data truncated");
    const idLen = buf.readUInt16BE(53);
    if (idLen > 1023 || buf.length < 55 + idLen) throw new WebAuthnError("Bad credential id length");
    out.credentialId = buf.subarray(55, 55 + idLen);
    const key = decodeCborPrefix(buf, 55 + idLen).value;
    if (!(key instanceof Map)) throw new WebAuthnError("Credential public key is not a COSE map");
    out.cosePublicKey = key;
  }
  return out;
}

/** COSE public key → SPKI DER (what Node's crypto.verify takes), checking it matches the declared algorithm. */
export function coseToSpki(cose: Map<Cbor, Cbor>): { spki: Buffer; algorithm: number } {
  const kty = cose.get(1);
  const alg = cose.get(3);
  const bytes = (label: number) => {
    const v = cose.get(label);
    if (!(v instanceof Uint8Array)) throw new WebAuthnError(`COSE key parameter ${label} missing`);
    return Buffer.from(v).toString("base64url");
  };
  let jwk: JsonWebKey;
  if (kty === 2 && alg === -7 && cose.get(-1) === 1) jwk = { kty: "EC", crv: "P-256", x: bytes(-2), y: bytes(-3) };
  else if (kty === 1 && alg === -8 && cose.get(-1) === 6) jwk = { kty: "OKP", crv: "Ed25519", x: bytes(-2) };
  else if (kty === 3 && alg === -257) jwk = { kty: "RSA", n: bytes(-1), e: bytes(-2) };
  else throw new WebAuthnError(`Unsupported key type ${String(kty)} / algorithm ${String(alg)}`);
  try {
    return { spki: createPublicKey({ key: jwk, format: "jwk" }).export({ type: "spki", format: "der" }), algorithm: alg as number };
  } catch {
    throw new WebAuthnError("Invalid public key");
  }
}

function checkRp(auth: AuthData, rpId: string) {
  if (!safeEqual(auth.rpIdHash.toString("hex"), sha256(Buffer.from(rpId)).toString("hex"))) throw new WebAuthnError("Credential belongs to another relying party");
  if (!auth.flags.up) throw new WebAuthnError("User was not present");
}

export type RegistrationResponse = { clientDataJSON: string; attestationObject: string; transports?: string[] };

/** §7.1: verify a new credential and return what to store (public key in SPKI, never anything secret). */
export function verifyRegistration(resp: RegistrationResponse, opts: { expectedChallenge: string; expectedOrigin: string; rpId: string; requireUserVerification?: boolean }) {
  try {
    parseClientData(resp.clientDataJSON, "webauthn.create", opts.expectedChallenge, opts.expectedOrigin);
    const att = decodeCbor(b64u(resp.attestationObject));
    if (!(att instanceof Map) || !(att.get("authData") instanceof Uint8Array)) throw new WebAuthnError("Malformed attestation object");
    const auth = parseAuthData(Buffer.from(att.get("authData") as Uint8Array));
    checkRp(auth, opts.rpId);
    if (opts.requireUserVerification && !auth.flags.uv) throw new WebAuthnError("User verification required");
    if (!auth.credentialId || !auth.cosePublicKey) throw new WebAuthnError("No attested credential data");
    const { spki, algorithm } = coseToSpki(auth.cosePublicKey);
    return {
      credentialId: auth.credentialId.toString("base64url"),
      publicKey: spki.toString("base64url"),
      algorithm,
      counter: auth.counter,
      backedUp: auth.flags.backedUp,
      userVerified: auth.flags.uv,
    };
  } catch (e) {
    throw e instanceof WebAuthnError ? e : new WebAuthnError(`Invalid registration: ${(e as Error).message}`);
  }
}

export type AssertionResponse = { clientDataJSON: string; authenticatorData: string; signature: string; userHandle?: string | null };

/** §7.2: verify a sign-in signature against the stored public key. Returns the new counter to store. */
export function verifyAssertion(
  resp: AssertionResponse,
  opts: { expectedChallenge: string; expectedOrigin: string; rpId: string; publicKey: string; algorithm: number; storedCounter: number; requireUserVerification?: boolean },
) {
  try {
    const { raw } = parseClientData(resp.clientDataJSON, "webauthn.get", opts.expectedChallenge, opts.expectedOrigin);
    const authBuf = b64u(resp.authenticatorData);
    const auth = parseAuthData(authBuf);
    checkRp(auth, opts.rpId);
    if (opts.requireUserVerification && !auth.flags.uv) throw new WebAuthnError("User verification required");
    const key = createPublicKey({ key: b64u(opts.publicKey), format: "der", type: "spki" });
    const signed = Buffer.concat([authBuf, sha256(raw)]);
    const ok = verify(opts.algorithm === -8 ? null : "sha256", signed, key, b64u(resp.signature));
    if (!ok) throw new WebAuthnError("Bad signature");
    // Authenticators that count must count up; going backwards means the key may have been cloned.
    if ((auth.counter > 0 || opts.storedCounter > 0) && auth.counter <= opts.storedCounter) throw new WebAuthnError("Signature counter did not increase (possible cloned authenticator)");
    return { counter: auth.counter, userVerified: auth.flags.uv, backedUp: auth.flags.backedUp };
  } catch (e) {
    throw e instanceof WebAuthnError ? e : new WebAuthnError(`Invalid signature: ${(e as Error).message}`);
  }
}
