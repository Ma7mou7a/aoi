import { Z90 } from ".";
import { MAX_SLOPE_PER_DAY, SLOPE_PRIOR_SD } from "./projection";
import type { Pace } from "../coach/intent";

export type PaceForecast = { gamesPerWeek: Pace; fromPct: number; toPct: number; lowPct: number; highPct: number; perGamePct: number };

export const MIN_GAMES_FOR_PACE = 3;
const HORIZON_DAYS = 7;

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const pct = (x: number) => Math.round(clamp01(x) * 100);

/**
 * "If you keep playing N games a week": the skill's own trend per game (x = block index, not days),
 * fitted like `projectGrowth` (weights 1/sd², slope shrunk toward no change, gain per game capped at
 * one day's cap), projected over one week of N games. The band combines today's uncertainty, the
 * slope's uncertainty times N and a week of drift. Null until there are MIN_GAMES_FOR_PACE games.
 */
export function forecastAtPace(
  history: Array<{ mean: number; sd: number }>,
  current: { mean: number; sd: number },
  gamesPerWeek: Pace,
  driftSdPerDay: number,
): PaceForecast | null {
  if (history.length < MIN_GAMES_FOR_PACE) return null;
  const xs = history.map((_, i) => i);
  const ws = history.map((h) => 1 / h.sd ** 2);
  const sw = ws.reduce((a, b) => a + b, 0);
  const mx = xs.reduce((s, x, i) => s + ws[i] * x, 0) / sw;
  const my = history.reduce((s, h, i) => s + ws[i] * h.mean, 0) / sw;
  const sxx = xs.reduce((s, x, i) => s + ws[i] * (x - mx) ** 2, 0);
  const sxy = xs.reduce((s, x, i) => s + ws[i] * (x - mx) * (history[i].mean - my), 0);
  const rawSlope = sxx > 0 ? sxy / sxx : 0;

  const n = history.length;
  const resid = history.reduce((s, h, i) => s + ws[i] * (h.mean - (my + rawSlope * (xs[i] - mx))) ** 2, 0) / Math.max(1, n - 2);
  const se = sxx > 0 ? Math.sqrt(resid / sxx) : Infinity;
  // One game ≈ one day of practice: reuse the per-day prior and cap as per-game values.
  const shrink = Number.isFinite(se) ? SLOPE_PRIOR_SD ** 2 / (SLOPE_PRIOR_SD ** 2 + se ** 2) : 0;
  const slope = Math.max(-MAX_SLOPE_PER_DAY, Math.min(MAX_SLOPE_PER_DAY, rawSlope * shrink));
  const slopeSe = Number.isFinite(se) ? Math.sqrt(shrink) * se : SLOPE_PRIOR_SD;

  const g = gamesPerWeek;
  const to = clamp01(current.mean + slope * g);
  const sd = Math.sqrt(current.sd ** 2 + (g * slopeSe) ** 2 + driftSdPerDay ** 2 * HORIZON_DAYS);
  return { gamesPerWeek, fromPct: pct(current.mean), toPct: pct(to), lowPct: pct(to - Z90 * sd), highPct: pct(to + Z90 * sd), perGamePct: Math.round(slope * 1000) / 10 };
}
