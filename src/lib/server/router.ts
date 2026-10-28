import "server-only";
import { classifyIntent } from "../coach/intent";
import { structuredWithLlm } from "../coach/llm";
import { parseRoute, ROUTE_JSON_SCHEMA, routerPrompt, ROUTER_SYSTEM, type Route } from "../coach/route";

/** Short: the coach's answer still needs its own call, so a slow router falls back instead of waiting. */
const ROUTER_TIMEOUT_MS = 6000;

/**
 * Step 1 of the coach ("understand"): an AI reads the message and picks what to compute from a fixed
 * menu. Steps 2 and 3 are unchanged: the engine computes, the coach writes, the checker verifies.
 * Only called with the user's AI consent; any failure or off-menu choice falls back to the keywords.
 */
export async function routeQuestion(question: string, skills: Array<{ id: string; name: string }>): Promise<Route & { routedBy: "ai" | "keywords" }> {
  const r = await structuredWithLlm({
    system: ROUTER_SYSTEM,
    prompt: routerPrompt(question, skills),
    name: "coach_route",
    schema: ROUTE_JSON_SCHEMA,
    parse: (x) => parseRoute(x, skills.map((s) => s.id)),
    maxTokens: 1000,
    timeoutMs: ROUTER_TIMEOUT_MS,
  });
  if (r.ok) {
    // Keep the keyword reading of the pace when the AI didn't give one ("3 times a week" is parsed exactly).
    const pace = r.data.pace ?? (r.data.intent === "forecast" ? classifyIntent(question).pace : undefined);
    return { ...r.data, ...(pace ? { pace } : {}), routedBy: "ai" };
  }
  return { ...classifyIntent(question), routedBy: "keywords" };
}
