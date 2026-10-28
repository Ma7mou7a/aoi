import { expectedPosteriorSd, Z90 } from "./profiler";
import type { PaceForecast } from "./profiler/pace";
import { MIN_POINTS, MIN_SPAN_DAYS } from "./profiler/projection";

/**
 * Plain-words progress and forecast messages for the dashboard. Every statement respects the
 * uncertainty: a change or a trend is only called real when it is clearly bigger than the noise.
 */

const pct = (x: number) => Math.round(x * 100);
/** A range wider than this (in points) is explained, with how many games would narrow it. */
const WIDE = 30;
const MAX_SUGGESTED_GAMES = 10;

export type Trend = { label: "Growing" | "Steady" | "Dipping"; note: string };

/** Growing or dipping only when the weekly trend is clearly (90%) away from zero; otherwise steady. */
export function trendLabel(slopePerWeek: number, slopeSePerWeek: number): Trend {
  if (slopePerWeek - Z90 * slopeSePerWeek > 0) return { label: "Growing", note: "Your recent games point upward." };
  if (slopePerWeek + Z90 * slopeSePerWeek < 0) return { label: "Dipping", note: "Often tiredness or a harder level. A rested game usually tells you more." };
  return { label: "Steady", note: "No clear change yet: the ups and downs are within the noise." };
}

/** Change since the first measured game, reported only when bigger than both measurements' noise. */
export function changeText(
  first: { mean: number; sd: number } | null,
  now: { mean: number; sd: number },
  opts: { games?: number; trend?: Trend["label"] } = {},
): string | null {
  if (!first || (opts.games !== undefined && opts.games < 2)) return null;
  const diff = pct(now.mean) - pct(first.mean);
  const noise = Z90 * Math.sqrt(first.sd ** 2 + now.sd ** 2) * 100;
  if (diff === 0 || Math.abs(diff) <= noise) {
    // Don't contradict a clear trend: the first game's own range was simply wide.
    if (opts.trend === "Growing") return "Trending up, though still within the range of your first game";
    if (opts.trend === "Dipping") return "Trending down, though still within the range of your first game";
    return "About the same as your first game (within the range)";
  }
  return `${diff > 0 ? "+" : "−"}${Math.abs(diff)} since your first game`;
}

/** Next week's range; when it is wide, say why and how many games would bring it under WIDE points. */
export function forecastText(p: { ciLow: number; ciHigh: number }, games: number, sdNow: number, obsSd: number): string {
  const lo = pct(p.ciLow);
  const hi = pct(p.ciHigh);
  const base = `Next week: likely ${lo}–${hi}.`;
  if (hi - lo <= WIDE) return base;
  // The range mixes today's uncertainty (games narrow it) with the trend's uncertainty and drift (only time narrows those).
  const total = (hi - lo) / 200 / Z90;
  const other = Math.sqrt(Math.max(0, total ** 2 - sdNow ** 2));
  const width = (sd: number) => 2 * Z90 * Math.sqrt(sd ** 2 + other ** 2) * 100;
  let sd = sdNow;
  let more = 0;
  while (width(sd) > WIDE && more < MAX_SUGGESTED_GAMES) {
    sd = expectedPosteriorSd(sd, obsSd);
    more++;
  }
  if (more === 0 || 2 * Z90 * other * 100 > WIDE * 0.9) return `${base} That's wide because your trend is still uncertain; playing on a few more days will narrow it.`;
  return `${base} That's wide because we've seen only ${games} games; ${more} more would narrow it to about ±${Math.round(width(sd) / 2)}.`;
}

/** What is missing before a forecast can be shown (MIN_POINTS measured games over MIN_SPAN_DAYS days). */
export function unlockText(measuredGames: number, spanDays: number): string {
  const games = Math.max(0, MIN_POINTS - measuredGames);
  const needDay = spanDays < MIN_SPAN_DAYS;
  if (games === 0) return "Play again on another day to unlock a forecast.";
  return `Play ${games} more ${games === 1 ? "game" : "games"}${needDay ? ", on another day," : ""} to unlock a forecast.`;
}

/** The twin's track record in one plain sentence (null when nothing has been checked yet). */
export function trackText(hits: number, total: number): string | null {
  if (!total) return null;
  const tail = " Every forecast is checked against what really happened.";
  if (total === 1) return `Bao's last forecast ${hits ? "was right" : "missed"}.${tail}`;
  return `Bao's last ${total} forecasts were right ${hits} ${hits === 1 ? "time" : "times"}.${tail}`;
}

const PACE_WORDS: Record<number, string> = { 2: "twice a week", 4: "four times a week", 7: "every day" };

/** The coach's per-game forecast, in the same words on the dashboard. */
export function paceText(f: PaceForecast): string {
  return `If you play ${PACE_WORDS[f.gamesPerWeek]}: about ${f.toPct} (likely ${f.lowPct}–${f.highPct}).`;
}
