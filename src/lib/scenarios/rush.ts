import { updatePosterior, type Posterior } from "../profiler";
import type { TrialRecord } from "../scoring/types";

/**
 * "Button Masher" detection (Layer A). Speed alone is not suspicious: some people are fast AND right.
 * What gives a masher away is the speed–accuracy signature of guessing: answers faster than the task
 * can be read (under twice the task's own anticipation floor) that are mostly wrong.
 *
 * - live: the last few answers, checked after every trial so the game can say "slow down" in the moment;
 * - block: the whole block, which adds the `rushing` validity flag (the block then counts with a much
 *   wider noise term instead of being read as a collapse in ability).
 */
export const RUSH = {
  /** "Too fast to have read it": under this multiple of the task's min_rt_ms. */
  fastFactor: 2,
  /** Live check: look at this many recent scored answers. */
  liveWindow: 6,
  /** Live check: at least this share of the window is too fast... */
  liveFastShare: 0.5,
  /** ...and at least this share of the window is wrong. */
  liveErrorRate: 0.4,
  /** Block check: at least this share of scored answers is too fast or an anticipation... */
  blockFastShare: 0.3,
  /** ...and the fast answers are at least this often wrong (guessing, not skill). */
  blockFastErrorRate: 0.4,
} as const;

export type RushAnswer = { rtMs: number | null; correct: boolean | null; isPractice?: boolean; outcome?: TrialRecord["outcome"] };

export type RushProfile = {
  rushing: boolean;
  /** Scored answers considered. */
  n: number;
  /** Threshold used, in ms. */
  fastMs: number;
  /** Share of scored answers that came in faster than `fastMs` (anticipations included). */
  fastShare: number;
  /** Share of those fast answers that were wrong. */
  fastErrorRate: number;
  /** Median response time of all scored answers, ms (NaN when none). */
  medianRtMs: number;
  /** Overall share of scored answers that were wrong. */
  errorRate: number;
};

const median = (xs: number[]) => {
  if (!xs.length) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

const scoredAnswers = (trials: RushAnswer[]) => trials.filter((t) => !t.isPractice && t.outcome !== "abandoned" && t.rtMs != null);

function profile(trials: RushAnswer[], minRtMs: number, fastShareMin: number, errorMin: number, errorOf: "fast" | "all"): RushProfile {
  const fastMs = RUSH.fastFactor * minRtMs;
  const scored = scoredAnswers(trials);
  const n = scored.length;
  const fast = scored.filter((t) => t.outcome === "anticipation" || t.rtMs! < fastMs);
  const wrong = (ts: RushAnswer[]) => ts.filter((t) => t.correct !== true).length;
  const fastShare = n ? fast.length / n : 0;
  const fastErrorRate = fast.length ? wrong(fast) / fast.length : 0;
  const errorRate = n ? wrong(scored) / n : 0;
  const err = errorOf === "fast" ? fastErrorRate : errorRate;
  return {
    rushing: n > 0 && fastShare >= fastShareMin && err >= errorMin,
    n,
    fastMs,
    fastShare,
    fastErrorRate,
    medianRtMs: median(scored.map((t) => t.rtMs!)),
    errorRate,
  };
}

/** Whole-block verdict (adds the `rushing` validity flag). */
export function rushProfile(trials: RushAnswer[], minRtMs: number): RushProfile {
  return profile(trials, minRtMs, RUSH.blockFastShare, RUSH.blockFastErrorRate, "fast");
}

/** In-the-moment verdict over the last few scored answers (drives the "slow down" nudge during a game). */
export function liveRushCheck(trials: RushAnswer[], minRtMs: number): RushProfile {
  const recent = scoredAnswers(trials).slice(-RUSH.liveWindow);
  if (recent.length < RUSH.liveWindow) return { ...profile([], minRtMs, 1, 1, "all"), n: recent.length };
  return profile(recent, minRtMs, RUSH.liveFastShare, RUSH.liveErrorRate, "all");
}

export type ShieldReceipt = {
  /** Estimate before the block, %. */
  beforePct: number;
  /** Where the estimate would be if the block had been taken at face value, %. */
  naivePct: number;
  /** Where it actually is, with the block counted as uncertain, %. */
  actualPct: number;
  /** How many points of false change the uncertainty flag prevented. */
  avoidedPts: number;
};

/**
 * "Damage avoided" receipt for an unreliable block: the same Kalman update run twice, once with the
 * noise the block would have had if it were trusted, once with the noise it actually got. Both are
 * real computations; nothing is invented for display.
 */
export function shieldReceipt(before: Posterior, observation: number, trustedSd: number, actualSd: number, nTrials: number): ShieldReceipt {
  const naive = updatePosterior(before, observation, trustedSd, nTrials);
  const actual = updatePosterior(before, observation, actualSd, nTrials);
  const pct = (x: number) => Math.round(x * 100);
  return {
    beforePct: pct(before.mean),
    naivePct: pct(naive.mean),
    actualPct: pct(actual.mean),
    avoidedPts: Math.abs(pct(naive.mean) - pct(actual.mean)),
  };
}

/** What the player can say about a flagged block; each answer is stored with the block. */
export const RUSH_CONTEXT = {
  rushing: "I was rushing",
  distracted: "I was distracted",
  testing: "I was testing the app",
  fine: "No, that was a real try",
} as const;
export type RushContext = keyof typeof RUSH_CONTEXT;
