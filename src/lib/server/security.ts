import "server-only";
import { asc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { keyring } from "@/lib/security/keyring";
import { listSecurityEvents, verifySecurityLog } from "./audit";
import { listSessions } from "./auth";
import { FIELDS } from "./vault";

/** A user's passkeys, without the key material. */
export async function listPasskeys(userId: string) {
  const rows = await db.select().from(schema.passkeys).where(eq(schema.passkeys.userId, userId)).orderBy(asc(schema.passkeys.createdAt));
  return rows.map((p) => ({ id: p.id, label: p.label, backedUp: p.backedUp, createdAt: p.createdAt.toISOString(), lastUsedAt: p.lastUsedAt?.toISOString() ?? null }));
}

/** Everything Settings → Security & privacy shows, in one call. */
export async function getSecurityOverview(userId: string, sessionId: string) {
  const ring = keyring();
  const [devices, passkeys, activity, logCheck] = await Promise.all([
    listSessions(userId, sessionId),
    listPasskeys(userId),
    listSecurityEvents(userId, 15),
    // The newest 500 entries: enough to catch recent tampering without scanning the whole log on every visit.
    verifySecurityLog(500),
  ]);
  return {
    encryption: {
      on: true,
      algorithm: "AES-256-GCM",
      encryptedFields: Object.values(FIELDS),
      masterKeyVersion: ring.current,
      developmentKey: ring.dev,
    },
    devices,
    passkeys,
    activity,
    logCheck: { ok: logCheck.ok, checked: logCheck.checked },
  };
}
export type SecurityOverview = Awaited<ReturnType<typeof getSecurityOverview>>;
