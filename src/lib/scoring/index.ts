import type { Dimension, DimensionTask } from "../dimensions/schema";
import { computeMetrics } from "./metrics";
import type { BlockScore, ComponentScore, Metrics, TrialRecord } from "./types";
import { assessValidity } from "./validity";

export * from "./types";

/** Composites this close to 0 or 1 mean the level was too hard/easy: the true ability may lie beyond the range. */
export const CENSOR_MARGIN = 0.05;
export const CENSORED_SD_MULTIPLIER = 1.5;

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

export function normaliseMetric(value: number, n: DimensionTask["scoring"]["components"][number]["normalise"]): number {
  // A metric that could not be computed (e.g. no hits → no hit RT) earns nothing.
  if (!Number.isFinite(value)) return 0;
  const x = clamp01((value - n.min) / (n.max - n.min));
  return n.invert ? 1 - x : x;
}

export function compositeScore(metrics: Metrics, task: DimensionTask): { composite: number; components: ComponentScore[] } {
  const components = task.scoring.components.map((c) => {
    const raw = metrics[c.metric] ?? NaN;
    const normalised = normaliseMetric(raw, c.normalise);
    return { metric: c.metric, raw, normalised, weight: c.weight, contribution: c.weight * normalised };
  });
  return { composite: clamp01(components.reduce((s, c) => s + c.contribution, 0)), components };
}

export function levelOf(task: DimensionTask, level: number) {
  const l = task.difficulty.levels.find((x) => x.level === level);
  if (!l) throw new Error(`task ${task.id} has no difficulty level ${level}`);
  return l;
}

/**
 * Turn one block of trials into one profiler observation:
 * metrics → normalised components → weighted composite → mapped into the level's ability range,
 * with noise obs_sd · √(reference_trials / valid_trials), widened for invalid or censored blocks.
 */
export function scoreBlock(dim: Dimension, task: DimensionTask, level: number, trials: TrialRecord[]): BlockScore {
  const metrics = computeMetrics(task.paradigm, trials, task.validity.min_rt_ms);
  const validity = assessValidity(trials, metrics, task.validity);
  const { composite, components } = compositeScore(metrics, task);

  const [lo, hi] = levelOf(task, level).ability_range;
  const rawObservation = lo + (hi - lo) * composite;
  // Calibration layer (per dimension, from config): maps the raw observation onto the ability scale.
  const cal = dim.profile.calibration;
  const observation = Math.min(1, Math.max(0, cal.intercept + cal.slope * rawObservation));

  const u = dim.profile.uncertainty;
  let observationSd = u.obs_sd * Math.sqrt(u.reference_trials / Math.max(validity.validTrials, 1));
  if (!validity.valid) observationSd *= u.invalid_block_sd_multiplier;
  const censored = composite < CENSOR_MARGIN || composite > 1 - CENSOR_MARGIN;
  if (censored) observationSd *= CENSORED_SD_MULTIPLIER;

  return { metrics, validity, components, composite, rawObservation, observation, observationSd, censored };
}
