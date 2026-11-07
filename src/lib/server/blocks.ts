import "server-only";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { dayStreak, milestones } from "../motivation";
import { db, schema } from "@/db";
import { inferAffect, type AffectState } from "../affect";
import { getDimension, getDimensions } from "../dimensions/loader";
import { newSeed } from "../rng";
import { dailyChallenge, isDailyRun, todayUtc } from "../daily";
import { credibleInterval, priorFor, robustUpdate, type Posterior, type RobustUpdate } from "../profiler";
import { fastGuess, type Engagement } from "../scenarios/engagement";
import { levelOf, scoreBlock, type BlockScore, type TrialRecord } from "../scoring";
import { whatItWouldTake, type Counterfactual } from "../scoring/counterfactual";
import { selectNext, type LastRun, type SelectionMode } from "../selector";
import { detectPlateau, detectTwinPlateau, plateauBuster, type StrategyTrial } from "../scenarios/plateau";
import { rushProfile, shieldReceipt, type RushProfile, type ShieldReceipt } from "../scenarios/rush";
import { betRecord, placeBet, settleBet, type Bet, type BetOutcome, type BetRecord } from "../scenarios/bet";
import { compareExperiment, type ExperimentResult } from "../scenarios/plateau";
import { reliableChange } from "../scenarios/rci";
import { AVAILABLE_PARADIGMS, type BlockSpec } from "../tasks/registry";
import { trustSignals } from "../collab/score";
import { selfCheck, selfEstimateValue, type SelfCheck } from "../metacog";
import { recordSignals } from "./collab";
import { rememberPlayed } from "./coach";
import { awardForRun, type EarnedReward } from "./rewards";
import { getPosteriors } from "./profile";
import { HttpError } from "./user";
import { cipherFor, FIELDS } from "./vault";

/** Blocks per assessment session before we stop even if bands are still wide (fatigue guard). */
export const MAX_BLOCKS_PER_SESSION = 6;

