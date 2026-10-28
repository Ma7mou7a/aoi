import "server-only";
import { eq, ne } from "drizzle-orm";
import { db, schema, type DB } from "@/db";
import { generateDataKey, open, openJson, seal, sealJson, unwrapKey, wrapKey, wrappedVersion, type SealedJson } from "@/lib/security/envelope";
import { keyring } from "@/lib/security/keyring";

/**
 * Per-user data keys (envelope encryption). See src/lib/security/envelope.ts for the format and
 * docs/security.md for the key hierarchy. Every sealed value is bound to "<userId>|<field>".
 */

/** The encrypted columns. Anything not listed here is stored in clear (see docs/security.md for why). */
export const FIELDS = {
  displayName: "users.display_name",
  coachMemory: "users.coach_memory",
  coachContent: "coach_messages.content",
  behaviour: "trials.behaviour",
  affect: "task_runs.affect",
} as const;

type Tx = Parameters<Parameters<DB["transaction"]>[0]>[0];
type Exec = DB | Tx;

// Unwrapped keys are kept in memory briefly so a page render doesn't unwrap the same key many times.
const CACHE_MS = 5 * 60_000;
const cache = new Map<string, { dek: Buffer; at: number }>();

export function forgetCachedKeys(userId?: string) {
  if (userId) cache.delete(userId);
  else cache.clear();
}

async function dataKey(userId: string, exec: Exec = db): Promise<Buffer> {
  const hit = cache.get(userId);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.dek;
  const ring = keyring();
  let [row] = await exec.select().from(schema.userKeys).where(eq(schema.userKeys.userId, userId));
  if (!row) {
    const dek = generateDataKey();
    await exec
      .insert(schema.userKeys)
      .values({ userId, wrappedKey: wrapKey(dek, ring.current, ring.keys.get(ring.current)!, userId), keyVersion: ring.current })
      .onConflictDoNothing();
    // Re-read: if two requests raced, both use the key that won.
    [row] = await exec.select().from(schema.userKeys).where(eq(schema.userKeys.userId, userId));
  }
  const dek = unwrapKey(row.wrappedKey, ring.keys, userId);
  cache.set(userId, { dek, at: Date.now() });
  return dek;
}

export type Field = (typeof FIELDS)[keyof typeof FIELDS];

/** Encrypt/decrypt helpers for one user. Fetch once per request, then use synchronously. */
export async function cipherFor(userId: string, exec: Exec = db) {
  const dek = await dataKey(userId, exec);
  const aad = (field: string) => `${userId}|${field}`;
  return {
    text: (plain: string, field: string) => seal(dek, plain, aad(field)),
    openText: (value: string, field: string) => open(dek, value, aad(field)),
    json: (value: unknown, field: string): SealedJson => sealJson(dek, value, aad(field)),
    openJson: <T>(value: unknown, field: string): T | null => openJson<T>(dek, (value ?? null) as T | null, aad(field)),
  };
}
export type UserCipher = Awaited<ReturnType<typeof cipherFor>>;

/**
 * Master-key rotation: re-wrap every data key that isn't under the current master key version.
 * Data itself is not re-encrypted (that's the point of envelope encryption). Once this reports 0
 * keys left on an old version, that old master key can be removed from the environment, and any
 * backup taken before that point can no longer be decrypted.
 */
export async function rotateAllKeys() {
  const ring = keyring();
  const stale = await db.select().from(schema.userKeys).where(ne(schema.userKeys.keyVersion, ring.current));
  let rewrapped = 0;
  const failed: string[] = [];
  for (const row of stale) {
    try {
      const dek = unwrapKey(row.wrappedKey, ring.keys, row.userId);
      await db
        .update(schema.userKeys)
        .set({ wrappedKey: wrapKey(dek, ring.current, ring.keys.get(ring.current)!, row.userId), keyVersion: ring.current, rotatedAt: new Date() })
        .where(eq(schema.userKeys.userId, row.userId));
      rewrapped++;
    } catch {
      failed.push(`${row.userId} (wrapped with version ${wrappedVersion(row.wrappedKey)})`);
    }
  }
  forgetCachedKeys();
  return { current: ring.current, rewrapped, failed };
}

/** Counts per master key version, for the rotation script and the Settings page. */
export async function keyVersionCounts() {
  const rows = await db.select({ v: schema.userKeys.keyVersion }).from(schema.userKeys);
  const counts: Record<number, number> = {};
  for (const r of rows) counts[r.v] = (counts[r.v] ?? 0) + 1;
  return counts;
}
