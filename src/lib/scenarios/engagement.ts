/**
 * Brain Twin 2.0, layer 1: the fast-guess model (Ollman 1966; Yellott 1971). Every answer is either
 * ENGAGED (right with the player's usual engaged accuracy pE) or a FAST GUESS (right only by chance c):
 *
 *   P(correct) = (1 − g)·pE + g·c   →   g = (pE − P(correct)) / (pE − c)
 *
 * g is the share of answers that were guesses. Its 90% interval comes from the binomial error of the
 * observed accuracy. This turns "you mashed the buttons" into a measurement ("about 80% of these answers
 * look like guesses, likely 66–94%"), and lets Bao check a "I was distracted" claim against the game itself.
 */
export const ENGAGEMENT = {
  /** Engaged accuracy when the player has no reliable history on this task yet. */
  defaultEngagedAccuracy: 0.9,
  /** Games needed before the player's own engaged accuracy replaces the default. */
  minHistory: 2,
  /** A guess share whose 90% interval starts at or above this supports a distraction claim. */
  supportsClaimAt: 0.2,
  z90: 1.6449,
} as const;

export type Engagement = { guessPct: number; lowPct: number; highPct: number; engagedAccuracyPct: number; n: number };

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

/**
 * `accuracy` over `n` scored answers, chance level `chance`, and the player's usual accuracy on this task
 * in reliable games (`history`, newest last). Null when the model can't be applied (no chance level, too few answers).
 */
export function fastGuess(accuracy: number, n: number, chance: number | undefined, history: number[] = []): Engagement | null {
  if (chance == null || !(n >= 8) || !Number.isFinite(accuracy)) return null;
  const own = history.filter(Number.isFinite).slice(-5);
  const pE = Math.max(chance + 0.15, own.length >= ENGAGEMENT.minHistory ? own.reduce((a, b) => a + b, 0) / own.length : ENGAGEMENT.defaultEngagedAccuracy);
  const span = pE - chance;
  const g = clamp01((pE - accuracy) / span);
  const se = Math.sqrt(Math.max(accuracy * (1 - accuracy), 1 / n) / n) / span;
  return {
    guessPct: Math.round(g * 100),
    lowPct: Math.round(clamp01(g - ENGAGEMENT.z90 * se) * 100),
    highPct: Math.round(clamp01(g + ENGAGEMENT.z90 * se) * 100),
    engagedAccuracyPct: Math.round(pE * 100),
    n,
  };
}
