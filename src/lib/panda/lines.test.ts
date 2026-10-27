import { describe, expect, it } from "vitest";
import { filterClinical } from "../coach/safety";
import { createRng } from "../rng";
import { LINES, pickLine, type LineKey } from "./lines";

const keys = Object.keys(LINES) as LineKey[];
const fullCtx = { name: "Sam", skill: "working memory", streak: 4, games: 3, score: 61 };

describe("LINES", () => {
  it("every key has at least 6 variants", () => {
    for (const k of keys) expect(LINES[k].length, k).toBeGreaterThanOrEqual(6);
  });
  it("covers every coach intent and panda event", () => {
    for (const k of ["debrief", "play", "progress", "forecast", "goal", "explain", "chat", "help", "consent_ask", "consent_yes", "consent_no", "bet", "trial_correct", "trial_wrong", "block_start", "block_end", "milestone", "gift", "greeting", "sleep", "no_data", "need_more_games"]) {
      expect(keys).toContain(k);
    }
  });
  it("no line uses clinical terms", () => {
    for (const k of keys) for (const l of LINES[k]) expect(filterClinical(l).blocked, l).toBe(false);
  });
  it("no line promises a better brain", () => {
    for (const k of keys) for (const l of LINES[k]) expect(l, l).not.toMatch(/brain improvement|smarter|\bIQ\b|boost your brain/i);
  });
  it("consent lines say what is sent and that it can be changed", () => {
    for (const l of LINES.consent_ask) {
      expect(l).toMatch(/AI/);
      expect(l).toMatch(/never your name/i);
      expect(l).toMatch(/Settings/);
    }
  });
});

describe("pickLine", () => {
  it("never returns one of the last 5 ids", () => {
    const rng = createRng(7);
    const recent: string[] = [];
    for (let i = 0; i < 200; i++) {
      const { id } = pickLine("play", fullCtx, recent, rng.next);
      expect(recent.slice(-5)).not.toContain(id);
      recent.push(id);
    }
  });
  it("ids are key:index", () => expect(pickLine("gift", fullCtx, [], () => 0).id).toBe("gift:0"));
  it("fills slots", () => {
    const texts = LINES.greeting.map((_, i) => pickLine("greeting", fullCtx, [], () => i / LINES.greeting.length).text);
    expect(texts.join(" ")).toContain("Sam");
    for (const t of texts) expect(t).not.toContain("{");
  });
  it("skips variants whose slot is missing", () => {
    for (let i = 0; i < 50; i++) {
      const { text } = pickLine("greeting", { name: "Sam" }, [], createRng(i).next);
      expect(text).not.toContain("{");
    }
  });
  it("falls back to any filled variant when everything is recent", () => {
    const all = LINES.chat.map((_, i) => `chat:${i}`);
    expect(pickLine("chat", fullCtx, all, () => 0).text.length).toBeGreaterThan(0);
  });
});
