import "server-only";

/**
 * Periodic retention purge inside the app server: once shortly after start, then every 6 hours.
 * Enforces every user's retention window even if they never come back. Started from
 * src/instrumentation.ts; `npm run purge` runs the same job by hand (or from cron).
 */
type Report = { users: number; challenges: number; at: string };
type Options = { run?: () => Promise<Report>; firstDelayMs?: number; intervalMs?: number; log?: (msg: string) => void };

type JobState = { first: ReturnType<typeof setTimeout>; every?: ReturnType<typeof setInterval> };
const g = globalThis as unknown as { __ai4bRetention?: JobState };

export function startRetentionJob(opts: Options = {}) {
  if (g.__ai4bRetention) return; // already running (dev hot reload)
  const log = opts.log ?? ((m: string) => console.log(m));
  const run = opts.run ?? (async () => (await import("./privacy")).purgeAllExpired());
  const tick = async () => {
    try {
      const r = await run();
      log(`[retention] purge done: ${r.users} profiles checked, ${r.challenges} expired codes removed`);
    } catch (e) {
      log(`[retention] purge failed, will retry next time: ${(e as Error).message}`);
    }
  };
  const state: JobState = {
    first: setTimeout(() => {
      void tick();
      state.every = setInterval(() => void tick(), opts.intervalMs ?? 6 * 3_600_000);
      state.every.unref?.();
    }, opts.firstDelayMs ?? 30_000),
  };
  state.first.unref?.();
  g.__ai4bRetention = state;
}

export function stopRetentionJob() {
  const s = g.__ai4bRetention;
  if (!s) return;
  clearTimeout(s.first);
  if (s.every) clearInterval(s.every);
  g.__ai4bRetention = undefined;
}
