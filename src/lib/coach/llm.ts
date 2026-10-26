import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { COACH_JSON_SCHEMA, coachDraftSchema, type CoachDraft } from "./claims";

/**
 * Two interchangeable LLM providers behind one contract (evidence pack in, CoachDraft JSON out):
 *  - Claude (Anthropic) when ANTHROPIC_API_KEY is set,
 *  - otherwise an open-weight model on Groq when GROQ_API_KEY is set.
 * COACH_PROVIDER=claude|groq forces one. Whatever answers, the server re-checks every claim.
 */
export const CLAUDE_MODEL = process.env.COACH_MODEL ?? "claude-opus-5-5";
export const GROQ_MODEL = process.env.GROQ_MODEL ?? "openai/gpt-oss-120b";
const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const TIMEOUT_MS = 45_000;

const SYSTEM = `You are the AI4Brain coach, a friendly guide for a non-clinical cognitive training app.
The user plays short tasks (N-back, Stroop, Corsi blocks...) and the app keeps an uncertainty-aware estimate per skill.

Write feedback that is specific, warm and honest, grounded only in the evidence pack you are given.

Rules:
- Every claim must cite at least one reference from the evidence pack (R# for a block, T# for a group of trials), exactly as written. Use only numbers that appear in the pack.
- Estimates are uncertain. When you give an estimate, mention its band. Never present a future change as certain.
- Compare the user only with their own earlier results, never with other people, norms or averages.
- This is not a medical or diagnostic tool. Never mention or hint at health conditions, disorders, diagnoses or medical terms. If the user asks about a condition, say kindly that the app can't speak to health questions and that a qualified professional can, then return to what the results do show.
- If a block is marked LOW RELIABILITY, say gently that it counted less and why, without blame.
- Explain like a good coach: what happened, why it matters, one thing to try next. Plain English, second person, no jargon (say "false alarms", not "d-prime").
- Be encouraging: name one genuine strength or improvement when the evidence shows one.
- 2 to 4 claims. Keep each claim to one or two sentences.`;

export type LlmResult = { ok: true; draft: CoachDraft; model: string } | { ok: false; reason: string };

export function activeProvider(): "claude" | "groq" | null {
  const forced = process.env.COACH_PROVIDER;
  if (forced === "claude" || forced === "groq") return forced;
  if (process.env.ANTHROPIC_API_KEY) return "claude";
  if (process.env.GROQ_API_KEY) return "groq";
  return null;
}

const parseDraft = (text: string) => {
  const parsed = coachDraftSchema.safeParse(JSON.parse(text));
  return parsed.success ? parsed.data : null;
};

let anthropic: Anthropic | null = null;

async function draftWithClaude(userPrompt: string): Promise<LlmResult> {
  try {
    anthropic ??= new Anthropic();
    const res = await anthropic.beta.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 16000,
      // Server-side fallback if a safety classifier declines the request on this model.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "medium", format: { type: "json_schema", schema: COACH_JSON_SCHEMA } },
      system: SYSTEM,
      messages: [{ role: "user", content: userPrompt }],
    });
    if (res.stop_reason === "refusal") return { ok: false, reason: "refusal" };
    if (res.stop_reason === "max_tokens") return { ok: false, reason: "max_tokens" };
    const text = res.content.find((b) => b.type === "text");
    if (!text || text.type !== "text") return { ok: false, reason: "no_text" };
    const draft = parseDraft(text.text);
    return draft ? { ok: true, draft, model: CLAUDE_MODEL } : { ok: false, reason: "invalid_json" };
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) return { ok: false, reason: "no_api_access" };
    if (e instanceof Anthropic.RateLimitError) return { ok: false, reason: "rate_limited" };
    if (e instanceof Anthropic.APIConnectionError) return { ok: false, reason: "network" };
    if (e instanceof Anthropic.APIError) return { ok: false, reason: `api_error_${e.status ?? "unknown"}` };
    if (e instanceof Anthropic.AnthropicError) return { ok: false, reason: "no_api_access" }; // e.g. missing credentials
    if (e instanceof SyntaxError) return { ok: false, reason: "invalid_json" };
    // No API key / auth token / profile configured: the SDK raises a plain Error at request time.
    if (e instanceof Error && /resolve authentication/i.test(e.message)) return { ok: false, reason: "no_api_access" };
    console.error("[coach] unexpected Claude error", e);
    return { ok: false, reason: "unexpected_error" };
  }
}

/** Groq's OpenAI-compatible endpoint with strict JSON-schema structured output. */
async function draftWithGroq(userPrompt: string): Promise<LlmResult> {
  const key = process.env.GROQ_API_KEY;
  if (!key) return { ok: false, reason: "no_api_access" };
  try {
    const res = await fetch(GROQ_URL, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages: [
          { role: "system", content: SYSTEM },
          { role: "user", content: userPrompt },
        ],
        response_format: { type: "json_schema", json_schema: { name: "coach_draft", strict: true, schema: COACH_JSON_SCHEMA } },
        reasoning_effort: "medium",
        max_completion_tokens: 4096,
      }),
    });
    if (res.status === 401 || res.status === 403) return { ok: false, reason: "no_api_access" };
    if (res.status === 429) return { ok: false, reason: "rate_limited" };
    if (!res.ok) {
      console.error("[coach] Groq error", res.status, (await res.text()).slice(0, 300));
      return { ok: false, reason: `api_error_${res.status}` };
    }
    const json = (await res.json()) as { choices?: Array<{ finish_reason?: string; message?: { content?: string | null } }> };
    const choice = json.choices?.[0];
    if (choice?.finish_reason === "length") return { ok: false, reason: "max_tokens" };
    if (!choice?.message?.content) return { ok: false, reason: "no_text" };
    const draft = parseDraft(choice.message.content);
    return draft ? { ok: true, draft, model: `${GROQ_MODEL} via Groq` } : { ok: false, reason: "invalid_json" };
  } catch (e) {
    if (e instanceof SyntaxError) return { ok: false, reason: "invalid_json" };
    if (e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError")) return { ok: false, reason: "network" };
    if (e instanceof TypeError) return { ok: false, reason: "network" }; // fetch failed
    console.error("[coach] unexpected Groq error", e);
    return { ok: false, reason: "unexpected_error" };
  }
}

/**
 * One structured-output request: evidence pack + question in, CoachDraft JSON out.
 * Never throws: any failure returns a reason so the caller can fall back to the rule-based coach.
 */
export async function draftWithLlm(userPrompt: string): Promise<LlmResult> {
  if (process.env.COACH_LLM === "off") return { ok: false, reason: "llm_disabled" };
  const provider = activeProvider();
  if (provider === "claude") return draftWithClaude(userPrompt);
  if (provider === "groq") return draftWithGroq(userPrompt);
  return { ok: false, reason: "no_api_access" };
}
