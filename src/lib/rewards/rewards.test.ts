import { describe, expect, it } from "vitest";
import { BADGES, earnedBadges, gardenStalks, REWARD_AMOUNTS, streakBonus, streakWithFreeze, type BadgeFacts } from ".";

const DIMS = ["working_memory", "attention_inhibition", "processing_speed", "cognitive_flexibility", "visuospatial_memory", "reasoning", "ai_reliance"];
const none: BadgeFacts = { skillsPlayed: [], streak: 0, questionsAsked: 0, caughtErrors: 0, dailyDone: 0, goalsSet: 0, playedAfterTough: false };

describe("amounts", () => {
  it("match the spec", () => expect(REWARD_AMOUNTS).toEqual({ daily_visit: 5, game_completed: 10, daily_plan_done: 20, daily_challenge: 15, badge: 25 }));
  it("streak bonus is 5 per day, capped at 7 days", () => {
    expect(streakBonus(2)).toBe(10);
    expect(streakBonus(10)).toBe(35);
  });
  it("one stalk per 50 bamboo, at most 30", () => {
    expect(gardenStalks(49)).toBe(0);
    expect(gardenStalks(600)).toBe(12);
    expect(gardenStalks(1600)).toBe(30);
  });
});

describe("streakWithFreeze", () => {
  const today = new Date("2026-10-29T12:00:00Z"); // a Thursday
  it("counts consecutive days, with today's grace", () => {
    expect(streakWithFreeze(["2026-10-28", "2026-10-27", "2026-10-26"], today)).toEqual({ streak: 3, frozenDays: [] });
  });
  it("bridges one missed day after at least 3 active days in the week before", () => {
    const days = ["2026-10-29", "2026-10-27", "2026-10-26", "2026-10-25", "2026-10-24"];
    expect(streakWithFreeze(days, today)).toEqual({ streak: 5, frozenDays: ["2026-10-28"] });
  });
  it("does not bridge two missed days in a row", () => {
    expect(streakWithFreeze(["2026-10-29", "2026-10-26", "2026-10-25", "2026-10-24", "2026-10-23"], today).streak).toBe(1);
  });
  it("needs 3 active days before the gap", () => {
    expect(streakWithFreeze(["2026-10-29", "2026-10-27", "2026-10-26"], today).streak).toBe(1);
  });
  it("uses at most one freeze per ISO week", () => {
    // Gaps on Tue 27th and Thu 29th (same week): only the later one can be bridged.
    const t = new Date("2026-10-30T12:00:00Z");
    const days = ["2026-10-30", "2026-10-28", "2026-10-26", "2026-10-25", "2026-10-24", "2026-10-23"];
    const r = streakWithFreeze(days, t);
    expect(r.frozenDays).toEqual(["2026-10-29"]);
    expect(r.streak).toBe(2);
  });
});

describe("badges", () => {
  it("are about consistency and curiosity, with unique ids", () => {
    const ids = BADGES.map((b) => b.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual(expect.arrayContaining(["first_working_memory", "all_skills", "streak_3", "streak_7", "streak_14", "first_question", "caught_error", "daily_5", "first_goal", "kept_going"]));
  });
  it("nothing earned yet", () => expect(earnedBadges(none, DIMS)).toEqual([]));
  it("first game in a skill, and all seven", () => {
    expect(earnedBadges({ ...none, skillsPlayed: ["reasoning"] }, DIMS)).toEqual(["first_reasoning"]);
    expect(earnedBadges({ ...none, skillsPlayed: DIMS }, DIMS)).toContain("all_skills");
    expect(earnedBadges({ ...none, skillsPlayed: DIMS.slice(0, 6) }, DIMS)).not.toContain("all_skills");
  });
  it("streak, curiosity, daily, goal and persistence badges", () => {
    const f: BadgeFacts = { ...none, streak: 7, questionsAsked: 1, caughtErrors: 1, dailyDone: 5, goalsSet: 1, playedAfterTough: true };
    expect(earnedBadges(f, DIMS)).toEqual(expect.arrayContaining(["streak_3", "streak_7", "first_question", "caught_error", "daily_5", "first_goal", "kept_going"]));
    expect(earnedBadges(f, DIMS)).not.toContain("streak_14");
    expect(earnedBadges({ ...none, playedAfterTough: false }, DIMS)).not.toContain("kept_going");
  });
});
