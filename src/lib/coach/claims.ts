import { z } from "zod";
import type { EvidencePack } from "./evidence";
import { filterClinical, NON_CLINICAL_NOTE } from "./safety";

/** What the model (or the rule engine) produces: claims cite pack references, never raw ids. */
export const coachDraftSchema = z.object({
  summary: z.string(),
  claims: z.array(z.object({ text: z.string(), why: z.string(), evidence: z.array(z.string()) })),
  next_step: z.string(),
});
export type CoachDraft = z.infer<typeof coachDraftSchema>;

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
          evidence: { type: "array", items: { type: "string" }, description: "References such as R1 or T3 from the evidence pack." },
        },
        required: ["text", "why", "evidence"],
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
};

export type FinalMessage = {
  content: string;
  nextStep: string;
  claims: FinalClaim[];
  filteredTerms: string[];
  /** Claims removed because they cited nothing valid or used diagnostic language. */
  dropped: Array<{ text: string; reason: "no_valid_evidence" | "clinical_language" }>;
};

/**
 * Turn a draft into what we store and show: resolve references to database ids, drop claims
 * without valid evidence (no unsupported statements), and run every text through the clinical filter.
 */
export function finaliseDraft(draft: CoachDraft, pack: EvidencePack): FinalMessage {
  const runByRef = new Map(pack.runs.map((r) => [r.ref, r]));
  const factByRef = new Map(pack.facts.map((f) => [f.ref, f]));
  const filteredTerms: string[] = [];
  const dropped: FinalMessage["dropped"] = [];

  const clean = (s: string) => {
    const r = filterClinical(s);
    filteredTerms.push(...r.hits);
    return r;
  };

  const claims: FinalClaim[] = [];
  for (const c of draft.claims) {
    const runIds = new Set<string>();
    const trialIds = new Set<string>();
    const labels: string[] = [];
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
    claims.push({ claim: text.text, why: why.text, evidenceTaskRunIds: [...runIds], evidenceTrialIds: [...trialIds], evidenceLabels: labels });
  }

  const summary = clean(draft.summary);
  const next = clean(draft.next_step);
  const content = summary.blocked ? NON_CLINICAL_NOTE : summary.text;
  return { content, nextStep: next.blocked ? "" : next.text, claims, filteredTerms, dropped };
}

/** Deterministic coach used when AI coaching is off (no consent / no API access) or the call fails. */
export function ruleBasedDraft(pack: EvidencePack, nextNote?: string): CoachDraft {
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
    });
  }

  const shaky = pack.runs.find((r) => !r.reliable);
  if (shaky) {
    claims.push({
      text: `One ${shaky.task} block counted less than usual.`,
      why: `It was flagged for: ${shaky.reliabilityNotes.join(", ").replaceAll("_", " ")}. A rested, focused session gives a fairer picture.`,
      evidence: [shaky.ref],
    });
  }

  const wide = [...measured].sort((a, b) => b.bandPct[1] - b.bandPct[0] - (a.bandPct[1] - a.bandPct[0]))[0];
  return {
    summary: `Nice work: ${measured.length} skill${measured.length > 1 ? "s" : ""} measured so far. Here's what your results show.`,
    claims,
    next_step: nextNote ?? `Another ${wide.name.toLowerCase()} block would narrow its band the most.`,
  };
}
