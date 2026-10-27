import type { Dimension, DimensionTask, Paradigm } from "../dimensions/schema";
import { CENSORED_SD_MULTIPLIER, CENSOR_MARGIN } from "../scoring";
import { expectedPosteriorSd, toPercent, Z90, type Posterior } from "../profiler";
import { inSentence } from "../text";

export type SelectionMode = "assessment" | "training";

export type Selection = {
  dimensionId: string;
  taskId: string;
  level: number;
  reason: { rule: string; expectedSdReduction: number; note: string };
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
    return {
      dimensionId: best.dim.id,
      taskId: best.task.id,
      level: best.level,
      reason: {
        rule: "max_expected_uncertainty_reduction",
        expectedSdReduction: best.reduction,
        note: `Your ${inSentence(best.dim.name)} estimate is still ±${toPercent(Z90 * post.sd)}% wide, the most we can narrow right now. ` +
          `One ${best.task.name} block at level ${best.level} should narrow it to about ±${toPercent(Z90 * after)}%.`,
      },
    };
  }

  // Training: focus on the lowest estimate (ties → least recently played), then pick the level.
  const dims = [...new Set(all.map((c) => c.dim))];
  const effective = (d: Dimension) => input.posteriors[d.id].mean + (d.id === last ? 0.1 : 0);
  const focus = dims.reduce((a, b) => (effective(b) < effective(a) ? b : a));
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
      ? `You scored ${toPercent(lastRun.accuracy)}% last block, so we're stepping up to level ${level}.`
      : down
        ? `Last block was tough (${toPercent(lastRun.accuracy)}%), so level ${level} lets you consolidate.`
        : `${toPercent(lastRun.accuracy)}% is right in the growth zone (~${toPercent(target)}%), so we stay at level ${level}.`;
  } else {
    const best = options.filter((c) => c.task.id === task.id).reduce((a, b) => (Math.abs(b.c - target) < Math.abs(a.c - target) ? b : a));
    level = best.level;
    rule = "target_success";
    note = `${focus.name} has the most room to grow. Level ${level} should feel challenging but doable (~${toPercent(target)}% success).`;
  }
  const chosen = options.find((c) => c.task.id === task.id && c.level === level)!;
  return { dimensionId: focus.id, taskId: task.id, level, reason: { rule, expectedSdReduction: chosen.reduction, note } };
}
