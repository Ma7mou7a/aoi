import { describe, expect, it } from "vitest";
import { resolveActions, type RawAction } from "./actions";

const dims = [
  { id: "working_memory", name: "Working memory" },
  { id: "reasoning", name: "Reasoning" },
];

describe("resolveActions", () => {
  it("builds a play link", () => {
    expect(resolveActions([{ type: "play", skill: "working_memory", mode: "training" }], dims)).toEqual([
      { label: "▶ Play: Working memory", kind: "link", href: "/play?focus=working_memory&mode=training" },
    ]);
  });
  it("builds progress, goal and daily links", () => {
    const out = resolveActions([{ type: "show_progress", skill: "reasoning" }, { type: "set_goal", skill: "reasoning" }, { type: "daily_challenge" }], dims);
    expect(out.map((a) => a.href)).toEqual(["/dashboard#reasoning", "/dashboard#goals", "/daily"]);
    expect(resolveActions([{ type: "show_progress" }], dims)[0]).toEqual({ label: "Show my progress", kind: "link", href: "/dashboard" });
  });
  it("turns a forecast into an in-chat request", () => {
    expect(resolveActions([{ type: "forecast", skill: "reasoning", gamesPerWeek: 7 }], dims)).toEqual([
      { label: "What if I play 7×/week?", kind: "forecast", forecast: { skill: "reasoning", gamesPerWeek: 7 } },
    ]);
  });
  it("drops unknown skills, unknown types and bad paces", () => {
    const raw = [
      { type: "play", skill: "memroy", mode: "training" },
      { type: "teleport" },
      { type: "forecast", skill: "reasoning", gamesPerWeek: 5 },
      { type: "play", skill: "reasoning", mode: "sideways" },
    ] as unknown as RawAction[];
    expect(resolveActions(raw, dims)).toEqual([]);
  });
  it("caps at 3 and removes duplicates", () => {
    const raw: RawAction[] = [
      { type: "play", skill: "working_memory", mode: "training" },
      { type: "play", skill: "working_memory", mode: "training" },
      { type: "show_progress" },
      { type: "set_goal", skill: "reasoning" },
      { type: "daily_challenge" },
    ];
    const out = resolveActions(raw, dims);
    expect(out).toHaveLength(3);
    expect(new Set(out.map((a) => a.label)).size).toBe(3);
  });
  it("accepts an empty skill string as no skill where it is optional", () => {
    expect(resolveActions([{ type: "show_progress", skill: "" }], dims)[0].href).toBe("/dashboard");
  });
  it("returns nothing for nothing", () => expect(resolveActions([], dims)).toEqual([]));
});
