import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * Envelope encryption for personal data at rest.
 *
 *   master key (env, versioned)  ──wraps──▶  per-user data key (DEK, in user_keys)  ──encrypts──▶  fields
 *
 * Every field value is AES-256-GCM with a fresh 96-bit IV. The additional authenticated data (AAD)
 * binds a ciphertext to its owner and column ("<userId>|<table.column>"), so a value copied to another
 * user's row or another column fails to decrypt instead of being shown. Deleting the DEK makes every
 * copy of that user's ciphertext unreadable (crypto-shredding).
 *
 * Formats (base64url, no padding):
 *   field:       enc:v1:<iv 12 bytes | ciphertext | tag 16 bytes>
 *   wrapped DEK: kw:v1:<master key version>:<iv | ciphertext | tag>
 */

const ALG = "aes-256-gcm";
const IV_BYTES = 12;
const TAG_BYTES = 16;
const FIELD_PREFIX = "enc:v1:";
const WRAP_PREFIX = "kw:v1:";

export const generateDataKey = () => randomBytes(32);

function encrypt(key: Buffer, plaintext: Buffer, aad: string) {
  const iv = randomBytes(IV_BYTES);
  const c = createCipheriv(ALG, key, iv);
  c.setAAD(Buffer.from(aad, "utf8"));
  const ct = Buffer.concat([c.update(plaintext), c.final()]);
  return Buffer.concat([iv, ct, c.getAuthTag()]).toString("base64url");
}

function decrypt(key: Buffer, packed: string, aad: string) {
  const raw = Buffer.from(packed, "base64url");
  if (raw.length < IV_BYTES + TAG_BYTES) throw new Error("Ciphertext too short");
  const d = createDecipheriv(ALG, key, raw.subarray(0, IV_BYTES));
  d.setAAD(Buffer.from(aad, "utf8"));
  d.setAuthTag(raw.subarray(raw.length - TAG_BYTES));
  // final() throws if the tag doesn't verify: wrong key, wrong AAD or a modified ciphertext.
  return Buffer.concat([d.update(raw.subarray(IV_BYTES, raw.length - TAG_BYTES)), d.final()]);
}

export const isSealed = (v: unknown): v is string => typeof v === "string" && v.startsWith(FIELD_PREFIX);

export function seal(dek: Buffer, plaintext: string, aad: string): string {
  return FIELD_PREFIX + encrypt(dek, Buffer.from(plaintext, "utf8"), aad);
}

/** Decrypt a sealed value. Plaintext written before encryption was switched on passes through unchanged. */
export function open(dek: Buffer, value: string, aad: string): string {
  if (!isSealed(value)) return value;
  return decrypt(dek, value.slice(FIELD_PREFIX.length), aad).toString("utf8");
}

export type SealedJson = { $enc: string };
const isSealedJson = (v: unknown): v is SealedJson => !!v && typeof v === "object" && isSealed((v as SealedJson).$enc);

/** JSON columns hold {"$enc": "enc:v1:…"} so the column type (jsonb) doesn't change. */
export function sealJson(dek: Buffer, value: unknown, aad: string): SealedJson {
  return { $enc: seal(dek, JSON.stringify(value), aad) };
}

export function openJson<T>(dek: Buffer, value: T | SealedJson | null, aad: string): T | null {
  if (value == null) return null;
  if (!isSealedJson(value)) return value as T;
  return JSON.parse(open(dek, value.$enc, aad)) as T;
}

export function wrapKey(dek: Buffer, version: number, kek: Buffer, userId: string): string {
  return `${WRAP_PREFIX}${version}:${encrypt(kek, dek, `dek|${userId}`)}`;
}

export function wrappedVersion(wrapped: string): number {
  return Number(wrapped.slice(WRAP_PREFIX.length).split(":")[0]);
}

export function unwrapKey(wrapped: string, keyring: ReadonlyMap<number, Buffer>, userId: string): Buffer {
  if (!wrapped.startsWith(WRAP_PREFIX)) throw new Error("Not a wrapped key");
  const [v, packed] = wrapped.slice(WRAP_PREFIX.length).split(":");
  const kek = keyring.get(Number(v));
  if (!kek) throw new Error(`No master key version ${v} is configured`);
  return decrypt(kek, packed, `dek|${userId}`);
}
