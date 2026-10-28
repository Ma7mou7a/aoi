import "server-only";
import { createHmac } from "node:crypto";
import { and, eq, gt, isNull } from "drizzle-orm";
import { db, schema } from "@/db";
import { keyring } from "@/lib/security/keyring";
import { hashToken, newToken } from "@/lib/security/tokens";
import { ALGORITHMS, challengeOf, verifyAssertion, verifyRegistration, WebAuthnError, type AssertionResponse, type RegistrationResponse } from "@/lib/security/webauthn";
import { expectedOrigin } from "@/lib/security/web";

/**
 * Passkeys: an optional, phishing-resistant way to sign in (Face ID, Windows Hello, a security key…).
 * The private key never leaves the user's device; the server keeps the public key only. Challenges are
 * random, single-use, valid 5 minutes and stored hashed. Discoverable credentials, so signing in needs
 * no name or email at all.
 */
const CHALLENGE_TTL_MS = 5 * 60_000;
export const MAX_PASSKEYS = 10;

export type RelyingParty = { id: string; origin: string; name: string };

export function relyingParty(h: Headers, requestUrl: string): RelyingParty {
  const origin = expectedOrigin(h, requestUrl);
  return { id: new URL(origin).hostname, origin, name: "AI4Brain" };
}

async function newChallenge(kind: "webauthn_register" | "webauthn_login", userId: string | null) {
  const challenge = newToken();
  await db.insert(schema.authChallenges).values({ kind, userId, tokenHash: hashToken(challenge), expiresAt: new Date(Date.now() + CHALLENGE_TTL_MS) });
  return challenge;
}

/** Consume the challenge named inside the client data (single use, unexpired, right kind and user). */
async function consumeChallenge(kind: "webauthn_register" | "webauthn_login", clientDataJSON: string, userId: string | null) {
  const challenge = challengeOf(clientDataJSON);
  if (!challenge) throw new WebAuthnError("No challenge");
  const [row] = await db
    .update(schema.authChallenges)
    .set({ usedAt: new Date() })
    .where(
      and(
        eq(schema.authChallenges.tokenHash, hashToken(challenge)),
        eq(schema.authChallenges.kind, kind),
        isNull(schema.authChallenges.usedAt),
        gt(schema.authChallenges.expiresAt, new Date()),
        userId ? eq(schema.authChallenges.userId, userId) : isNull(schema.authChallenges.userId),
      ),
    )
    .returning({ id: schema.authChallenges.id });
  if (!row) throw new WebAuthnError("Wrong or expired challenge");
  return challenge;
}

/**
 * The WebAuthn user handle: derived from the user id with a server-side key, so it is stable without
 * being stored up front, and reveals nothing about the user id to the authenticator.
 */
async function userHandleFor(userId: string) {
  const [existing] = await db.select({ h: schema.passkeys.userHandle }).from(schema.passkeys).where(eq(schema.passkeys.userId, userId)).limit(1);
  return existing?.h ?? createHmac("sha256", keyring().auditKey).update(`webauthn-user-handle:${userId}`).digest().subarray(0, 16).toString("base64url");
}

/** Options for navigator.credentials.create(). */
export async function registrationOptions(user: { id: string; displayName: string }, rp: RelyingParty) {
  const existing = await db.select().from(schema.passkeys).where(eq(schema.passkeys.userId, user.id));
  if (existing.length >= MAX_PASSKEYS) throw new WebAuthnError(`You already have ${MAX_PASSKEYS} passkeys. Remove one first.`);
  const userHandle = await userHandleFor(user.id);
  return {
    challenge: await newChallenge("webauthn_register", user.id),
    rp: { id: rp.id, name: rp.name },
    user: { id: userHandle, name: `${user.displayName} · AI4Brain`, displayName: user.displayName },
    pubKeyCredParams: ALGORITHMS.map((alg) => ({ type: "public-key" as const, alg })),
    timeout: CHALLENGE_TTL_MS,
    attestation: "none" as const,
    authenticatorSelection: { residentKey: "required" as const, requireResidentKey: true, userVerification: "preferred" as const },
    excludeCredentials: existing.map((p) => ({ type: "public-key" as const, id: p.credentialId, transports: p.transports })),
  };
}

export async function finishRegistration(userId: string, credential: { id: string; response: RegistrationResponse }, rp: RelyingParty, label: string) {
  const userHandle = await userHandleFor(userId);
  const challenge = await consumeChallenge("webauthn_register", credential.response.clientDataJSON, userId);
  const v = verifyRegistration(credential.response, { expectedChallenge: challenge, expectedOrigin: rp.origin, rpId: rp.id });
  const [taken] = await db.select({ id: schema.passkeys.id }).from(schema.passkeys).where(eq(schema.passkeys.credentialId, v.credentialId));
  if (taken) throw new WebAuthnError("This passkey is already registered");
  const [row] = await db
    .insert(schema.passkeys)
    .values({ userId, credentialId: v.credentialId, publicKey: v.publicKey, algorithm: v.algorithm, counter: v.counter, userHandle, transports: (credential.response.transports ?? []).slice(0, 8), label, backedUp: v.backedUp })
    .returning();
  return row;
}

/** Options for navigator.credentials.get(): no user named, the device offers its passkeys for this site. */
export async function authenticationOptions(rp: RelyingParty) {
  return { challenge: await newChallenge("webauthn_login", null), rpId: rp.id, timeout: CHALLENGE_TTL_MS, userVerification: "preferred" as const, allowCredentials: [] as never[] };
}

/** Verify a passkey sign-in; returns the user id. */
export async function finishAuthentication(credential: { id: string; response: AssertionResponse }, rp: RelyingParty) {
  const challenge = await consumeChallenge("webauthn_login", credential.response.clientDataJSON, null);
  const [pk] = await db.select().from(schema.passkeys).where(eq(schema.passkeys.credentialId, credential.id));
  if (!pk) throw new WebAuthnError("Unknown passkey");
  // For discoverable credentials the device also returns our user handle; it must match.
  if (credential.response.userHandle && credential.response.userHandle !== pk.userHandle) throw new WebAuthnError("Passkey does not match its profile");
  const v = verifyAssertion(credential.response, { expectedChallenge: challenge, expectedOrigin: rp.origin, rpId: rp.id, publicKey: pk.publicKey, algorithm: pk.algorithm, storedCounter: pk.counter });
  await db.update(schema.passkeys).set({ counter: v.counter, lastUsedAt: new Date(), backedUp: v.backedUp }).where(eq(schema.passkeys.id, pk.id));
  return { userId: pk.userId, passkeyId: pk.id };
}

export async function removePasskey(userId: string, passkeyId: string) {
  const rows = await db.delete(schema.passkeys).where(and(eq(schema.passkeys.id, passkeyId), eq(schema.passkeys.userId, userId))).returning({ id: schema.passkeys.id, label: schema.passkeys.label });
  return rows[0] ?? null;
}
