import { inSentence } from "../text";
import { resolveActions, type ClientAction } from "./actions";
import type { PaceRef } from "./evidence";
import type { Pace } from "./intent";

/**
 * A forecast question must get a forecast. If the reply (model or template) doesn't state the range
 * from the pace forecast, append it in fixed words; if it has no buttons, add Play and the other pace.
 * The sentence is built from the evidence itself, so it always passes the number check.
 */
export function ensureForecast<T extends { content: string; actions: ClientAction[] }>(
  reply: T,
  pace: PaceRef[],
  asked: { skill?: string; pace?: Pace },
  dims: Array<{ id: string; name: string }>,
): T {
  const games = asked.pace ?? 4;
  const p = pace.find((x) => x.skill === asked.skill && x.gamesPerWeek === games);
  if (!p) return reply;
  const states = reply.content.includes(String(p.toPct)) && reply.content.includes(String(p.lowPct)) && reply.content.includes(String(p.highPct));
  const content = states
    ? reply.content
    : `${reply.content} If your recent trend continues at ${games} games a week, your ${inSentence(p.skillName)} score could be about ${p.toPct} next week (likely ${p.lowPct}–${p.highPct}). A range, not a promise.`;
  const others = pace.filter((x) => x.skill === p.skill && x.gamesPerWeek !== games).map((x) => ({ type: "forecast" as const, skill: x.skill, gamesPerWeek: x.gamesPerWeek }));
  const actions = reply.actions.length ? reply.actions : resolveActions([{ type: "play", skill: p.skill, mode: "training" }, ...others], dims);
  return states && reply.actions.length ? reply : { ...reply, content, actions };
}
