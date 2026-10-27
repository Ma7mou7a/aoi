import { createHash } from "node:crypto";
import { count, eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { z } from "zod";
import { db, schema } from "@/db";
import { purgeExpired, RETENTION_OPTIONS } from "@/lib/server/privacy";
import { handle, HttpError, requireUser, USER_COOKIE } from "@/lib/server/user";

const patch = z
  .object({
    retentionDays: z.number().int().refine((d) => (RETENTION_OPTIONS as readonly number[]).includes(d)).optional(),
    researchMode: z.boolean().optional(),
  })
  .refine((p) => p.retentionDays !== undefined || p.researchMode !== undefined);

/** Change how long data is kept; anything older than the new window is deleted right away. */
export const PATCH = handle(async (req: Request) => {
  const user = await requireUser();
  const parsed = patch.safeParse(await req.json());
  if (!parsed.success) throw new HttpError(400, `Retention must be one of ${RETENTION_OPTIONS.join(", ")} days.`);
  const { retentionDays: days, researchMode } = parsed.data;
  if (researchMode !== undefined) {
    await db.update(schema.users).set({ preferences: { ...user.preferences, researchMode } }).where(eq(schema.users.id, user.id));
  }
  if (days !== undefined) {
    await db.update(schema.users).set({ retentionDays: days }).where(eq(schema.users.id, user.id));
    await purgeExpired(user.id, days);
    (await cookies()).set(USER_COOKIE, user.id, { httpOnly: true, sameSite: "lax", path: "/", maxAge: days * 86_400 });
  }
  return Response.json({ retentionDays: days ?? user.retentionDays, researchMode: researchMode ?? !!user.preferences.researchMode });
});

/** One-click delete: every user-owned row goes (FK cascade); only a salted hash and row counts remain as proof. */
export const DELETE = handle(async () => {
  const user = await requireUser();
  const tables = { trials: schema.trials, task_runs: schema.taskRuns, profile_snapshots: schema.profileSnapshots, sessions: schema.sessions, consents: schema.consents, coach_messages: schema.coachMessages, collab_events: schema.collabEvents, collab_scores: schema.collabScores, goals: schema.goals, plans: schema.plans, reward_events: schema.rewardEvents } as const;

  const rowsDeleted: Record<string, number> = {};
  await db.transaction(async (tx) => {
    for (const [name, t] of Object.entries(tables)) {
      const [{ n }] = await tx.select({ n: count() }).from(t).where(eq(t.userId, user.id));
      rowsDeleted[name] = n;
    }
    await tx.delete(schema.users).where(eq(schema.users.id, user.id));
    await tx.insert(schema.deletionLog).values({
      userHash: createHash("sha256").update(`ai4brain:${user.id}`).digest("hex"),
      reason: "user_request",
      rowsDeleted,
    });
  });

  (await cookies()).delete(USER_COOKIE);
  return Response.json({ deleted: true, rowsDeleted });
});
