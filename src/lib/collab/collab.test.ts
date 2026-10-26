import { describe, expect, it } from "vitest";
import { createRng } from "../rng";
import { plantFlaw } from "./plant";
import { actualDirection, computeCollabScore, COMPONENTS, isSpecificQuestion, SIGNALS, WEIGHTS, type Signal } from "./score";

const ev = (...signals: Signal[]) => signals.map((s) => ({ component: SIGNALS[s].component, value: SIGNALS[s].value }));

describe("collaboration score formula", () => {
  it("weights sum to 1 and match the brief", () => {
    expect(Object.values(WEIGHTS).reduce((a, b) => a + b, 0)).toBeCloseTo(1);
    expect(WEIGHTS.critical_verification).toBe(0.25);
  });
  it("starts at the neutral prior (50) with no events", () => {
    const s = computeCollabScore([]);
    expect(s.score).toBe(50);
    for (const c of COMPONENTS) expect(s.components[c]).toMatchObject({ score: 0.5, n: 0 });
  });
  it("is the weighted sum of smoothed component means", () => {
    const s = computeCollabScore(ev("caught_planted_flaw", "caught_planted_flaw"));
    // critical_verification: (1 + 1 + 0.5·2) / (2 + 2) = 0.75; others 0.5
    expect(s.components.critical_verification.score).toBeCloseTo(0.75);
    expect(s.score).toBe(Math.round(100 * (0.25 * 0.75 + 0.75 * 0.5)));
  });
  it("rewards checking over blind acceptance", () => {
    const careful = computeCollabScore(ev("opened_evidence", "verified_then_accepted", "caught_planted_flaw", "asked_specific_question", "prediction_correct"));
    const blind = computeCollabScore(ev("accepted_unchecked", "accepted_unchecked", "missed_planted_flaw", "prediction_skipped"));
    // With only a handful of events the prior keeps both near 50: the gap is what matters.
    expect(careful.score).toBeGreaterThan(60);
    expect(blind.score).toBeLessThan(45);
    expect(careful.score - blind.score).toBeGreaterThan(15);
  });
  it("stays within 0..100 and converges to the signal mean with many events", () => {
    const all = computeCollabScore(Array(200).fill(ev("caught_planted_flaw", "follow_up_question", "prediction_correct", "in_scope_question", "asked_specific_question")).flat());
    expect(all.score).toBeLessThanOrEqual(100);
    expect(all.score).toBeGreaterThan(98);
  });
});

describe("helpers", () => {
  it("classifies specific questions", () => {
    expect(isSpecificQuestion("Why did my score drop?")).toBe(true);
    expect(isSpecificQuestion("What does the band mean?")).toBe(true);
    expect(isSpecificQuestion("hello")).toBe(false);
  });
  it("direction uses a ±2 point dead zone", () => {
    expect(actualDirection(0.5, 0.53)).toBe("better");
    expect(actualDirection(0.5, 0.51)).toBe("same");
    expect(actualDirection(0.5, 0.45)).toBe("worse");
  });
});

describe("plantFlaw", () => {
  const claims = [
    { claim: "Strong memory.", why: "Your block scored 62% at level 2." },
    { claim: "No numbers here.", why: "Keep going." },
  ];
  it("changes exactly one number in one why, keeping the claim text", () => {
    for (let seed = 0; seed < 20; seed++) {
      const r = plantFlaw(claims, createRng(seed))!;
      expect(r.flaw.claimIndex).toBe(0);
      expect(r.claims[0].claim).toBe(claims[0].claim);
      expect(r.claims[0].why).not.toBe(claims[0].why);
      expect(r.claims[0].why).toMatch(/\d+% at level 2/);
      expect(r.claims[1]).toEqual(claims[1]);
      const n = Number(r.claims[0].why.match(/(\d+)%/)![1]);
      expect(n).toBeGreaterThanOrEqual(0);
      expect(n).toBeLessThanOrEqual(100);
    }
  });
  it("returns null when there is nothing to change", () => {
    expect(plantFlaw([{ claim: "a", why: "b" }], createRng(1))).toBeNull();
  });
});
