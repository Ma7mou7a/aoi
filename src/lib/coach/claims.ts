import { z } from "zod";
import { packToPrompt, type EvidencePack } from "./evidence";
import { filterClinical, NON_CLINICAL_NOTE } from "./safety";
import { scienceToPrompt, type ScienceRef } from "./science";
import { inSentence } from "../text";
import { resolveActions, type ClientAction } from "./actions";

export const INTENTS = ["debrief", "play", "progress", "forecast", "goal", "explain", "chat", "help"] as const;
export const MOODS = ["cheer", "think", "proud", "calm", "wave"] as const;
export type Mood = (typeof MOODS)[number];
export const MAX_CLAIMS = 3;

const rawActionSchema = z.object({
  type: z.enum(["play", "show_progress", "forecast", "set_goal", "daily_challenge"]),
  skill: z.string().optional(),
  mode: z.enum(["training", "assessment", ""]).optional(),
  gamesPerWeek: z.number().optional(),
});

/**
 * What the model (or the template coach) produces: a short reply, 0–3 evidence-backed claims shown
 * behind "Why?", 0–3 action buttons and Bao's mood. Claims cite pack references, never raw ids.
 */
export const coachDraftSchema = z.object({
  intent: z.enum(INTENTS).default("debrief"),
  reply: z.string(),
  claims: z.array(z.object({ text: z.string(), why: z.string(), evidence: z.array(z.string()), science: z.array(z.string()).default([]) })),
  actions: z.array(rawActionSchema).default([]),
  mood: z.enum(MOODS).default("calm"),
});
// Input type: `science`, `intent`, `actions` and `mood` may be omitted (tests, older drafts).
export type CoachDraft = z.input<typeof coachDraftSchema>;

/** Same shape as JSON Schema for structured outputs (objects closed, all fields required). */
export const COACH_JSON_SCHEMA = {
  type: "object",
  properties: {
    intent: { type: "string", enum: [...INTENTS], description: "What the user is asking for." },
    reply: { type: "string", description: "At most 3 short, warm sentences that answer the user's actual message first." },
    claims: {
      type: "array",
      description: "0-3 specific observations, each backed by evidence references (0 for small talk or help).",
      items: {
        type: "object",
        properties: {
          text: { type: "string", description: "The observation, in plain second-person language." },
          why: { type: "string", description: "How the cited numbers support it." },
          evidence: { type: "array", items: { type: "string" }, description: "References such as R1, T3, W2 or P1 from the evidence pack. At least one is required." },
          science: { type: "array", items: { type: "string" }, description: "Science card references such as S2 that explain the observation or what tends to help. May be empty." },
        },
        required: ["text", "why", "evidence", "science"],
        additionalProperties: false,
      },
    },
    actions: {
      type: "array",
      description: "0-3 buttons. type play needs skill and mode; forecast needs skill and gamesPerWeek (2, 4 or 7); show_progress and set_goal may leave skill empty; daily_challenge needs nothing. Unused fields: empty string or 0.",
      items: {
        type: "object",
        properties: {
          type: { type: "string", enum: ["play", "show_progress", "forecast", "set_goal", "daily_challenge"] },
          skill: { type: "string", description: "A skill id from the evidence pack, or empty." },
          mode: { type: "string", enum: ["training", "assessment", ""], description: "training or assessment for play; empty otherwise." },
          gamesPerWeek: { type: "integer", description: "2, 4 or 7 for a forecast, else 0." },
        },
        required: ["type", "skill", "mode", "gamesPerWeek"],
        additionalProperties: false,
      },
    },
    mood: { type: "string", enum: [...MOODS], description: "Bao the panda's reaction to show with the reply." },
  },
  required: ["intent", "reply", "claims", "actions", "mood"],
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
  /** Label of the first action (drives the "acted on advice" collaboration signal), or "". */
  nextStep: string;
  actions: ClientAction[];
  mood: Mood;
  claims: FinalClaim[];
  filteredTerms: string[];
  /** Claims removed because they cited nothing valid or used diagnostic language. */
  dropped: Array<{ text: string; reason: "no_valid_evidence" | "clinical_language" | "unverified_number"; numbers?: number[] }>;
  /** S# references the model cited that were not in the science pack (ignored). */
  unknownScience: string[];
};

