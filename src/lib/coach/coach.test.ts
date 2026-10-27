import { describe, expect, it } from "vitest";
import { loadDimensions } from "../dimensions/loader";
import { priorFor, updatePosterior } from "../profiler";
import { createRng } from "../rng";
import { generateNBack, simulateNBackResponses } from "../tasks/nback";
import { finaliseDraft, numbersIn, ruleBasedDraft, stripRefs, unverifiedNumbers } from "./claims";
import { buildEvidencePack, packToPrompt, type TrialRow } from "./evidence";
import { filterClinical } from "./safety";
import { loadScience, MAX_SCIENCE_CARDS, scienceToPrompt, selectScience } from "./science";

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
  it("removes sentences that compare the user with norms or other people", () => {
    const r = filterClinical("Your interference cost was 220 ms. That is typical for this skill level.");
    expect(r.text).toBe("Your interference cost was 220 ms.");
    expect(r.blocked).toBe(false);
    expect(r.hits.join()).toMatch(/norm/);
    expect(filterClinical("You are above average for your age.").blocked).toBe(true);
    expect(filterClinical("Your best block this week, well above your average.").blocked).toBe(false);
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

describe("science cards", () => {
  const cards = loadScience();
  it("load, validate and cite real skills", () => {
    expect(cards.length).toBeGreaterThanOrEqual(10);
    const skillIds = new Set(dims.map((d) => d.id));
    for (const c of cards) for (const s of c.applies_to) expect(s === "all" || skillIds.has(s)).toBe(true);
  });
  it("are selected for what the user has measured, numbered S1…", () => {
    const refs = selectScience(pack);
    expect(refs.length).toBeGreaterThan(0);
    expect(refs.length).toBeLessThanOrEqual(MAX_SCIENCE_CARDS);
    expect(refs.map((r) => r.ref)).toEqual(refs.map((_, i) => `S${i + 1}`));
    // Strategy cards only for skills actually played: chunking applies to working memory (played), not Stroop focus.
    expect(refs.some((r) => r.id === "chunking")).toBe(true);
    expect(refs.some((r) => r.id === "stroop_focus")).toBe(false);
    expect(scienceToPrompt(refs)).toContain("S1 (");
  });
  it("offer the automation-bias card only when the user asks about the AI", () => {
    expect(selectScience(pack).some((r) => r.id === "automation_bias")).toBe(false);
    expect(selectScience(pack, "Should I trust the coach's claims?").some((r) => r.id === "automation_bias")).toBe(true);
  });
  it("support claims but never replace the user's own evidence", () => {
    const science = selectScience(pack);
    const out = finaliseDraft(
      {
        summary: "Nice session.",
        claims: [
          { text: "You caught most matches.", why: "Chunking helps.", evidence: ["R1"], science: ["S1", "S99"] },
          { text: "Practice makes perfect.", why: "Research says so.", evidence: ["S2"], science: [] },
        ],
        next_step: "",
      },
      pack,
      science,
    );
    expect(out.claims).toHaveLength(1);
    expect(out.claims[0].science.map((s) => s.id)).toEqual([science[0].id]);
    expect(out.claims[0].science[0].url).toMatch(/^https:\/\//);
    expect(out.dropped).toEqual([{ text: "Practice makes perfect.", reason: "no_valid_evidence" }]);
    expect(out.unknownScience).toEqual(["S99"]);
  });
  it("findings themselves pass the clinical and norm filter", () => {
    for (const c of cards) expect(filterClinical(c.finding).blocked).toBe(false);
  });
});

describe("reference codes in text", () => {
  it("are stripped from what the user reads", () => {
    expect(stripRefs("Research (S6) says single blocks are noisy (R2, T3).")).toBe("Research says single blocks are noisy.");
    expect(stripRefs("Rows R and T stay put.")).toBe("Rows R and T stay put.");
    expect(stripRefs("Blocks R2 and R4 scored 67% and 66%. W4 shows that one fewer error helps.")).toBe("Those blocks scored 67% and 66%. The recalculation shows that one fewer error helps.");
  });
});

describe("number check", () => {
  it("reads numbers but not reference codes", () => {
    expect(numbersIn("You caught 5 of 7 matches (+16 points, 1,200 trials, d′ 1.8) in T3.")).toEqual([5, 7, 16, 1200, 1.8]);
  });
  it("accepts evidence numbers within rounding and differences of verified numbers", () => {
    expect(unverifiedNumbers("Your score went from 60% to 68%, +8 points.", [60, 68])).toEqual([]);
    expect(unverifiedNumbers("About 66.6% of matches.", [67])).toEqual([]);
    expect(unverifiedNumbers("You caught 9 of 7 matches.", [5, 7])).toEqual([9]);
    expect(unverifiedNumbers("You made zero errors after a switch.", [3, 2])).toEqual([0]);
  });
  it("drops a claim whose numbers don't match the evidence, keeps the honest one", () => {
    const caught = pack.facts.find((f) => f.label === "matches you caught")!;
    const out = finaliseDraft(
      {
        summary: "Good session. You beat 95% of your blocks.",
        claims: [
          { text: `You caught ${caught.count} matches.`, why: "Straight from the block.", evidence: ["R1", caught.ref] },
          { text: `You caught ${caught.count + 4} matches.`, why: "Invented.", evidence: ["R1", caught.ref] },
        ],
        next_step: "",
      },
      pack,
    );
    expect(out.claims.map((c) => c.claim)).toEqual([`You caught ${caught.count} matches.`]);
    expect(out.dropped).toEqual([{ text: `You caught ${caught.count + 4} matches.`, reason: "unverified_number", numbers: [caught.count + 4] }]);
    expect(out.content).toBe("Good session.");
  });
});

describe("what it would take", () => {
  it("are exact recalculations that the coach can cite", () => {
    expect(pack.whatIf.length).toBeGreaterThan(0);
    for (const w of pack.whatIf) expect(w.toPct).toBeGreaterThan(w.fromPct);
    const w = pack.whatIf[0];
    const out = finaliseDraft(
      { summary: "", claims: [{ text: `${w.label} would have made it ${w.toPct}%.`, why: `It was ${w.fromPct}%.`, evidence: [w.ref] }], next_step: "" },
      pack,
    );
    expect(out.claims).toHaveLength(1);
    expect(out.claims[0].evidenceTaskRunIds).toEqual(["run-1"]);
  });
});
