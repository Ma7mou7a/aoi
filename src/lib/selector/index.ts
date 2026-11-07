import type { Bet } from "../scenarios/bet";
import type { Dimension, DimensionTask, Paradigm } from "../dimensions/schema";
import { CENSORED_SD_MULTIPLIER, CENSOR_MARGIN } from "../scoring";
import { expectedPosteriorSd, toPercent, Z90, type Posterior } from "../profiler";
import { inSentence } from "../text";
import { detectAsymmetry, levelForRole } from "../scenarios/asymmetry";

export type SelectionMode = "assessment" | "training";

/** One skill as the rule saw it when it decided (ranked best candidate first). */
export type RankedSkill = { skill: string; name: string; meanPct: number; bandPct: [number, number]; blocks: number; score: number };

/**
 * The decision record ("why this exercise?"): what the rule looked at, how it ranked the skills, the
 * runner-up and how close it came. Saved with the block at decision time, so an explanation is the
 * real reason, never a story made up afterwards.
 */
export type DecisionTrace = {
  mode: SelectionMode;
  /** "lowest_estimate", "max_expected_uncertainty_reduction", "asymmetric_stretch" ... */
  basis: string;
  ranking: RankedSkill[];
  chosen: string;
  runnerUp?: string;
  /** Training: estimate points the runner-up was above the chosen skill. Assessment: band points of shrinkage it lacked. */
  marginPts?: number;
  /** Everything that changed the plain rule's choice (staircase, ease off, plateau, split profile...). */
  adjustments: string[];
  at: string;
};

/** A format change chosen by the engine (plateau buster), shown before the game and saved with the block. */
export type BlockVariant = {
  kind: "strategy" | "stretch";
  title: string;
  detail: string;
  strategy?: { name: string; how: string };
  /** Plateau block scores (0..1) the strategy will be compared with. */
  baseline?: number[];
};

export type SelectionReason = { rule: string; expectedSdReduction: number; note: string; trace?: DecisionTrace; variant?: BlockVariant; bet?: Bet };

export type Selection = {
  dimensionId: string;
  taskId: string;
  level: number;
  reason: SelectionReason;
};

export type LastRun = { taskId: string; level: number; accuracy: number };

export type SelectorInput = {
  dimensions: Dimension[];
  posteriors: Record<string, Posterior>;
  mode: SelectionMode;
  /** Only paradigms the front end can render are eligible. */
  available: readonly Paradigm[];
  /** Dimension ids already played this session, oldest first. */
  recent?: string[];
  /** Last completed block per task in this session (drives the training staircase). */
  lastRuns?: Record<string, LastRun>;
  /** Assessment stops once every eligible band is narrower than this SD. */
  targetSd?: number;
};

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

/** Where the user is expected to land inside a level's range, given their current estimate. */
export function predictedComposite(mean: number, range: readonly [number, number]): number {
  return clamp01((mean - range[0]) / (range[1] - range[0]));
}

/** Expected observation noise for a full, valid block at a level (wider if the level is likely too easy/hard). */
export function expectedObsSd(dim: Dimension, mean: number, range: readonly [number, number]): number {
  const c = predictedComposite(mean, range);
  const censored = c < CENSOR_MARGIN * 2 || c > 1 - CENSOR_MARGIN * 2;
  return dim.profile.uncertainty.obs_sd * (censored ? CENSORED_SD_MULTIPLIER : 1);
}

type Candidate = { dim: Dimension; task: DimensionTask; level: number; reduction: number; c: number };

function candidates(input: SelectorInput): Candidate[] {
  const out: Candidate[] = [];
  for (const dim of input.dimensions) {
    const post = input.posteriors[dim.id];
    if (!post) continue;
    for (const task of dim.tasks) {
      if (!input.available.includes(task.paradigm)) continue;
      for (const l of task.difficulty.levels) {
        if (input.mode === "assessment" && l.training_only) continue;
        const reduction = post.sd - expectedPosteriorSd(post.sd, expectedObsSd(dim, post.mean, l.ability_range));
        out.push({ dim, task, level: l.level, reduction, c: predictedComposite(post.mean, l.ability_range) });
      }
    }
  }
  return out;
}

