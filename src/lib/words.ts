import { expectedPosteriorSd } from "./profiler";

/** User-facing words on the main screens. /validation, /skills and docs keep the technical terms. */
export const WORDS = {
  estimate: "score",
  band: "how sure we are",
  block: "game",
  composite: "game score",
  credibleInterval: "how sure we are",
} as const;

/** Wider than this (in points) and a range says little: say so plainly instead. */
const WIDE_RANGE = 30;

export function sureText(lowPct: number, highPct: number): string {
  if (highPct - lowPct > WIDE_RANGE) return "We're still getting to know you.";
  return `We're fairly sure it's between ${lowPct} and ${highPct}.`;
}

/** Games of this skill until its uncertainty drops to `targetSd` (0 when already there, at most 10). */
export function gamesToSure(sd: number, obsSd: number, targetSd = 0.08): number {
  let s = sd;
  let n = 0;
  while (s > targetSd && n < 10) {
    s = expectedPosteriorSd(s, obsSd);
    n++;
  }
  return n;
}

const p = (x: number | undefined) => (x != null && Number.isFinite(x) ? `${Math.round(x * 100)}%` : null);
/** A slow-down worth mentioning: at least 1% (a zero or negative cost says nothing to the player). */
const slowdown = (x: number | undefined) => (x != null && Number.isFinite(x) && x >= 0.01 ? p(x) : null);
const n = (x: number | undefined) => (x != null && Number.isFinite(x) ? String(Math.round(x)) : null);

/** One plain sentence about what the player just did, per game type. */
export function plainDid(paradigm: string, m: Record<string, number>): string {
  switch (paradigm) {
    case "n_back": {
      const caught = p(m.hit_rate);
      const fa = p(m.false_alarm_rate);
      if (!caught) return "You finished the letter-matching game.";
      return `You caught ${caught} of the matching letters${fa ? ` and pressed by mistake on ${fa} of the others` : ""}.`;
    }
    case "stroop": {
      const acc = p(m.accuracy);
      const slow = slowdown(m.interference_ratio);
      if (!acc) return "You finished the colour-word game.";
      return `You named the ink colour correctly ${acc} of the time.${slow ? ` When the word and the colour clashed, you slowed down by about ${slow}.` : ""}`;
    }
    case "corsi": {
      const span = n(m.span);
      return span ? `You remembered sequences of up to ${span} blocks.` : "You finished the block-sequence game.";
    }
    case "symbol_digit": {
      const per = n(m.correct_per_minute);
      const acc = p(m.accuracy);
      return per ? `You matched ${per} symbols a minute${acc ? `, ${acc} of them correctly` : ""}.` : "You finished the symbol-matching game.";
    }
    case "task_switching": {
      const acc = p(m.accuracy);
      const slow = slowdown(m.switch_cost_ratio);
      if (!acc) return "You finished the rule-switching game.";
      return `You got ${acc} right.${slow ? ` Switching rules slowed you by about ${slow}.` : ""}`;
    }
    case "matrices": {
      const acc = p(m.accuracy);
      return acc ? `You solved ${acc} of the puzzles.` : "You finished the pattern puzzles.";
    }
    case "trust_machine": {
      const right = p(m.appropriate_reliance);
      return right ? `When the AI helper disagreed with you, you made the right call ${right} of the time.` : "You finished the second-opinion game.";
    }
    default:
      return "You finished the game.";
  }
}
