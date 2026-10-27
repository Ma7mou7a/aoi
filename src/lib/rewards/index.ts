/**
 * Bamboo rewards: pure rules. They reward showing up, consistency and curiosity, never how high a
 * score is, so slower or newer players earn exactly as much as anyone else.
 */

export type RewardKind = "daily_visit" | "game_completed" | "daily_plan_done" | "daily_challenge" | "streak_day" | "badge";

export const REWARD_AMOUNTS = { daily_visit: 5, game_completed: 10, daily_plan_done: 20, daily_challenge: 15, badge: 25 } as const;

/** Bonus for the first game of a day that continues a streak: 5 per day, capped at a week. */
export const streakBonus = (streak: number) => 5 * Math.min(streak, 7);

/** One bamboo stalk per 50 bamboo, at most 30 in the garden. */
export const gardenStalks = (total: number) => Math.min(30, Math.floor(total / 50));

const DAY = 86_400_000;
const iso = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * DAY);
/** Monday of the ISO week a day belongs to (UTC). */
const weekOf = (d: Date) => iso(addDays(d, -((d.getUTCDay() + 6) % 7)));

/**
 * Consecutive active days (UTC) counting back from today (or yesterday, if today isn't played yet),
 * where a single missed day is bridged by a streak freeze when: the day before it was active, at least
 * 3 of the 7 days before it were active, and no other day in its ISO week was frozen. Two missed days
 * in a row end the streak. Frozen days don't count as streak days.
 */
export function streakWithFreeze(activeDays: string[], today = new Date()): { streak: number; frozenDays: string[] } {
  const days = new Set(activeDays);
  let cursor = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  if (!days.has(iso(cursor))) cursor = addDays(cursor, -1);
  let streak = 0;
  const frozenDays: string[] = [];
  const frozenWeeks = new Set<string>();
  for (;;) {
    if (days.has(iso(cursor))) {
      streak++;
      cursor = addDays(cursor, -1);
      continue;
    }
    if (streak === 0) break;
    const before = addDays(cursor, -1);
    const activeBefore = Array.from({ length: 7 }, (_, i) => iso(addDays(cursor, -(i + 1)))).filter((d) => days.has(d)).length;
    if (days.has(iso(before)) && activeBefore >= 3 && !frozenWeeks.has(weekOf(cursor))) {
      frozenDays.push(iso(cursor));
      frozenWeeks.add(weekOf(cursor));
      cursor = before;
      continue;
    }
    break;
  }
  return { streak, frozenDays };
}

export type BadgeFacts = {
  skillsPlayed: string[];
  streak: number;
  questionsAsked: number;
  caughtErrors: number;
  dailyDone: number;
  goalsSet: number;
  /** Played another game right after one that looked tough (behaviour-based ease-off). */
  playedAfterTough: boolean;
};

const SKILL_NAMES: Record<string, string> = {
  working_memory: "working memory",
  attention_inhibition: "focus",
  processing_speed: "speed",
  cognitive_flexibility: "flexibility",
  visuospatial_memory: "visual memory",
  reasoning: "reasoning",
  ai_reliance: "working with AI",
};

export const BADGES: Array<{ id: string; title: string; text: string }> = [
  ...Object.entries(SKILL_NAMES).map(([id, name]) => ({ id: `first_${id}`, title: `First ${name} game`, text: `Play your first ${name} game.` })),
  { id: "all_skills", title: "Explorer", text: "Try all seven skills." },
  { id: "streak_3", title: "Three in a row", text: "Play three days in a row." },
  { id: "streak_7", title: "A whole week", text: "Play seven days in a row." },
  { id: "streak_14", title: "Two strong weeks", text: "Play fourteen days in a row." },
  { id: "first_question", title: "Curious mind", text: "Ask Bao your first question." },
  { id: "caught_error", title: "Sharp eye", text: "Catch a deliberate mistake in research mode." },
  { id: "daily_5", title: "Daily regular", text: "Finish five daily challenges." },
  { id: "first_goal", title: "Goal setter", text: "Set your first goal." },
  { id: "kept_going", title: "Kept going", text: "Play again right after a tough game." },
];

export function earnedBadges(f: BadgeFacts, dimensionIds: string[]): string[] {
  const played = new Set(f.skillsPlayed);
  const out = dimensionIds.filter((d) => played.has(d)).map((d) => `first_${d}`);
  if (dimensionIds.every((d) => played.has(d))) out.push("all_skills");
  for (const n of [3, 7, 14]) if (f.streak >= n) out.push(`streak_${n}`);
  if (f.questionsAsked > 0) out.push("first_question");
  if (f.caughtErrors > 0) out.push("caught_error");
  if (f.dailyDone >= 5) out.push("daily_5");
  if (f.goalsSet > 0) out.push("first_goal");
  if (f.playedAfterTough) out.push("kept_going");
  return out;
}

export const badgeTitle = (id: string) => BADGES.find((b) => b.id === id)?.title ?? id;
