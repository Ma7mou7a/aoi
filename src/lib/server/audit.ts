import "server-only";
import { and, asc, desc, eq, isNull, lt, sql } from "drizzle-orm";
import { db, schema, type DB } from "@/db";
import { GENESIS, linkEntry, verifyChain } from "@/lib/security/hashChain";
import { keyring } from "@/lib/security/keyring";

/** Security events and how they read in Settings → Security activity. */
export const SECURITY_EVENTS = {
  sign_up: "Profile created",
  sign_in: "Signed in",
  sign_out: "Signed out",
  session_revoked: "A device was signed out",
  signed_out_everywhere: "Signed out on every device",
  signin_key_replaced: "Sign-in key replaced",
  passkey_added: "Passkey added",
  passkey_removed: "Passkey removed",
  device_link_created: "Sign-in code for another device created",
  consent_changed: "Permission changed",
  retention_changed: "Data retention changed",
  data_exported: "All data downloaded",
  account_deleted: "Profile and all data deleted",
} as const;
export type SecurityEventType = keyof typeof SECURITY_EVENTS;
type Details = Record<string, string | number | boolean>;
type Tx = Parameters<Parameters<DB["transaction"]>[0]>[0];

const METHOD_WORDS: Record<string, string> = { key: "with the sign-in key", passkey: "with a passkey", device_link: "with a code from another device", signup: "", dev: "(developer link)" };

// One writer at a time: the in-process queue covers PGlite, the advisory lock covers several app servers on Postgres.
let queue: Promise<unknown> = Promise.resolve();
const AUDIT_LOCK = 0x41_49_34_42; // "AI4B"

/** Append one entry to the chain. Never throws into the caller's flow (a log failure must not block sign-out). */
export function logSecurityEvent(userId: string | null, type: SecurityEventType, details: Details = {}) {
  const run = queue.then(() =>
    db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(${AUDIT_LOCK})`);
      const [last] = await tx.select({ seq: schema.securityEvents.seq, hash: schema.securityEvents.hash }).from(schema.securityEvents).orderBy(desc(schema.securityEvents.seq)).limit(1);
      const content = { seq: (last?.seq ?? 0) + 1, at: new Date(), userId, type, details };
      await tx.insert(schema.securityEvents).values({ ...content, ...linkEntry(keyring().auditKey, last?.hash ?? GENESIS, content) });
    }),
  );
  queue = run.catch((e) => console.error("[audit] could not write security event", e));
  return queue as Promise<void>;
}

/** A user's own security activity, newest first, in plain words. */
export async function listSecurityEvents(userId: string, limit = 20) {
  const rows = await db.select().from(schema.securityEvents).where(eq(schema.securityEvents.userId, userId)).orderBy(desc(schema.securityEvents.seq)).limit(limit);
  return rows.map((r) => {
    const base = SECURITY_EVENTS[r.type as SecurityEventType] ?? r.type;
    const method = r.type === "sign_in" && typeof r.details?.method === "string" ? METHOD_WORDS[r.details.method] : "";
    const device = typeof r.details?.device === "string" ? ` · ${r.details.device}` : "";
    return { seq: r.seq, type: r.type, label: `${base}${method ? ` ${method}` : ""}${device}`, at: r.at.toISOString(), details: r.details ?? {} };
  });
}

/** Verify the whole chain (or the newest `limit` entries). */
export async function verifySecurityLog(limit?: number) {
  const q = db.select().from(schema.securityEvents);
  const rows = limit
    ? (await q.orderBy(desc(schema.securityEvents.seq)).limit(limit)).reverse()
    : await q.orderBy(asc(schema.securityEvents.seq));
  const start = rows.length && rows[0].seq > 1 ? rows[0].prevHash : GENESIS;
  // A window that doesn't start at seq 1 trusts its first prevHash; the full check (no limit) trusts nothing.
  return verifyChain(keyring().auditKey, rows, start);
}

/** Right to erasure: blank the user's entries; their content hashes keep the chain verifiable. */
export async function redactUserEvents(userId: string, exec: DB | Tx = db, before?: Date) {
  await exec
    .update(schema.securityEvents)
    .set({ userId: null, details: null, redactedAt: new Date() })
    .where(and(eq(schema.securityEvents.userId, userId), isNull(schema.securityEvents.redactedAt), before ? lt(schema.securityEvents.at, before) : undefined));
}
