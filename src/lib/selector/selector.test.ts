import { describe, expect, it } from "vitest";
import { loadDimensions } from "../dimensions/loader";
import { PARADIGMS } from "../dimensions/schema";
import type { Posterior } from "../profiler";
import { selectNext } from ".";

const dimensions = loadDimensions();
const post = (mean: number, sd: number): Posterior => ({ mean, sd, nObservations: 0, nTrials: 0, updatedAt: "2026-10-26T00:00:00Z" });
const allAt = (mean: number, sd: number) => Object.fromEntries(dimensions.map((d) => [d.id, post(mean, sd)]));

describe("assessment mode", () => {
  it("targets the least certain dimension", () => {
    const posteriors = { ...allAt(0.5, 0.1), visuospatial_memory: post(0.5, 0.2) };
    const s = selectNext({ dimensions, posteriors, mode: "assessment", available: PARADIGMS })!;
    expect(s.dimensionId).toBe("visuospatial_memory");
    expect(s.reason.rule).toBe("max_expected_uncertainty_reduction");
    expect(s.reason.expectedSdReduction).toBeGreaterThan(0);
    expect(s.reason.note).toMatch(/least sure about your visuospatial memory so far \(±33%\)/);
  });
  it("only offers paradigms the front end can render", () => {
    const s = selectNext({ dimensions, posteriors: allAt(0.5, 0.2), mode: "assessment", available: ["n_back"] })!;
    expect(s.taskId).toBe("n_back");
  });
  it("chooses a level where a strong user is not at ceiling", () => {
    const s = selectNext({ dimensions, posteriors: { working_memory: post(0.9, 0.15) }, mode: "assessment", available: ["n_back"] })!;
    expect(s.level).toBe(3);
    const weak = selectNext({ dimensions, posteriors: { working_memory: post(0.1, 0.15) }, mode: "assessment", available: ["n_back"] })!;
    expect(weak.level).toBe(1);
  });
  it("avoids repeating the same dimension when another is nearly as uncertain", () => {
    const posteriors = { ...allAt(0.5, 0.05), working_memory: post(0.5, 0.2), attention_inhibition: post(0.5, 0.19) };
    const s = selectNext({ dimensions, posteriors, mode: "assessment", available: PARADIGMS, recent: ["working_memory"] })!;
    expect(s.dimensionId).toBe("attention_inhibition");
  });
  it("stops when every band is narrow enough", () => {
    expect(selectNext({ dimensions, posteriors: allAt(0.5, 0.05), mode: "assessment", available: PARADIGMS })).toBeNull();
  });
  it("returns null when nothing is renderable", () => {
    expect(selectNext({ dimensions, posteriors: allAt(0.5, 0.2), mode: "assessment", available: [] })).toBeNull();
  });
});

describe("training mode", () => {
  const posteriors = { ...allAt(0.6, 0.1), working_memory: post(0.4, 0.1) };
  it("focuses the lowest dimension at the level closest to target success", () => {
    const s = selectNext({ dimensions, posteriors, mode: "training", available: PARADIGMS })!;
    expect(s.dimensionId).toBe("working_memory");
    expect(s.reason.rule).toBe("target_success");
  });
  it("steps up after an easy block and down after a hard one", () => {
    const base = { dimensions, posteriors, mode: "training" as const, available: PARADIGMS };
    expect(selectNext({ ...base, lastRuns: { n_back: { taskId: "n_back", level: 2, accuracy: 0.95 } } })!.level).toBe(3);
    expect(selectNext({ ...base, lastRuns: { n_back: { taskId: "n_back", level: 2, accuracy: 0.5 } } })!.level).toBe(1);
    expect(selectNext({ ...base, lastRuns: { n_back: { taskId: "n_back", level: 2, accuracy: 0.78 } } })!.level).toBe(2);
    expect(selectNext({ ...base, lastRuns: { n_back: { taskId: "n_back", level: 3, accuracy: 1 } } })!.level).toBe(3);
  });
});
