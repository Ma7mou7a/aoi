import { describe, expect, it } from "vitest";
import { dayStreak, milestones } from "./motivation";

describe("dayStreak", () => {
  const today = new Date("2026-10-26T15:00:00Z");
  it("counts consecutive days ending today", () => {
    expect(dayStreak(["2026-10-26", "2026-10-25", "2026-10-24", "2026-10-22"], today)).toBe(3);
  });
  it("is still alive when today has not been played yet", () => {
    expect(dayStreak(["2026-10-25", "2026-10-24"], today)).toBe(2);
  });
  it("is zero after a missed day", () => {
    expect(dayStreak(["2026-10-23"], today)).toBe(0);
  });
});

describe("milestones", () => {
  const base = { taskName: "N-back", level: 2, composite: 0.7, bestPreviousComposite: 0.6, skillName: "Working memory", newMean: 0.62, bestPreviousMean: 0.58, streak: 3, valid: true };
  it("celebrates real improvements only", () => {
    const m = milestones(base);
    expect(m).toHaveLength(3);
    expect(m[0]).toMatch(/personal best.*70%.*60%/);
    expect(m[1]).toMatch(/highest working memory estimate/);
  });
  it("no praise for no progress, first blocks, or unreliable blocks", () => {
    expect(milestones({ ...base, composite: 0.6, newMean: 0.58, streak: 2 })).toEqual([]);
    expect(milestones({ ...base, bestPreviousComposite: null, bestPreviousMean: null, streak: 1 })).toEqual([]);
    expect(milestones({ ...base, valid: false })).toEqual([]);
  });
});
