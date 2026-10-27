import { describe, expect, it } from "vitest";
import { loadDimensions } from "../dimensions/loader";
import { priorFor, updatePosterior } from "../profiler";
import { createRng } from "../rng";
import { generateNBack, simulateNBackResponses } from "../tasks/nback";
import { applyClinicalGuard, finaliseDraft, numbersIn } from "./claims";
import { buildEvidencePack, type TrialRow } from "./evidence";
import { fallbackDraft } from "./fallback";
import { classifyIntent } from "./intent";
import { EMPTY_MEMORY, updateMemory } from "./memory";
import { NON_CLINICAL_NOTE } from "./safety";

const dims = loadDimensions();
const now = new Date("2026-10-26T10:00:00Z");
const priors = Object.fromEntries(dims.map((d) => [d.id, priorFor(d, now)]));
const empty = buildEvidencePack({ dimensions: dims, posteriors: priors, firstMeans: {}, runs: [], trials: [] });

const seq = generateNBack({ n: 2, stimulus_set: ["B", "C", "D", "F", "G", "H"], trials_per_block: 24, target_rate: 0.3, stimulus_ms: 500, isi_ms: 2000 }, 3);
const trials: TrialRow[] = simulateNBackResponses(seq, 2, 0.5, createRng(4)).map((t, i) => ({ id: `trial-${i}`, taskRunId: "run-1", trialIndex: t.trialIndex, isPractice: t.isPractice, stimulus: t.stimulus, response: t.response, outcome: t.outcome, correct: t.correct, rtMs: t.rtMs, behaviour: null }));
const posteriors = { ...priors, working_memory: updatePosterior(priors.working_memory, 0.6, 0.12, 24, now) };
const run = { id: "run-1", dimensionId: "working_memory", taskId: "n_back", difficultyLevel: 2, metrics: { d_prime: 1.8, accuracy: 0.8, n_targets: 7 }, composite: 0.6, validity: { valid: true, flags: [] }, startedAt: now };
const pack = buildEvidencePack({ dimensions: dims, posteriors, firstMeans: { working_memory: 0.5 }, runs: [run], trials });
const paced = buildEvidencePack({
  dimensions: dims,
  posteriors,
  firstMeans: { working_memory: 0.5 },
  runs: [run],
  trials,
  pace: ([2, 4, 7] as const).map((g) => ({ skill: "working_memory", gamesPerWeek: g, fromPct: 60, toPct: 60 + g, lowPct: 50, highPct: 70 + g, perGamePct: 1 })),
});

const ask = (text: string, p = pack, memory = EMPTY_MEMORY, seed = 1) => {
  const r = fallbackDraft({ ...classifyIntent(text), question: text }, p, memory, undefined, createRng(seed).next, dims);
  return { ...r, final: finaliseDraft(r.draft, p, [], r.context, dims) };
};
const hrefs = (f: ReturnType<typeof ask>["final"]) => f.actions.map((a) => a.href);

describe("fallbackDraft", () => {
  it("offers the memory game when asked to improve memory", () => {
    const { final } = ask("I want to improve my memory");
    expect(hrefs(final)).toContain("/play?focus=working_memory&mode=training");
    expect(final.content.length).toBeGreaterThan(0);
  });
  it("offers both visual games for visualisation", () => {
    const { final } = ask("visualisation");
    expect(hrefs(final)).toEqual(expect.arrayContaining(["/play?focus=visuospatial_memory&mode=training", "/play?focus=reasoning&mode=training"]));
  });
  it("a brand-new user asking for progress gets a warm reply, a Play button and no numbers", () => {
    const { final } = ask("how am I doing?", empty);
    expect(final.actions.some((a) => a.href?.startsWith("/play?"))).toBe(true);
    expect(numbersIn(final.content)).toEqual([]);
    expect(final.claims).toEqual([]);
  });
  it("a brand-new user asking for a forecast is told it needs 3 games", () => {
    const { final, lineIds } = ask("what if I play every day?", empty);
    expect(lineIds[0]).toMatch(/^need_more_games:/);
    expect(final.content).toContain("3");
    expect(final.actions.some((a) => a.href?.startsWith("/play?"))).toBe(true);
  });
  it("forecasts from the pace items and offers the other paces", () => {
    const { final } = ask("what if I play my memory game every day", paced);
    expect(final.claims).toHaveLength(1);
    expect(final.claims[0].claim).toMatch(/67%/);
    expect(final.actions.filter((a) => a.kind === "forecast").map((a) => a.forecast!.gamesPerWeek).sort()).toEqual([2, 4]);
    expect(final.dropped).toEqual([]);
  });
  it("never repeats its opening line for the same question", () => {
    const first = ask("hi", pack, EMPTY_MEMORY, 5);
    const memory = first.lineIds.reduce((m, id) => updateMemory(m, { type: "line", id }), EMPTY_MEMORY);
    const second = ask("hi", pack, memory, 5);
    expect(second.lineIds[0]).not.toBe(first.lineIds[0]);
  });
  it("debriefs with evidence that survives finalisation", () => {
    const { final } = ask("debrief my last game");
    expect(final.claims.length).toBeGreaterThan(0);
    expect(final.dropped).toEqual([]);
  });
  it("every intent produces a reply, actions and nothing dropped", () => {
    for (const q of ["hi", "help", "set a goal for memory", "what does false alarm mean", "show my progress", "let's play", "debrief my last game"]) {
      const { final } = ask(q);
      expect(final.content, q).not.toBe("");
      expect(final.actions.length, q).toBeGreaterThan(0);
      expect(final.dropped, q).toEqual([]);
    }
  });
  it("explains a known word in plain language", () => {
    expect(ask("what does false alarm mean").final.content).toMatch(/pressed/i);
  });
});

describe("applyClinicalGuard", () => {
  it("puts the non-clinical note first for a health question, on the template path too", () => {
    const { final } = ask("do I have ADHD?");
    const content = applyClinicalGuard("do I have ADHD?", final.content);
    expect(content.startsWith(NON_CLINICAL_NOTE)).toBe(true);
    expect(content).not.toMatch(/ADHD/);
  });
  it("leaves ordinary questions alone and never doubles the note", () => {
    expect(applyClinicalGuard("how am I doing?", "Fine.")).toBe("Fine.");
    expect(applyClinicalGuard("do I have ADHD?", `${NON_CLINICAL_NOTE} Fine.`)).toBe(`${NON_CLINICAL_NOTE} Fine.`);
    expect(applyClinicalGuard(undefined, "Fine.")).toBe("Fine.");
  });
});
