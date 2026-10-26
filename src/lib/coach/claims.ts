import { z } from "zod";
import type { EvidencePack } from "./evidence";
import { filterClinical, NON_CLINICAL_NOTE } from "./safety";
import type { ScienceRef } from "./science";

/** What the model (or the rule engine) produces: claims cite pack references, never raw ids. */
export const coachDraftSchema = z.object({
  summary: z.string(),
  claims: z.array(z.object({ text: z.string(), why: z.string(), evidence: z.array(z.string()), science: z.array(z.string()).default([]) })),
  next_step: z.string(),
});
// Input type: `science` may be omitted (older drafts, tests); finaliseDraft treats it as empty.
export type CoachDraft = z.input<typeof coachDraftSchema>;

/** Same shape as JSON Schema for structured outputs (objects closed, all fields required). */
export const COACH_JSON_SCHEMA = {
  type: "object",
  properties: {
    summary: { type: "string", description: "1-2 warm sentences answering the user or summarising the latest session." },
    claims: {
      type: "array",
      description: "2-4 specific observations, each backed by evidence references.",
      items: {
        type: "object",
        properties: {
          text: { type: "string", description: "The observation, in plain second-person language." },
          why: { type: "string", description: "How the cited numbers support it." },
          evidence: { type: "array", items: { type: "string" }, description: "References such as R1 or T3 from the evidence pack. At least one is required." },
          science: { type: "array", items: { type: "string" }, description: "Science card references such as S2 that explain the observation or what tends to help. May be empty." },
        },
        required: ["text", "why", "evidence", "science"],
        additionalProperties: false,
      },
    },
    next_step: { type: "string", description: "One concrete, encouraging suggestion for what to do next." },
  },
  required: ["summary", "claims", "next_step"],
  additionalProperties: false,
} as const;

export type FinalClaim = {
  claim: string;
  why: string;
  evidenceTaskRunIds: string[];
  evidenceTrialIds: string[];
  evidenceLabels: string[];
  /** Published findings cited next to the user's evidence (never on their own). */
  science: Array<Pick<ScienceRef, "id" | "title" | "finding" | "citation" | "url">>;
};

export type FinalMessage = {
  content: string;
  nextStep: string;
  claims: FinalClaim[];
  filteredTerms: string[];
  /** Claims removed because they cited nothing valid or used diagnostic language. */
  dropped: Array<{ text: string; reason: "no_valid_evidence" | "clinical_language" }>;
  /** S# references the model cited that were not in the science pack (ignored). */
  unknownScience: string[];
};

/** Remove reference codes the model leaked into user-facing text, e.g. "(S6)" or "(R2, T3)". */
export const stripRefs = (s: string) => s.replace(/\s*\((?:[RTS]\d+[,;\s]*(?:and\s+)?)+\)/g, "").replace(/\s{2,}/g, " ").trim();

/**
 * Turn a draft into what we store and show: resolve references to database ids, drop claims
 * without valid evidence (no unsupported statements), and run every text through the clinical filter.
 * Science references (S#) are resolved too, but they never count as evidence: "science explains,
 * your data decides", so a claim that cites only science is dropped like any unsupported claim.
 */
export function finaliseDraft(draft: CoachDraft, pack: EvidencePack, science: ScienceRef[] = []): FinalMessage {
  const runByRef = new Map(pack.runs.map((r) => [r.ref, r]));
  const factByRef = new Map(pack.facts.map((f) => [f.ref, f]));
  const sciByRef = new Map(science.map((s) => [s.ref, s]));
  const filteredTerms: string[] = [];
  const dropped: FinalMessage["dropped"] = [];
  const unknownScience: string[] = [];

  const clean = (s: string) => {
    const r = filterClinical(stripRefs(s));
    filteredTerms.push(...r.hits);
    return r;
  };

  const claims: FinalClaim[] = [];
  for (const c of draft.claims) {
    const runIds = new Set<string>();
    const trialIds = new Set<string>();
    const labels: string[] = [];
    const sci = new Map<string, ScienceRef>();
    // Models sometimes put S# in the evidence list: accept it there too, as science.
    for (const ref of [...c.evidence, ...(c.science ?? [])].map((e) => e.trim().toUpperCase()).filter((e) => e.startsWith("S"))) {
      const card = sciByRef.get(ref);
      if (card) sci.set(card.id, card);
      else unknownScience.push(ref);
    }
    for (const ref of c.evidence.map((e) => e.trim().toUpperCase())) {
      const run = runByRef.get(ref);
      const fact = factByRef.get(ref);
      if (run) {
        runIds.add(run.runId);
        labels.push(`${run.task}, level ${run.level} (${run.when})`);
      } else if (fact) {
        const parent = runByRef.get(fact.runRef);
        if (parent) runIds.add(parent.runId);
        fact.trialIds.forEach((id) => trialIds.add(id));
        labels.push(`${fact.count} ${fact.label}`);
      }
    }
    if (!runIds.size) {
      dropped.push({ text: c.text, reason: "no_valid_evidence" });
      continue;
    }
    const text = clean(c.text);
    const why = clean(c.why);
    if (text.blocked || why.blocked) {
      dropped.push({ text: c.text, reason: "clinical_language" });
      continue;
    }
    claims.push({
      claim: text.text,
      why: why.text,
      evidenceTaskRunIds: [...runIds],
      evidenceTrialIds: [...trialIds],
      evidenceLabels: labels,
      science: [...sci.values()].map(({ id, title, finding, citation, url }) => ({ id, title, finding, citation, url })),
    });
  }

  const summary = clean(draft.summary);
  const next = clean(draft.next_step);
  const content = summary.blocked ? NON_CLINICAL_NOTE : summary.text;
  return { content, nextStep: next.blocked ? "" : next.text, claims, filteredTerms, dropped, unknownScience };
}

