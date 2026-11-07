import { updatePosterior, type Posterior } from "../profiler";

/**
 * The pushback scenario (AI Collaboration). When the user says a result was not representative
 * ("I was distracted"), the coach does not defend its profile: it re-weighs that block as uncertain,
 * shows the before/after, and credits the pushback in the collaboration score. It also checks the
 * claim against what it recorded (looked away, window lost focus, rushed answers): supported claims
 * widen the block more, unsupported ones still widen it (the user was there, the app wasn't), and a
 * habit of disputing every result is named honestly instead of rewarded forever.
 */

export type DisputeReason = "distraction" | "interruption" | "noise" | "tired" | "device" | "unfair";

const PATTERNS: Array<[DisputeReason, RegExp]> = [
  ["interruption", /\b(interrupt\w*|phone (rang|call)|someone (came|walked|called)|door ?bell|had to (leave|stop|answer)|got called)\b/],
  ["noise", /\b(nois\w*|loud|music|construction|barking|shouting|(people|someone|they) (kept |were |was )?(talking|chatting|yelling))\b/],
  ["tired", /\b(tired|exhausted|sleepy|no sleep|didn ?t sleep|late at night|headache)\b/],
  ["device", /\b(lag\w*|laggy|freez\w*|glitch\w*|bug\w*|keyboard|mouse|touchpad|screen (was|froze)|internet|wifi|slow (phone|laptop|computer))\b/],
  ["distraction", /\b(a lot going on( around me)?|so much going on|busy around me|chaos around me|distract\w*|not focus\w*|wasn ?t focus\w*|couldn ?t focus|lost focus|wasn ?t paying attention|not paying attention|mind (was )?wander\w*|multitask\w*|on my phone|kids?|baby|tv)\b/],
  ["unfair", /\b(not fair|unfair|that ?s wrong|you ?re wrong|wrong score|not accurate|inaccurate|disagree|doesn ?t reflect|not (really )?me|not my (real )?level|bad day|off day|fluke|not representative|doesn ?t count|shouldn ?t count)\b/],
];

const norm = (s: string) => ` ${s.toLowerCase().replace(/[’']/g, " ").replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim()} `;

/** Is this message pushing back on a result, and why? Needs a result word or a clear reason. */
export function detectDispute(text: string): { reason: DisputeReason } | null {
  const t = norm(text);
  const hit = PATTERNS.find(([, re]) => re.test(t));
  if (!hit) return null;
  // "How do I avoid distractions?" is a question about focus, not a dispute about a result.
  const aboutResult = /\b(score|result|game|block|round|that|it|this|last|today|test|session|was|were|i was|i m|im)\b/.test(t);
  const isHowTo = /^\s*(how|what|can|should|tips?)\b/.test(t) && !/\b(was|were|i was)\b/.test(t);
  if (!aboutResult || isHowTo) return null;
  return { reason: hit[0] };
}

export const REASON_WORDS: Record<DisputeReason, string> = {
  distraction: "you were distracted",
  interruption: "you were interrupted",
  noise: "it was noisy",
  tired: "you were tired",
  device: "the device got in the way",
  unfair: "it doesn't reflect your real level",
};

/** What the app itself recorded during the block, used to check the claim. */
export type BlockSignals = {
  lookedAway: number;
  focusLost: number;
  flags: string[];
  fatigueHigh?: boolean;
  /** Scored trials in the block. */
  n: number;
};

export type Verification = { supported: boolean; notes: string[] };

export function verifyDispute(reason: DisputeReason, s: BlockSignals): Verification {
  const notes: string[] = [];
  if (s.lookedAway > 0) notes.push(`the camera saw you look away during ${s.lookedAway} of ${s.n} rounds`);
  if (s.focusLost > 0) notes.push(`the game window lost focus ${s.focusLost} time${s.focusLost > 1 ? "s" : ""}`);
  if (s.flags.includes("rushing")) notes.push("many answers came in faster than the words could be read");
  if (s.flags.includes("many_timeouts")) notes.push("many rounds ran out of time");
  if (s.flags.includes("many_anticipations")) notes.push("many presses came before the stimulus");
  if (reason === "tired" && s.fatigueHigh) notes.push("your answers slowed down towards the end, a typical sign of fatigue");
  return { supported: notes.length > 0, notes };
}

export const DISPUTE = {
  /** Noise multiplier for a block the user contests and the data supports. */
  supportedMultiplier: 3,
  /** ...and for one the data neither supports nor rules out. */
  unsupportedMultiplier: 2,
  /** More disputes than this in the last 7 days: still re-weighed, but the coach names the pattern. */
  habitThreshold: 3,
} as const;

export type ReplayRun = { id: string; observation: number; observationSd: number; nTrials: number; at: Date };

/**
 * Re-run the Brain Twin's Kalman filter over a skill's blocks, with some blocks' noise multiplied.
 * Drift between blocks is applied as in the live filter. Used twice (with and without the change) so
 * the before/after difference is exact and independent of rounding in stored snapshots.
 */
export function replay(
  prior: Pick<Posterior, "mean" | "sd">,
  runs: ReplayRun[],
  driftSdPerDay: number,
  priorSd: number,
  multipliers: Record<string, number> = {},
): Posterior {
  let p: Posterior = { mean: prior.mean, sd: prior.sd, nObservations: 0, nTrials: 0, updatedAt: (runs[0]?.at ?? new Date(0)).toISOString() };
  for (const r of [...runs].sort((a, b) => a.at.getTime() - b.at.getTime())) {
    const days = Math.max(0, (r.at.getTime() - new Date(p.updatedAt).getTime()) / 86_400_000);
    const sd = Math.min(priorSd, Math.sqrt(p.sd ** 2 + driftSdPerDay ** 2 * days));
    p = { ...p, sd: Math.max(sd, p.sd) };
    p = updatePosterior(p, r.observation, r.observationSd * (multipliers[r.id] ?? 1), r.nTrials, r.at);
  }
  return p;
}

/**
 * Apply a dispute to the current state: the change the re-weighing makes in the replayed history is
 * carried onto today's estimate (so drift since the last block is kept as is).
 */
export function reweigh(
  current: Pick<Posterior, "mean" | "sd">,
  prior: Pick<Posterior, "mean" | "sd">,
  runs: ReplayRun[],
  driftSdPerDay: number,
  multipliers: Record<string, number>,
): { mean: number; sd: number; deltaPts: number; bandBeforePts: number; bandAfterPts: number } {
  const without = replay(prior, runs, driftSdPerDay, prior.sd, {});
  const withIt = replay(prior, runs, driftSdPerDay, prior.sd, multipliers);
  const mean = Math.min(1, Math.max(0, current.mean + (withIt.mean - without.mean)));
  const sd = Math.min(prior.sd, current.sd * (withIt.sd / without.sd));
  const z = 1.6449;
  return {
    mean,
    sd,
    deltaPts: Math.round(mean * 100) - Math.round(current.mean * 100),
    bandBeforePts: Math.round(2 * z * current.sd * 100),
    bandAfterPts: Math.round(2 * z * sd * 100),
  };
}
