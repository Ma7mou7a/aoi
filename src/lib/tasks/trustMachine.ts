import { createRng, type Rng } from "../rng";
import type { TrialRecord } from "../scoring/types";

/**
 * "Second opinion": a two-stage judge–advisor task that measures appropriate reliance on AI advice.
 *
 * Each trial: (1) decide which of two sums is larger, under time pressure (initial answer);
 * (2) an AI helper gives its answer; (3) give a final answer. Reliance is only measurable when the helper
 * DISAGREES with the initial answer (Schemmer et al., IUI 2023):
 *   - initial right, helper wrong → keeping your answer is correct      (relative self-reliance, RSR)
 *   - initial wrong, helper right → switching to the helper is correct  (relative AI reliance, RAIR)
 * Conditioning on the initial answer separates trusting well from simply being good at the sums.
 *
 * The helper's correctness is drawn per trial after the initial answer (ai_wrong_when_right /
 * ai_right_when_wrong), so both kinds of disagreement occur in every block and neither "always follow"
 * nor "always keep my answer" can score well. The instructions say plainly that the helper is
 * sometimes wrong on purpose.
 *
 * Confident-helper level (show_confidence): the helper also says whether it is "very sure" or "not sure",
 * and that confidence is honest (calibrated): it is "very sure" far more often when it is right. Using it
 * well is calibrated trust (Lee & See 2004): follow a confident helper, double-check an unsure one.
 */

export type Side = "left" | "right";

export type TrustParams = {
  trials_per_block: number;
  practice_trials: number;
  /** Deadline for the initial answer: tight enough that checking every sum fully isn't possible. */
  max_response_ms: number;
  /** Deadline for the final answer after the advice appears; on timeout the initial answer stands. */
  final_response_ms: number;
  /** Two-digit numbers per side. */
  terms: number;
  /** Relative gap between the two totals, drawn uniformly in [min_gap, max_gap]. Smaller = harder. */
  min_gap: number;
  max_gap: number;
  ai_wrong_when_right: number;
  ai_right_when_wrong: number;
  /** Confident-helper level: the helper states its confidence. */
  show_confidence?: boolean;
  /** P(helper says "very sure" | it is right) and P(... | it is wrong). Defaults 0.8 / 0.3. */
  conf_high_when_right?: number;
  conf_high_when_wrong?: number;
};

export type TrustItem = { practice: boolean; left: number[]; right: number[]; answer: Side; gap: number };

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

/** `terms` two-digit numbers (10–89) that add up to `total` (total must be reachable). */
function partition(total: number, terms: number, rng: Rng): number[] {
  const out: number[] = [];
  let left = total;
  for (let i = terms; i > 1; i--) {
    const lo = Math.max(10, left - 89 * (i - 1));
    const hi = Math.min(89, left - 10 * (i - 1));
    const x = lo + rng.int(hi - lo + 1);
    out.push(x);
    left -= x;
  }
  out.push(left);
  return rng.shuffle(out);
}

export function generateTrustMachine(p: TrustParams, seed: number): TrustItem[] {
  const rng = createRng(seed);
  const n = p.practice_trials + p.trials_per_block;
  return Array.from({ length: n }, (_, i) => {
    const a = Array.from({ length: p.terms }, () => 10 + rng.int(80));
    const totalA = sum(a);
    const gap = p.min_gap + (p.max_gap - p.min_gap) * rng.next();
    const up = rng.next() < 0.5;
    const lo = 10 * p.terms;
    const hi = 89 * p.terms;
    let totalB = Math.round(totalA * (up ? 1 + gap : 1 - gap));
    if (totalB === totalA) totalB += up ? 1 : -1;
    totalB = Math.min(hi, Math.max(lo, totalB));
    if (totalB === totalA) totalB = totalA + (totalA < hi ? 1 : -1);
    const b = partition(totalB, p.terms, rng);
    const aLeft = rng.next() < 0.5;
    const left = aLeft ? a : b;
    const right = aLeft ? b : a;
    return { practice: i < p.practice_trials, left, right, answer: sum(left) > sum(right) ? "left" : "right", gap: Math.abs(totalB - totalA) / totalA };
  });
}

