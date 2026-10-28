import { describe, expect, it } from "vitest";
import { loadDimensions } from "../dimensions/loader";
import { priorFor } from "../profiler";
import { buildEvidencePack } from "./evidence";
import { EMPTY_MEMORY } from "./memory";
import { buildCoachPrompt } from "./prompt";

const dims = loadDimensions();
const now = new Date("2026-10-27T10:00:00Z");
const pack = buildEvidencePack({ dimensions: dims, posteriors: Object.fromEntries(dims.map((d) => [d.id, priorFor(d, now)])), firstMeans: {}, runs: [], trials: [] });

describe("buildCoachPrompt", () => {
  const base = {
    pack,
    science: [],
    memory: { ...EMPTY_MEMORY, goal: "working_memory" },
    dims,
    intent: "chat" as const,
    nextNote: undefined,
    ask: "USER QUESTION\nHi, I'm Samira, how am I doing?",
  };

  it("never sends the user's display name, even when it appears in history or the question", () => {
    const prompt = buildCoachPrompt({
      ...base,
      userName: "Samira",
      history: [
        { role: "coach", content: "Hi Samira! Want to play?" },
        { role: "user", content: "samira here again" },
      ],
    });
    expect(prompt).not.toMatch(/samira/i);
    expect(prompt).toContain("Hi the user! Want to play?");
  });
  it("includes the memory, intent and conversation", () => {
    const prompt = buildCoachPrompt({ ...base, userName: "Sam", history: [{ role: "user", content: "hello" }], skill: "reasoning" });
    expect(prompt).toContain("ABOUT THE USER");
    expect(prompt).toContain("Working memory");
    expect(prompt).toMatch(/USER INTENT .*chat, skill id reasoning/);
    expect(prompt).toContain("user: hello");
  });
  it("does not redact a short or empty name everywhere", () => {
    const prompt = buildCoachPrompt({ ...base, userName: "", history: [] });
    expect(prompt).toContain("USER QUESTION");
  });
});
