import type { Pace } from "./intent";

/**
 * Buttons the coach can attach to a reply. The model (or the template coach) proposes raw actions;
 * the server keeps only valid ones and turns them into links or in-chat requests. Flat shape so the
 * same JSON schema works in strict structured-output mode on both providers.
 */
export type RawAction = {
  type: "play" | "show_progress" | "forecast" | "set_goal" | "daily_challenge";
  skill?: string;
  mode?: "training" | "assessment";
  gamesPerWeek?: number;
};

export type ClientAction = { label: string; kind: "link" | "forecast"; href?: string; forecast?: { skill: string; gamesPerWeek: Pace } };

export const MAX_ACTIONS = 3;
const PACES: readonly number[] = [2, 4, 7];

function resolveOne(a: RawAction, dims: Array<{ id: string; name: string }>): ClientAction | null {
  const dim = a.skill ? dims.find((d) => d.id === a.skill) : undefined;
  switch (a.type) {
    case "play":
      if (!dim || (a.mode !== "training" && a.mode !== "assessment")) return null;
      return { label: `▶ Play: ${dim.name}`, kind: "link", href: `/play?focus=${dim.id}&mode=${a.mode}` };
    case "show_progress":
      if (a.skill && !dim) return null;
      return { label: "Show my progress", kind: "link", href: dim ? `/dashboard#${dim.id}` : "/dashboard" };
    case "forecast":
      if (!dim || !PACES.includes(a.gamesPerWeek ?? 0)) return null;
      return { label: `What if I play ${a.gamesPerWeek}×/week?`, kind: "forecast", forecast: { skill: dim.id, gamesPerWeek: a.gamesPerWeek as Pace } };
    case "set_goal":
      if (a.skill && !dim) return null;
      return { label: "Set a goal", kind: "link", href: "/dashboard#goals" };
    case "daily_challenge":
      return { label: "Today's challenge", kind: "link", href: "/daily" };
    default:
      return null;
  }
}

/** Valid, de-duplicated client actions, at most MAX_ACTIONS. Anything unknown is dropped silently. */
export function resolveActions(raw: RawAction[], dims: Array<{ id: string; name: string }>): ClientAction[] {
  const out: ClientAction[] = [];
  for (const a of raw) {
    const r = resolveOne(a, dims);
    if (r && !out.some((o) => o.label === r.label)) out.push(r);
    if (out.length === MAX_ACTIONS) break;
  }
  return out;
}
