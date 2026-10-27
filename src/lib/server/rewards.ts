import "server-only";
import { and, count, desc, eq, gte, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { getDimensions } from "../dimensions/loader";
import { BADGES, earnedBadges, gardenStalks, REWARD_AMOUNTS, streakBonus, streakWithFreeze, type RewardKind } from "../rewards";

export type EarnedReward = { kind: RewardKind; amount: number; badge?: string };

const todayUtc = () => new Date().toISOString().slice(0, 10);

/** Award once: the unique index (user, kind, day, ref) turns a repeat into a no-op. True if it was new. */
export async function award(userId: string, kind: RewardKind, ref = "", amount?: number): Promise<boolean> {
  const value = amount ?? (kind === "streak_day" ? 0 : REWARD_AMOUNTS[kind]);
  const rows = await db
    .insert(schema.rewardEvents)
    .values({ userId, kind, amount: value, day: todayUtc(), ref })
    .onConflictDoNothing()
    .returning({ id: schema.rewardEvents.id });
  return rows.length > 0;
}

async function activeDays(userId: string) {
  const rows = await db
    .selectDistinct({ day: sql<string>`to_char(${schema.taskRuns.startedAt} at time zone 'UTC', 'YYYY-MM-DD')` })
    .from(schema.taskRuns)
    .where(and(eq(schema.taskRuns.userId, userId), eq(schema.taskRuns.status, "completed")));
  return rows.map((r) => r.day);
}

export async function getRewards(userId: string) {
  const rows = await db.select().from(schema.rewardEvents).where(eq(schema.rewardEvents.userId, userId));
  const today = todayUtc();
  const total = rows.reduce((s, r) => s + r.amount, 0);
  const { streak, frozenDays } = streakWithFreeze(await activeDays(userId));
  return {
    total,
    today: rows.filter((r) => r.day === today).reduce((s, r) => s + r.amount, 0),
    streak,
    frozenDays,
    badges: rows.filter((r) => r.kind === "badge").map((r) => r.ref),
    gardenStalks: gardenStalks(total),
    giftClaimedToday: rows.some((r) => r.kind === "daily_visit" && r.day === today),
  };
}
export type RewardsView = Awaited<ReturnType<typeof getRewards>>;

/** Is every item of the user's current weekly plan done? Returns the plan id if so. */
async function completedPlanId(userId: string): Promise<string | null> {
  const [plan] = await db
    .select()
    .from(schema.plans)
    .where(and(eq(schema.plans.userId, userId), eq(schema.plans.status, "active")))
    .orderBy(desc(schema.plans.createdAt))
    .limit(1);
  if (!plan) return null;
  const items = await db.select().from(schema.planItems).where(eq(schema.planItems.planId, plan.id));
  if (!items.length) return null;
  const runs = await db
    .select({ taskId: schema.taskRuns.taskId })
    .from(schema.taskRuns)
    .where(and(eq(schema.taskRuns.userId, userId), eq(schema.taskRuns.status, "completed"), gte(schema.taskRuns.startedAt, new Date(`${plan.weekStart}T00:00:00Z`))));
  const done = items.every((i) => runs.filter((r) => r.taskId === i.taskId).length >= i.sessionsTarget);
  return done ? plan.id : null;
}

async function badgeFacts(userId: string, runId: string) {
  const runs = await db
    .select({ id: schema.taskRuns.id, dimensionId: schema.taskRuns.dimensionId, affect: schema.taskRuns.affect })
    .from(schema.taskRuns)
    .where(and(eq(schema.taskRuns.userId, userId), eq(schema.taskRuns.status, "completed")))
    .orderBy(desc(schema.taskRuns.startedAt));
  const idx = runs.findIndex((r) => r.id === runId);
  const previous = idx >= 0 ? runs[idx + 1] : undefined;
  const [{ n: questionsAsked }] = await db.select({ n: count() }).from(schema.coachMessages).where(and(eq(schema.coachMessages.userId, userId), eq(schema.coachMessages.role, "user")));
  const [{ n: caughtErrors }] = await db.select({ n: count() }).from(schema.collabEvents).where(and(eq(schema.collabEvents.userId, userId), eq(schema.collabEvents.signal, "caught_planted_flaw")));
  const [{ n: dailyDone }] = await db.select({ n: count() }).from(schema.rewardEvents).where(and(eq(schema.rewardEvents.userId, userId), eq(schema.rewardEvents.kind, "daily_challenge")));
  const [{ n: goalsSet }] = await db.select({ n: count() }).from(schema.goals).where(eq(schema.goals.userId, userId));
  return {
    skillsPlayed: [...new Set(runs.map((r) => r.dimensionId))],
    streak: streakWithFreeze(await activeDays(userId)).streak,
    questionsAsked,
    caughtErrors,
    dailyDone,
    goalsSet,
    playedAfterTough: !!previous?.affect?.easeOff,
  };
}

/** Bamboo for a finished game: the game itself, a streak day, a finished weekly plan, a daily challenge, and new badges. */
export async function awardForRun(userId: string, run: { id: string; valid: boolean; daily?: boolean }): Promise<EarnedReward[]> {
  if (!run.valid) return [];
  const earned: EarnedReward[] = [];
  if (await award(userId, "game_completed", run.id)) earned.push({ kind: "game_completed", amount: REWARD_AMOUNTS.game_completed });

  const { streak } = streakWithFreeze(await activeDays(userId));
  if (streak >= 2) {
    const bonus = streakBonus(streak);
    if (await award(userId, "streak_day", "", bonus)) earned.push({ kind: "streak_day", amount: bonus });
  }
  if (run.daily && (await award(userId, "daily_challenge"))) earned.push({ kind: "daily_challenge", amount: REWARD_AMOUNTS.daily_challenge });

  const planId = await completedPlanId(userId);
  if (planId) {
    const [already] = await db
      .select({ id: schema.rewardEvents.id })
      .from(schema.rewardEvents)
      .where(and(eq(schema.rewardEvents.userId, userId), eq(schema.rewardEvents.kind, "daily_plan_done"), eq(schema.rewardEvents.ref, planId)))
      .limit(1);
    if (!already && (await award(userId, "daily_plan_done", planId))) earned.push({ kind: "daily_plan_done", amount: REWARD_AMOUNTS.daily_plan_done });
  }

  const have = new Set(
    (await db.select({ ref: schema.rewardEvents.ref }).from(schema.rewardEvents).where(and(eq(schema.rewardEvents.userId, userId), eq(schema.rewardEvents.kind, "badge")))).map((r) => r.ref),
  );
  for (const badge of earnedBadges(await badgeFacts(userId, run.id), getDimensions().map((d) => d.id))) {
    if (!have.has(badge) && (await award(userId, "badge", badge))) earned.push({ kind: "badge", amount: REWARD_AMOUNTS.badge, badge });
  }
  return earned;
}

export const badgeInfo = (id: string) => BADGES.find((b) => b.id === id);
