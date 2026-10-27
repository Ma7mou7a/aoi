/**
 * "How sure are you?": before seeing a block's score, the user guesses it. Comparing guess and actual
 * score over blocks measures metacognitive calibration (knowing how well you did). Feedback on such
 * judgements improved calibration and transferred to an untrained task (Carpenter et al. 2019).
 */

export type GuessPair = { guess: number; actual: number };

export type SelfCheck = {
  guess: number;
  actual: number;
  /** guess − actual: positive = you thought you did better than you did. */
  error: number;
  /** Over the recent blocks with a guess (this one included); null with fewer than 3. */
  recent: { blocks: number; meanAbsError: number; bias: number } | null;
};

/** Recent blocks considered for the running summary. */
export const RECENT_GUESSES = 10;
/** Collaboration value: 1 for a perfect guess, 0 when off by this much or more. */
const ZERO_CREDIT_ERROR = 0.4;

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

export function selfCheck(guess: number, actual: number, earlier: GuessPair[]): SelfCheck {
  const pairs = [{ guess, actual }, ...earlier].slice(0, RECENT_GUESSES);
  return {
    guess,
    actual,
    error: guess - actual,
    recent: pairs.length >= 3
      ? { blocks: pairs.length, meanAbsError: mean(pairs.map((p) => Math.abs(p.guess - p.actual))), bias: mean(pairs.map((p) => p.guess - p.actual)) }
      : null,
  };
}

/** Graded "autonomy" credit for one guess: closer guesses earn more. */
export const selfEstimateValue = (guess: number, actual: number) => Math.max(0, 1 - Math.abs(guess - actual) / ZERO_CREDIT_ERROR);

/** Plain-language reading of the running bias (in points). */
export function biasWord(bias: number): "about right" | "a bit optimistic" | "a bit modest" {
  if (Math.abs(bias) < 0.05) return "about right";
  return bias > 0 ? "a bit optimistic" : "a bit modest";
}
