/**
 * Clinical-language guard. AI4Brain is non-clinical: coach output must never diagnose, label
 * conditions or use medical framing. Diagnostic terms make the whole claim unusable (it is dropped);
 * softer medical words are rewritten to everyday language.
 */

/** Any of these means the sentence is diagnosing or naming a condition: drop it. */
const BLOCKING: RegExp[] = [
  /\bdiagnos\w*/i,
  /\bdisorders?\b/i,
  /\bADH?D\b/,
  /\battention[- ]deficit\b/i,
  /\bdementia\b/i,
  /\balzheimer'?s?\b/i,
  /\bautis(m|tic)\b/i,
  /\bdyslexi\w*/i,
  /\bdyscalculi\w*/i,
  /\bdyspraxi\w*/i,
  /\bMCI\b/,
  /\bcognitive decline\b/i,
  /\bneurodegenerat\w*/i,
  /\bbrain damage\b/i,
  /\bconcussion\b/i,
  /\bsyndrome\b/i,
  /\bdiseases?\b/i,
  /\bpatholog\w*/i,
  /\bdepressi(on|ve)\b/i,
  /\banxiety disorder\b/i,
  /\blearning disabilit\w*/i,
  /\bintellectual disabilit\w*/i,
  /\bretard\w*/i,
  /\bIQ\b/,
  /\bmedicat\w*/i,
  /\bclinical(ly)?\b/i,
];

/** Medical-sounding words with a plain-language replacement. */
const REWRITES: Array<[RegExp, string]> = [
  [/\bimpairments?\b/gi, "difficulty"],
  [/\bimpaired\b/gi, "harder for you"],
  [/\bdeficits?\b/gi, "gap"],
  [/\bsymptoms\b/gi, "signs"],
  [/\bsymptom\b/gi, "sign"],
  [/\babnormal(ly)?\b/gi, "unusual"],
  [/\bpatients?\b/gi, "person"],
  [/\btreatments?\b/gi, "practice"],
  [/\btherapy\b/gi, "practice"],
  [/\bbelow normal\b/gi, "lower than your other skills"],
  [/\bnormal range\b/gi, "typical range"],
];

export type FilterResult = { text: string; blocked: boolean; hits: string[] };

export function filterClinical(text: string): FilterResult {
  const hits: string[] = [];
  let blocked = false;
  for (const re of BLOCKING) {
    const m = text.match(re);
    if (m) {
      hits.push(m[0]);
      blocked = true;
    }
  }
  let out = text;
  for (const [re, replacement] of REWRITES) {
    out = out.replace(re, (m) => {
      hits.push(m);
      return replacement;
    });
  }
  return { text: out, blocked, hits };
}

/** Shown instead of anything that tried to diagnose. */
export const NON_CLINICAL_NOTE =
  "AI4Brain is a learning tool, not a medical test, so it can't say anything about health conditions. If you have concerns, a qualified professional is the right person to talk to.";
