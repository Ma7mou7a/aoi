import "server-only";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { dayStreak, milestones } from "../motivation";
import { db, schema } from "@/db";
import { inferAffect, type AffectState } from "../affect";
import { getDimension, getDimensions } from "../dimensions/loader";
import { newSeed } from "../rng";
import { credibleInterval, priorFor, updatePosterior, type Posterior } from "../profiler";
import { levelOf, scoreBlock, type BlockScore, type TrialRecord } from "../scoring";
import { whatItWouldTake, type Counterfactual } from "../scoring/counterfactual";
import { selectNext, type LastRun, type SelectionMode } from "../selector";
import { AVAILABLE_PARADIGMS, type BlockSpec } from "../tasks/registry";
import { trustSignals } from "../collab/score";
import { selfCheck, selfEstimateValue, type SelfCheck } from "../metacog";
import { recordSignals } from "./collab";
import { getPosteriors } from "./profile";
import { HttpError } from "./user";

/** Blocks per assessment session before we stop even if bands are still wide (fatigue guard). */
export const MAX_BLOCKS_PER_SESSION = 6;

/** Ask the selector for the next block of this session and package it for the client. */
export async function nextBlock(userId: string, sessionId: string, mode: SelectionMode): Promise<BlockSpec | null> {
  const runs = await db
    .select()
    .from(schema.taskRuns)
    .where(eq(schema.taskRuns.sessionId, sessionId))
    .orderBy(asc(schema.taskRuns.startedAt));
  const completed = runs.filter((r) => r.status === "completed");
  if (mode === "assessment" && completed.length >= MAX_BLOCKS_PER_SESSION) return null;

  const lastRuns: Record<string, LastRun> = {};
  for (const r of completed) {
    lastRuns[r.taskId] = { taskId: r.taskId, level: r.difficultyLevel, accuracy: r.metrics?.accuracy ?? 0 };
  }

  const selection = selectNext({
    dimensions: getDimensions(),
    posteriors: await getPosteriors(userId),
    mode,
    available: AVAILABLE_PARADIGMS,
    recent: completed.map((r) => r.dimensionId),
    lastRuns,
  });
  if (!selection) return null;

  const dim = getDimension(selection.dimensionId)!;
  const task = dim.tasks.find((t) => t.id === selection.taskId)!;
  let { level, reason } = selection;
  // Emotion-aware ease-off: after a block that looked frustrating, the next one of that task is one level easier.
  const last = completed.at(-1);
  const levels = task.difficulty.levels.map((l) => l.level);
  if (last?.affect?.easeOff && last.taskId === task.id && level > levels[0]) {
    level = levels[levels.indexOf(level) - 1] ?? levels[0];
    reason = { ...reason, rule: `${reason.rule}+ease_off`, note: `${reason.note} We're easing off one level after a tough block.` };
  }
  return {
    dimension: { id: dim.id, name: dim.name, color: dim.color },
    task: { id: task.id, name: task.name, paradigm: task.paradigm, instructions: task.instructions.trim(), params: task.params, validity: { min_rt_ms: task.validity.min_rt_ms } },
    level,
    params: { ...task.params, ...levelOf(task, level).params },
    seed: newSeed(),
    reason,
  };
}

export type RunResult = {
  taskRunId: string;
  score: BlockScore;
  before: { mean: number; sd: number; ci: [number, number] };
  after: { mean: number; sd: number; ci: [number, number] } | null;
  /** Behaviour-based fatigue/frustration hint (null without behavioural_signals consent). */
  affect: AffectState | null;
  /** Earned celebrations (personal best, highest estimate, streak); empty when nothing new. */
  wins: string[];
  /** Guess vs actual score, with the running calibration over recent guesses (null when skipped). */
  selfCheck: SelfCheck | null;
  /** Exact "what it would take" recalculations of this block (empty for Corsi and abandoned blocks). */
  whatIf: Counterfactual[];
};

/**
 * Store a finished (or abandoned) block with all its trials, score it, update the Brain Twin and
 * append a snapshot. Abandoned blocks are kept for behaviour analysis but never change the profile.
 */
