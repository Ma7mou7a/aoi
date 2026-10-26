import { describe, expect, it } from "vitest";
import { generateNBack } from "./nback";

const p = { n: 2, stimulus_set: ["B", "C", "D", "F"], trials_per_block: 24, target_rate: 0.3, stimulus_ms: 500, isi_ms: 2000 };

describe("generateNBack", () => {
  it("has n fillers plus the scored trials with the exact target count", () => {
    const seq = generateNBack(p, 1);
    expect(seq).toHaveLength(26);
    expect(seq.filter((s) => s.filler)).toHaveLength(2);
    expect(seq.filter((s) => s.isTarget)).toHaveLength(7);
  });
  it("marks targets exactly where the letter matches n back", () => {
    for (const seed of [1, 2, 3, 99]) {
      const seq = generateNBack(p, seed);
      seq.forEach((s, i) => {
        if (i >= p.n) expect(s.isTarget).toBe(s.letter === seq[i - p.n].letter);
      });
    }
  });
  it("is reproducible from the seed", () => {
    expect(generateNBack(p, 5)).toEqual(generateNBack(p, 5));
    expect(generateNBack(p, 5)).not.toEqual(generateNBack(p, 6));
  });
});
