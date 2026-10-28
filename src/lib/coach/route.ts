import { INTENTS } from "./claims";
import type { Intent, Pace } from "./intent";

/**
 * The coach's "what to do" step when an AI reads the message (src/lib/server/router.ts). The AI only
 * chooses from this fixed menu; every number behind each choice is still computed by the engine.
 * Anything off-menu is rejected here, and the keyword rules answer instead.
 */
export type Route = { intent: Intent; skill?: string; alsoSkill?: string; pace?: Pace };

/** What each menu item makes the engine compute, as the AI is told. */
export const ROUTE_MENU: Record<Intent, string> = {
  debrief: "feedback on their latest game or session",
  progress: "how their skills are going overall, or one skill's trend",
  forecast: "what could happen if they keep playing at some pace (set pace: 2, 4 or 7 games a week)",
  goal: "setting or changing what they want to work on",
  explain: "what a score, a skill, a game or a word in the app means",
  play: "which game to play now, or how to train a skill",
  help: "what Bao or the app can do",
  chat: "anything else: greetings, feelings, small talk, or whether to play at all today",
};

export const ROUTE_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["intent", "skill", "also_skill", "pace"],
  properties: {
    intent: { type: "string", enum: [...INTENTS] },
    skill: { type: ["string", "null"], description: "Skill id the message is about, or null." },
    also_skill: { type: ["string", "null"], description: "A second skill id, only when the message clearly spans two." },
    pace: { type: ["integer", "null"], enum: [2, 4, 7, null], description: "Games per week, only for forecast." },
  },
};

/** Validate the AI's choice against the menu and the real skill ids. Null means: use the keyword rules. */
export function parseRoute(x: unknown, skillIds: readonly string[]): Route | null {
  if (!x || typeof x !== "object") return null;
  const r = x as Record<string, unknown>;
  if (typeof r.intent !== "string" || !(INTENTS as readonly string[]).includes(r.intent)) return null;
  const known = (v: unknown) => (typeof v === "string" && skillIds.includes(v) ? v : undefined);
  if (r.skill != null && !known(r.skill)) return null; // an invented skill means the choice can't be trusted
  const skill = known(r.skill);
  const alsoSkill = skill ? known(r.also_skill) : undefined;
  const pace = r.intent === "forecast" && (r.pace === 2 || r.pace === 4 || r.pace === 7) ? (r.pace as Pace) : undefined;
  return {
    intent: r.intent as Intent,
    ...(skill ? { skill } : {}),
    ...(alsoSkill && alsoSkill !== skill ? { alsoSkill } : {}),
    ...(pace ? { pace } : {}),
  };
}

export function routerPrompt(question: string, skills: Array<{ id: string; name: string }>) {
  return [
    "MENU (choose one intent)",
    ...Object.entries(ROUTE_MENU).map(([k, v]) => `- ${k}: ${v}`),
    "",
    "SKILLS (use these ids, or null)",
    ...skills.map((s) => `- ${s.id}: ${s.name}`),
    "",
    "MESSAGE",
    question,
  ].join("\n");
}

export const ROUTER_SYSTEM = `You route messages for Bao, the coach in a non-clinical cognitive training app. Read the user's message and choose what the app should compute next from the menu. You do not answer the user.
- Understand everyday and indirect wording ("am I getting any sharper at remembering stuff?" is progress for working_memory).
- Pick a skill only when the message is about one; map everyday words to the closest skill (memory → working_memory, focus → attention_inhibition, speed → processing_speed, switching → cognitive_flexibility, logic → reasoning, visual or spatial memory → visuospatial_memory, trusting AI → ai_reliance).
- For forecast, set pace to the nearest of 2, 4 or 7 games a week ("every day" is 7); otherwise null.
- Health or medical questions are chat: the app answers them safely elsewhere.`;
