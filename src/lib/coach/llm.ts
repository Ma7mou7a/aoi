import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { COACH_JSON_SCHEMA, coachDraftSchema, type CoachDraft } from "./claims";

export const COACH_MODEL = process.env.COACH_MODEL ?? "claude-opus-5-5";

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
- 2 to 4 claims. Keep each claim to one or two sentences.`;

export type LlmResult = { ok: true; draft: CoachDraft } | { ok: false; reason: string };

let client: Anthropic | null = null;

/**
 * One structured-output request: evidence pack + question in, CoachDraft JSON out.
 * Never throws: any failure returns a reason so the caller can fall back to the rule-based coach.
 */
export async function draftWithLlm(userPrompt: string): Promise<LlmResult> {
  if (process.env.COACH_LLM === "off") return { ok: false, reason: "llm_disabled" };
  try {
    client ??= new Anthropic();
    const res = await client.beta.messages.create({
      model: COACH_MODEL,
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
    const parsed = coachDraftSchema.safeParse(JSON.parse(text.text));
    return parsed.success ? { ok: true, draft: parsed.data } : { ok: false, reason: "invalid_json" };
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) return { ok: false, reason: "no_api_access" };
    if (e instanceof Anthropic.RateLimitError) return { ok: false, reason: "rate_limited" };
    if (e instanceof Anthropic.APIConnectionError) return { ok: false, reason: "network" };
    if (e instanceof Anthropic.APIError) return { ok: false, reason: `api_error_${e.status ?? "unknown"}` };
    if (e instanceof Anthropic.AnthropicError) return { ok: false, reason: "no_api_access" }; // e.g. missing credentials
    if (e instanceof SyntaxError) return { ok: false, reason: "invalid_json" };
    // No API key / auth token / profile configured: the SDK raises a plain Error at request time.
    if (e instanceof Error && /resolve authentication/i.test(e.message)) return { ok: false, reason: "no_api_access" };
    console.error("[coach] unexpected LLM error", e);
    return { ok: false, reason: "unexpected_error" };
  }
}
