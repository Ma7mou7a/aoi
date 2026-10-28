import { describe, expect, it } from "vitest";
import type { ClientAction } from "./actions";
import { ensureForecast } from "./forecastGuard";

const pace = [
  { ref: "P1", skill: "working_memory", skillName: "Working memory", runRef: "R1", gamesPerWeek: 2 as const, fromPct: 48, toPct: 49, lowPct: 30, highPct: 66, perGamePct: 0.5 },
  { ref: "P2", skill: "working_memory", skillName: "Working memory", runRef: "R1", gamesPerWeek: 7 as const, fromPct: 48, toPct: 51, lowPct: 29, highPct: 67, perGamePct: 0.5 },
];
const dims = [{ id: "working_memory", name: "Working memory" }];

describe("ensureForecast", () => {
  it("adds the exact range when the reply has no numbers", () => {
    const out = ensureForecast({ content: "Practice helps. Let's see how it evolves!", actions: [] as ClientAction[] }, pace, { skill: "working_memory", pace: 7 }, dims);
    expect(out.content).toBe("Practice helps. Let's see how it evolves! If your recent trend continues at 7 games a week, your working memory score could be about 51 next week (likely 29–67). A range, not a promise.");
  });
  it("adds a play button and the other pace when the reply has no actions", () => {
    const out = ensureForecast({ content: "x", actions: [] as ClientAction[] }, pace, { skill: "working_memory", pace: 7 }, dims);
    expect(out.actions.map((a) => a.label)).toEqual(["▶ Play: Working memory", "What if I play 2×/week?"]);
  });
  it("leaves a reply that already gives the range alone", () => {
    const reply = { content: "At 7 a week you could reach about 51 (likely 29–67).", actions: [{ label: "x", kind: "link" as const, href: "/" }] };
    expect(ensureForecast(reply, pace, { skill: "working_memory", pace: 7 }, dims)).toEqual(reply);
  });
  it("does nothing without a matching forecast", () => {
    const reply = { content: "Need more games.", actions: [] as ClientAction[] };
    expect(ensureForecast(reply, [], { skill: "working_memory", pace: 7 }, dims)).toEqual(reply);
  });
});
