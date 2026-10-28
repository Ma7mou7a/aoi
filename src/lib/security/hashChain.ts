import { createHash, createHmac, timingSafeEqual } from "node:crypto";

/**
 * A keyed, redactable hash chain for the security log.
 *
 *   contentHash_n = SHA-256(canonical JSON of {seq, at, userId, type, details})
 *   hash_n        = HMAC-SHA-256(auditKey, hash_{n-1} | contentHash_n)
 *
 * - Editing an entry changes its contentHash; deleting or reordering entries breaks the link to the
 *   previous hash. Either way verification fails from that entry on.
 * - The HMAC key lives only in the environment, so someone with write access to the database alone
 *   cannot rewrite history and re-seal the chain.
 * - Erasure: a user's entries can be redacted (userId and details set to null) while their stored
 *   contentHash still links the chain, so deleting a person never breaks the proof for everyone else.
 */

export const GENESIS = "0".repeat(64);

export type ChainContent = { seq: number; at: Date; userId: string | null; type: string; details: Record<string, unknown> | null };
export type ChainRow = ChainContent & { contentHash: string; prevHash: string; hash: string; redactedAt: Date | null };

/** Stable JSON: object keys sorted at every level, so the same content always hashes the same. */
export function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value ?? null);
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  const obj = value as Record<string, unknown>;
  return `{${Object.keys(obj).sort().map((k) => `${JSON.stringify(k)}:${canonical(obj[k])}`).join(",")}}`;
}

export const contentHashOf = (c: ChainContent) =>
  createHash("sha256").update(canonical({ seq: c.seq, at: c.at, userId: c.userId, type: c.type, details: c.details })).digest("hex");

export const chainHash = (key: Buffer, prevHash: string, contentHash: string) =>
  createHmac("sha256", key).update(`${prevHash}|${contentHash}`).digest("hex");

export function linkEntry(key: Buffer, prevHash: string, content: ChainContent) {
  const contentHash = contentHashOf(content);
  return { contentHash, prevHash, hash: chainHash(key, prevHash, contentHash) };
}

const same = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

export type ChainVerdict =
  | { ok: true; checked: number }
  | { ok: false; checked: number; brokenAt: number; reason: "content_changed" | "link_broken" | "seal_invalid" };

/** Verify rows in seq order. `start` is the expected prevHash of the first row (GENESIS for the whole chain). */
export function verifyChain(key: Buffer, rows: ChainRow[], start: string = GENESIS): ChainVerdict {
  let prev = start;
  let expectedSeq = rows[0]?.seq;
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const fail = (reason: "content_changed" | "link_broken" | "seal_invalid") => ({ ok: false as const, checked: i, brokenAt: r.seq, reason });
    if (r.seq !== expectedSeq || !same(r.prevHash, prev)) return fail("link_broken");
    if (!r.redactedAt && !same(contentHashOf(r), r.contentHash)) return fail("content_changed");
    if (!same(chainHash(key, prev, r.contentHash), r.hash)) return fail("seal_invalid");
    prev = r.hash;
    expectedSeq = r.seq + 1;
  }
  return { ok: true, checked: rows.length };
}