/** Deterministic coach used when AI coaching is off (no consent / no API access) or the call fails. */
export function ruleBasedDraft(pack: EvidencePack, nextNote?: string, science: ScienceRef[] = []): CoachDraft {
  const sci = (...ids: string[]) => science.filter((s) => ids.includes(s.id)).map((s) => s.ref);
  const measured = pack.skills.filter((s) => s.measured);
  if (!measured.length || !pack.runs.length) {
    return { summary: "Play your first assessment and I'll explain what your results show.", claims: [], next_step: nextNote ?? "Start an assessment from the home page." };
  }
  const latestRunFor = (skillName: string) => pack.runs.find((r) => r.skill === skillName);
  const factsFor = (runRef: string) => pack.facts.filter((f) => f.runRef === runRef);
  const claims: CoachDraft["claims"] = [];

  const sorted = [...measured].sort((a, b) => b.estimatePct - a.estimatePct);
  const top = sorted[0];
  const topRun = latestRunFor(top.name);
  if (topRun) {
    const good = factsFor(topRun.ref).find((f) => /caught|longest/.test(f.label));
    claims.push({
      text: `${top.name} is your strongest area so far, at about ${top.estimatePct}%.`,
      why: `Your latest ${topRun.task} block at level ${topRun.level} scored ${topRun.blockScorePct}%. The band ${top.bandPct[0]}–${top.bandPct[1]}% shows how sure we are.`,
      evidence: [topRun.ref, ...(good ? [good.ref] : [])],
      science: [],
    });
  }

  const low = sorted.at(-1)!;
  const lowRun = latestRunFor(low.name);
  if (lowRun && low !== top) {
    const misses = factsFor(lowRun.ref).find((f) => /missed|errors|didn't|false alarms/.test(f.label));
    // Within a few points the bands overlap heavily: don't call one skill weaker than the other.
    const close = top.estimatePct - low.estimatePct < 5;
    claims.push({
      text: close
        ? `${low.name} is close behind (about ${low.estimatePct}%). With bands this wide, the two can't be told apart yet.`
        : `${low.name} has the most room to grow right now (about ${low.estimatePct}%).`,
      why: misses ? `In your latest ${lowRun.task} block there were ${misses.count} ${misses.label}.` : `Your latest ${lowRun.task} block scored ${lowRun.blockScorePct}%.`,
      evidence: [lowRun.ref, ...(misses ? [misses.ref] : [])],
      // Switch and interference costs are noisy block to block: say so where it applies.
      science: /flexib|attention/i.test(low.name) ? sci("noisy_difference_scores") : [],
    });
  }

  const grown = measured.find((s) => s.changePct != null && s.changePct > 0 && s.blocks >= 3);
  const grownRun = grown && latestRunFor(grown.name);
  if (grown && grownRun && claims.length < 3) {
    const practice = sci("practice_effects");
    claims.push({
      text: `Your ${grown.name.toLowerCase()} estimate is up ${grown.changePct} points since your first block.`,
      why: practice.length
        ? `That's across ${grown.blocks} blocks. Part of early gains usually comes from getting used to the task itself, so the trend over the next sessions will tell you more.`
        : `That's across ${grown.blocks} blocks.`,
      evidence: [grownRun.ref],
      science: practice,
    });
  }

  const shaky = pack.runs.find((r) => !r.reliable);
  if (shaky) {
    claims.push({
      text: `One ${shaky.task} block counted less than usual.`,
      why: `It was flagged for: ${shaky.reliabilityNotes.join(", ").replaceAll("_", " ")}. A rested, focused session gives a fairer picture.`,
      evidence: [shaky.ref],
      science: sci("attention_lapses", "web_testing").slice(0, 1),
    });
  }

  const wide = [...measured].sort((a, b) => b.bandPct[1] - b.bandPct[0] - (a.bandPct[1] - a.bandPct[0]))[0];
  return {
    summary: `Nice work: ${measured.length} skill${measured.length > 1 ? "s" : ""} measured so far. Here's what your results show.`,
    claims,
    next_step: nextNote ?? `Another ${wide.name.toLowerCase()} block would narrow its band the most.`,
  };
}
