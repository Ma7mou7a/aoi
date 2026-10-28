/**
 * Clinical-language guard. AI4Brain is non-clinical: coach output must never diagnose, label
 * conditions or use medical framing. Diagnostic terms make the whole claim unusable (it is dropped);
 * softer medical words are rewritten to everyday language. The same check flags user questions about
 * health, so they get the fixed non-clinical answer first. Red-team set: safety.redteam.test.ts.
 */

/** Any of these means the sentence is diagnosing, naming or asking about a condition: drop it. */
const BLOCKING: RegExp[] = [
  /\bdiagno[sz]\w*/i,
  /\bdisorders?\b/i,
  /\bADH?D\b/,
  /\badhd\b/i,
  /\bA\.D\.(H\.)?D\b/i,
  /\battention[- ]deficit\b/i,
  /\bdementia\b/i,
  /\bsenil\w*/i,
  /\balzheimer'?s?\b/i,
  /\bparkinson'?s?\b/i,
  /\bautis(m|tic)\b/i,
  /\bon the spectrum\b/i,
  /\bdyslexi\w*/i,
  /\bdyscalculi\w*/i,
  /\bdyspraxi\w*/i,
  /\bMCI\b/,
  /\bcognitive decline\b/i,
  /\bneuro[- ]?degenerat\w*/i,
  /\bbrain (damage|injur\w*|tumou?rs?|fog)\b/i,
  /\bbrain (is |was |been |got )?damaged\b/i,
  /\bhead injur\w*/i,
  /\bTBI\b/,
  /\bconcuss\w*/i,
  /\bstrokes?\b/i,
  /\bearly[- ]onset\b/i,
  /\bsyndrome\b/i,
  /\bdiseases?\b/i,
  /\bpatholog\w*/i,
  /\bdepressi(on|ve)\b/i,
  /\banxiety disorder\b/i,
  /\b(OCD|PTSD)\b/,
  /\bbipolar\b/i,
  /\bschizo\w*/i,
  /\bpsychos[ie]s\b|\bpsychotic\b/i,
  /\bmental(ly)? (health|illness|ill|disorder|decline)\b/i,
  /\b(declining|deteriorating) (mentally|cognitively)\b/i,
  /\blosing my (mind|memory|marbles)\b/i,
  /\blearning disabilit\w*/i,
  /\bintellectual disabilit\w*/i,
  /\bretard\w*/i,
  /\bIQ\b/i,
  /\bintelligence quotient\b/i,
  /\bmedicat\w*/i,
  /\bmeds\b/i,
  /\b(ritalin|adderall|modafinil|methylphenidate|donepezil|aricept)\b/i,
  /\bclinical(ly)?\b/i,
  /\b(neurologists?|psychiatrists?|neuropsycholog\w*)\b/i,
  /\b(see|visit|ask|consult) (a |my |your )?(doctor|GP|physician)\b/i,
  // Plain-word worries about a condition: "memory loss", "attention problems", "concentration issues".
  /\b(memory|attention|focus|concentration|cognitive|thinking)\s+(loss|problems?|issues?|troubles?|decline|failure|is failing|failing)\b/i,
  /\bmemory (is |keeps )?(failing|going)\b/i,
  /\bcognitive (impairment|dysfunction)\b/i,
  /\b(getting|becoming|so|very|really) forgetful\b/i,
  /\bsomething (is )?wrong with (me|my|your)\b/i,
  /\b(is|are) (my|your) (brain|mind|memory) (normal|ok|okay|alright|healthy|working properly)\b/i,
];

/**
 * Misspellings ("demensia", "alzeimers", "diagnoze") are caught by edit distance against these terms:
 * at most 1 edit for terms of up to 8 letters, 2 for longer ones. Words under 6 letters are never fuzzy-matched.
 */
const FUZZY_TERMS = ["dementia", "alzheimers", "alzheimer", "parkinsons", "parkinson", "dyslexia", "dyscalculia", "autism", "autistic", "diagnose", "diagnosis", "disorder", "disease", "concussion", "schizophrenia", "senility", "neurodegenerative"];

/** Damerau-Levenshtein (optimal string alignment) distance, stopping early above `max`. */
export function editDistance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array<number>(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    let rowMin = Infinity;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      rowMin = Math.min(rowMin, d[i][j]);
    }
    if (rowMin > max) return max + 1;
  }
  return d[a.length][b.length];
}

function fuzzyHit(text: string): string | null {
  for (const word of text.toLowerCase().replace(/'/g, "").match(/[a-z]{6,}/g) ?? []) {
    for (const term of FUZZY_TERMS) {
      const max = term.length >= 9 ? 2 : 1;
      if (editDistance(word, term, max) <= max) return word;
    }
  }
  return null;
}

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
  const fuzzy = blocked ? null : fuzzyHit(text);
  if (fuzzy) {
    hits.push(fuzzy);
    blocked = true;
  }
  let out = text;
  for (const [re, replacement] of REWRITES) {
    out = out.replace(re, (m) => {
      hits.push(m);
      return replacement;
    });
  }
  // Norm comparisons: the app compares people only with themselves, so such sentences are removed.
  const sentences = out.split(/(?<=[.!?])\s+/);
  const kept = sentences.filter((s) => {
    const m = NORM.find((re) => re.test(s));
    if (m) hits.push(`norm: ${s.match(m)![0]}`);
    return !m;
  });
  out = kept.join(" ");
  // Nothing left after removing norm comparisons = nothing to say.
  if (!out.trim()) blocked = true;
  return { text: out, blocked, hits };
}

/** Comparisons with other people or population norms (never allowed; the app has no norms). */
const NORM: RegExp[] = [
  /\b(typical|normal|usual) (for|of|at) (your|this|a|an|people|someone|adults?)\b/i,
  /\b(above|below) (the )?(average|norm|normal)\b/i,
  /\bthe average (person|user|adult)\b/i,
  /\b(most|other|many) (people|users|adults)\b/i,
  /\b(for|at) (your|my|our|his|her|their) age\b/i,
  /\bcompared (to|with) (others|other people|peers|most)\b/i,
  /\bpercentile\b/i,
];

/** Shown instead of anything that tried to diagnose. */
export const NON_CLINICAL_NOTE =
  "AI4Brain is a learning tool, not a medical test, so it can't say anything about health conditions. If you have concerns, a qualified professional is the right person to talk to.";