/** Numbers written in a text, as absolute values ("+16", "−0.4", "1,200" → 16, 0.4, 1200). Codes like "T3" are skipped. */
export function numbersIn(s: string): number[] {
  const digits = [...s.replace(/(\d),(\d{3})\b/g, "$1$2").matchAll(/(?<![A-Za-z\d.])\d+(?:\.\d+)?/g)].map((m) => Number(m[0]));
  // Counts written as words ("zero errors", "three matches") are checked too; "one" is skipped (too common: "one more block").
  const words = [...s.toLowerCase().matchAll(/\b(zero|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\b/g)].map((m) => NUMBER_WORDS[m[1]]);
  return [...digits, ...words];
}
const NUMBER_WORDS: Record<string, number> = { zero: 0, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12 };

const close = (x: number, y: number) => Math.abs(x - y) <= (Math.max(x, y) >= 10 ? 1 : 0.05);

/**
 * Number check: every number in a sentence must come from the evidence (within rounding), or be the
 * difference of two verified numbers in the same claim ("from 60% to 68%, +8"). Returns the numbers that fail.
 */
export function unverifiedNumbers(text: string, allowed: number[]): number[] {
  const nums = numbersIn(text);
  const ok = nums.filter((n) => allowed.some((a) => close(n, a)));
  return nums.filter((n) => !allowed.some((a) => close(n, a)) && !ok.some((a) => ok.some((b) => a !== b && close(n, Math.abs(a - b)))));
}

/** Remove reference codes the model leaked into user-facing text, e.g. "(S6)" or "(R2, T3)". */
export const stripRefs = (s: string) =>
  s
    .replace(/\s*\((?:[RTSWP]\d+[,;\s]*(?:and\s+)?)+\)/g, "")
    // Bare codes in running text become plain words ("Blocks R2 and R4 show" → "Those blocks show").
    .replace(/\b(blocks?)\s+R\d+(?:\s*(?:,|and|&)\s*R\d+)*/gi, (_, b: string) => (b.toLowerCase() === "blocks" ? "those blocks" : "that block"))
    .replace(/\bR\d+(?:\s*(?:,|and|&)\s*R\d+)+/g, "those blocks")
    .replace(/\bR\d+\b/g, "that block")
    .replace(/\bW\d+\b/g, "the recalculation")
    .replace(/\bT\d+\b/g, "the trial details")
    .replace(/\bP\d+\b/g, "the forecast")
    .replace(/\bS\d+\b/g, "the research")
    .replace(/\s{2,}/g, " ")
    .trim()
    .replace(/(^|[.!?]\s+)([a-z])/g, (_, p: string, c: string) => p + c.toUpperCase());

/**
 * Turn a draft into what we store and show: resolve references to database ids, drop claims
 * without valid evidence (no unsupported statements), and run every text through the clinical filter.
 * Science references (S#) are resolved too, but they never count as evidence: "science explains,
 * your data decides", so a claim that cites only science is dropped like any unsupported claim.
 */
export function finaliseDraft(
  draft: CoachDraft,
  pack: EvidencePack,
  science: ScienceRef[] = [],
  context = "",
  dims: Array<{ id: string; name: string }> = pack.skills,
): FinalMessage {
  // Everything the model was shown: the only legitimate source of numbers.
  // Timestamps are dropped first: their digits (2026, 10, 14…) would otherwise "verify" almost any number.
  const noDates = (s: string) => s.replace(/\d{4}-\d{2}-\d{2}(?: \d{2}:\d{2})?/g, " ");
  const promptLines = packToPrompt(pack).split("\n");
  const lineOf = new Map(promptLines.flatMap((l) => (/^- ([RTWP]\d+)\b/.exec(l) ? [[/^- ([RTWP]\d+)\b/.exec(l)![1], l] as const] : [])));
  const skillLines = promptLines.filter((l) => l.startsWith("- ") && !/^- [RTWP]\d+\b/.test(l)).join("\n");
  const shared = `${skillLines}\n${scienceToPrompt(science)}\n${context}`;
  // The summary may draw on the whole pack; a claim only on what it cites (plus the skill estimates).
  const allowed = numbersIn(noDates(`${packToPrompt(pack)}\n${shared}`));
  const allowedFor = (refs: string[]) => {
    const own = refs.flatMap((r) => {
      const line = lineOf.get(r) ?? "";
      const parent = /\((?:in|for) (R\d+)\)/.exec(line)?.[1];
      return [line, parent ? lineOf.get(parent) ?? "" : ""];
    });
    return numbersIn(noDates(`${own.join("\n")}\n${shared}`));
  };
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
      } else if (ref.startsWith("W")) {
        const w = pack.whatIf.find((x) => x.ref === ref);
        const parent = w && runByRef.get(w.runRef);
        if (w && parent) {
          runIds.add(parent.runId);
          labels.push(`what it would take: ${w.label} → ${w.toPct}% (was ${w.fromPct}%)`);
        }
      } else if (ref.startsWith("P")) {
        const p = pack.pace.find((x) => x.ref === ref);
        const parent = p && runByRef.get(p.runRef);
        if (p && parent) {
          runIds.add(parent.runId);
          labels.push(`if you keep ${p.gamesPerWeek} games a week: ${p.toPct}% (${p.lowPct}–${p.highPct}%)`);
        }
      }
    }
    if (!runIds.size) {
      dropped.push({ text: c.text, reason: "no_valid_evidence" });
      continue;
    }
    const badNumbers = unverifiedNumbers(`${stripRefs(c.text)} ${stripRefs(c.why)}`, allowedFor(c.evidence.map((e) => e.trim().toUpperCase())));
    if (badNumbers.length) {
      dropped.push({ text: c.text, reason: "unverified_number", numbers: badNumbers });
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

  // The reply: keep only sentences whose numbers check out.
  const verified = (s: string) => s.split(/(?<=[.!?])\s+/).filter((x) => !unverifiedNumbers(stripRefs(x), allowed).length).join(" ");
  const reply = clean(verified(draft.reply) || "Here's what your results show.");
  const content = reply.blocked ? NON_CLINICAL_NOTE : reply.text;
  const actions = resolveActions(draft.actions ?? [], dims);
  return {
    content,
    nextStep: actions[0]?.label ?? "",
    actions,
    mood: draft.mood ?? "calm",
    claims: claims.slice(0, MAX_CLAIMS),
    filteredTerms,
    dropped,
    unknownScience,
  };
}

