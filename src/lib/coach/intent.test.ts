import { describe, expect, it } from "vitest";
import { classifyIntent, parsePace } from "./intent";

describe("classifyIntent", () => {
  it.each([
    // play, by skill word
    ["I want to improve my memory", "play", "working_memory"],
    ["let's play something", "play", undefined],
    ["can I train my focus?", "play", "attention_inhibition"],
    ["visualisation", "play", "visuospatial_memory"],
    ["I want to work on visualization", "play", "visuospatial_memory"],
    ["give me a spatial memory game", "play", "visuospatial_memory"],
    ["I'd like to remember things better", "play", "working_memory"],
    ["practice my concentration", "play", "attention_inhibition"],
    ["I want to be faster", "play", "processing_speed"],
    ["a quick speed game please", "play", "processing_speed"],
    ["help me multitask", "play", "cognitive_flexibility"],
    ["train switching between rules", "play", "cognitive_flexibility"],
    ["I love logic puzzles", "play", "reasoning"],
    ["improve my reasoning", "play", "reasoning"],
    ["can I practise trusting AI", "play", "ai_reliance"],
    ["start a game", "play", undefined],
    ["memroy game pls", "play", "working_memory"],
    ["attenton training", "play", "attention_inhibition"],
    // progress
    ["how am I doing?", "progress", undefined],
    ["show my progress in speed", "progress", "processing_speed"],
    ["what are my stats", "progress", undefined],
    ["how is my memory doing", "progress", "working_memory"],
    // forecast
    ["what if I play every day", "forecast", undefined],
    ["if I keep going will my reasoning get better", "forecast", "reasoning"],
    ["where will I be next week if I play 3 times a week", "forecast", undefined],
    ["what's my pace forecast for focus", "forecast", "attention_inhibition"],
    // goal
    ["set a goal for memory", "goal", "working_memory"],
    ["I want a target for speed", "goal", "processing_speed"],
    // explain
    ["what does false alarm mean", "explain", undefined],
    ["why is my band so wide", "explain", undefined],
    ["what does how sure we are mean", "explain", undefined],
    // debrief
    ["debrief my last game", "debrief", undefined],
    ["explain my last game", "debrief", undefined],
    ["how did I do", "debrief", undefined],
    ["tell me about my last session", "debrief", undefined],
    // chat / help
    ["hi", "chat", undefined],
    ["hello Bao!", "chat", undefined],
    ["thanks", "chat", undefined],
    ["what can you do", "help", undefined],
    ["help", "help", undefined],
  ])("%s → %s / %s", (text, intent, skill) => {
    const r = classifyIntent(text);
    expect(r.intent).toBe(intent);
    expect(r.skill).toBe(skill);
  });

  it("visualisation also suggests reasoning", () => expect(classifyIntent("visualisation").alsoSkill).toBe("reasoning"));
  it("carries the pace on a forecast", () => expect(classifyIntent("what if I play every day").pace).toBe(7));
});

describe("parsePace", () => {
  it("parses everyday phrasings", () => {
    expect(parsePace("every day")).toBe(7);
    expect(parsePace("daily")).toBe(7);
    expect(parsePace("3 times a week")).toBe(4);
    expect(parsePace("5 times a week")).toBe(4);
    expect(parsePace("6 games a week")).toBe(7);
    expect(parsePace("twice a week")).toBe(2);
    expect(parsePace("once a week")).toBe(2);
    expect(parsePace("hello")).toBeUndefined();
  });
});
