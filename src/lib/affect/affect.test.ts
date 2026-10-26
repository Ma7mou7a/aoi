import { describe, expect, it } from "vitest";
import type { TrialRecord } from "../scoring/types";
import { errorStreak, inferAffect, slowingRatio } from ".";

const trial = (i: number, correct: boolean, rtMs: number, extra: Partial<TrialRecord> = {}): TrialRecord => ({
  trialIndex: i, stimulus: {}, outcome: "response", correct, rtMs, ...extra,
});
const steady = Array.from({ length: 24 }, (_, i) => trial(i, i % 5 !== 0, 600));

describe("behavioural affect signals", () => {
  it("measures error streaks and slowing", () => {
    expect(errorStreak([trial(0, true, 500), trial(1, false, 500), trial(2, false, 500), trial(3, false, 500), trial(4, true, 500)])).toBe(3);
    const slowing = Array.from({ length: 24 }, (_, i) => trial(i, true, 500 + i * 30));
    expect(slowingRatio(slowing)!).toBeGreaterThan(1.25);
    expect(slowingRatio(steady)).toBeCloseTo(1, 5);
  });
  it("calm, steady block: no suggestion", () => {
    const a = inferAffect({ trials: steady, composite: 0.6, taskId: "n_back", earlier: [], sessionMinutes: 5 });
    expect(a).toMatchObject({ fatigue: "low", frustration: "low", suggestion: null, easeOff: false });
  });
  it("slowing + long session → suggests a break, citing the cues", () => {
    const slowing = Array.from({ length: 24 }, (_, i) => trial(i, true, 500 + i * 30));
    const a = inferAffect({ trials: slowing, composite: 0.6, taskId: "n_back", earlier: [], sessionMinutes: 30 });
    expect(a.fatigue).toBe("high");
    expect(a.suggestion).toMatch(/break/);
    expect(a.cues.join(" ")).toMatch(/slower/);
  });
  it("miss streak + drop vs earlier block → ease off", () => {
    const rough = Array.from({ length: 24 }, (_, i) => trial(i, i > 6, 600));
    const a = inferAffect({ trials: rough, composite: 0.3, taskId: "n_back", earlier: [{ taskId: "n_back", composite: 0.7, status: "completed" }], sessionMinutes: 8 });
    expect(a.frustration).toBe("high");
    expect(a.easeOff).toBe(true);
    expect(a.suggestion).toMatch(/easier/);
  });
  it("never uses clinical or diagnostic words", () => {
    const rough = Array.from({ length: 24 }, (_, i) => trial(i, false, 500 + i * 40, { behaviour: { focusLost: true } }));
    const a = inferAffect({ trials: rough, composite: 0.1, taskId: "x", earlier: [{ taskId: "x", composite: 0.8, status: "completed" }, { taskId: "y", composite: null, status: "abandoned" }], sessionMinutes: 40 });
    expect(`${a.suggestion} ${a.cues.join(" ")}`).not.toMatch(/anxi|depress|stress disorder|burnout|diagnos/i);
  });
});
