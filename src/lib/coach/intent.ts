/**
 * What a free-text message to the coach is asking for, from keywords only. Used by the template coach
 * (no AI consent or no API) and as a hint to the LLM, so both answer the same kinds of request.
 */

export type Intent = "debrief" | "play" | "progress" | "forecast" | "goal" | "explain" | "chat" | "help";
/** Games per week a forecast is computed at. */
export type Pace = 2 | 4 | 7;

/** Everyday words → skill (dimension id). More specific rows first: "visual memory" before "memory". */
export const SKILL_WORDS: Array<{ words: string[]; skill: string; alsoSkill?: string }> = [
  { words: ["visualisation", "visualization", "visualise", "visualize"], skill: "visuospatial_memory", alsoSkill: "reasoning" },
  { words: ["visual memory", "spatial", "visuospatial", "corsi"], skill: "visuospatial_memory" },
  { words: ["memory", "remember", "recall", "n-back", "nback"], skill: "working_memory" },
  { words: ["focus", "attention", "concentration", "concentrate", "distraction", "stroop"], skill: "attention_inhibition" },
  { words: ["speed", "fast", "faster", "quick", "quicker"], skill: "processing_speed" },
  { words: ["switching", "switch", "multitask", "multitasking", "flexible", "flexibility"], skill: "cognitive_flexibility" },
  { words: ["logic", "reasoning", "reason", "puzzle", "puzzles", "iq", "pattern", "patterns"], skill: "reasoning" },
  { words: ["second opinion", "ai", "trust", "trusting", "helper"], skill: "ai_reliance" },
];

const INTENT_RULES: Array<[Intent, RegExp]> = [
  ["forecast", /\bwhat if\b|\bwill (i|my)\b|\bif i (keep|play)\b|\bkeep (going|playing)\b|\bpace\b|\bforecast\b|\bevery day\b|\bper week\b|\bnext week\b/],
  ["goal", /\bgoal\b|\btarget\b|\baim\b/],
  ["debrief", /\blast (game|session|block|round)\b|\bdebrief\b|\bhow did i do\b|\bmy latest\b/],
  ["progress", /\bhow am i\b|\bprogress\b|\bdoing\b|\bstats\b|\bhow (is|are) my\b|\bmy scores?\b/],
  ["explain", /\bwhat does\b|\bwhat is an?\b|\bmeans?\b|\bwhy\b|\bexplain\b/],
  ["play", /\bplay\b|\btrain\b|\bpractis|\bpractic|\bimprove\b|\bgame\b|\bwork on\b|\bstart\b|\bwant to be\b/],
  ["help", /\bhelp\b|\bwhat can you\b|\bhow does this work\b/],
];

const normalise = (text: string) =>
  ` ${text
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim()} `;

/** Optimal string alignment distance (a swapped pair of letters counts as one edit). */
function editDistance(a: string, b: string): number {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }
  return d[a.length][b.length];
}

function findSkill(norm: string): { skill: string; alsoSkill?: string } | undefined {
  for (const row of SKILL_WORDS) {
    if (row.words.some((w) => norm.includes(` ${w} `))) return { skill: row.skill, alsoSkill: row.alsoSkill };
  }
  // Typo tolerance only for longer words, where one slip can't turn one real word into another.
  const tokens = norm.trim().split(" ").filter((t) => t.length >= 6);
  for (const row of SKILL_WORDS) {
    if (row.words.some((w) => w.length >= 6 && !w.includes(" ") && tokens.some((t) => editDistance(t, w) <= 1))) {
      return { skill: row.skill, alsoSkill: row.alsoSkill };
    }
  }
  return undefined;
}

const NUMBER_WORDS: Record<string, number> = { once: 1, one: 1, twice: 2, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7 };

/** Games per week mentioned in the text, rounded to the nearest pace we forecast (ties go up). */
export function parsePace(text: string): Pace | undefined {
  const norm = normalise(text);
  if (/\b(every|each) day\b|\bdaily\b/.test(norm)) return 7;
  const m = /\b(\d+|once|twice|one|two|three|four|five|six|seven)\b(?: (?:times|games|days|sessions))?(?: a| per)? week\b/.exec(norm) ?? /\b(once|twice)\b/.exec(norm);
  if (!m) return undefined;
  const n = /^\d+$/.test(m[1]) ? Number(m[1]) : NUMBER_WORDS[m[1]];
  const paces: Pace[] = [2, 4, 7];
  return paces.reduce((best, p) => (Math.abs(p - n) <= Math.abs(best - n) ? p : best), paces[0]);
}

export function classifyIntent(text: string): { intent: Intent; skill?: string; alsoSkill?: string; pace?: Pace } {
  const norm = normalise(text);
  const found = findSkill(norm);
  let intent: Intent = INTENT_RULES.find(([, re]) => re.test(norm))?.[0] ?? (found ? "play" : "chat");
  if (intent === "help" && found) intent = "play";
  const pace = intent === "forecast" ? parsePace(text) : undefined;
  return { intent, ...(found ?? {}), ...(pace ? { pace } : {}) };
}
