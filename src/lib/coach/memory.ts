import type { Intent } from "./intent";

/** What the coach remembers about a user between messages (stored on users.coach_memory). */
export type CoachMemory = {
  /** A skill id, or "curious" (picked at signup or by setting a goal). */
  goal?: string;
  favouriteSkill?: string;
  /** Last 5 topics as "<intent>" or "<intent>:<skill>". */
  recentTopics: string[];
  /** Last 5 template lines used, so Bao never repeats himself. */
  recentLineIds: string[];
  /** Last 10 skills played, oldest first. */
  recentPlays: string[];
  /** Set once Bao has asked for AI consent in chat (yes or no). */
  aiAsked?: boolean;
  debriefsSinceBet: number;
};

export type MemoryEvent =
  | { type: "question"; intent: Intent; skill?: string }
  | { type: "line"; id: string }
  | { type: "debrief"; bet: boolean }
  | { type: "ai_asked" }
  | { type: "goal"; goal: string }
  | { type: "played"; skill: string };

export const EMPTY_MEMORY: CoachMemory = { recentTopics: [], recentLineIds: [], recentPlays: [], debriefsSinceBet: 0 };

const keepLast = (xs: string[], x: string, n: number) => [...xs, x].slice(-n);

function mostPlayed(plays: string[]): string | undefined {
  const counts = new Map<string, number>();
  for (const p of plays) counts.set(p, (counts.get(p) ?? 0) + 1);
  // Ties go to the most recently played skill.
  return [...plays].reverse().reduce<string | undefined>((best, p) => (!best || counts.get(p)! > counts.get(best)! ? p : best), undefined);
}

export function updateMemory(m: CoachMemory, e: MemoryEvent): CoachMemory {
  const base: CoachMemory = { ...EMPTY_MEMORY, ...m };
  switch (e.type) {
    case "question":
      return { ...base, recentTopics: keepLast(base.recentTopics, e.skill ? `${e.intent}:${e.skill}` : e.intent, 5) };
    case "line":
      return { ...base, recentLineIds: keepLast(base.recentLineIds, e.id, 5) };
    case "debrief":
      return { ...base, debriefsSinceBet: e.bet ? 0 : base.debriefsSinceBet + 1 };
    case "ai_asked":
      return { ...base, aiAsked: true };
    case "goal":
      return { ...base, goal: e.goal };
    case "played": {
      const recentPlays = keepLast(base.recentPlays, e.skill, 10);
      return { ...base, recentPlays, favouriteSkill: mostPlayed(recentPlays) };
    }
  }
}

/** The bet card shows on every debrief in research mode, otherwise on at most every third one. */
export const shouldOfferBet = (m: CoachMemory, researchMode: boolean) => researchMode || m.debriefsSinceBet >= 2;

/** A few plain lines for the prompt's ABOUT THE USER section (skill names, never ids). */
export function memoryToPrompt(m: CoachMemory, dims: Array<{ id: string; name: string }>): string {
  const name = (id: string) => dims.find((d) => d.id === id)?.name ?? id.replaceAll("_", " ");
  const lines: string[] = [];
  if (m.goal) lines.push(`- Goal: ${m.goal === "curious" ? "just curious, no specific skill" : name(m.goal)}`);
  if (m.favouriteSkill) lines.push(`- Plays most: ${name(m.favouriteSkill)}`);
  if (m.recentTopics.length) {
    lines.push(`- Recently asked about: ${m.recentTopics.map((t) => { const [intent, skill] = t.split(":"); return skill ? `${intent} (${name(skill)})` : intent; }).join(", ")}`);
  }
  return lines.length ? lines.join("\n") : "- Nothing yet: this is a new conversation.";
}
