import { pickLine, type LineKey } from "../panda/lines";
import { MIN_GAMES_FOR_PACE } from "../profiler/pace";
import { inSentence } from "../text";
import type { RawAction } from "./actions";
import { ruleBasedDraft, type CoachDraft, type Mood } from "./claims";
import type { EvidencePack } from "./evidence";
import type { Intent, Pace } from "./intent";
import type { CoachMemory } from "./memory";

/** Plain-words answers for the words people ask about most (no digits: every number is checked). */
const GLOSSARY: Array<[RegExp, string]> = [
  [/false alarm/i, "A false alarm is when you pressed for a match that wasn't there."],
  [/how sure|band|range|uncertain/i, "\"How sure we are\" is the range your real score most likely sits in. It gets narrower with every game you play."],
  [/level/i, "Levels make a game harder or easier, so it stays challenging without being frustrating."],
  [/streak/i, "A streak counts the days in a row you've played. Missing a day now and then is fine."],
  [/bamboo|garden|badge/i, "Bamboo is what you earn for showing up and playing. It grows your garden, whatever your scores."],
  [/slow.?down|switch|conflict/i, "The slow-down is how much longer you take when the task gets tricky, like when a rule switches."],
  [/score/i, "Your score is my current best guess for a skill, based only on your own games, never on other people."],
];

const MOOD: Record<Intent, Mood> = { debrief: "proud", play: "cheer", progress: "proud", forecast: "think", goal: "cheer", explain: "think", chat: "wave", help: "wave" };

/** The skill to suggest when the user didn't name one: their goal, what they play most, else the least-measured skill. */
function suggestSkill(pack: EvidencePack, memory: CoachMemory): string {
  if (memory.goal && memory.goal !== "curious" && pack.skills.some((s) => s.id === memory.goal)) return memory.goal;
  if (memory.favouriteSkill && pack.skills.some((s) => s.id === memory.favouriteSkill)) return memory.favouriteSkill;
  return [...pack.skills].sort((a, b) => a.blocks - b.blocks)[0]?.id ?? "working_memory";
}

/**
 * The template coach: answers what the user asked (intent from `classifyIntent`) with a line from Bao's
 * line bank, evidence-backed claims where it has them, and action buttons. Same draft shape as the LLM,
 * so it goes through the same `finaliseDraft` checks. `context` lists the numbers the lines inserted,
 * to pass to `finaliseDraft` so the number check accepts them.
 */
export function fallbackDraft(
  input: { intent: Intent; skill?: string; alsoSkill?: string; pace?: Pace; question?: string; name?: string },
  pack: EvidencePack,
  memory: CoachMemory,
  nextNote: string | undefined,
  rand: () => number,
  dims: Array<{ id: string; name: string }>,
): { draft: CoachDraft; lineIds: string[]; context: string } {
  const nameOf = (id: string) => inSentence(dims.find((d) => d.id === id)?.name ?? id.replaceAll("_", " "));
  const skill = input.skill ?? suggestSkill(pack, memory);
  const ctx: Record<string, string | number | undefined> = { name: input.name, skill: nameOf(skill) };
  const lineIds: string[] = [];
  const line = (key: LineKey) => {
    const l = pickLine(key, ctx, [...memory.recentLineIds, ...lineIds], rand);
    lineIds.push(l.id);
    return l.text;
  };
  const play = (id: string, mode: "training" | "assessment" = "training"): RawAction => ({ type: "play", skill: id, mode });
  const hasData = pack.runs.length > 0;
  let draft: CoachDraft;

  if (!hasData && input.intent !== "help" && input.intent !== "chat" && input.intent !== "forecast") {
    draft = { intent: input.intent, reply: line("no_data"), claims: [], actions: [play(skill, "assessment"), { type: "daily_challenge" }], mood: "wave" };
  } else {
    switch (input.intent) {
      case "play": {
        const actions = [play(skill), ...(input.alsoSkill ? [play(input.alsoSkill)] : [])];
        draft = { intent: "play", reply: line("play"), claims: [], actions: [...actions, { type: "show_progress", skill }], mood: MOOD.play };
        break;
      }
      case "forecast": {
        const gamesPerWeek = input.pace ?? 4;
        const p = pack.pace.find((x) => x.skill === skill && x.gamesPerWeek === gamesPerWeek);
        if (!p) {
          const played = pack.skills.find((s) => s.id === skill)?.blocks ?? 0;
          ctx.games = Math.max(1, MIN_GAMES_FOR_PACE - played);
          draft = { intent: "forecast", reply: line("need_more_games"), claims: [], actions: [play(skill)], mood: "think" };
        } else {
          const others = ([2, 4, 7] as const).filter((g) => g !== gamesPerWeek);
          draft = {
            intent: "forecast",
            reply: line("forecast"),
            claims: [
              {
                text: `If your recent trend continues at ${gamesPerWeek} games a week, your ${nameOf(skill)} score could reach about ${p.toPct}% (likely ${p.lowPct}–${p.highPct}%).`,
                why: `Based only on your own ${nameOf(skill)} games so far. It's a range, not a promise.`,
                evidence: [p.ref],
              },
            ],
            actions: [...others.map((g): RawAction => ({ type: "forecast", skill, gamesPerWeek: g })), play(skill)],
            mood: MOOD.forecast,
          };
        }
        break;
      }
      case "progress":
      case "debrief": {
        const rules = ruleBasedDraft(pack, nextNote);
        draft = { intent: input.intent, reply: line(input.intent), claims: rules.claims, actions: [play(skill), { type: "show_progress" }], mood: MOOD[input.intent] };
        break;
      }
      case "goal":
        draft = { intent: "goal", reply: line("goal"), claims: [], actions: [{ type: "set_goal", skill }, { type: "show_progress", skill }], mood: MOOD.goal };
        break;
      case "explain": {
        const def = GLOSSARY.find(([re]) => re.test(input.question ?? ""))?.[1] ?? "Tap \"Why?\" under any of my messages to see the games behind it.";
        draft = { intent: "explain", reply: `${line("explain")} ${def}`, claims: [], actions: [{ type: "show_progress" }, play(skill)], mood: MOOD.explain };
        break;
      }
      default:
        draft = { intent: input.intent, reply: line(input.intent), claims: [], actions: [play(skill), { type: "show_progress" }, { type: "daily_challenge" }], mood: MOOD[input.intent] };
    }
  }
  const context = Object.values(ctx).filter((v) => typeof v === "number").join(" ");
  return { draft, lineIds, context };
}
