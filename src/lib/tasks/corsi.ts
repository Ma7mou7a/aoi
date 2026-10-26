import type { Rng } from "../rng";

export type CorsiParams = {
  blocks: number;
  highlight_ms: number;
  gap_ms: number;
  trials_per_span: number;
  start_span: number;
  max_span: number;
  backward?: boolean;
};

/** Irregular 9-block layout (x, y in 0..1), after the classic Corsi board. */
export const CORSI_LAYOUT: ReadonlyArray<readonly [number, number]> = [
  [0.12, 0.78], [0.28, 0.42], [0.18, 0.12], [0.48, 0.66], [0.55, 0.28],
  [0.82, 0.14], [0.86, 0.52], [0.68, 0.86], [0.38, 0.9],
];

/** Random sequence of distinct blocks with no immediate spatial repeats. */
export function corsiSequence(rng: Rng, span: number, blocks: number): number[] {
  return rng.shuffle([...Array(blocks).keys()]).slice(0, span);
}

export function expectedOrder(sequence: number[], backward: boolean): number[] {
  return backward ? [...sequence].reverse() : sequence;
}

/**
 * Span staircase: trials_per_span attempts per span; go up when at least one is right,
 * stop when all attempts at a span fail or max_span is done.
 */
export class CorsiStaircase {
  span: number;
  private attempt = 0;
  private anyCorrect = false;
  done = false;

  constructor(private p: CorsiParams) {
    this.span = p.start_span;
  }

  record(correct: boolean) {
    this.attempt++;
    this.anyCorrect ||= correct;
    if (this.attempt < this.p.trials_per_span) return;
    if (!this.anyCorrect || this.span >= this.p.max_span) this.done = true;
    else this.span++;
    this.attempt = 0;
    this.anyCorrect = false;
  }
}

/** Synthetic responder: recalls a sequence correctly with probability falling off around span ≈ 3 + 5·ability. */
export function simulateCorsiBlock(p: CorsiParams, ability: number, rng: Rng) {
  const stairs = new CorsiStaircase(p);
  const trials = [];
  let i = 0;
  while (!stairs.done && i < 40) {
    const seq = corsiSequence(rng, stairs.span, p.blocks);
    const expected = expectedOrder(seq, !!p.backward);
    const capacity = 3 + 5 * ability - (p.backward ? 0.5 : 0);
    const correct = rng.next() < 1 / (1 + Math.exp(2.2 * (stairs.span - capacity)));
    const response = correct ? expected : [...expected.slice(0, -1), (expected.at(-1)! + 1) % p.blocks];
    trials.push({
      trialIndex: i++,
      stimulus: { span: stairs.span, sequence: seq, backward: !!p.backward },
      expected,
      response,
      outcome: "response" as const,
      correct,
      rtMs: Math.round(700 * stairs.span + 300 * rng.normal() + 600),
    });
    stairs.record(correct);
  }
  return trials;
}