/**
 * Pick the next block.
 * - assessment: maximise expected shrinkage of the credible band (uncertainty sampling), preferring
 *   levels where the user should land mid-range (no floor/ceiling), lightly penalising repeats.
 * - training: weakest-but-practised dimension at the level where the expected composite is closest to
 *   the task's target_success, with a 1-up/1-down staircase from the last block.
 * Returns null when assessment is precise enough everywhere.
 */
export function selectNext(input: SelectorInput): Selection | null {
  const all = candidates(input);
  if (!all.length) return null;
  const recent = input.recent ?? [];
  const last = recent[recent.length - 1];

  if (input.mode === "assessment") {
    const targetSd = input.targetSd ?? 0.08;
    const open = all.filter((c) => input.posteriors[c.dim.id].sd > targetSd);
    if (!open.length) return null;
    const score = (c: Candidate) => c.reduction * (c.dim.id === last ? 0.5 : 1) - 0.001 * Math.abs(c.c - 0.5);
    const best = open.reduce((a, b) => (score(b) > score(a) ? b : a));
    const post = input.posteriors[best.dim.id];
    const after = post.sd - best.reduction;
    // Best candidate per skill, ranked: the record of what else was considered.
    const perSkill = [...new Map([...open].sort((a, b) => score(a) - score(b)).map((c) => [c.dim.id, c])).values()].sort((a, b) => score(b) - score(a));
    const ranking = perSkill.map((c) => ranked(c.dim, input.posteriors[c.dim.id], Math.round(Z90 * c.reduction * 1000) / 10));
    const runner = perSkill.find((c) => c.dim.id !== best.dim.id);
    return {
      dimensionId: best.dim.id,
      taskId: best.task.id,
      level: best.level,
      reason: {
        rule: "max_expected_uncertainty_reduction",
        expectedSdReduction: best.reduction,
        trace: {
          mode: "assessment",
          basis: "max_expected_uncertainty_reduction",
          ranking,
          chosen: best.dim.id,
          runnerUp: runner?.dim.id,
          marginPts: runner ? Math.round(Z90 * (best.reduction - runner.reduction) * 1000) / 10 : undefined,
          adjustments: last === best.dim.id ? ["played just before: its score was halved to avoid repeats"] : [],
          at: new Date().toISOString(),
        },
        note: `We're least sure about your ${inSentence(best.dim.name)} so far (±${toPercent(Z90 * post.sd)}%). ` +
          `One ${best.task.name} game at level ${best.level} should bring that down to about ±${toPercent(Z90 * after)}%.`,
      },
    };
  }

  // Training: focus on the lowest estimate (ties → least recently played), then pick the level.
  const dims = [...new Set(all.map((c) => c.dim))];
  const effective = (d: Dimension) => input.posteriors[d.id].mean + (d.id === last ? 0.1 : 0);
  const byNeed = [...dims].sort((a, b) => effective(a) - effective(b));
  let focus = byNeed[0];
  const adjustments: string[] = [];
  let basis = "lowest_estimate";
  if (last && dims.some((d) => d.id === last) && byNeed[0].id !== last && input.posteriors[last].mean < input.posteriors[byNeed[0].id].mean) {
    adjustments.push("played just before: counted 10 points higher to avoid repeats");
  }

  // Split profile: don't average it away. After a foundation game, the next one stretches the strong side.
  const asym = detectAsymmetry(dims.map((d) => ({ id: d.id, name: d.name, mean: input.posteriors[d.id].mean, sd: input.posteriors[d.id].sd, measured: input.posteriors[d.id].nObservations > 0 })));
  const role = (id: string) => (asym.asymmetric ? asym.roles[id] : "maintain");
  if (asym.asymmetric && last && role(last) === "foundation") {
    const stretch = dims.filter((d) => role(d.id) === "stretch" && d.id !== last).sort((a, b) => input.posteriors[b.id].mean - input.posteriors[a.id].mean)[0];
    if (stretch) {
      focus = stretch;
      basis = "asymmetric_stretch";
      adjustments.push(`split profile (${asym.gapPts}-point gap): alternating foundation and stretch games`);
    }
  }
  const options = all.filter((c) => c.dim.id === focus.id);
  const task = options[0].task;
  const target = task.difficulty.target_success;
  const levels = task.difficulty.levels.map((l) => l.level);

  const lastRun = input.lastRuns?.[task.id];
  let level: number;
  let rule: string;
  let note: string;
  if (lastRun) {
    const i = levels.indexOf(lastRun.level);
    const up = lastRun.accuracy >= target + 0.1;
    const down = lastRun.accuracy <= target - 0.15;
    level = levels[Math.min(levels.length - 1, Math.max(0, i + (up ? 1 : down ? -1 : 0)))];
    rule = "staircase";
    note = up
      ? `You scored ${toPercent(lastRun.accuracy)}% last game, so we're stepping up to level ${level}.`
      : down
        ? `Last game was tough (${toPercent(lastRun.accuracy)}%), so level ${level} lets you find your feet.`
        : `${toPercent(lastRun.accuracy)}% is right in the growth zone (~${toPercent(target)}%), so we stay at level ${level}.`;
  } else {
    const best = options.filter((c) => c.task.id === task.id).reduce((a, b) => (Math.abs(b.c - target) < Math.abs(a.c - target) ? b : a));
    level = best.level;
    rule = "target_success";
    note = `${focus.name} has the most room to grow. Level ${level} should feel challenging but doable (~${toPercent(target)}% success).`;
    const r = role(focus.id);
    if (r !== "maintain") {
      const roleLevel = levelForRole(r, level, levels.filter((l) => options.some((c) => c.task.id === task.id && c.level === l)));
      if (roleLevel !== level) adjustments.push(`${r} skill: level ${level} changed to ${roleLevel}`);
      level = roleLevel;
    }
  }
  if (asym.asymmetric && role(focus.id) !== "maintain") {
    const s = asym.strongest!;
    const w = asym.weakest!;
    rule = `${rule}+asymmetric`;
    note = role(focus.id) === "stretch"
      ? `Split profile: ${s.name} (${s.pct}%) is far ahead of ${inSentence(w.name)} (${w.pct}%). Averaging them would bore one side and overload the other, so this is an advanced ${task.name} game at level ${level}.`
      : `Split profile: ${inSentence(w.name)} (${w.pct}%) sits well below ${inSentence(s.name)} (${s.pct}%), so this is a foundation game at level ${level}, built for the basics.`;
  }
  const chosen = options.find((c) => c.task.id === task.id && c.level === level);
  const ranking = byNeed.map((d) => ranked(d, input.posteriors[d.id], toPercent(effective(d))));
  const runner = byNeed.find((d) => d.id !== focus.id);
  const trace: DecisionTrace = {
    mode: "training",
    basis,
    ranking,
    chosen: focus.id,
    runnerUp: runner?.id,
    marginPts: runner && basis === "lowest_estimate" ? toPercent(effective(runner)) - toPercent(effective(focus)) : undefined,
    adjustments: [...adjustments, ...(lastRun ? [`staircase from your last game (${toPercent(lastRun.accuracy)}% at level ${lastRun.level})`] : [])],
    at: new Date().toISOString(),
  };
  return { dimensionId: focus.id, taskId: task.id, level, reason: { rule, expectedSdReduction: chosen?.reduction ?? 0, note, trace } };
}

function ranked(d: Dimension, p: Posterior, score: number): RankedSkill {
  const lo = Math.max(0, p.mean - Z90 * p.sd);
  const hi = Math.min(1, p.mean + Z90 * p.sd);
  return { skill: d.id, name: d.name, meanPct: toPercent(p.mean), bandPct: [toPercent(lo), toPercent(hi)], blocks: p.nObservations, score };
}
