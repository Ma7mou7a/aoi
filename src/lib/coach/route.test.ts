import { beforeEach, describe, expect, it, vi } from "vitest";
import { parseRoute, routerPrompt, ROUTE_MENU } from "./route";
import { INTENTS } from "./claims";

const SKILLS = ["working_memory", "attention_inhibition", "reasoning"];

describe("AI router: the choice must come from the fixed menu", () => {
  it("accepts a valid choice and keeps only what applies", () => {
    expect(parseRoute({ intent: "progress", skill: "working_memory", also_skill: null, pace: null }, SKILLS)).toEqual({ intent: "progress", skill: "working_memory" });
    expect(parseRoute({ intent: "forecast", skill: "reasoning", also_skill: null, pace: 7 }, SKILLS)).toEqual({ intent: "forecast", skill: "reasoning", pace: 7 });
    expect(parseRoute({ intent: "explain", skill: "working_memory", also_skill: "reasoning", pace: null }, SKILLS)).toEqual({ intent: "explain", skill: "working_memory", alsoSkill: "reasoning" });
  });

  it("drops a pace outside forecasts and a second skill without a first", () => {
    expect(parseRoute({ intent: "play", skill: null, also_skill: "reasoning", pace: 4 }, SKILLS)).toEqual({ intent: "play" });
  });

  it("rejects anything off the menu, so the keyword rules answer instead", () => {
    expect(parseRoute({ intent: "delete_account", skill: null }, SKILLS)).toBeNull();
    expect(parseRoute({ intent: "progress", skill: "iq" }, SKILLS)).toBeNull();
    expect(parseRoute("progress", SKILLS)).toBeNull();
    expect(parseRoute(null, SKILLS)).toBeNull();
  });

  it("puts every menu item and every skill id in the prompt", () => {
    const p = routerPrompt("am I getting sharper?", SKILLS.map((id) => ({ id, name: id })));
    for (const i of INTENTS) expect(p).toContain(`- ${i}: ${ROUTE_MENU[i]}`);
    for (const s of SKILLS) expect(p).toContain(`- ${s}:`);
    expect(p).toMatch(/am I getting sharper\?$/);
  });
});

const structured = vi.fn();
vi.mock("server-only", () => ({}));
vi.mock("./llm", () => ({ structuredWithLlm: (...a: unknown[]) => structured(...a) }));

describe("routeQuestion", () => {
  const skills = SKILLS.map((id) => ({ id, name: id }));
  beforeEach(() => structured.mockReset());

  it("uses the AI's choice when it is valid", async () => {
    const { routeQuestion } = await import("../server/router");
    structured.mockResolvedValue({ ok: true, data: { intent: "progress", skill: "working_memory" }, model: "test" });
    expect(await routeQuestion("am I any better at remembering stuff lately", skills)).toEqual({ intent: "progress", skill: "working_memory", routedBy: "ai" });
  });

  it("falls back to the keyword rules when the AI fails or is off", async () => {
    const { routeQuestion } = await import("../server/router");
    structured.mockResolvedValue({ ok: false, reason: "network" });
    const r = await routeQuestion("what if I play memory every day", skills);
    expect(r).toMatchObject({ intent: "forecast", skill: "working_memory", pace: 7, routedBy: "keywords" });
  });

  it("fills a forecast pace from the message when the AI leaves it out", async () => {
    const { routeQuestion } = await import("../server/router");
    structured.mockResolvedValue({ ok: true, data: { intent: "forecast", skill: "reasoning" }, model: "test" });
    expect(await routeQuestion("logic, if I keep going twice a week?", skills)).toEqual({ intent: "forecast", skill: "reasoning", pace: 2, routedBy: "ai" });
  });
});
