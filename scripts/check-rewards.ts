/**
 * Idempotency check for bamboo awards: two concurrent claims of the same daily gift must produce one row.
 * Run against a throwaway database, e.g.
 *   PGLITE_DIR=/tmp/pg-check npx drizzle-kit migrate && PGLITE_DIR=/tmp/pg-check npx tsx --conditions=react-server scripts/check-rewards.ts
 */
import { and, eq } from "drizzle-orm";
import { closeDb, db, schema } from "../src/db";
import { award, getRewards } from "../src/lib/server/rewards";

async function main() {
  const [user] = await db.insert(schema.users).values({ displayName: "reward check" }).returning();
  try {
    const results = await Promise.all([award(user.id, "daily_visit"), award(user.id, "daily_visit")]);
    const rows = await db.select().from(schema.rewardEvents).where(and(eq(schema.rewardEvents.userId, user.id), eq(schema.rewardEvents.kind, "daily_visit")));
    const view = await getRewards(user.id);
    const ok = rows.length === 1 && results.filter(Boolean).length === 1 && view.total === 5 && view.giftClaimedToday;
    console.log(ok ? "ok" : `FAILED: rows=${rows.length} results=${JSON.stringify(results)} total=${view.total}`);
    process.exitCode = ok ? 0 : 1;
  } finally {
    await db.delete(schema.users).where(eq(schema.users.id, user.id));
    await closeDb();
  }
}

void main();
