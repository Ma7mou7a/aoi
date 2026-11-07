import { Z90 } from "../profiler";
import { perGameTrend, MIN_GAMES_FOR_PACE } from "../profiler/pace";

/**
 * The Fortune Teller trap (Brain Twin certainty). "What exactly will my score be next month?" has no
 * exact answer, so the coach never gives one:
 * - `detectFortune` spots the question and its horizon;
 * - `forecastFan` gives the 50% and 90% ranges at 1 week, 1 month and 3 months (they widen with time);
 * - `backtest` replays the same forecaster on the user's own past games and counts how often the real
 *   result landed inside the 90% range: the coach's own track record, shown next to the forecast;
 * - `guardCertainty` rewrites any absolute claim in any coach reply (model or template) into
 *   probabilistic language, as a last line of defence.
 */

export const HORIZONS = [7, 30, 90] as const;
/** Assumed pace when the user doesn't give one: about 4 games a week. */
export const DEFAULT_GAMES_PER_WEEK = 4;
/** z for a two-sided 50% interval. */
export const Z50 = 0.6745;

const norm = (s: string) => ` ${s.toLowerCase().replace(/[’']/g, "").replace(/[^a-z0-9%\s]/g, " ").replace(/\s+/g, " ").trim()} `;

/** Is the user asking for a future number? Returns the horizon in days (capped at 90). */
export function detectFortune(text: string): { horizonDays: number; exact: boolean } | null {
  const t = norm(text);
  const future = /\b(will|gonna|going to|predict\w*|forecast|be at|reach|in (a|one|two|three|six|\d+) (days?|weeks?|months?|years?)|next (week|month|year)|by (then|next))\b/.test(t);
  const number = /\b(score|level|percent|%|number|result|be|get|reach)\b/.test(t);
  const askingFuture = /\b(what|how (much|high|good)|which|tell me|predict|guess|give me)\b/.test(t) || /\bwill (i|my)\b/.test(t);
  if (!(future && number && askingFuture)) return null;
  const exact = /\b(exact\w*|precise\w*|for sure|guarantee\w*|definitely|certain\w*|one number|a single number|just a number)\b/.test(t);
  let horizonDays = 30;
  if (/\bnext week\b|\bin (a|one) week\b|\b7 days\b/.test(t)) horizonDays = 7;
  else if (/\bin (\d+) days\b/.test(t)) horizonDays = Math.min(90, Number(t.match(/\bin (\d+) days\b/)![1]) <= 10 ? 7 : Number(t.match(/\bin (\d+) days\b/)![1]) <= 20 ? 14 : Number(t.match(/\bin (\d+) days\b/)![1]) <= 45 ? 30 : 90);
  else if (/\bin (two|2) weeks\b/.test(t)) horizonDays = 14;
  else if (/\b(three|3|six|6) months\b|\bnext year\b|\bin (a|one) year\b|\b(\d+) years?\b/.test(t)) horizonDays = 90;
  else if (/\bnext month\b|\bin (a|one) month\b|\b30 days\b/.test(t)) horizonDays = 30;
  return { horizonDays, exact };
}

export type FanPoint = { days: number; midPct: number; low50: number; high50: number; low90: number; high90: number };

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const pct = (x: number) => Math.round(clamp01(x) * 100);

/**
 * Ranges at several horizons from the skill's own per-game trend (shrunk toward "no change"), at a
 * pace of `gamesPerWeek`. Uncertainty = today's band + trend uncertainty × games + drift × days.
 * Day 0 is today's estimate, so the chart starts from what we know.
 */
export function forecastFan(
  history: Array<{ mean: number; sd: number }>,
  current: { mean: number; sd: number },
  driftSdPerDay: number,
  gamesPerWeek = DEFAULT_GAMES_PER_WEEK,
  horizons: readonly number[] = HORIZONS,
): FanPoint[] | null {
  if (history.length < MIN_GAMES_FOR_PACE) return null;
  const { slope, slopeSe } = perGameTrend(history);
  const point = (days: number): FanPoint => {
    const games = (gamesPerWeek * days) / 7;
    const mid = clamp01(current.mean + slope * games);
    const sd = Math.sqrt(current.sd ** 2 + (games * slopeSe) ** 2 + driftSdPerDay ** 2 * days);
    return { days, midPct: pct(mid), low50: pct(mid - Z50 * sd), high50: pct(mid + Z50 * sd), low90: pct(mid - Z90 * sd), high90: pct(mid + Z90 * sd) };
  };
  return [0, ...horizons].map(point);
}

export type TrackRecord = { hits: number; total: number; ratePct: number };

/**
 * Walk forward through the user's history: at each past game (from the 3rd on), forecast the next
 * game's estimate with only what was known then, and check whether the next estimate fell inside the
 * 90% range. A 90% range should catch about 9 in 10; far fewer would mean we are overconfident.
 */
export function backtest(history: Array<{ mean: number; sd: number }>, driftSdPerDay: number, gamesPerWeek = DEFAULT_GAMES_PER_WEEK): TrackRecord | null {
  let hits = 0;
  let total = 0;
  const daysPerGame = 7 / gamesPerWeek;
  for (let i = MIN_GAMES_FOR_PACE - 1; i < history.length - 1; i++) {
    const past = history.slice(0, i + 1);
    const { slope, slopeSe } = perGameTrend(past);
    const now = history[i];
    const mid = now.mean + slope;
    const sd = Math.sqrt(now.sd ** 2 + slopeSe ** 2 + driftSdPerDay ** 2 * daysPerGame);
    const actual = history[i + 1].mean;
    total++;
    if (actual >= mid - Z90 * sd && actual <= mid + Z90 * sd) hits++;
  }
  return total ? { hits, total, ratePct: Math.round((hits / total) * 100) } : null;
}

/** Absolute claims about the future → probabilistic language. Applied to every coach reply. */
const CERTAINTY_RULES: Array<[RegExp, string]> = [
  [/\b(?:will|is going to) be exactly\b/gi, "could be around"],
  [/\bexactly (\d+(?:\.\d+)?)\s?%/gi, "about $1%"],
  [/\bi(?:'m| am) (?:100% |completely |totally |absolutely )?(?:sure|certain) (?:that )?you(?:'ll| will)\b/gi, "I expect you could"],
  [/\b(?:100%|completely|totally|absolutely) (?:sure|certain)\b/gi, "fairly confident"],
  [/\byou(?:'| a)?ll (?:definitely |certainly |surely )?(reach|hit|get to|score|be at)\b/gi, "you could $1"],
  [/\byou will (?:definitely |certainly |surely )?(reach|hit|get to|score|be at)\b/gi, "you could $1"],
  [/\b(?:your score|it) will (?:definitely |certainly |surely )?be (\d+)/gi, "your score could be around $1"],
  [/\b(?:guaranteed?|guarantees)\b/gi, "likely"],
  [/\b(?:definitely|certainly|without a doubt|for sure)\b\s?/gi, ""],
];

export function guardCertainty(text: string): { text: string; rewrites: number } {
  let rewrites = 0;
  let out = text;
  for (const [re, by] of CERTAINTY_RULES) {
    out = out.replace(re, (...m) => {
      rewrites++;
      return by.replace(/\$(\d)/g, (_, k: string) => String(m[Number(k)] ?? ""));
    });
  }
  out = out.replace(/\s{2,}/g, " ").replace(/\s+([.,!?])/g, "$1").replace(/(^|[.!?]\s+)([a-z])/g, (_, p: string, c: string) => p + c.toUpperCase());
  return { text: out, rewrites };
}
