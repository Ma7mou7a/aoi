import { describe, expect, it } from "vitest";
import { EMPTY_MEMORY, memoryToPrompt, shouldOfferBet, updateMemory, type CoachMemory } from "./memory";

const dims = [
  { id: "working_memory", name: "Working memory" },
  { id: "reasoning", name: "Reasoning" },
];

describe("updateMemory", () => {
  it("keeps the last 5 topics and line ids", () => {
    let m: CoachMemory = EMPTY_MEMORY;
    for (let i = 0; i < 8; i++) {
      m = updateMemory(m, { type: "question", intent: "chat" });
      m = updateMemory(m, { type: "line", id: `chat:${i}` });
    }
    expect(m.recentTopics).toHaveLength(5);
    expect(m.recentLineIds).toEqual(["chat:3", "chat:4", "chat:5", "chat:6", "chat:7"]);
  });
  it("records the skill with the topic", () => {
    const m = updateMemory(EMPTY_MEMORY, { type: "question", intent: "play", skill: "reasoning" });
    expect(m.recentTopics).toEqual(["play:reasoning"]);
  });
  it("favourite skill is the most played among the last 10 games", () => {
    let m: CoachMemory = EMPTY_MEMORY;
    for (const s of ["reasoning", "working_memory", "working_memory", "reasoning", "working_memory"]) m = updateMemory(m, { type: "played", skill: s });
    expect(m.favouriteSkill).toBe("working_memory");
    for (let i = 0; i < 10; i++) m = updateMemory(m, { type: "played", skill: "reasoning" });
    expect(m.recentPlays).toHaveLength(10);
    expect(m.favouriteSkill).toBe("reasoning");
  });
  it("counts debriefs since the last bet and resets on a bet", () => {
    let m = updateMemory(EMPTY_MEMORY, { type: "debrief", bet: false });
    m = updateMemory(m, { type: "debrief", bet: false });
    expect(m.debriefsSinceBet).toBe(2);
    expect(updateMemory(m, { type: "debrief", bet: true }).debriefsSinceBet).toBe(0);
  });
  it("remembers the AI question and the goal", () => {
    const m = updateMemory(updateMemory(EMPTY_MEMORY, { type: "ai_asked" }), { type: "goal", goal: "reasoning" });
    expect(m.aiAsked).toBe(true);
    expect(m.goal).toBe("reasoning");
  });
  it("does not mutate its input", () => {
    const before = structuredClone(EMPTY_MEMORY);
    updateMemory(EMPTY_MEMORY, { type: "line", id: "x:1" });
    expect(EMPTY_MEMORY).toEqual(before);
  });
});

describe("shouldOfferBet", () => {
  it("always in research mode", () => expect(shouldOfferBet(EMPTY_MEMORY, true)).toBe(true));
  it("otherwise at most every third debrief", () => {
    expect(shouldOfferBet({ ...EMPTY_MEMORY, debriefsSinceBet: 0 }, false)).toBe(false);
    expect(shouldOfferBet({ ...EMPTY_MEMORY, debriefsSinceBet: 1 }, false)).toBe(false);
    expect(shouldOfferBet({ ...EMPTY_MEMORY, debriefsSinceBet: 2 }, false)).toBe(true);
  });
});

describe("memoryToPrompt", () => {
  it("names skills by name, never ids or line ids", () => {
    const m: CoachMemory = { ...EMPTY_MEMORY, goal: "working_memory", favouriteSkill: "reasoning", recentTopics: ["play:reasoning"], recentLineIds: ["chat:2"] };
    const text = memoryToPrompt(m, dims);
    expect(text).toContain("Working memory");
    expect(text).toContain("Reasoning");
    expect(text).not.toMatch(/working_memory|chat:2/);
  });
  it("says 'just curious' for that goal and handles an empty memory", () => {
    expect(memoryToPrompt({ ...EMPTY_MEMORY, goal: "curious" }, dims)).toMatch(/just curious/);
    expect(memoryToPrompt(EMPTY_MEMORY, dims)).toMatch(/nothing yet/i);
  });
});
