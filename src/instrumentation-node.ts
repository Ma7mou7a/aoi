/**
 * Server start (Node runtime only, not during `next build`):
 * - load the master keyring early, so production refuses to start without AI4B_MASTER_KEY;
 * - start the retention purge (every user's window, every 6 hours).
 */
import { keyring } from "./lib/security/keyring";
import { startRetentionJob } from "./lib/server/retentionJob";

if (process.env.NEXT_PHASE !== "phase-production-build") {
  keyring();
  if (process.env.AI4B_DISABLE_RETENTION_JOB !== "1") startRetentionJob();
}
