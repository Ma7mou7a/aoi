import { describe, expect, it } from "vitest";
import { loadDimensions } from "../dimensions/loader";
import { createRng } from "../rng";
import { generateNBack, simulateNBackResponses, type NBackParams } from "../tasks/nback";
import { compositeScore, normaliseMetric, scoreBlock } from ".";
import { computeMetrics, median, probit } from "./metrics";
import type { TrialRecord } from "./types";
import { assessValidity, longestStreak } from "./validity";

const dims = loadDimensions();
const wm = dims.find((d) => d.id === "working_memory")!;
const nback = wm.tasks[0];
const params = (n: number): NBackParams => ({ ...(nback.params as Omit<NBackParams, "n">), n });

function block(n: number, respond: (s: ReturnType<typeof generateNBack>[number], i: number) => boolean, rt = 600): TrialRecord[] {
  return generateNBack(params(n), 7).map((s, i) => {
    const press = respond(s, i);
    return {
      trialIndex: i,
      isPractice: s.filler,
      stimulus: { ...s },
      response: press ? "match" : null,
      outcome: press ? "response" : "no_response",
      correct: press === s.isTarget,
      rtMs: press ? rt : null,
    };
  });
}

describe("metric helpers", () => {
  it("probit inverts the normal CDF", () => {
    expect(probit(0.5)).toBeCloseTo(0, 6);
    expect(probit(0.975)).toBeCloseTo(1.96, 2);
    expect(probit(0.01)).toBeCloseTo(-2.326, 2);
  });
  it("median handles even, odd and empty", () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 2, 3])).toBe(2.5);
    expect(median([])).toBeNaN();
  });
});

describe("n-back metrics", () => {
  it("perfect performer: high d', accuracy 1", () => {
    const m = computeMetrics("n_back", block(2, (s) => s.isTarget));
    expect(m.hit_rate).toBe(1);
    expect(m.false_alarm_rate).toBe(0);
    expect(m.accuracy).toBe(1);
    expect(m.d_prime).toBeGreaterThan(2.5);
    expect(m.median_rt_ms).toBe(600);
  });
  it("never pressing is chance (balanced accuracy 0.5, d' near 0)", () => {
    const m = computeMetrics("n_back", block(2, () => false));
    expect(m.accuracy).toBe(0.5);
    // Log-linear correction with 7 targets vs 17 lures leaves a small positive bias, far below a real performer.
    expect(m.d_prime).toBeLessThan(0.5);
  });
  it("counts implausibly fast presses as errors, not hits", () => {
    const m = computeMetrics("n_back", block(1, (s) => s.isTarget, 90), 150);
    expect(m.hit_rate).toBe(0);
    expect(m.median_rt_ms).toBeNaN();
  });
});

describe("validity", () => {
  it("flags non-responding as near chance", () => {
    const t = block(2, () => false);
    const v = assessValidity(t, computeMetrics("n_back", t), nback.validity);
    expect(v.flags).toContain("near_chance");
    expect(v.valid).toBe(false);
  });
  it("flags key-mashing as a response streak", () => {
    const t = block(2, () => true);
    expect(longestStreak(t.filter((x) => !x.isPractice))).toBe(24);
    const v = assessValidity(t, computeMetrics("n_back", t), nback.validity);
    expect(v.flags).toContain("response_streak");
  });
  it("accepts a good engaged block", () => {
    const t = block(2, (s) => s.isTarget);
    expect(assessValidity(t, computeMetrics("n_back", t), nback.validity)).toEqual({ valid: true, validTrials: 24, flags: [] });
  });
});

describe("composite", () => {
  it("normalises linearly, clamps, inverts, and zeroes missing metrics", () => {
    const n = { method: "linear" as const, min: 0, max: 10, invert: false };
    expect(normaliseMetric(5, n)).toBe(0.5);
    expect(normaliseMetric(20, n)).toBe(1);
    expect(normaliseMetric(2, { ...n, invert: true })).toBe(0.8);
    expect(normaliseMetric(NaN, n)).toBe(0);
  });
  it("is the weighted sum of components", () => {
    const { composite, components } = compositeScore({ d_prime: 3.5, median_rt_ms: 1200 }, nback);
    expect(components.map((c) => c.contribution)).toEqual([0.8, 0]);
    expect(composite).toBeCloseTo(0.8);
  });
});

describe("scoreBlock", () => {
  it("maps the composite into the level's ability range", () => {
    const s = scoreBlock(wm, nback, 2, block(2, (s) => s.isTarget, 350));
    expect(s.validity.valid).toBe(true);
    expect(s.observation).toBeGreaterThan(0.3);
    expect(s.observation).toBeLessThanOrEqual(0.75);
    expect(s.observationSd).toBeGreaterThan(0);
  });
  it("trusts invalid blocks much less", () => {
    const good = scoreBlock(wm, nback, 2, block(2, (s, i) => s.isTarget !== (i % 9 === 0)));
    const bad = scoreBlock(wm, nback, 2, block(2, () => false));
    expect(bad.observationSd).toBeGreaterThan(good.observationSd * 2);
  });
  it("higher simulated ability → higher observation (monotone on average)", () => {
    const rng = createRng(1);
    const meanObs = (ability: number) => {
      let s = 0;
      for (let k = 0; k < 40; k++) {
        const trials = simulateNBackResponses(generateNBack(params(2), k), 2, ability, rng);
        s += scoreBlock(wm, nback, 2, trials).observation;
      }
      return s / 40;
    };
    const [low, mid, high] = [0.2, 0.5, 0.8].map(meanObs);
    expect(low).toBeLessThan(mid);
    expect(mid).toBeLessThan(high);
  });
});
