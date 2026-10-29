import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { readJson } from "@/lib/security/body";
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
  lookedAway: z.boolean().optional(),
});

const body = z.object({
  dimensionId: z.string().max(64),
  taskId: z.string().max(64),
  level: z.number().int().positive(),
  params: z.record(z.string(), z.unknown()),
  reason: z.object({ rule: z.string().max(64), expectedSdReduction: z.number(), note: z.string().max(500) }),
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
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new HttpError(404, "Session not found");
  const session = await getSessionForUser(id, user.id);
  if (!session) throw new HttpError(404, "Session not found");
  if (session.status !== "active") throw new HttpError(409, "Session already ended");

  // A block carries all its trials (up to 500), so it gets a larger, still bounded, body limit.
  const b = await readJson(req, body, { maxBytes: 512 * 1024 });

  // Strip behaviour signals unless the user opted in to them, and Focus Guard flags without camera consent.
  const consented = async (kind: "behavioural_signals" | "camera") => {
    const [latest] = await db
      .select({ granted: schema.consents.granted })
      .from(schema.consents)
      .where(and(eq(schema.consents.userId, user.id), eq(schema.consents.kind, kind)))
      .orderBy(desc(schema.consents.createdAt))
      .limit(1);
    return latest?.granted ?? false;
  };
  const behaviourOk = await consented("behavioural_signals");
  const cameraOk = await consented("camera");
  const trials = b.trials.map((t) => ({ ...t, behaviour: behaviourOk ? t.behaviour : undefined, lookedAway: cameraOk ? t.lookedAway : undefined }));

  const result = await recordRun({ ...b, trials, userId: user.id, sessionId: session.id, startedAt: new Date(b.startedAt), behaviourOk, sessionStartedAt: session.startedAt });
  const next = await nextBlock(user.id, session.id, session.mode);
  if (!next) {
    await db.update(schema.sessions).set({ status: "completed", endedAt: new Date() }).where(eq(schema.sessions.id, session.id));
  }
  return Response.json({ result, next });
});
