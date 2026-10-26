import { describe, expect, it } from "vitest";
import { loadDimensions } from "../dimensions/loader";
import { priorFor, updatePosterior } from "../profiler";
import { createRng } from "../rng";
import { generateNBack, simulateNBackResponses } from "../tasks/nback";
import { finaliseDraft, ruleBasedDraft } from "./claims";
import { buildEvidencePack, packToPrompt, type TrialRow } from "./evidence";
import { filterClinical } from "./safety";

describe("clinical filter", () => {
  it("blocks diagnostic language", () => {
    for (const s of ["This could indicate ADHD.", "Signs of early dementia", "a possible attention-deficit pattern", "You may have a learning disability", "your IQ is high"]) {
      expect(filterClinical(s).blocked).toBe(true);
    }
  });
  it("rewrites medical-sounding words to plain language", () => {
    const r = filterClinical("A mild impairment and a memory deficit are symptoms of tiredness.");
    expect(r.blocked).toBe(false);
    expect(r.text).toBe("A mild difficulty and a memory gap are signs of tiredness.");
    expect(r.hits).toEqual(["impairment", "deficit", "symptoms"]);
  });
  it("leaves normal coaching untouched", () => {
    const s = "You caught 6 of 7 matches; try staying with 2-back a little longer.";
    expect(filterClinical(s)).toEqual({ text: s, blocked: false, hits: [] });
  });
  it("does not trip on words that merely contain a term", () => {
    expect(filterClinical("Add one more block, then rest.").blocked).toBe(false);
  });
});

// A realistic pack: one simulated 2-back block.
const dims = loadDimensions();
const seq = generateNBack({ n: 2, stimulus_set: ["B", "C", "D", "F", "G", "H"], trials_per_block: 24, target_rate: 0.3, stimulus_ms: 500, isi_ms: 2000 }, 3);
const sim = simulateNBackResponses(seq, 2, 0.5, createRng(4));
const trials: TrialRow[] = sim.map((t, i) => ({ id: `trial-${i}`, taskRunId: "run-1", trialIndex: t.trialIndex, isPractice: t.isPractice, stimulus: t.stimulus, response: t.response, outcome: t.outcome, correct: t.correct, rtMs: t.rtMs, behaviour: null }));
const now = new Date("2026-10-26T10:00:00Z");
const posteriors = Object.fromEntries(dims.map((d) => [d.id, priorFor(d, now)]));
posteriors.working_memory = updatePosterior(posteriors.working_memory, 0.6, 0.12, 24, now);
const pack = buildEvidencePack({
  dimensions: dims,
  posteriors,
  firstMeans: { working_memory: 0.5 },
  runs: [{ id: "run-1", dimensionId: "working_memory", taskId: "n_back", difficultyLevel: 2, metrics: { d_prime: 1.8, accuracy: 0.8, n_targets: 7 }, composite: 0.6, validity: { valid: true, flags: [] }, startedAt: now }],
  trials,
});

describe("evidence pack", () => {
  it("references blocks and groups trials into facts", () => {
    expect(pack.runs.map((r) => r.ref)).toEqual(["R1"]);
    const caught = pack.facts.find((f) => f.label === "matches you caught")!;
    const missed = pack.facts.find((f) => f.label === "matches you missed");
    expect(caught.count + (missed?.count ?? 0)).toBe(seq.filter((s) => s.isTarget).length);
    expect(caught.trialIds.every((id) => id.startsWith("trial-"))).toBe(true);
  });
  it("prompt text carries references but no database ids", () => {
    const text = packToPrompt(pack);
    expect(text).toContain("R1:");
    expect(text).toContain("Working memory: estimate");
    expect(text).not.toContain("run-1");
    expect(text).not.toContain("trial-");
  });
});

describe("finaliseDraft", () => {
  const factRef = pack.facts[0].ref;
  it("maps references to ids and drops unsupported or clinical claims", () => {
    const out = finaliseDraft(
      {
        summary: "Good session!",
        claims: [
          { text: "You tracked letters well.", why: "High catch rate.", evidence: ["R1", factRef] },
          { text: "Made up claim.", why: "No evidence.", evidence: ["R9", "T99"] },
          { text: "This suggests ADHD.", why: "Errors.", evidence: ["R1"] },
        ],
        next_step: "Try 3-back next.",
      },
      pack,
    );
    expect(out.claims).toHaveLength(1);
    expect(out.claims[0].evidenceTaskRunIds).toEqual(["run-1"]);
    expect(out.claims[0].evidenceTrialIds.length).toBe(pack.facts[0].count);
    expect(out.dropped.map((d) => d.reason)).toEqual(["no_valid_evidence", "clinical_language"]);
    expect(out.filteredTerms).toContain("ADHD");
  });
  it("replaces a diagnosing summary with the non-clinical note", () => {
    const out = finaliseDraft({ summary: "You might have dyslexia.", claims: [], next_step: "" }, pack);
    expect(out.content).toMatch(/not a medical test/);
  });
});

describe("rule-based coach", () => {
  it("produces evidence-backed claims that survive finalisation", () => {
    const out = finaliseDraft(ruleBasedDraft(pack), pack);
    expect(out.claims.length).toBeGreaterThan(0);
    for (const c of out.claims) expect(c.evidenceTaskRunIds.length).toBeGreaterThan(0);
  });
  it("asks for a first assessment when nothing is measured", () => {
    const empty = buildEvidencePack({ dimensions: dims, posteriors: Object.fromEntries(dims.map((d) => [d.id, priorFor(d, now)])), firstMeans: {}, runs: [], trials: [] });
    expect(ruleBasedDraft(empty).claims).toEqual([]);
  });
});
