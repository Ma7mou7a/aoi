import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { nextBlock } from "@/lib/server/blocks";
import { recordSignals, signalActedOnAdvice } from "@/lib/server/collab";
import { purgeExpired } from "@/lib/server/privacy";
import { handle, HttpError, requireUser } from "@/lib/server/user";

const body = z.object({
  mode: z.enum(["assessment", "training"]),
  /** Optional dimension id for the first block (getting-started links). */
  focus: z.string().max(64).optional(),
  device: z
    .object({
      type: z.enum(["desktop", "tablet", "phone"]),
      input: z.enum(["keyboard", "mouse", "touch"]),
      screen: z.tuple([z.number(), z.number()]),
    })
    .optional(),
});

/** Start a session (always non-biometric) and return its first block. */
export const POST = handle(async (req: Request) => {
  const user = await requireUser();
  const parsed = body.safeParse(await req.json());
  if (!parsed.success) throw new HttpError(400, parsed.error.message);

  // Housekeeping on activity: enforce the retention window, and credit acting on the coach's advice.
  await purgeExpired(user.id, user.retentionDays);
  const [previous] = await db
    .select({ startedAt: schema.sessions.startedAt })
    .from(schema.sessions)
    .where(eq(schema.sessions.userId, user.id))
    .orderBy(desc(schema.sessions.startedAt))
    .limit(1);
  const advice = await signalActedOnAdvice(user.id, previous?.startedAt ?? null);
  if (advice.length) await recordSignals(user.id, advice);

  const [session] = await db
    .insert(schema.sessions)
    .values({ userId: user.id, mode: parsed.data.mode, device: parsed.data.device, biometric: false })
    .returning();
  return Response.json({ sessionId: session.id, next: await nextBlock(user.id, session.id, parsed.data.mode, parsed.data.focus) });
});
