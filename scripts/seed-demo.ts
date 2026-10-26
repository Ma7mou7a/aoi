/**
 * Seed a demo user with ~2 weeks of realistic history for the dashboard and the demo video.
 * Runs simulated players through the real pipeline (task simulators → scoreBlock → updatePosterior),
 * backdating every row. Usage: npm run seed:demo   (stop the dev server first when using PGlite)
 * Then open the dev-only sign-in link printed at the end.
 */
import { closeDb, db, schema } from "../src/db";
import { loadDimensions } from "../src/lib/dimensions/loader";
import { applyDrift, credibleInterval, priorFor, updatePosterior, type Posterior } from "../src/lib/profiler";
import { projectGrowth, type SnapshotPoint } from "../src/lib/profiler/projection";
import { createRng } from "../src/lib/rng";
import type { Paradigm } from "../src/lib/dimensions/schema";
import { levelOf, scoreBlock } from "../src/lib/scoring";
import { selectNext, type LastRun } from "../src/lib/selector";
import { simulateBlock } from "../src/lib/sim";
import { AVAILABLE_PARADIGMS } from "../src/lib/tasks/registry";

const DAY = 86_400_000;
const rng = createRng(2026);
const dims = loadDimensions();

/** True ability per skill on a given day: slow, noisy growth. */
const TRUTH: Record<string, [number, number]> = {
  working_memory: [0.45, 0.63],
  attention_inhibition: [0.38, 0.52],
  visuospatial_memory: [0.52, 0.6],
  processing_speed: [0.55, 0.66],
  cognitive_flexibility: [0.4, 0.5],
  reasoning: [0.6, 0.64],
};
const truthOn = (dimId: string, day: number) => {
  const [a, b] = TRUTH[dimId] ?? [0.5, 0.5];
  return a + ((b - a) * day) / 12;
};

const simulate = (paradigm: Paradigm, params: Record<string, unknown>, ability: number, seed: number) => simulateBlock(paradigm, params, ability, seed);

