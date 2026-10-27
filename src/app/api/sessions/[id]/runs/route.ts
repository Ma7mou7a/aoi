import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { nextBlock, recordRun } from "@/lib/server/blocks";
import { getSessionForUser } from "@/lib/server/profile";
import { handle, HttpError, requireUser } from "@/lib/server/user";

const trial = z.object({
  trialIndex: z.number().int().nonnegative(),
  isPractice: z.boolean().optional(),
  stimulus: z.record(z.string(), z.unknown()),
  expected: z.unknown().optional(),
  response: z.unknown().optional(),
  outcome: z.enum(["response", "no_response", "timeout", "anticipation", "abandoned"]),
  correct: z.boolean().nullable(),
  rtMs: z.number().nonnegative().nullable(),
  behaviour: z
    .object({ hesitationMs: z.number().optional(), focusLost: z.boolean().optional(), changedAnswer: z.boolean().optional(), pointerDistancePx: z.number().optional() })
    .optional(),
  shownAt: z.string().datetime().optional(),
});

const body = z.object({
  dimensionId: z.string(),
  taskId: z.string(),
  level: z.number().int().positive(),
  params: z.record(z.string(), z.unknown()),
  reason: z.object({ rule: z.string(), expectedSdReduction: z.number(), note: z.string() }),
  startedAt: z.string().datetime(),
  status: z.enum(["completed", "abandoned"]),
  trials: z.array(trial).max(500),
  /** "How sure are you?" guess of the block score (0..1), made before the result is shown. */
  selfEstimate: z.number().min(0).max(1).nullable().optional(),
});

/** Submit one block: stores trials, scores it, updates the Brain Twin, and returns the next block. */
export const POST = handle(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  const session = await getSessionForUser(id, user.id);
  if (!session) throw new HttpError(404, "Session not found");
  if (session.status !== "active") throw new HttpError(409, "Session already ended");

  const parsed = body.safeParse(await req.json());
  if (!parsed.success) throw new HttpError(400, parsed.error.message);
  const b = parsed.data;

  // Strip behaviour signals unless the user opted in to them.
  const [latest] = await db
    .select({ granted: schema.consents.granted })
    .from(schema.consents)
    .where(and(eq(schema.consents.userId, user.id), eq(schema.consents.kind, "behavioural_signals")))
    .orderBy(desc(schema.consents.createdAt))
    .limit(1);
  const behaviourOk = latest?.granted ?? false;
  const trials = b.trials.map((t) => ({ ...t, behaviour: behaviourOk ? t.behaviour : undefined }));

  const result = await recordRun({ ...b, trials, userId: user.id, sessionId: session.id, startedAt: new Date(b.startedAt), behaviourOk, sessionStartedAt: session.startedAt });
  const next = await nextBlock(user.id, session.id, session.mode);
  if (!next) {
    await db.update(schema.sessions).set({ status: "completed", endedAt: new Date() }).where(eq(schema.sessions.id, session.id));
  }
  return Response.json({ result, next });
});
