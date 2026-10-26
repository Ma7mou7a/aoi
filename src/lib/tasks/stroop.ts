import { createRng, type Rng } from "../rng";

export type StroopParams = {
  colours: string[];
  keys: Record<string, string>;
  trials_per_block: number;
  practice_trials: number;
  max_response_ms: number;
  incongruent_rate: number;
  deadline_ms?: number;
};

export type StroopStimulus = { word: string; ink: string; congruent: boolean; practice: boolean };

/** Ink colours tuned to stay distinguishable on light and dark backgrounds. */
export const INK: Record<string, string> = { red: "#ef4444", green: "#22c55e", blue: "#3b82f6", yellow: "#eab308" };

/**
 * Practice trials (all congruent-rate 50%) followed by the scored block with exactly
 * round(incongruent_rate · trials) incongruent items, shuffled.
 */
export function generateStroop(p: StroopParams, seed: number): StroopStimulus[] {
  const rng = createRng(seed);
  const make = (congruent: boolean, practice: boolean): StroopStimulus => {
    const ink = rng.pick(p.colours);
    const word = congruent ? ink : rng.pick(p.colours.filter((c) => c !== ink));
    return { word, ink, congruent, practice };
  };
  const practice = [...Array(p.practice_trials).keys()].map((i) => make(i % 2 === 0, true));
  const nInc = Math.round(p.incongruent_rate * p.trials_per_block);
  const flags = rng.shuffle([...Array(p.trials_per_block).keys()].map((i) => i >= nInc));
  return [...practice, ...flags.map((congruent) => make(congruent, false))];
}

/** Synthetic responder: higher ability → faster, more accurate, smaller interference cost. */
export function simulateStroopResponses(seq: StroopStimulus[], colours: string[], ability: number, rng: Rng) {
  return seq.map((s, i) => {
    const pCorrect = s.congruent ? 0.9 + 0.09 * ability : 0.65 + 0.33 * ability;
    const correct = rng.next() < pCorrect;
    const rt = 1100 - 450 * ability + (s.congruent ? 0 : 260 - 200 * ability) + 90 * rng.normal();
    const response = correct ? s.ink : rng.pick(colours.filter((c) => c !== s.ink));
    return {
      trialIndex: i,
      isPractice: s.practice,
      stimulus: { ...s },
      expected: s.ink,
      response,
      outcome: "response" as const,
      correct,
      rtMs: Math.max(250, Math.round(rt)),
    };
  });
}
