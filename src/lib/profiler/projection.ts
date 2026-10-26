import { Z90 } from ".";

export type SnapshotPoint = { at: Date; mean: number; sd: number };

export type Projection = {
  horizonDays: number;
  mean: number;
  ciLow: number;
  ciHigh: number;
  /** Estimated change per week (ability scale), for the explanation. */
  slopePerWeek: number;
};

export const MIN_POINTS = 3;
export const MIN_SPAN_DAYS = 2;
/** Practice gains are bounded: never extrapolate faster than this (ability scale per day). */
export const MAX_SLOPE_PER_DAY = 0.01;

const DAY = 86_400_000;
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

/**
 * Growth forecast from the twin's own history: weighted linear trend of the estimate over time
 * (weights 1/sd², so precise estimates count more), anchored at the current estimate. The band
 * combines today's uncertainty, the uncertainty of the trend, and day-to-day drift, so it widens
 * with the horizon. Returns null until there are ≥ 3 measured points over ≥ 2 days.
 */
export function projectGrowth(
  history: SnapshotPoint[],
  current: { mean: number; sd: number },
  horizonDays: number,
  driftSdPerDay: number,
  now = new Date(),
): Projection | null {
  if (history.length < MIN_POINTS) return null;
  const t0 = history[0].at.getTime();
  const span = (history.at(-1)!.at.getTime() - t0) / DAY;
  if (span < MIN_SPAN_DAYS) return null;

  const xs = history.map((h) => (h.at.getTime() - t0) / DAY);
  const ws = history.map((h) => 1 / h.sd ** 2);
  const sw = ws.reduce((a, b) => a + b, 0);
  const mx = xs.reduce((s, x, i) => s + ws[i] * x, 0) / sw;
  const my = history.reduce((s, h, i) => s + ws[i] * h.mean, 0) / sw;
  const sxx = xs.reduce((s, x, i) => s + ws[i] * (x - mx) ** 2, 0);
  const sxy = xs.reduce((s, x, i) => s + ws[i] * (x - mx) * (history[i].mean - my), 0);
  const rawSlope = sxx > 0 ? sxy / sxx : 0;
  const slope = Math.max(-MAX_SLOPE_PER_DAY, Math.min(MAX_SLOPE_PER_DAY, rawSlope));

  // Residual variance → standard error of the slope.
  const n = history.length;
  const resid = history.reduce((s, h, i) => s + ws[i] * (h.mean - (my + rawSlope * (xs[i] - mx))) ** 2, 0) / Math.max(1, n - 2);
  const slopeSe = sxx > 0 ? Math.sqrt(resid / sxx) : MAX_SLOPE_PER_DAY;

  const h = horizonDays;
  const mean = clamp01(current.mean + slope * h);
  const sd = Math.sqrt(current.sd ** 2 + (h * slopeSe) ** 2 + driftSdPerDay ** 2 * h);
  void now;
  return { horizonDays: h, mean, ciLow: clamp01(mean - Z90 * sd), ciHigh: clamp01(mean + Z90 * sd), slopePerWeek: slope * 7 };
}

/** Did a past forecast come true? (the actual estimate at the target date fell inside its band) */
export function checkForecast(forecast: { ciLow: number; ciHigh: number }, actualMean: number): boolean {
  return actualMean >= forecast.ciLow && actualMean <= forecast.ciHigh;
}
