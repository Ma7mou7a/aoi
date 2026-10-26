import { describe, expect, it } from "vitest";
import { loadDimensions } from "../dimensions/loader";
import { createRng } from "../rng";
import { applyDrift, credibleInterval, expectedPosteriorSd, MIN_SD, priorFor, updatePosterior } from ".";

const wm = loadDimensions().find((d) => d.id === "working_memory")!;
const t0 = new Date("2026-10-26T10:00:00Z");

describe("posterior update", () => {
  it("starts at the configured prior", () => {
    expect(priorFor(wm, t0)).toMatchObject({ mean: 0.5, sd: 0.2, nObservations: 0 });
  });
  it("moves toward the observation and narrows the band", () => {
    const p = updatePosterior(priorFor(wm, t0), 0.8, 0.12, 24, t0);
    expect(p.mean).toBeGreaterThan(0.5);
    expect(p.mean).toBeLessThan(0.8);
    expect(p.sd).toBeLessThan(0.2);
    expect(p).toMatchObject({ nObservations: 1, nTrials: 24 });
  });
  it("weights a noisy observation less than a precise one", () => {
    const precise = updatePosterior(priorFor(wm, t0), 0.8, 0.05, 24, t0);
    const noisy = updatePosterior(priorFor(wm, t0), 0.8, 0.3, 24, t0);
    expect(precise.mean).toBeGreaterThan(noisy.mean);
  });
  it("never claims more precision than MIN_SD", () => {
    let p = priorFor(wm, t0);
    for (let i = 0; i < 200; i++) p = updatePosterior(p, 0.6, 0.05, 24, t0);
    expect(p.sd).toBe(MIN_SD);
  });
  it("keeps the interval inside 0..1", () => {
    expect(credibleInterval({ mean: 0.98, sd: 0.1 })).toEqual([expect.any(Number), 1]);
  });
  it("expectedPosteriorSd matches an actual update", () => {
    expect(expectedPosteriorSd(0.2, 0.12)).toBeCloseTo(updatePosterior(priorFor(wm, t0), 0.5, 0.12, 1, t0).sd, 10);
  });
});

describe("drift", () => {
  it("widens the band with time, capped at the prior", () => {
    const p = updatePosterior(priorFor(wm, t0), 0.6, 0.05, 24, t0);
    const later = applyDrift(p, wm, new Date("2026-11-25T10:00:00Z"));
    expect(later.sd).toBeGreaterThan(p.sd);
    expect(later.mean).toBe(p.mean);
    expect(applyDrift(p, wm, new Date("2030-01-01")).sd).toBeLessThanOrEqual(0.2);
  });
});

describe("calibration (simulated users)", () => {
  it("90% credible interval covers the true ability ~90% of the time", () => {
    const rng = createRng(42);
    const users = 2000;
    let covered = 0;
    for (let u = 0; u < users; u++) {
      const truth = Math.min(1, Math.max(0, 0.5 + 0.2 * rng.normal()));
      let p = priorFor(wm, t0);
      for (let k = 0; k < 5; k++) p = updatePosterior(p, truth + 0.12 * rng.normal(), 0.12, 24, t0);
      const [lo, hi] = credibleInterval(p);
      if (truth >= lo && truth <= hi) covered++;
    }
    const coverage = covered / users;
    expect(coverage).toBeGreaterThan(0.86);
    expect(coverage).toBeLessThan(0.94);
  });
});
