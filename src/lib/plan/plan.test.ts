import { describe, expect, it } from "vitest";
import { loadDimensions } from "../dimensions/loader";
import { goalProgress, normalCdf } from "../goals";
import type { Posterior } from "../profiler";
import { AVAILABLE_PARADIGMS } from "../tasks/registry";
import { generateWeeklyPlan, weekStartOf } from ".";

const dimensions = loadDimensions();
const post = (mean: number, sd: number, n = 3): Posterior => ({ mean, sd, nObservations: n, nTrials: n * 24, updatedAt: "2026-10-26T00:00:00Z" });

describe("generateWeeklyPlan", () => {
  const posteriors = Object.fromEntries(dimensions.map((d) => [d.id, post(0.5, 0.2, 0)]));
  posteriors.working_memory = post(0.8, 0.05);
  posteriors.attention_inhibition = post(0.3, 0.08);

  const plan = generateWeeklyPlan({ dimensions, posteriors, available: ["n_back", "stroop", "corsi"], blocksPerWeek: 12 });

  it("covers all six skills when every task is playable", () => {
    const all = generateWeeklyPlan({ dimensions, posteriors, available: AVAILABLE_PARADIGMS, blocksPerWeek: 12 });
    expect(all.items).toHaveLength(6);
    expect(all.items.reduce((s, i) => s + i.blocks, 0)).toBe(12);
  });
  it("only schedules playable tasks and uses the whole budget", () => {
    expect(plan.items.map((i) => i.taskId).sort()).toEqual(["corsi_blocks", "n_back", "stroop"]);
    expect(plan.items.reduce((s, i) => s + i.blocks, 0)).toBe(12);
    for (const i of plan.items) expect(i.blocks).toBeGreaterThanOrEqual(1);
  });
  it("prioritises unmeasured, then weak/uncertain, over strong and certain", () => {
    const blocks = Object.fromEntries(plan.items.map((i) => [i.dimensionId, i.blocks]));
    expect(blocks.visuospatial_memory).toBeGreaterThan(blocks.attention_inhibition);
    expect(blocks.attention_inhibition).toBeGreaterThan(blocks.working_memory);
    expect(plan.items[0].dimensionId).toBe("visuospatial_memory");
  });
  it("targets a harder level for a strong skill", () => {
    const wm = plan.items.find((i) => i.dimensionId === "working_memory")!;
    const att = plan.items.find((i) => i.dimensionId === "attention_inhibition")!;
    expect(wm.targetLevel).toBeGreaterThan(att.targetLevel);
  });
  it("explains every item", () => {
    expect(plan.items.find((i) => i.dimensionId === "visuospatial_memory")!.reason).toMatch(/Not measured yet/);
    expect(plan.rationale).toMatch(/12 blocks/);
  });
});

describe("weekStartOf", () => {
  it("returns the Monday of the week", () => {
    expect(weekStartOf(new Date("2026-10-26T12:00:00Z"))).toBe("2026-10-26"); // Monday
    expect(weekStartOf(new Date("2026-11-01T23:00:00Z"))).toBe("2026-10-26"); // Sunday
  });
});

describe("goals", () => {
  it("normal CDF", () => {
    expect(normalCdf(0)).toBeCloseTo(0.5, 6);
    expect(normalCdf(1.6449)).toBeCloseTo(0.95, 3);
  });
  it("score goal is achieved only when the whole band clears the target", () => {
    const g = { kind: "reach_score" as const, targetValue: 0.6 };
    const near = goalProgress(g, { posterior: post(0.62, 0.08), startValue: 0.5, sessionsLast7Days: 0 });
    expect(near.achieved).toBe(false);
    expect(near.probability).toBeGreaterThan(0.5);
    expect(near.fraction).toBe(1);
    expect(near.label).toMatch(/likely/);
    const sure = goalProgress(g, { posterior: post(0.75, 0.05), startValue: 0.5, sessionsLast7Days: 0 });
    expect(sure.achieved).toBe(true);
  });
  it("consistency goal counts sessions", () => {
    const p = goalProgress({ kind: "consistency", targetValue: 4 }, { sessionsLast7Days: 3 });
    expect(p).toMatchObject({ current: 3, fraction: 0.75, achieved: false });
  });
});
