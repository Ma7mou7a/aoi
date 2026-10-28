import { describe, expect, it } from "vitest";
import { HUNT_ROUNDS, HUNT_TOPICS, PERSUADER_QUESTIONS, PERSUADER_ROUNDS, TECHNIQUES } from "./bank";
import { discernment, huntDelta, huntSummary, PERSUADER_SIGNAL, persuaderOutcome, wagerVerdict } from "./score";
import { SIGNALS } from "../collab/score";

describe("Resist the Persuader scoring", () => {
  it("classifies every round by whether the AI disagreed and who was right", () => {
    // answer 0: the truth is option 0.
    expect(persuaderOutcome({ initial: 0, final: 0, answer: 0, aiSide: 1 })).toBe("resisted");
    expect(persuaderOutcome({ initial: 0, final: 1, answer: 0, aiSide: 1 })).toBe("persuaded_wrong");
    expect(persuaderOutcome({ initial: 1, final: 0, answer: 0, aiSide: 0 })).toBe("updated_right");
    expect(persuaderOutcome({ initial: 1, final: 1, answer: 0, aiSide: 0 })).toBe("stuck_wrong");
    expect(persuaderOutcome({ initial: 0, final: 0, answer: 0, aiSide: 0 })).toBe("agreed");
  });

  it("counts only challenged rounds, so neither always-resist nor always-follow wins", () => {
    const challenged = [
      { initial: 0 as const, answer: 0 as const, aiSide: 1 as const }, // AI wrong
      { initial: 1 as const, answer: 0 as const, aiSide: 0 as const }, // AI right
    ];
    const alwaysResist = challenged.map((r) => ({ ...r, final: r.initial }));
    const alwaysFollow = challenged.map((r) => ({ ...r, final: r.aiSide }));
    const judge = challenged.map((r) => ({ ...r, final: r.answer }));
    expect(discernment(alwaysResist)).toBe(0.5);
    expect(discernment(alwaysFollow)).toBe(0.5);
    expect(discernment(judge)).toBe(1);
    expect(discernment([{ initial: 0, final: 0, answer: 0, aiSide: 0 }])).toBeNull();
  });

  it("maps every informative outcome to a real collaboration signal", () => {
    for (const s of Object.values(PERSUADER_SIGNAL)) expect(SIGNALS[s].component).toBe("critical_verification");
  });
});

describe("Fabrication Hunt scoring", () => {
  it("wins the wager when the fake is caught and loses it otherwise", () => {
    expect(huntDelta({ pick: 2, fake: 2, wager: 3 })).toBe(3);
    expect(huntDelta({ pick: 1, fake: 2, wager: 2 })).toBe(-2);
  });

  it("never lets tokens go below zero, and measures whether bets track hits", () => {
    const s = huntSummary([{ pick: 0, fake: 1, wager: 3 }, { pick: 0, fake: 2, wager: 3 }, { pick: 0, fake: 3, wager: 3 }], 6);
    expect(s.tokens).toBe(0);
    const calibrated = huntSummary([{ pick: 1, fake: 1, wager: 3 }, { pick: 0, fake: 2, wager: 1 }], 6);
    expect(calibrated).toMatchObject({ caught: 1, tokens: 8, wagerGap: 2 });
    expect(wagerVerdict(calibrated.wagerGap)).toMatch(/tracked/);
    expect(wagerVerdict(-1)).toMatch(/didn't track/);
    expect(wagerVerdict(null)).toMatch(/more rounds/);
  });
});

describe("AI Lab content bank", () => {
  it("has unique ids and enough items that one game never repeats", () => {
    const qIds = PERSUADER_QUESTIONS.map((q) => q.id);
    const tIds = HUNT_TOPICS.map((t) => t.id);
    expect(new Set(qIds).size).toBe(qIds.length);
    expect(new Set(tIds).size).toBe(tIds.length);
    expect(qIds.length).toBeGreaterThanOrEqual(PERSUADER_ROUNDS * 3);
    expect(tIds.length).toBeGreaterThanOrEqual(HUNT_ROUNDS * 3);
  });

  it("gives every question a fallback argument for both sides and an explanation", () => {
    for (const q of PERSUADER_QUESTIONS) {
      expect(q.options).toHaveLength(2);
      expect(q.fallback.every((f) => f.length > 40)).toBe(true);
      expect(q.why.length).toBeGreaterThan(20);
    }
  });

  it("keeps the fallback fabrication different from every true fact", () => {
    for (const t of HUNT_TOPICS) expect(t.facts).not.toContain(t.fallbackFake);
  });

  it("names a tell for every technique the AI may use", () => {
    for (const t of Object.values(TECHNIQUES)) expect(t.tell.length).toBeGreaterThan(10);
  });
});
