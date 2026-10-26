import { describe, expect, it } from "vitest";
import { checkForecast, MAX_SLOPE_PER_DAY, projectGrowth, type SnapshotPoint } from "./projection";

const day = (d: number) => new Date(Date.UTC(2026, 9, 1 + d));
const pts = (means: number[], sd = 0.08): SnapshotPoint[] => means.map((m, i) => ({ at: day(i * 2), mean: m, sd }));

describe("projectGrowth", () => {
  it("needs enough history", () => {
    expect(projectGrowth(pts([0.5, 0.52]), { mean: 0.52, sd: 0.08 }, 14, 0.03)).toBeNull();
    expect(projectGrowth([{ at: day(0), mean: 0.5, sd: 0.1 }, { at: day(0), mean: 0.5, sd: 0.1 }, { at: day(1), mean: 0.5, sd: 0.1 }], { mean: 0.5, sd: 0.1 }, 14, 0.03)).toBeNull();
  });
  it("extends an upward trend from the current estimate", () => {
    // +1 point every 2 days = 0.005/day (under the cap) → +3.5 points/week.
    const p = projectGrowth(pts([0.4, 0.41, 0.42, 0.43, 0.44]), { mean: 0.44, sd: 0.06 }, 14, 0.03)!;
    expect(p.slopePerWeek).toBeCloseTo(0.035, 3);
    expect(p.mean).toBeCloseTo(0.51, 3);
    expect(p.ciLow).toBeLessThan(p.mean);
    expect(p.ciHigh).toBeGreaterThan(p.mean);
  });
  it("band widens with the horizon", () => {
    const h = pts([0.4, 0.45, 0.43, 0.5, 0.52]);
    const near = projectGrowth(h, { mean: 0.52, sd: 0.06 }, 7, 0.03)!;
    const far = projectGrowth(h, { mean: 0.52, sd: 0.06 }, 28, 0.03)!;
    expect(far.ciHigh - far.ciLow).toBeGreaterThan(near.ciHigh - near.ciLow);
  });
  it("caps implausibly fast growth and stays in 0..1", () => {
    const p = projectGrowth(pts([0.1, 0.4, 0.7, 0.9]), { mean: 0.9, sd: 0.05 }, 28, 0.03)!;
    expect(p.slopePerWeek).toBeCloseTo(MAX_SLOPE_PER_DAY * 7, 6);
    expect(p.mean).toBeLessThanOrEqual(1);
    expect(p.ciHigh).toBeLessThanOrEqual(1);
  });
  it("checks a forecast against what happened", () => {
    expect(checkForecast({ ciLow: 0.5, ciHigh: 0.7 }, 0.62)).toBe(true);
    expect(checkForecast({ ciLow: 0.5, ciHigh: 0.7 }, 0.75)).toBe(false);
  });
});
