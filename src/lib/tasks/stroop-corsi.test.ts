import { describe, expect, it } from "vitest";
import { loadDimensions } from "../dimensions/loader";
import { createRng } from "../rng";
import { levelOf, scoreBlock } from "../scoring";
import { computeMetrics } from "../scoring/metrics";
import { CorsiStaircase, corsiSequence, expectedOrder, simulateCorsiBlock, type CorsiParams } from "./corsi";
import { generateStroop, simulateStroopResponses, type StroopParams } from "./stroop";

const dims = loadDimensions();
const att = dims.find((d) => d.id === "attention_inhibition")!;
const vsm = dims.find((d) => d.id === "visuospatial_memory")!;
const stroop = att.tasks[0];
const corsi = vsm.tasks[0];
const stroopParams = (level: number) => ({ ...stroop.params, ...levelOf(stroop, level).params }) as unknown as StroopParams;
const corsiParams = (level: number) => ({ ...corsi.params, ...levelOf(corsi, level).params }) as unknown as CorsiParams;

describe("generateStroop", () => {
  it("has practice trials then the exact incongruent count", () => {
    const seq = generateStroop(stroopParams(2), 3);
    expect(seq.filter((s) => s.practice)).toHaveLength(8);
    const scored = seq.filter((s) => !s.practice);
    expect(scored).toHaveLength(32);
    expect(scored.filter((s) => !s.congruent)).toHaveLength(16);
  });
  it("congruent means word = ink, incongruent means word ≠ ink", () => {
    for (const s of generateStroop(stroopParams(3), 9)) expect(s.word === s.ink).toBe(s.congruent);
  });
  it("is reproducible from the seed", () => {
    expect(generateStroop(stroopParams(1), 4)).toEqual(generateStroop(stroopParams(1), 4));
  });
  it("interference cost is positive for a typical simulated user and ability raises the score", () => {
    const rng = createRng(2);
    const mean = (ability: number) => {
      let obs = 0;
      let cost = 0;
      for (let k = 0; k < 30; k++) {
        const t = simulateStroopResponses(generateStroop(stroopParams(2), k), stroop.params.colours as string[], ability, rng);
        obs += scoreBlock(att, stroop, 2, t).observation;
        cost += computeMetrics("stroop", t).interference_cost_ms;
      }
      return { obs: obs / 30, cost: cost / 30 };
    };
    const low = mean(0.2);
    const high = mean(0.8);
    expect(low.cost).toBeGreaterThan(0);
    expect(high.obs).toBeGreaterThan(low.obs);
  });
});

describe("Corsi", () => {
  it("sequences use distinct blocks", () => {
    const s = corsiSequence(createRng(1), 6, 9);
    expect(new Set(s).size).toBe(6);
  });
  it("backward mode reverses the expected order", () => {
    expect(expectedOrder([1, 2, 3], true)).toEqual([3, 2, 1]);
  });
  it("staircase goes up after any success and stops after a failed span", () => {
    const st = new CorsiStaircase({ blocks: 9, highlight_ms: 1, gap_ms: 1, trials_per_span: 2, start_span: 3, max_span: 9 });
    st.record(false);
    st.record(true);
    expect(st.span).toBe(4);
    st.record(false);
    st.record(false);
    expect(st.done).toBe(true);
  });
  it("stops at max span", () => {
    const st = new CorsiStaircase({ blocks: 9, highlight_ms: 1, gap_ms: 1, trials_per_span: 1, start_span: 8, max_span: 9 });
    st.record(true);
    st.record(true);
    expect(st.done).toBe(true);
  });
  it("span metric tracks simulated ability", () => {
    const rng = createRng(5);
    const span = (ability: number) => {
      let s = 0;
      for (let k = 0; k < 40; k++) s += computeMetrics("corsi", simulateCorsiBlock(corsiParams(1), ability, rng)).span;
      return s / 40;
    };
    expect(span(0.8)).toBeGreaterThan(span(0.2) + 1.5);
  });
  it("scored block gives a valid observation inside the level range", () => {
    const t = simulateCorsiBlock(corsiParams(2), 0.6, createRng(8));
    const s = scoreBlock(vsm, corsi, 2, t);
    expect(s.observation).toBeGreaterThanOrEqual(0.25);
    expect(s.observation).toBeLessThanOrEqual(0.8);
  });
});
