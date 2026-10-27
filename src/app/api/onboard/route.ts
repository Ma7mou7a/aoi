import { cookies } from "next/headers";
import { z } from "zod";
import { db, schema } from "@/db";
import { EMPTY_MEMORY } from "@/lib/coach/memory";
import { getDimensions } from "@/lib/dimensions/loader";
import { generateSigninKey, hashSigninKey, normaliseSigninKey } from "@/lib/signinKey";
import { handle, HttpError, POLICY_VERSION, USER_COOKIE } from "@/lib/server/user";

const body = z.object({
  displayName: z.string().trim().min(1).max(40),
  consents: z.object({
    data_processing: z.literal(true, { errorMap: () => ({ message: "Consent to data processing is required to use the app." }) }),
    behavioural_signals: z.boolean(),
    llm_coaching: z.boolean(),
    // Spot-the-error mode is opt-in from Settings; recorded as "not granted" at signup.
    planted_flaws: z.boolean().default(false),
  }),
  retentionDays: z.number().int().min(7).max(365).default(180),
  /** What the user wants to grow: a skill id, or "curious". Seeds the coach's memory. */
  goal: z.string().max(64).optional(),
});

/** Create an anonymous profile and record each consent choice (granted or not) for the audit trail. */
export const POST = handle(async (req: Request) => {
  const parsed = body.safeParse(await req.json());
  if (!parsed.success) throw new HttpError(400, parsed.error.issues.map((i) => i.message).join("; "));
  const { displayName, consents, retentionDays, goal } = parsed.data;
  const known = goal === "curious" || getDimensions().some((d) => d.id === goal);
  // Bao asked about AI during signup, so he won't ask again in the chat.
  const coachMemory = { ...EMPTY_MEMORY, aiAsked: true, ...(goal && known ? { goal } : {}) };

  // The sign-in key is shown once, right after signup; only its hash is stored.
  const signinKey = generateSigninKey();
  const user = await db.transaction(async (tx) => {
    const [u] = await tx.insert(schema.users).values({ displayName, retentionDays, coachMemory, signinKeyHash: hashSigninKey(normaliseSigninKey(signinKey)!) }).returning();
    await tx.insert(schema.consents).values(
      (Object.entries(consents) as [keyof typeof consents, boolean][]).map(([kind, granted]) => ({
        userId: u.id,
        kind,
        granted,
        policyVersion: POLICY_VERSION,
      })),
    );
    return u;
  });

  (await cookies()).set(USER_COOKIE, user.id, { httpOnly: true, sameSite: "lax", path: "/", maxAge: retentionDays * 86_400 });
  return Response.json({ id: user.id, displayName: user.displayName, signinKey });
});