async function main() {
  const start = Date.now() - 13 * DAY;
  const [user] = await db.insert(schema.users).values({ displayName: "Demo", createdAt: new Date(start), lastActiveAt: new Date() }).returning();
  await db.insert(schema.consents).values(
    (["data_processing", "behavioural_signals", "llm_coaching", "planted_flaws"] as const).map((kind) => ({
      userId: user.id, kind, granted: kind !== "planted_flaws", policyVersion: "2026-10-26", createdAt: new Date(start),
    })),
  );

  const posteriors: Record<string, Posterior> = Object.fromEntries(dims.map((d) => [d.id, priorFor(d, new Date(start))]));
  const hist: Record<string, SnapshotPoint[]> = Object.fromEntries(dims.map((d) => [d.id, []]));
  const playDays = [0, 1, 2, 4, 5, 7, 8, 9, 11, 12, 13];
  let blocks = 0;

  for (const day of playDays) {
    const sessionStart = start + day * DAY + (17 + rng.int(4)) * 3_600_000;
    const mode = day < 3 || day % 3 === 0 ? "assessment" : "training";
    const [session] = await db
      .insert(schema.sessions)
      .values({ userId: user.id, mode, status: "completed", device: { type: "desktop", input: "keyboard", screen: [1440, 900] }, startedAt: new Date(sessionStart), endedAt: new Date(sessionStart + 12 * 60_000) })
      .returning();
    const recent: string[] = [];
    const lastRuns: Record<string, LastRun> = {};

    for (let b = 0; b < 3 + rng.int(2); b++) {
      const at = new Date(sessionStart + b * 3 * 60_000);
      for (const d of dims) posteriors[d.id] = applyDrift(posteriors[d.id], d, at);
      const sel = selectNext({ dimensions: dims, posteriors, mode, available: AVAILABLE_PARADIGMS, recent, lastRuns, targetSd: 0.04 });
      if (!sel) break;
      const dim = dims.find((d) => d.id === sel.dimensionId)!;
      const task = dim.tasks.find((t) => t.id === sel.taskId)!;
      const params = { ...task.params, ...levelOf(task, sel.level).params };
      const seed = rng.int(2 ** 31);
      const trials = simulate(task.paradigm, params, Math.min(1, Math.max(0, truthOn(dim.id, day) + 0.04 * rng.normal())), seed);
      const score = scoreBlock(dim, task, sel.level, trials);
      const before = posteriors[dim.id];
      const after = updatePosterior(before, score.observation, score.observationSd, score.validity.validTrials, at);

      const [run] = await db
        .insert(schema.taskRuns)
        .values({
          sessionId: session.id, userId: user.id, dimensionId: dim.id, taskId: task.id, configVersion: dim.version, difficultyLevel: sel.level,
          params: { ...params, seed }, selectionReason: sel.reason, status: "completed",
          metrics: Object.fromEntries(Object.entries(score.metrics).filter(([, v]) => Number.isFinite(v))),
          composite: score.composite, observation: score.observation, observationSd: score.observationSd, validity: score.validity,
          startedAt: at, endedAt: new Date(at.getTime() + 90_000),
        })
        .returning({ id: schema.taskRuns.id });
      await db.insert(schema.trials).values(
        trials.map((t) => ({
          taskRunId: run.id, userId: user.id, trialIndex: t.trialIndex, isPractice: t.isPractice ?? false, stimulus: t.stimulus,
          expected: t.expected ?? null, response: t.response ?? null, outcome: t.outcome, correct: t.correct, rtMs: t.rtMs, shownAt: at,
        })),
      );
      const snap = (p: Posterior, trigger: "prior" | "task_run", when: Date) => {
        const [lo, hi] = credibleInterval(p);
        return { userId: user.id, dimensionId: dim.id, sessionId: session.id, taskRunId: trigger === "task_run" ? run.id : null, trigger, mean: p.mean, sd: p.sd, ciLow: lo, ciHigh: hi, nObservations: p.nObservations, nTrials: p.nTrials, createdAt: when };
      };
      await db.insert(schema.profileSnapshots).values(before.nObservations === 0 ? [snap(before, "prior", at), snap(after, "task_run", new Date(at.getTime() + 90_000))] : [snap(after, "task_run", new Date(at.getTime() + 90_000))]);

      posteriors[dim.id] = after;
      hist[dim.id].push({ at: new Date(at.getTime() + 90_000), mean: after.mean, sd: after.sd });
      recent.push(dim.id);
      lastRuns[task.id] = { taskId: task.id, level: sel.level, accuracy: score.metrics.accuracy ?? 0 };
      blocks++;
    }
  }

  // Weekly forecasts the twin "made" in the past, from the history available at that time,
  // so the dashboard can show its track record.
  const forecasts = [];
  // Days 3–5: their 7-day targets (days 10–12) have already passed, so each can be checked.
  for (const cpDay of [3, 4, 5]) {
    const cp = new Date(start + cpDay * DAY + 22 * 3_600_000);
    for (const d of dims) {
      const h = hist[d.id].filter((p) => p.at <= cp);
      if (!h.length) continue;
      const p = projectGrowth(h, h.at(-1)!, 7, d.profile.uncertainty.drift_sd_per_day, cp);
      if (p) forecasts.push({ userId: user.id, dimensionId: d.id, model: "trend_v1", horizonDays: 7, mean: p.mean, ciLow: p.ciLow, ciHigh: p.ciHigh, fittedOnSnapshots: h.length, createdAt: cp });
    }
  }
  if (forecasts.length) await db.insert(schema.projections).values(forecasts);

  const wm = posteriors.working_memory;
  await db.insert(schema.goals).values([
    { userId: user.id, kind: "reach_score", dimensionId: "working_memory", title: "Working memory to 70%", targetValue: 0.7, currentValue: 0.5, deadline: new Date(Date.now() + 10 * DAY).toISOString().slice(0, 10), createdAt: new Date(start + 2 * DAY) },
    { userId: user.id, kind: "consistency", title: "Play 4 sessions a week", targetValue: 4, deadline: new Date(Date.now() + 7 * DAY).toISOString().slice(0, 10), createdAt: new Date(start + 2 * DAY) },
  ]);

  console.log(`Seeded demo user ${user.id}: ${playDays.length} sessions, ${blocks} blocks. Working memory now ${Math.round(wm.mean * 100)}%.`);
  console.log(`Sign in (dev server only): http://localhost:3000/api/dev/login?uid=${user.id}`);
}

// Close the connection so PGlite flushes to disk (it isn't crash-safe on a hard exit).
main()
  .then(closeDb)
  .catch(async (e) => {
    console.error(e);
    await closeDb();
    process.exitCode = 1;
  });
