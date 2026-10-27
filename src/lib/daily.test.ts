import { describe, expect, it } from "vitest";
import { dailyChallenge, dailySeed, DAILY_ORDER, isDailyRun, shareText } from "./daily";
import { loadDimensions } from "./dimensions/loader";

const dims = loadDimensions();
const addDays = (day: string, n: number) => new Date(Date.parse(`${day}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

describe("dailySeed", () => {
  it("is the same all day and differs between days", () => {
    expect(dailySeed("2026-10-27")).toBe(dailySeed("2026-10-27"));
    expect(dailySeed("2026-10-27")).not.toBe(dailySeed("2026-10-28"));
    expect(dailySeed("2026-10-27")).toBeGreaterThanOrEqual(0);
    expect(dailySeed("2026-10-27")).toBeLessThan(2 ** 31);
  });
});

describe("dailyChallenge", () => {
  it("covers all 7 skills over 7 days", () => {
    const skills = new Set(Array.from({ length: 7 }, (_, i) => dailyChallenge(addDays("2026-10-27", i), dims).dimensionId));
    expect(skills).toEqual(new Set(DAILY_ORDER));
    expect(DAILY_ORDER).toHaveLength(7);
  });
  it("uses the skill's first task at its middle level, with the day's seed", () => {
    const c = dailyChallenge("2026-10-27", dims);
    const dim = dims.find((d) => d.id === c.dimensionId)!;
    const levels = dim.tasks[0].difficulty.levels.map((l) => l.level);
    expect(c.taskId).toBe(dim.tasks[0].id);
    expect(c.level).toBe(levels[Math.floor(levels.length / 2)]);
    expect(c.seed).toBe(dailySeed("2026-10-27"));
  });
});

describe("isDailyRun", () => {
  const c = dailyChallenge("2026-10-27", dims);
  it("is true only for today's skill and seed", () => {
    expect(isDailyRun({ dimensionId: c.dimensionId, params: { seed: c.seed } }, "2026-10-27", dims)).toBe(true);
    expect(isDailyRun({ dimensionId: c.dimensionId, params: { seed: c.seed + 1 } }, "2026-10-27", dims)).toBe(false);
    expect(isDailyRun({ dimensionId: "nope", params: { seed: c.seed } }, "2026-10-27", dims)).toBe(false);
    expect(isDailyRun({ dimensionId: c.dimensionId, params: { seed: c.seed } }, "2026-10-28", dims)).toBe(false);
  });
});

describe("shareText", () => {
  it("has the date, the game, exactly 5 squares and no personal data", () => {
    const t = shareText({ day: "2026-10-27", taskName: "Corsi blocks", score: 0.62, detail: "span 5" });
    expect(t).toMatch(/^Bao's daily · Oct 27 · Corsi blocks /);
    expect([...t.matchAll(/🟩|🟨|⬜/gu)]).toHaveLength(5);
    expect(t).toContain("span 5");
    expect(t).toMatch(/ai4brain$/);
  });
  it("fills squares by score", () => {
    expect(shareText({ day: "2026-10-27", taskName: "X", score: 1, detail: "" })).toContain("🟩🟩🟩🟩🟩");
    expect(shareText({ day: "2026-10-27", taskName: "X", score: 0, detail: "" })).toContain("⬜⬜⬜⬜⬜");
  });
});
