import { describe, expect, it } from "vitest";
import { loadDimensions } from "../dimensions/loader";
import { projectGrowth, SLOPE_PRIOR_SD } from "../profiler/projection";
import { simulateBlock } from "../sim";
import { levelOf } from ".";
import { computeMetrics } from "./metrics";

/** The shipped task params at level 2, so the test plays the real task. */
const paramsOf = (dimId: string) => {
  const task = loadDimensions().find((d) => d.id === dimId)!.tasks[0];
  return { ...task.params, ...levelOf(task, 2).params };
};

const slower = (factor: number) => (t: { rtMs: number | null }) => ({ ...t, rtMs: t.rtMs == null ? null : t.rtMs * factor });

describe("proportional costs (fairness to slower responders)", () => {
  it("leave the Stroop interference ratio unchanged when every response is 30% slower", () => {
    const trials = simulateBlock("stroop", paramsOf("attention_inhibition"), 0.5, 11);
    const a = computeMetrics("stroop", trials);
    const b = computeMetrics("stroop", trials.map(slower(1.3)) as typeof trials);
    expect(b.interference_cost_ms).toBeGreaterThan(a.interference_cost_ms); // raw ms penalises the slower person
    expect(b.interference_ratio).toBeCloseTo(a.interference_ratio, 10); // the ratio does not
  });

  it("leave the task-switching cost ratio unchanged under general slowing", () => {
    const trials = simulateBlock("task_switching", paramsOf("cognitive_flexibility"), 0.5, 12);
    const a = computeMetrics("task_switching", trials);
    const b = computeMetrics("task_switching", trials.map(slower(1.3)) as typeof trials);
    expect(b.switch_cost_ratio).toBeCloseTo(a.switch_cost_ratio, 10);
  });
});

describe("forecast slope shrinkage", () => {
  const day = (d: number) => new Date(Date.UTC(2026, 9, 1 + d));
  it("trusts a noisy short trend less than its raw fit", () => {
    // Raw trend ≈ +2 points/day, but the points are noisy and few.
    const history = [0, 1, 2, 3].map((d) => ({ at: day(d), mean: 0.4 + 0.02 * d + (d % 2 ? 0.03 : -0.03), sd: 0.12 }));
    const f = projectGrowth(history, { mean: 0.46, sd: 0.1 }, 7, 0.01, day(3))!;
    expect(f.slopePerWeek / 7).toBeLessThan(0.02);
    expect(f.slopePerWeek / 7).toBeGreaterThanOrEqual(0);
  });
  it("keeps a clear, precise trend", () => {
    const history = Array.from({ length: 10 }, (_, d) => ({ at: day(d * 3), mean: 0.3 + 0.004 * d * 3, sd: 0.03 }));
    const f = projectGrowth(history, { mean: 0.408, sd: 0.03 }, 7, 0.01, day(27))!;
    expect(f.slopePerWeek / 7).toBeGreaterThan(0.5 * SLOPE_PRIOR_SD);
  });
});
