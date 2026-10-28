import { z } from "zod";
import { EMPTY_MEMORY } from "@/lib/coach/memory";
import { getDimensions } from "@/lib/dimensions/loader";
import { readJson } from "@/lib/security/body";
import { createAccount } from "@/lib/server/accounts";
import { handle, startSession } from "@/lib/server/user";

const body = z.object({
  // Letters, digits, spaces and simple punctuation; no control characters.
  displayName: z.string().trim().min(1).max(40).regex(/^[^\p{C}<>]+$/u, "Please use letters, numbers and spaces in your name."),
  consents: z.object({
    data_processing: z.literal(true, { errorMap: () => ({ message: "Consent to data processing is required to use the app." }) }),
    behavioural_signals: z.boolean(),
    llm_coaching: z.boolean(),
    // Spot-the-error mode is opt-in from Settings; recorded as "not granted" at signup.
    planted_flaws: z.boolean().default(false),
    age_18_plus: z.literal(true, { errorMap: () => ({ message: "AI4Brain is for adults: please confirm you are 18 or over." }) }),
  }),
  retentionDays: z.number().int().min(7).max(365).default(180),
  /** What the user wants to grow: a skill id, or "curious". Seeds the coach's memory. */
  goal: z.string().max(64).optional(),
});

/** Create an anonymous profile and record each consent choice (granted or not) for the audit trail. */
export const POST = handle(async (req: Request) => {
  const { displayName, consents, retentionDays, goal } = await readJson(req, body, { maxBytes: 4096 });
  const known = goal === "curious" || getDimensions().some((d) => d.id === goal);
  // Bao asked about AI during signup, so he won't ask again in the chat.
  const coachMemory = { ...EMPTY_MEMORY, aiAsked: true, ...(goal && known ? { goal } : {}) };

  // The sign-in key is shown once, right after signup; only its hash is stored.
  const { user, signinKey } = await createAccount({ displayName, retentionDays, coachMemory, consents });
  await startSession(user.id, "signup");
  return Response.json({ id: user.id, displayName: user.displayName, signinKey });
});