/** Deterministic coach used when AI coaching is off (no consent / no API access) or the call fails. */
export function ruleBasedDraft(pack: EvidencePack, nextNote?: string, science: ScienceRef[] = []): CoachDraft {
  const sci = (...ids: string[]) => science.filter((s) => ids.includes(s.id)).map((s) => s.ref);
  const measured = pack.skills.filter((s) => s.measured);
  if (!measured.length || !pack.runs.length) {
    return { intent: "debrief", reply: "Play your first game and I'll explain what your results show.", claims: [], actions: [], mood: "wave" };
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
      text: `Your ${inSentence(grown.name)} estimate is up ${grown.changePct} points since your first block.`,
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
    intent: "debrief",
    reply: `Nice work: ${measured.length} skill${measured.length > 1 ? "s" : ""} measured so far. ${nextNote ?? `Another ${inSentence(wide.name)} game would make me much surer about it.`}`,
    claims,
    actions: [
      { type: "play", skill: wide.id, mode: "assessment" },
      { type: "show_progress" },
    ],
    mood: "proud",
  };
}

/** A question about a health condition always gets the non-clinical answer first, whoever wrote the reply. */
export function applyClinicalGuard(question: string | undefined, content: string): string {
  if (!question || !filterClinical(question).blocked || content.startsWith(NON_CLINICAL_NOTE)) return content;
  return `${NON_CLINICAL_NOTE} ${content}`;
}
