import { credibleInterval, type Posterior } from "../profiler";

export type GoalKind = "reach_score" | "consistency";

export type GoalProgress = {
  current: number;
  /** 0..1 share of the way from start to target, for the meter. */
  fraction: number;
  /** reach_score only: probability the true level is already at or above the target. */
  probability?: number;
  achieved: boolean;
  label: string;
};

/** Standard normal CDF (Abramowitz–Stegun 7.1.26, |error| < 1.5e-7). */
export function normalCdf(z: number): number {
  const t = 1 / (1 + 0.3275911 * Math.abs(z) / Math.SQRT2);
  const erf = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-(z * z) / 2);
  return z >= 0 ? 0.5 * (1 + erf) : 0.5 * (1 - erf);
}

/**
 * Goal progress that respects uncertainty. A score goal counts as achieved only when the whole
 * 90% band is at or above the target, not merely the point estimate; until then we report how
 * likely it is that the user is already there.
 */
export function goalProgress(
  goal: { kind: GoalKind; targetValue: number },
  ctx: { posterior?: Posterior; startValue?: number; sessionsLast7Days: number },
): GoalProgress {
  if (goal.kind === "consistency") {
    const current = ctx.sessionsLast7Days;
    return {
      current,
      fraction: Math.min(1, current / goal.targetValue),
      achieved: current >= goal.targetValue,
      label: `${current} of ${goal.targetValue} sessions in the last 7 days`,
    };
  }
  const p = ctx.posterior!;
  const [lo] = credibleInterval(p);
  const probability = normalCdf((p.mean - goal.targetValue) / p.sd);
  const start = Math.min(ctx.startValue ?? p.mean, goal.targetValue);
  const span = goal.targetValue - start;
  const fraction = span <= 0 ? 1 : Math.min(1, Math.max(0, (p.mean - start) / span));
  const achieved = lo >= goal.targetValue;
  const pct = (x: number) => Math.round(x * 100);
  return {
    current: p.mean,
    fraction,
    probability,
    achieved,
    label: achieved
      ? `Reached: even the low end of your band (${pct(lo)}%) is above ${pct(goal.targetValue)}%`
      : `Now about ${pct(p.mean)}%. ${pct(probability)}% likely you're already at ${pct(goal.targetValue)}%+`,
  };
}
