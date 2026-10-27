import { describe, expect, it } from "vitest";
import { biasWord, selfCheck, selfEstimateValue } from "./metacog";

describe("How sure are you? (self-estimate)", () => {
  it("compares the guess with the actual score", () => {
    const c = selfCheck(0.7, 0.58, []);
    expect(c.error).toBeCloseTo(0.12, 10);
    expect(c.recent).toBeNull(); // needs 3 guesses for a running summary
  });
  it("summarises recent guesses: mean absolute error and bias", () => {
    const c = selfCheck(0.6, 0.5, [{ guess: 0.7, actual: 0.5 }, { guess: 0.4, actual: 0.5 }]);
    expect(c.recent!.blocks).toBe(3);
    expect(c.recent!.meanAbsError).toBeCloseTo((0.1 + 0.2 + 0.1) / 3, 10);
    expect(c.recent!.bias).toBeCloseTo((0.1 + 0.2 - 0.1) / 3, 10);
    expect(biasWord(c.recent!.bias)).toBe("a bit optimistic");
    expect(biasWord(-0.1)).toBe("a bit modest");
    expect(biasWord(0.02)).toBe("about right");
  });
  it("gives graded collaboration credit: closer guesses earn more", () => {
    expect(selfEstimateValue(0.6, 0.6)).toBe(1);
    expect(selfEstimateValue(0.8, 0.6)).toBeCloseTo(0.5, 10);
    expect(selfEstimateValue(0.1, 0.9)).toBe(0);
  });
});
