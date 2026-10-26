import { createHash } from "node:crypto";
import { count, eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { db, schema } from "@/db";
import { handle, requireUser, USER_COOKIE } from "@/lib/server/user";

/** One-click delete: every user-owned row goes (FK cascade); only a salted hash and row counts remain as proof. */
export const DELETE = handle(async () => {
  const user = await requireUser();
  const tables = { trials: schema.trials, task_runs: schema.taskRuns, profile_snapshots: schema.profileSnapshots, sessions: schema.sessions, consents: schema.consents, coach_messages: schema.coachMessages, collab_events: schema.collabEvents, goals: schema.goals, plans: schema.plans } as const;

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