/** The helper's advice for one trial, given the initial answer (null = no initial answer in time). Deterministic per seed. */
export function adviceFor(item: TrustItem, initial: Side | null, p: TrustParams, seed: number): { advice: Side; aiCorrect: boolean; confident: boolean } {
  const rng = createRng(seed);
  const pRight = initial == null ? (p.ai_right_when_wrong + 1 - p.ai_wrong_when_right) / 2 : initial === item.answer ? 1 - p.ai_wrong_when_right : p.ai_right_when_wrong;
  const aiCorrect = rng.next() < pRight;
  // Second draw, so the helper's answers are the same with or without the confidence display.
  const confident = rng.next() < (aiCorrect ? p.conf_high_when_right ?? 0.8 : p.conf_high_when_wrong ?? 0.3);
  const other: Side = item.answer === "left" ? "right" : "left";
  return { advice: aiCorrect ? item.answer : other, aiCorrect, confident };
}

/** Per-trial seed for the advice, shared by the renderer and the simulator (replayable blocks). */
export const adviceSeed = (blockSeed: number, trialIndex: number) => (blockSeed * 1009 + trialIndex * 7919) >>> 0;

export type TrustStrategy = "calibrated" | "always_follow" | "always_keep" | "confidence_only";

/**
 * Synthetic player. `reliance` (the dimension's ability) is how well they tell good advice from bad when
 * the helper disagrees; `arithmetic` (independent) is how often their initial answer is right.
 * Rechecking a disagreement uses some arithmetic too, so reliance is not fully independent of it.
 */
export function simulateTrustMachine(
  items: TrustItem[],
  p: TrustParams,
  reliance: number,
  rng: Rng,
  opts: { arithmetic?: number; strategy?: TrustStrategy; blockSeed?: number } = {},
): TrialRecord[] {
  const arithmetic = opts.arithmetic ?? 0.2 + 0.6 * rng.next();
  const strategy = opts.strategy ?? "calibrated";
  const blockSeed = opts.blockSeed ?? rng.int(2 ** 31);
  return items.map((it, i) => {
    const ease = Math.min(1.3, it.gap / 0.06);
    const pInit = Math.min(0.97, 0.5 + (0.15 + 0.3 * arithmetic) * ease);
    const initialRt = Math.round(900 + 1700 * (1 - arithmetic) * (0.6 + 0.6 * rng.next()) * (p.terms / 3));
    const inTime = initialRt <= p.max_response_ms;
    const other = (s: Side): Side => (s === "left" ? "right" : "left");
    const initial: Side | null = inTime ? (rng.next() < pInit ? it.answer : other(it.answer)) : null;
    const { advice, aiCorrect, confident } = adviceFor(it, initial, p, adviceSeed(blockSeed, i));

    let final: Side;
    if (strategy === "always_follow") final = advice;
    else if (strategy === "always_keep") final = initial ?? advice;
    else if (strategy === "confidence_only") final = initial == null || initial === advice ? advice : confident ? advice : initial;
    else if (initial == null) final = rng.next() < 0.5 + 0.3 * reliance ? advice : other(advice);
    else if (initial === advice) final = rng.next() < 0.97 ? initial : other(initial);
    else if (p.show_confidence && rng.next() < 0.7 * reliance) {
      // Calibrated trust: a skilled player often lets the helper's (honest) confidence decide.
      final = confident ? advice : initial;
    } else {
      // Disagreement: pick whoever is right with a probability that grows with reliance skill,
      // a little with arithmetic (rechecking), and with how clear-cut the item is.
      const certainty = Math.min(1, 0.6 + 0.4 * ease);
      const pRightCall = 0.5 + (0.42 * reliance + 0.1 * (arithmetic - 0.5)) * certainty;
      const right = rng.next() < pRightCall;
      final = right ? it.answer : other(it.answer);
    }
    const finalRt = Math.round(450 + 900 * (1 - reliance) * rng.next() + (initial !== advice ? 400 : 0));
    return {
      trialIndex: i,
      isPractice: it.practice,
      stimulus: { left: it.left, right: it.right, gap: it.gap, initial, initialRtMs: inTime ? initialRt : null, advice, aiCorrect, ...(p.show_confidence ? { aiConfident: confident } : {}) },
      expected: it.answer,
      response: final,
      outcome: "response",
      correct: final === it.answer,
      rtMs: finalRt,
    };
  });
}
