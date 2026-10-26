import { readFileSync } from "node:fs";
import path from "node:path";
import { parse } from "yaml";
import { z } from "zod";
import type { EvidencePack } from "./evidence";

// Science cards: published findings the coach may cite as S# references next to the user's own evidence.
// "Science explains, your data decides": a claim must still cite R#/T#, and a claim citing only S# is dropped
// (claims.ts). Cards live in science/findings.yaml, so the corpus is reviewed text, not open retrieval.

const WHEN = ["always", "repeated_practice", "low_reliability", "engagement", "asked_about_ai", "strategy"] as const;
type When = (typeof WHEN)[number];

const cardSchema = z.object({
  id: z.string().regex(/^[a-z0-9_]+$/),
  title: z.string().min(3),
  finding: z.string().min(20).max(400),
  citation: z.string().min(5),
  url: z.string().url(),
  applies_to: z.array(z.string()).min(1),
  when: z.array(z.enum(WHEN)).min(1),
});
export type ScienceCard = z.infer<typeof cardSchema>;
export type ScienceRef = ScienceCard & { ref: string };

export const SCIENCE_FILE = path.join(process.cwd(), "science", "findings.yaml");
/** At most this many cards go to the model, so the prompt stays focused. */
export const MAX_SCIENCE_CARDS = 8;

let cache: ScienceCard[] | null = null;

/** Parse and validate science/findings.yaml (unique ids). Throws listing every problem. */
export function loadScience(file = SCIENCE_FILE): ScienceCard[] {
  if (cache && file === SCIENCE_FILE) return cache;
  const parsed = z.array(cardSchema).safeParse(parse(readFileSync(file, "utf8")));
  if (!parsed.success) throw new Error(`science cards: ${parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`);
  const ids = parsed.data.map((c) => c.id);
  const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
  if (dupes.length) throw new Error(`science cards: duplicate ids ${dupes.join(", ")}`);
  if (file === SCIENCE_FILE) cache = parsed.data;
  return parsed.data;
}

const AI_WORDS = /\b(ai|coach|trust|check|verify|wrong|mistakes?|claims?)\b/i;
const HOW_WORDS = /\b(how|tips?|improve|better|strategy|strategies|advice|help|practice|practise)\b/i;

/**
 * Pick the cards relevant to this user's evidence (and question), numbered S1…Sn.
 * Strategy cards are only offered for skills played recently or named in the question.
 */
export function selectScience(pack: EvidencePack, question?: string, cards = loadScience()): ScienceRef[] {
  const measured = pack.skills.filter((s) => s.measured);
  const idByName = new Map(pack.skills.map((s) => [s.name, s.id]));
  const recent = new Set(pack.runs.slice(0, 3).map((r) => idByName.get(r.skill)).filter(Boolean) as string[]);
  const q = question ?? "";
  for (const s of pack.skills) if (q && q.toLowerCase().includes(s.name.toLowerCase().split(" ")[0])) recent.add(s.id);

  const contexts = new Set<When>(["always"]);
  if (measured.some((s) => s.blocks >= 3)) contexts.add("repeated_practice");
  if (pack.runs.some((r) => !r.reliable)) contexts.add("low_reliability");
  if (pack.runs.some((r) => r.engagement.length > 0)) contexts.add("engagement");
  if (AI_WORDS.test(q)) contexts.add("asked_about_ai");
  if (!q || HOW_WORDS.test(q)) contexts.add("strategy");

  const measuredIds = new Set(measured.map((s) => s.id));
  const relevant = cards.filter((c) => {
    if (!c.when.some((w) => contexts.has(w))) return false;
    if (c.applies_to.includes("all")) return measuredIds.size > 0;
    const pool = c.when.includes("strategy") ? recent : measuredIds;
    return c.applies_to.some((id) => pool.has(id));
  });
  // Situation-specific cards first (they explain something that happened), general ones after.
  const rank = (c: ScienceCard) => (c.when.includes("always") ? 1 : 0);
  return [...relevant].sort((a, b) => rank(a) - rank(b)).slice(0, MAX_SCIENCE_CARDS).map((c, i) => ({ ...c, ref: `S${i + 1}` }));
}

/** Prompt section listing the selected cards (wording the model may paraphrase, never stretch). */
export function scienceToPrompt(refs: ScienceRef[]): string {
  if (!refs.length) return "SCIENCE CARDS\n- none";
  return `SCIENCE CARDS (published findings; cite as S#)\n${refs.map((c) => `- ${c.ref} (${c.title}; ${c.citation}): ${c.finding}`).join("\n")}`;
}
