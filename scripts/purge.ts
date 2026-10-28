/**
 * Retention purge for every profile (the same job the server runs every 6 hours).
 * npm run purge   (safe to run from cron; uses DATABASE_URL or PGLITE_DIR like the app)
 */
import { closeDb } from "../src/db";
import { purgeAllExpired } from "../src/lib/server/privacy";

async function main() {
  const report = await purgeAllExpired();
  console.log(`Retention purge done at ${report.at}: ${report.users} profiles checked, ${report.challenges} expired sign-in codes removed.`);
  await closeDb();
}

void main();