export async function recordRun(input: {
  userId: string;
  sessionId: string;
  dimensionId: string;
  taskId: string;
  level: number;
  params: Record<string, unknown>;
  reason: BlockSpec["reason"];
  startedAt: Date;
  status: "completed" | "abandoned";
  trials: TrialRecord[];
  /** behavioural_signals consent: enables the affect inference. */
  behaviourOk?: boolean;
  sessionStartedAt?: Date;
  /** "How sure are you?" guess of the block score before seeing it (0..1); null/undefined = skipped. */
  selfEstimate?: number | null;
}): Promise<RunResult> {
  const dim = getDimension(input.dimensionId);
  const task = dim?.tasks.find((t) => t.id === input.taskId);
  if (!dim || !task) throw new HttpError(400, `unknown dimension/task ${input.dimensionId}/${input.taskId}`);
  if (!task.difficulty.levels.some((l) => l.level === input.level)) throw new HttpError(400, `invalid level ${input.level}`);

  const now = new Date();
  const score = scoreBlock(dim, task, input.level, input.trials);
  const before: Posterior = (await getPosteriors(input.userId, now))[dim.id] ?? priorFor(dim, now);
  const completed = input.status === "completed";
  const after = completed ? updatePosterior(before, score.observation, score.observationSd, score.validity.validTrials, now) : null;

  let affect: AffectState | null = null;
  if (completed && input.behaviourOk) {
    const earlier = await db
      .select({ taskId: schema.taskRuns.taskId, composite: schema.taskRuns.composite, status: schema.taskRuns.status })
      .from(schema.taskRuns)
      .where(eq(schema.taskRuns.sessionId, input.sessionId))
      .orderBy(asc(schema.taskRuns.startedAt));
    const minutes = input.sessionStartedAt ? (now.getTime() - input.sessionStartedAt.getTime()) / 60_000 : 0;
    affect = inferAffect({ trials: input.trials, composite: score.composite, taskId: task.id, earlier, sessionMinutes: minutes });
  }

  // Motivation: celebrate only real improvements against the user's own history.
  let wins: string[] = [];
  if (completed && after) {
    const [prevBlocks, prevSnaps, days] = await Promise.all([
      db.select({ composite: schema.taskRuns.composite }).from(schema.taskRuns)
        .where(and(eq(schema.taskRuns.userId, input.userId), eq(schema.taskRuns.taskId, task.id), eq(schema.taskRuns.difficultyLevel, input.level), eq(schema.taskRuns.status, "completed"))),
      db.select({ mean: schema.profileSnapshots.mean }).from(schema.profileSnapshots)
        .where(and(eq(schema.profileSnapshots.userId, input.userId), eq(schema.profileSnapshots.dimensionId, dim.id), eq(schema.profileSnapshots.trigger, "task_run"))),
      db.selectDistinct({ day: sql<string>`to_char(${schema.taskRuns.startedAt} at time zone 'UTC', 'YYYY-MM-DD')` }).from(schema.taskRuns)
        .where(and(eq(schema.taskRuns.userId, input.userId), eq(schema.taskRuns.status, "completed"))),
    ]);
    const maxOf = (xs: Array<number | null>) => (xs.filter((x): x is number => x != null).length ? Math.max(...xs.filter((x): x is number => x != null)) : null);
    wins = milestones({
      taskName: task.name,
      level: input.level,
      composite: score.composite,
      bestPreviousComposite: maxOf(prevBlocks.map((b) => b.composite)),
      skillName: dim.name,
      newMean: after.mean,
      bestPreviousMean: maxOf(prevSnaps.map((s) => s.mean)),
      streak: dayStreak([...days.map((d) => d.day), now.toISOString().slice(0, 10)], now),
      valid: score.validity.valid,
    });
  }

  const taskRunId = await db.transaction(async (tx) => {
    const [run] = await tx
      .insert(schema.taskRuns)
      .values({
        sessionId: input.sessionId,
        userId: input.userId,
        dimensionId: dim.id,
        taskId: task.id,
        configVersion: dim.version,
        difficultyLevel: input.level,
        params: input.params,
        selectionReason: input.reason,
        status: input.status,
        metrics: sanitise(score.metrics),
        composite: score.composite,
        observation: score.observation,
        observationSd: score.observationSd,
        validity: score.validity,
        affect,
        selfEstimate: input.selfEstimate ?? null,
        startedAt: input.startedAt,
        endedAt: now,
      })
      .returning({ id: schema.taskRuns.id });

    if (input.trials.length) {
      await tx.insert(schema.trials).values(
        input.trials.map((t) => ({
          taskRunId: run.id,
          userId: input.userId,
          trialIndex: t.trialIndex,
          isPractice: t.isPractice ?? false,
          stimulus: t.stimulus,
          expected: t.expected ?? null,
          response: t.response ?? null,
          outcome: t.outcome,
          correct: t.correct,
          rtMs: t.rtMs == null ? null : Math.round(t.rtMs),
          behaviour: t.behaviour ?? null,
          shownAt: t.shownAt ? new Date(t.shownAt) : now,
        })),
      );
    }

    if (after) {
      const snap = (p: Posterior, trigger: "prior" | "task_run", at: Date) => {
        const [lo, hi] = credibleInterval(p);
        return { userId: input.userId, dimensionId: dim.id, sessionId: input.sessionId, taskRunId: trigger === "task_run" ? run.id : null, trigger, mean: p.mean, sd: p.sd, ciLow: lo, ciHigh: hi, nObservations: p.nObservations, nTrials: p.nTrials, createdAt: at };
      };
      // First observation: also store the prior so the history chart starts from it.
      const rows = before.nObservations === 0 ? [snap(before, "prior", input.startedAt), snap(after, "task_run", now)] : [snap(after, "task_run", now)];
      await tx.insert(schema.profileSnapshots).values(rows);
    }
    return run.id;
  });

  await db.update(schema.users).set({ lastActiveAt: now }).where(eq(schema.users.id, input.userId));

  const view = (p: Posterior) => ({ mean: p.mean, sd: p.sd, ci: credibleInterval(p) });
  const whatIf = completed ? whatItWouldTake(task, input.trials) : [];
  let check: SelfCheck | null = null;
  if (completed && input.selfEstimate != null) {
    const earlier = await db
      .select({ guess: schema.taskRuns.selfEstimate, actual: schema.taskRuns.composite })
      .from(schema.taskRuns)
      .where(and(eq(schema.taskRuns.userId, input.userId), eq(schema.taskRuns.status, "completed"), sql`${schema.taskRuns.selfEstimate} is not null`, sql`${schema.taskRuns.id} <> ${taskRunId}`))
      .orderBy(desc(schema.taskRuns.startedAt))
      .limit(9);
    check = selfCheck(input.selfEstimate, score.composite, earlier.filter((e) => e.actual != null).map((e) => ({ guess: e.guess!, actual: e.actual! })));
    await recordSignals(input.userId, [{ signal: "self_estimate", value: selfEstimateValue(input.selfEstimate, score.composite), details: { taskRunId, guess: input.selfEstimate, actual: score.composite } }]);
  }
  if (completed && task.paradigm === "trust_machine") {
    const scoredTrials = input.trials.filter((t) => !t.isPractice && t.stimulus.initial != null);
    const disagreed = scoredTrials.filter((t) => t.stimulus.initial !== t.stimulus.advice);
    const cases = { self: disagreed.filter((t) => t.stimulus.aiCorrect === false).length, ai: disagreed.filter((t) => t.stimulus.aiCorrect === true).length };
    const signals = trustSignals(score.metrics, cases);
    if (signals.length) await recordSignals(input.userId, signals.map((s) => ({ ...s, details: { taskRunId, ...cases } })));
  }
  return { taskRunId, score, before: view(before), after: after && view(after), affect, wins, whatIf, selfCheck: check };
}

/** JSON can't hold NaN/Infinity; store them as absent. */
function sanitise(m: Record<string, number>) {
  return Object.fromEntries(Object.entries(m).filter(([, v]) => Number.isFinite(v)));
}
