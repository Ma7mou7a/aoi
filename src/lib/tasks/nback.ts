import { createRng, type Rng } from "../rng";

export type NBackParams = {
  n: number;
  stimulus_set: string[];
  trials_per_block: number;
  target_rate: number;
  stimulus_ms: number;
  isi_ms: number;
};

export type NBackStimulus = { letter: string; isTarget: boolean; filler: boolean };

/**
 * Letter sequence with exactly round(target_rate · trials) targets. The first n items are
 * fillers (nothing to compare with yet) and are not scored. Non-targets never repeat the n-back letter.
 */
export function generateNBack(p: NBackParams, seed: number): NBackStimulus[] {
  const rng = createRng(seed);
  const scoredCount = p.trials_per_block;
  const nTargets = Math.round(p.target_rate * scoredCount);
  const targetIdx = new Set(rng.shuffle([...Array(scoredCount).keys()]).slice(0, nTargets).map((i) => i + p.n));

  const seq: NBackStimulus[] = [];
  for (let i = 0; i < p.n + scoredCount; i++) {
    if (i < p.n) {
      seq.push({ letter: rng.pick(p.stimulus_set), isTarget: false, filler: true });
    } else if (targetIdx.has(i)) {
      seq.push({ letter: seq[i - p.n].letter, isTarget: true, filler: false });
    } else {
      const avoid = seq[i - p.n].letter;
      seq.push({ letter: rng.pick(p.stimulus_set.filter((l) => l !== avoid)), isTarget: false, filler: false });
    }
  }
  return seq;
}

/**
 * Synthetic responder for tests and the validation study: a user with ability θ ∈ [0,1]
 * gets hit/false-alarm rates that degrade as n grows.
 */
export function simulateNBackResponses(seq: NBackStimulus[], n: number, ability: number, rng: Rng) {
  const difficulty = (n - 1) / 2; // 0, 0.5, 1 for 1/2/3-back
  const skill = 1 / (1 + Math.exp(-8 * (ability - 0.2 - 0.35 * difficulty)));
  const pHit = 0.5 + 0.48 * skill;
  const pFa = 0.3 - 0.27 * skill;
  return seq.map((s, i) => {
    const press = rng.next() < (s.isTarget ? pHit : pFa);
    const rt = press ? Math.round(1100 - 500 * ability + 120 * rng.normal()) : null;
    return {
      trialIndex: i,
      isPractice: s.filler,
      stimulus: { ...s },
      expected: s.isTarget ? "match" : null,
      response: press ? "match" : null,
      outcome: press ? ("response" as const) : ("no_response" as const),
      correct: press === s.isTarget,
      rtMs: rt == null ? null : Math.max(200, rt),
    };
  });
}
