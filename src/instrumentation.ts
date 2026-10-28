/**
 * Runs once when the Next.js server starts (not during `next build`).
 * - Loads the master keyring early, so production refuses to start without AI4B_MASTER_KEY.
 * - Starts the retention purge (every user's window, every 6 hours).
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  const { keyring } = await import("./lib/security/keyring");
  keyring();
  if (process.env.AI4B_DISABLE_RETENTION_JOB === "1") return;
  const { startRetentionJob } = await import("./lib/server/retentionJob");
  startRetentionJob();
}
