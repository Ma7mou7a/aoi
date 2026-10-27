import { describe, expect, it } from "vitest";
import { forecastAtPace, MIN_GAMES_FOR_PACE } from "./pace";

const series = (means: number[], sd = 0.06) => means.map((mean) => ({ mean, sd }));
const up = series([0.5, 0.53, 0.56, 0.6]);
const cur = { mean: 0.6, sd: 0.06 };

describe("forecastAtPace", () => {
  it("needs at least 3 games", () => {
    expect(MIN_GAMES_FOR_PACE).toBe(3);
    expect(forecastAtPace(up.slice(0, 2), cur, 4, 0.005)).toBeNull();
  });
  it("reports whole percentages starting from today's score", () => {
    const f = forecastAtPace(up, cur, 4, 0.005)!;
    expect(f.fromPct).toBe(60);
    expect(f.gamesPerWeek).toBe(4);
    for (const v of [f.fromPct, f.toPct, f.lowPct, f.highPct]) expect(Number.isInteger(v)).toBe(true);
    expect(f.lowPct).toBeLessThanOrEqual(f.toPct);
    expect(f.highPct).toBeGreaterThanOrEqual(f.toPct);
  });
  it("more games a week forecasts at least as high when the trend is up", () => {
    expect(forecastAtPace(up, cur, 7, 0.005)!.toPct).toBeGreaterThanOrEqual(forecastAtPace(up, cur, 2, 0.005)!.toPct);
    expect(forecastAtPace(up, cur, 7, 0.005)!.toPct).toBeGreaterThan(60);
  });
  it("shrinks a noisy trend toward no change", () => {
    const noisy = series([0.4, 0.7, 0.45, 0.72], 0.15);
    const f = forecastAtPace(noisy, { mean: 0.72, sd: 0.15 }, 7, 0.005)!;
    expect(Math.abs(f.toPct - 72)).toBeLessThanOrEqual(3);
  });
  it("the band widens with more games when the slope is uncertain", () => {
    const wobbly = series([0.5, 0.58, 0.52, 0.6], 0.08);
    const w2 = forecastAtPace(wobbly, { mean: 0.6, sd: 0.08 }, 2, 0.005)!;
    const w7 = forecastAtPace(wobbly, { mean: 0.6, sd: 0.08 }, 7, 0.005)!;
    expect(w7.highPct - w7.lowPct).toBeGreaterThanOrEqual(w2.highPct - w2.lowPct);
  });
  it("caps the gain per game", () => {
    const steep = series([0.2, 0.4, 0.6, 0.8], 0.02);
    expect(forecastAtPace(steep, { mean: 0.8, sd: 0.02 }, 7, 0.005)!.perGamePct).toBeLessThanOrEqual(1);
  });
  it("stays within 0–100", () => {
    const f = forecastAtPace(series([0.9, 0.95, 0.98, 0.99], 0.02), { mean: 0.99, sd: 0.02 }, 7, 0.005)!;
    expect(f.highPct).toBeLessThanOrEqual(100);
    expect(f.lowPct).toBeGreaterThanOrEqual(0);
  });
});
