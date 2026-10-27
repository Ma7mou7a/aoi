import { createHash, randomBytes } from "node:crypto";

/**
 * Sign-in keys: the privacy-preserving way back into a profile from another browser or device.
 * No email, no password: a random 80-bit key in Crockford base32, grouped for reading aloud
 * ("K7QM-2XRP-9TFD-W4HN"). Only its SHA-256 is stored; with 80 random bits a fast hash is enough
 * (nothing to brute-force with a dictionary), and it doubles as the lookup index.
 */

const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"; // Crockford base32: no I, L, O, U
export const KEY_CHARS = 16;

export function generateSigninKey(bytes: Uint8Array = randomBytes(10)): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const b of bytes) {
    value = (value << 8) | b;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  return out.slice(0, KEY_CHARS).match(/.{4}/g)!.join("-");
}

/** Forgiving input: case, spaces and dashes don't matter, and look-alikes map (O→0, I/L→1, U→V). */
export function normaliseSigninKey(input: string): string | null {
  const s = input.toUpperCase().replace(/[\s-]/g, "").replace(/O/g, "0").replace(/[IL]/g, "1").replace(/U/g, "V");
  return s.length === KEY_CHARS && [...s].every((c) => ALPHABET.includes(c)) ? s : null;
}

export const hashSigninKey = (normalised: string) => createHash("sha256").update(`ai4brain-signin:${normalised}`).digest("hex");
