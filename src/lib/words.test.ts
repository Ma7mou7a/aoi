import { describe, expect, it } from "vitest";
import { AVAILABLE_PARADIGMS } from "./tasks/registry";
import { gamesToSure, plainDid, sureText, WORDS } from "./words";

describe("WORDS", () => {
  it("maps the technical terms to plain ones", () => {
    expect(WORDS).toMatchObject({ estimate: "score", band: "how sure we are", block: "game", composite: "game score" });
  });
});

describe("sureText", () => {
  it("is honest when the range is wide", () => expect(sureText(40, 80)).toBe("We're still getting to know you."));
  it("gives the range when it is narrow enough", () => expect(sureText(55, 68)).toBe("We're fairly sure it's between 55 and 68."));
});

describe("gamesToSure", () => {
  it("is zero once sure enough", () => expect(gamesToSure(0.07, 0.2)).toBe(0));
  it("grows with uncertainty", () => {
    expect(gamesToSure(0.15, 0.2)).toBeGreaterThan(0);
    expect(gamesToSure(0.2, 0.2)).toBeGreaterThanOrEqual(gamesToSure(0.12, 0.2));
  });
  it("never says more than 10", () => expect(gamesToSure(0.5, 0.5, 0.01)).toBe(10));
});

describe("plainDid", () => {
  it("describes n-back without jargon", () => {
    const t = plainDid("n_back", { hit_rate: 0.78, false_alarm_rate: 0.1, d_prime: 1.9 });
    expect(t).toContain("78%");
    expect(t).not.toMatch(/d′|d'|composite|\brate\b/i);
  });
  it("leaves out a slow-down that rounds to nothing", () => {
    expect(plainDid("stroop", { accuracy: 1, interference_ratio: 0.003 })).not.toMatch(/slowed/);
    expect(plainDid("task_switching", { accuracy: 0.9, switch_cost_ratio: -0.02 })).not.toMatch(/slowed/);
    expect(plainDid("stroop", { accuracy: 1, interference_ratio: 0.12 })).toMatch(/about 12%/);
  });
  it("describes Corsi as a span of blocks", () => expect(plainDid("corsi", { span: 5 })).toMatch(/up to 5 blocks/));
  it("gives every paradigm a sentence, even with no metrics", () => {
    for (const p of AVAILABLE_PARADIGMS) {
      const t = plainDid(p, {});
      expect(t.length, p).toBeGreaterThan(10);
      expect(t, p).not.toMatch(/NaN|undefined/);
    }
  });
});