/** Ask the selector for the next block of this session and package it for the client. */
/** `focus` (a dimension id) makes the session's first block come from that skill, e.g. from the getting-started checklist. */
/** `daily` makes the session a single game: today's shared daily challenge. */
export async function nextBlock(userId: string, sessionId: string, mode: SelectionMode, focus?: string, daily = false): Promise<BlockSpec | null> {
  const runs = await db
    .select()
    .from(schema.taskRuns)
    .where(eq(schema.taskRuns.sessionId, sessionId))
    .orderBy(asc(schema.taskRuns.startedAt));
  const completed = runs.filter((r) => r.status === "completed");
  if (mode === "assessment" && completed.length >= MAX_BLOCKS_PER_SESSION) return null;
  // A daily-challenge session is exactly one game.
  if (runs.some((r) => r.selectionReason?.rule === "daily")) return null;
  if (daily) {
    const all = getDimensions();
    const c = dailyChallenge(todayUtc(), all);
    const dim = getDimension(c.dimensionId)!;
    const task = dim.tasks.find((t) => t.id === c.taskId)!;
    return {
      dimension: { id: dim.id, name: dim.name, color: dim.color },
      task: { id: task.id, name: task.name, paradigm: task.paradigm, instructions: task.instructions.trim(), params: task.params, validity: { min_rt_ms: task.validity.min_rt_ms } },
      level: c.level,
      params: { ...task.params, ...levelOf(task, c.level).params },
      seed: c.seed,
      reason: { rule: "daily", expectedSdReduction: 0, note: "Bao's daily challenge: the same puzzle for everyone today." },
    };
  }

  const lastRuns: Record<string, LastRun> = {};
  for (const r of completed) {
    lastRuns[r.taskId] = { taskId: r.taskId, level: r.difficultyLevel, accuracy: r.metrics?.accuracy ?? 0 };
  }

  const all = getDimensions();
  const posteriors = await getPosteriors(userId);
  // The player picked the skill ("Play working memory"): every game of this session stays on it; the engine picks the level.
  const focused = focus ? all.filter((d) => d.id === focus) : [];
  const selection = selectNext({
    dimensions: focused.length ? focused : all,
    posteriors,
    mode,
    available: AVAILABLE_PARADIGMS,
    recent: completed.map((r) => r.dimensionId),
    lastRuns,
  });
  if (!selection) return null;
  // The player picked the skill: record that, with the full ranking for context (where the engine stood).
  if (focused.length && selection.reason.trace) {
    const full = selectNext({ dimensions: all, posteriors, mode, available: AVAILABLE_PARADIGMS, recent: completed.map((r) => r.dimensionId), lastRuns });
    selection.reason.trace = {
      ...selection.reason.trace,
      basis: "user_choice",
      ranking: full?.reason.trace?.ranking ?? selection.reason.trace.ranking,
      runnerUp: full?.dimensionId !== selection.dimensionId ? full?.dimensionId : undefined,
      marginPts: undefined,
      adjustments: ["you chose this skill yourself; I chose the level", ...selection.reason.trace.adjustments],
    };
  }

  const dim = getDimension(selection.dimensionId)!;
  const task = dim.tasks.find((t) => t.id === selection.taskId)!;
  let { level, reason } = selection;
  // Emotion-aware ease-off: after a block that looked frustrating, the next one of that task is one level easier.
  const last = completed.at(-1);
  const lastAffect = last ? (await cipherFor(userId)).openJson<AffectState>(last.affect, FIELDS.affect) : null;
  const levels = task.difficulty.levels.map((l) => l.level);
  if (last && lastAffect?.easeOff && last.taskId === task.id && level > levels[0]) {
    level = levels[levels.indexOf(level) - 1] ?? levels[0];
    reason = { ...reason, rule: `${reason.rule}+ease_off`, note: `${reason.note} We're easing off one level after a tough game.` };
    if (reason.trace) reason.trace = { ...reason.trace, adjustments: [...reason.trace.adjustments, "the last game looked frustrating: one level easier"] };
  }

  // Stagnation plateau (practice and assessments, across sessions): no progress → change the format.
  if (mode === "training" || PLATEAU_IN_ASSESSMENT.on) {
    const { p, ordered, normal, isBuster, tried } = await plateauState(userId, dim.id, task.id);
    const lastWasBuster = ordered.length > 0 && isBuster(ordered[ordered.length - 1]);
    if (p.plateau && !lastWasBuster) {
      const b = plateauBuster(p, task.paradigm, levels, p.level ?? level, ordered.filter(isBuster).length, tried);
      level = b.level;
      reason = {
        ...reason,
        rule: `${reason.rule}+plateau_${b.kind}`,
        note: b.detail,
        variant: { kind: b.kind, title: b.title, detail: b.detail, strategy: b.strategy, baseline: normal.slice(-6).map((r) => r.composite!) },
        trace: reason.trace && {
          ...reason.trace,
          adjustments: [...reason.trace.adjustments, `${p.basis === "twin" ? `plateau: ${p.n} games left your estimate within ${p.twinMovePts} pts (near ${p.twinPct}%)` : `plateau: ${p.n} games near ${p.meanPct}% (trend ${p.slopePtsPerBlock} pts per game, spread ${p.rangePts} pts)`} → ${b.kind === "strategy" ? `strategy “${b.strategy!.name}”` : `stretch round at level ${b.level}`}`],
        },
      };
    }
  }
  // Bao's bet: sealed now, before the game, settled on the result card.
  const post = posteriors[dim.id];
  if (post) reason = { ...reason, bet: placeBet(post, levelOf(task, level).ability_range, dim.profile.uncertainty.obs_sd, dim.profile.calibration) };
  return {
    dimension: { id: dim.id, name: dim.name, color: dim.color },
    task: { id: task.id, name: task.name, paradigm: task.paradigm, instructions: task.instructions.trim(), params: task.params, validity: { min_rt_ms: task.validity.min_rt_ms } },
    level,
    params: { ...task.params, ...levelOf(task, level).params },
    seed: newSeed(),
    reason,
  };
}

