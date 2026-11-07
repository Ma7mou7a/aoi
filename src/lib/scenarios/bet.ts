import type { Posterior } from "../profiler";

/**
 * Bao's bet: before a game starts, the Brain Twin publishes the range it expects the *game score* to
 * land in. After the game the bet is settled in front of the player, and every settled bet feeds a
 * running track record. Calibration shown live, not claimed.
 *
 * The predictive distribution of the next observation is Normal(mean, sd² + obs_sd²): what we don't know
 * about the player plus the noise of one game. Observation → game score is the level's linear map
 * (obs = lo + (hi − lo) · score), so the bounds map back one-to-one.
 */

export const Z50 = 0.6745;
export const Z90 = 1.6449;

export type Bet = {
  /** Game-score bounds (0..1) at 50% and 90%, and the middle. */
  mid: number;
  low50: number;
  high50: number;
  low90: number;
  high90: number;
  /** ISO time the bet was sealed (before the game). */
  at: string;
};

export type BetOutcome = "inside50" | "inside90" | "outside";

export type BetRecord = { hits90: number; hits50: number; total: number };

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const r2 = (x: number) => Math.round(x * 100) / 100;

/** The bet for one game at a level with ability range [lo, hi] and one-game noise `obsSd`. */
export function placeBet(p: Pick<Posterior, "mean" | "sd">, abilityRange: [number, number], obsSd: number, calibration = { intercept: 0, slope: 1 }, now = new Date()): Bet {
  const [lo, hi] = abilityRange;
  const sd = Math.sqrt(p.sd ** 2 + obsSd ** 2);
  // ability-scale value → raw observation (undo calibration) → game score on this level
  const toScore = (ability: number) => clamp01(((ability - calibration.intercept) / calibration.slope - lo) / (hi - lo));
  return {
    mid: r2(toScore(p.mean)),
    low50: r2(toScore(p.mean - Z50 * sd)),
    high50: r2(toScore(p.mean + Z50 * sd)),
    low90: r2(toScore(p.mean - Z90 * sd)),
    high90: r2(toScore(p.mean + Z90 * sd)),
    at: now.toISOString(),
  };
}

/** Where the actual game score landed relative to the sealed bet (bounds inclusive, at whole percent). */
export function settleBet(bet: Bet, composite: number): BetOutcome {
  const pct = Math.round(composite * 100);
  const inside = (a: number, b: number) => pct >= Math.round(a * 100) && pct <= Math.round(b * 100);
  if (inside(bet.low50, bet.high50)) return "inside50";
  if (inside(bet.low90, bet.high90)) return "inside90";
  return "outside";
}

/** Track record over settled bets (unreliable games excluded: a masher's game says nothing about the forecaster). */
export function betRecord(settled: Array<{ bet: Bet; composite: number }>): BetRecord {
  let hits90 = 0;
  let hits50 = 0;
  for (const s of settled) {
    const o = settleBet(s.bet, s.composite);
    if (o !== "outside") hits90++;
    if (o === "inside50") hits50++;
  }
  return { hits90, hits50, total: settled.length };
}

/** One honest sentence about a settled bet, for the result card. */
export function betVerdict(outcome: BetOutcome): string {
  if (outcome === "inside50") return "Inside my likely range: the Twin read you well.";
  if (outcome === "inside90") return "Outside my likely range but inside the wide one: a normal surprise, about 4 games in 10 land here.";
  return "Outside both ranges: I got this one wrong. That happens about 1 game in 10, and it's why the ranges exist.";
}
