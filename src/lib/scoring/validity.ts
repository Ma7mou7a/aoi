import type { DimensionTask } from "../dimensions/schema";
import type { Metrics, TrialRecord, Validity, ValidityFlag } from "./types";

/** Longest run of identical responses (no response counts as its own value). */
export function longestStreak(trials: TrialRecord[]): number {
  let best = 0;
  let run = 0;
  let prev: string | undefined;
  for (const t of trials) {
    const key = JSON.stringify(t.response ?? null);
    run = key === prev ? run + 1 : 1;
    prev = key;
    best = Math.max(best, run);
  }
  return best;
}

/**
 * Data-quality checks that decide how much a block can be trusted.
 * Invalid blocks are still stored and still update the profile, but with a much wider noise term.
 */
export function assessValidity(trials: TrialRecord[], metrics: Metrics, rules: DimensionTask["validity"]): Validity {
  const scored = trials.filter((t) => !t.isPractice && t.outcome !== "abandoned");
  const n = scored.length || 1;
  const anticipations = scored.filter((t) => t.outcome === "anticipation" || (t.rtMs != null && t.rtMs < rules.min_rt_ms));
  const timeouts = scored.filter((t) => t.outcome === "timeout" || (t.rtMs != null && t.rtMs > rules.max_rt_ms));
  const validTrials = scored.length - anticipations.length - timeouts.length;

  const flags: ValidityFlag[] = [];
  if (validTrials < rules.min_valid_trials) flags.push("too_few_trials");

  // Accuracy must beat chance by a one-sided 95% binomial margin to count as engaged.
  const acc = metrics.accuracy;
  const p = rules.chance_accuracy;
  if (p > 0 && Number.isFinite(acc) && acc <= p + 1.645 * Math.sqrt((p * (1 - p)) / n)) flags.push("near_chance");

  if (longestStreak(scored) > rules.max_same_response_streak) flags.push("response_streak");
  if (anticipations.length / n > 0.2) flags.push("many_anticipations");
  if (timeouts.length / n > 0.3) flags.push("many_timeouts");
  if (scored.filter((t) => t.behaviour?.focusLost).length > 2) flags.push("focus_lost");

  return { valid: flags.length === 0, validTrials: Math.max(validTrials, 0), flags };
}