/**
 * The plateau state of one task for one player, shared by the engine (format change) and the coach
 * ("I'm stuck"): the last ordinary games, the plateau verdict (on the scores, else on the Brain Twin),
 * and every strategy already tried, with its own experiment result (strategy memory).
 */
export const PLATEAU_IN_ASSESSMENT = { on: true, rciGuard: true };

export async function plateauState(userId: string, dimensionId: string, taskId: string) {
  const history = await db
    .select({ id: schema.taskRuns.id, composite: schema.taskRuns.composite, observation: schema.taskRuns.observation, level: schema.taskRuns.difficultyLevel, validity: schema.taskRuns.validity, reason: schema.taskRuns.selectionReason, startedAt: schema.taskRuns.startedAt })
    .from(schema.taskRuns)
    .where(and(eq(schema.taskRuns.userId, userId), eq(schema.taskRuns.taskId, taskId), eq(schema.taskRuns.status, "completed")))
    .orderBy(desc(schema.taskRuns.startedAt))
    .limit(20);
  const ordered = history.reverse();
  type Row = (typeof ordered)[number];
  const variantOf = (r: Row) => (r.reason as { variant?: { kind: string; strategy?: { name: string }; baseline?: number[] } } | null)?.variant;
  const isBuster = (r: Row) => !!variantOf(r);
  const normal = ordered.filter((r) => !isBuster(r) && r.composite != null).slice(-10);
  const points = normal.map((r) => ({ composite: r.composite!, level: r.level, valid: r.validity?.valid ?? true }));
  const ids = normal.map((r) => r.id);
  const snaps = ids.length
    ? await db
        .select({ taskRunId: schema.profileSnapshots.taskRunId, mean: schema.profileSnapshots.mean })
        .from(schema.profileSnapshots)
        .where(and(eq(schema.profileSnapshots.userId, userId), eq(schema.profileSnapshots.dimensionId, dimensionId), eq(schema.profileSnapshots.trigger, "task_run"), inArray(schema.profileSnapshots.taskRunId, ids)))
    : [];
  const twinOf = new Map(snaps.map((x) => [x.taskRunId, x.mean]));
  const twinPoints = normal.map((r, i) => ({ ...points[i], twin: twinOf.get(r.id) ?? NaN }));
  let p = detectPlateau(points);
  // Scores too noisy to look flat? Read the plateau on the Brain Twin instead (the estimate after each game).
  if (!p.plateau && normal.length >= 4) p = detectTwinPlateau(twinPoints);
  // Never call it a plateau when the games show a reliable change (Reliable Change Index, 90%).
  if (p.plateau && PLATEAU_IN_ASSESSMENT.rciGuard) {
    const dim = getDimension(dimensionId);
    const obs = normal.filter((r) => r.validity?.valid !== false && r.observation != null).slice(-4).map((r) => r.observation!);
    const rc = dim ? reliableChange(obs, dim.profile.uncertainty.obs_sd) : null;
    if (rc?.reliable) p = { ...p, plateau: false };
  }
  // Strategy memory: each strategy tried so far, its games against the plateau games it was compared with.
  const byName = new Map<string, { baseline: number[]; scores: number[] }>();
  for (const r of ordered) {
    const v = variantOf(r);
    if (v?.kind !== "strategy" || !v.strategy || r.composite == null || r.validity?.valid === false) continue;
    const g = byName.get(v.strategy.name) ?? { baseline: v.baseline ?? [], scores: [] };
    g.scores.push(r.composite);
    byName.set(v.strategy.name, g);
  }
  const tried: StrategyTrial[] = [];
  for (const [name, g] of byName) {
    const e = compareExperiment(g.baseline, g.scores);
    if (e) tried.push({ name, diffPts: e.diffPts, lowPts: e.lowPts, highPts: e.highPts, verdict: e.verdict, n: e.nStrategy });
  }
  return { p, ordered, normal, isBuster, tried, twinPoints };
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
  /** Bamboo earned by this game (empty for an abandoned or unreliable game). */
  rewards: EarnedReward[];
  /** Exact "what it would take" recalculations of this block (empty for Corsi and abandoned blocks). */
  whatIf: Counterfactual[];
  /** Bao's bet sealed before the game, settled against the game score, with the running track record (null if no bet or unreliable game). */
  bet: { bet: Bet; outcome: BetOutcome; record: BetRecord } | null;
  /** Button-masher check of this block (speed–accuracy signature). */
  rush: RushProfile;
  /** For an unreliable block: how far a face-value update would have moved the Twin vs how far it moved. */
  shield: ShieldReceipt | null;
  /** After a plateau-buster strategy block: strategy vs plateau, with a 90% interval. */
  experiment: (ExperimentResult & { strategy: string }) | null;
  /** Fast-guess model: share of answers that look like guesses, with a 90% interval (choice tasks only). */
  engagement: Engagement | null;
  /** Outlier-proof update: how surprising the game was for the Twin, and whether its weight was reduced. */
  surprise: Pick<RobustUpdate, "z" | "damped" | "factor"> | null;
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
  const cipher = await cipherFor(input.userId);
  const score = scoreBlock(dim, task, input.level, input.trials);
  const before: Posterior = (await getPosteriors(input.userId, now))[dim.id] ?? priorFor(dim, now);
  const completed = input.status === "completed";
  const robust = completed ? robustUpdate(before, score.observation, score.observationSd, score.validity.validTrials, now) : null;
  const after = robust?.posterior ?? null;
  const rush = rushProfile(input.trials, task.validity.min_rt_ms);
  // Layer A, made visible: the update this block would have caused if trusted, next to the one it caused.
  let shield: ShieldReceipt | null = null;
  if (completed && !score.validity.valid) {
    const u = dim.profile.uncertainty;
    const scored = input.trials.filter((t) => !t.isPractice && t.outcome !== "abandoned").length;
    shield = shieldReceipt(before, score.observation, u.obs_sd * Math.sqrt(u.reference_trials / Math.max(scored, 1)), score.observationSd * (robust?.factor ?? 1), scored);
  }

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
        observationSd: score.observationSd * (robust?.factor ?? 1), // the noise actually used (outlier-proof), so replays match the Twin
        validity: score.validity,
        // Behaviour-based inferences and signals are encrypted with the user's data key.
        affect: affect ? (cipher.json(affect, FIELDS.affect) as unknown as AffectState) : null,
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
          behaviour: t.behaviour ? (cipher.json(t.behaviour, FIELDS.behaviour) as unknown as typeof t.behaviour) : null,
          shownAt: t.shownAt ? new Date(t.shownAt) : now,
          lookedAway: t.lookedAway ?? false,
        })),
      );
    }

    if (after) {
      const snap = (p: Posterior, trigger: "prior" | "task_run", at: Date) => {
        const [lo, hi] = credibleInterval(p);
        return { userId: input.userId, dimensionId: dim.id, sessionId: input.sessionId, taskRunId: trigger === "task_run" ? run.id : null, trigger, mean: p.mean, sd: p.sd, ciLow: lo, ciHigh: hi, nObservations: p.nObservations, nTrials: p.nTrials, createdAt: at };
      };
      // First observation: also store the prior so the history chart starts from it.
      // The prior is dated strictly before the update, even if the client's clock runs ahead of the server's.
      const priorAt = new Date(Math.min(input.startedAt.getTime(), now.getTime() - 1));
      const rows = before.nObservations === 0 ? [snap(before, "prior", priorAt), snap(after, "task_run", now)] : [snap(after, "task_run", now)];
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
  if (completed) await rememberPlayed(input.userId, dim.id);
  // Fast-guess model (Brain Twin 2.0, layer 1): how many of these answers look like guesses.
  let engagement: Engagement | null = null;
  const chance = (task.validity as { chance_accuracy?: number }).chance_accuracy;
  if (completed && chance != null && Number.isFinite(score.metrics.accuracy)) {
    const own = await db
      .select({ metrics: schema.taskRuns.metrics, valid: schema.taskRuns.validity })
      .from(schema.taskRuns)
      .where(and(eq(schema.taskRuns.userId, input.userId), eq(schema.taskRuns.taskId, task.id), eq(schema.taskRuns.status, "completed"), sql`${schema.taskRuns.id} <> ${taskRunId}`))
      .orderBy(desc(schema.taskRuns.startedAt))
      .limit(5);
    const history = own.filter((r) => r.valid?.valid !== false && Number.isFinite(r.metrics?.accuracy)).map((r) => r.metrics!.accuracy).reverse();
    engagement = fastGuess(score.metrics.accuracy, input.trials.filter((t) => !t.isPractice).length, chance, history);
  }
  // Self-experiment readout: strategy blocks played since the plateau, against the plateau's own blocks.
  let experiment: RunResult["experiment"] = null;
  const variant = input.reason.variant;
  if (completed && variant?.kind === "strategy" && variant.strategy && variant.baseline?.length) {
    const tried = await db
      .select({ composite: schema.taskRuns.composite, reason: schema.taskRuns.selectionReason, valid: schema.taskRuns.validity })
      .from(schema.taskRuns)
      .where(and(eq(schema.taskRuns.userId, input.userId), eq(schema.taskRuns.taskId, task.id), eq(schema.taskRuns.status, "completed")))
      .orderBy(desc(schema.taskRuns.startedAt))
      .limit(10);
    const same = tried.filter((r) => r.composite != null && r.valid?.valid !== false && (r.reason as { variant?: { strategy?: { name: string } } } | null)?.variant?.strategy?.name === variant.strategy!.name);
    const r = compareExperiment(variant.baseline, same.map((x) => x.composite!));
    if (r) experiment = { ...r, strategy: variant.strategy.name };
  }
  // Bao's bet: settle this game's sealed range, then the track record over every settled bet so far.
  let bet: RunResult["bet"] = null;
  if (completed && score.validity.valid && input.reason.bet) {
    const past = await db
      .select({ composite: schema.taskRuns.composite, reason: schema.taskRuns.selectionReason, valid: schema.taskRuns.validity })
      .from(schema.taskRuns)
      .where(and(eq(schema.taskRuns.userId, input.userId), eq(schema.taskRuns.status, "completed")))
      .orderBy(desc(schema.taskRuns.startedAt))
      .limit(200);
    const settled = past.flatMap((r) => {
      const b = (r.reason as { bet?: Bet } | null)?.bet;
      return b && r.composite != null && r.valid?.valid !== false ? [{ bet: b, composite: r.composite }] : [];
    });
    bet = { bet: input.reason.bet, outcome: settleBet(input.reason.bet, score.composite), record: betRecord(settled) };
  }
  const daily = isDailyRun({ dimensionId: input.dimensionId, params: input.params }, todayUtc(), getDimensions());
  const rewards = completed ? await awardForRun(input.userId, { id: taskRunId, valid: score.validity.valid, daily }) : [];
  return { taskRunId, score, before: view(before), after: after && view(after), affect, wins, whatIf, selfCheck: check, rewards, rush, shield, experiment, bet, engagement, surprise: robust && { z: robust.z, damped: robust.damped, factor: robust.factor } };
}

/** JSON can't hold NaN/Infinity; store them as absent. */
function sanitise(m: Record<string, number>) {
  return Object.fromEntries(Object.entries(m).filter(([, v]) => Number.isFinite(v)));
}
