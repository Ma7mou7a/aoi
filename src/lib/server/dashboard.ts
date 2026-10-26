import "server-only";
import { and, asc, desc, eq, gte, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import { getDimensions } from "../dimensions/loader";
import { goalProgress, type GoalKind } from "../goals";
import { generateWeeklyPlan, weekStartOf } from "../plan";
import { checkForecast, projectGrowth, type Projection } from "../profiler/projection";
import { AVAILABLE_PARADIGMS } from "../tasks/registry";
import { currentCollabScore } from "./collab";
import { getPosteriors, getProfileView, type ProfileView } from "./profile";
import { HttpError } from "./user";

export const RANGE_OPTIONS = [7, 14, 28] as const;
export type RangeDays = (typeof RANGE_OPTIONS)[number];

const DAY = 86_400_000;

/** The active plan for this week, generated from the current Brain Twin on first visit of the week. */
async function ensureCurrentPlan(userId: string, regenerate = false) {
  const week = weekStartOf(new Date());
  const [active] = await db
    .select()
    .from(schema.plans)
    .where(and(eq(schema.plans.userId, userId), eq(schema.plans.status, "active")))
    .orderBy(desc(schema.plans.createdAt))
    .limit(1);
  const snapshotIds = (
    await db
      .selectDistinctOn([schema.profileSnapshots.dimensionId], { id: schema.profileSnapshots.id })
      .from(schema.profileSnapshots)
      .where(eq(schema.profileSnapshots.userId, userId))
      .orderBy(schema.profileSnapshots.dimensionId, desc(schema.profileSnapshots.createdAt))
  ).map((r) => r.id);
  // A plan made before anything was measured is rebuilt as soon as results exist.
  const builtBlind = active && active.basedOnSnapshotIds.length === 0 && snapshotIds.length > 0;
  if (active && active.weekStart === week && !regenerate && !builtBlind) return active;

  const posteriors = await getPosteriors(userId);
  const draft = generateWeeklyPlan({ dimensions: getDimensions(), posteriors, available: AVAILABLE_PARADIGMS });

  return db.transaction(async (tx) => {
    if (active) await tx.update(schema.plans).set({ status: "superseded" }).where(eq(schema.plans.id, active.id));
    const [plan] = await tx
      .insert(schema.plans)
      .values({ userId, weekStart: week, rationale: draft.rationale, basedOnSnapshotIds: snapshotIds })
      .returning();
    if (draft.items.length) {
      await tx.insert(schema.planItems).values(
        draft.items.map((i) => ({ planId: plan.id, dimensionId: i.dimensionId, taskId: i.taskId, targetLevel: i.targetLevel, sessionsTarget: i.blocks, reason: i.reason })),
      );
    }
    return plan;
  });
}

export async function regeneratePlan(userId: string) {
  return ensureCurrentPlan(userId, true);
}

async function planView(userId: string) {
  const plan = await ensureCurrentPlan(userId);
  const items = await db.select().from(schema.planItems).where(eq(schema.planItems.planId, plan.id));
  const since = new Date(`${plan.weekStart}T00:00:00Z`);
  const runs = await db
    .select({ taskId: schema.taskRuns.taskId })
    .from(schema.taskRuns)
    .where(and(eq(schema.taskRuns.userId, userId), eq(schema.taskRuns.status, "completed"), gte(schema.taskRuns.startedAt, since)));
  const dims = getDimensions();
  return {
    id: plan.id,
    weekStart: plan.weekStart,
    rationale: plan.rationale,
    createdAt: plan.createdAt.toISOString(),
    items: items.map((i) => {
      const dim = dims.find((d) => d.id === i.dimensionId);
      return {
        id: i.id,
        dimensionId: i.dimensionId,
        skill: dim?.name ?? i.dimensionId,
        task: dim?.tasks.find((t) => t.id === i.taskId)?.name ?? i.taskId,
        level: i.targetLevel,
        blocksTarget: i.sessionsTarget,
        blocksDone: runs.filter((r) => r.taskId === i.taskId).length,
        reason: i.reason,
      };
    }).sort((a, b) => b.blocksTarget - a.blocksTarget),
  };
}

async function sessionsInLast7Days(userId: string) {
  const runs = await db
    .select({ sessionId: schema.taskRuns.sessionId })
    .from(schema.taskRuns)
    .where(and(eq(schema.taskRuns.userId, userId), eq(schema.taskRuns.status, "completed"), gte(schema.taskRuns.startedAt, new Date(Date.now() - 7 * DAY))));
  return new Set(runs.map((r) => r.sessionId)).size;
}

async function goalsView(userId: string) {
  const [goals, posteriors, sessions7] = await Promise.all([
    db.select().from(schema.goals).where(and(eq(schema.goals.userId, userId), inArray(schema.goals.status, ["active", "achieved", "expired"]))).orderBy(desc(schema.goals.createdAt)),
    getPosteriors(userId),
    sessionsInLast7Days(userId),
  ]);
  const dims = getDimensions();
  const today = new Date().toISOString().slice(0, 10);
  const out = [];
  for (const g of goals) {
    const kind = g.kind as GoalKind;
    const progress = goalProgress({ kind, targetValue: g.targetValue }, { posterior: g.dimensionId ? posteriors[g.dimensionId] : undefined, startValue: g.currentValue, sessionsLast7Days: sessions7 });
    let status = g.status;
    // Persist transitions: achieved stays achieved; an unmet goal past its deadline expires.
    if (status === "active" && progress.achieved) {
      status = "achieved";
      await db.update(schema.goals).set({ status, achievedAt: new Date() }).where(eq(schema.goals.id, g.id));
    } else if (status === "active" && g.deadline && g.deadline < today) {
      status = "expired";
      await db.update(schema.goals).set({ status }).where(eq(schema.goals.id, g.id));
    }
    out.push({
      id: g.id,
      kind,
      title: g.title,
      dimensionId: g.dimensionId,
      skill: dims.find((d) => d.id === g.dimensionId)?.name ?? null,
      target: g.targetValue,
      deadline: g.deadline,
      status,
      progress,
    });
  }
  return { goals: out, sessionsLast7Days: sessions7 };
}

/** Blocks played per skill per day, with the average block score (for the activity heatmap). */
async function activity(userId: string, rangeDays: number) {
  const since = new Date(Date.now() - (rangeDays - 1) * DAY);
  since.setUTCHours(0, 0, 0, 0);
  const runs = await db
    .select({ dimensionId: schema.taskRuns.dimensionId, startedAt: schema.taskRuns.startedAt, composite: schema.taskRuns.composite })
    .from(schema.taskRuns)
    .where(and(eq(schema.taskRuns.userId, userId), eq(schema.taskRuns.status, "completed"), gte(schema.taskRuns.startedAt, since)))
    .orderBy(asc(schema.taskRuns.startedAt));
  const days = Array.from({ length: rangeDays }, (_, i) => new Date(since.getTime() + i * DAY).toISOString().slice(0, 10));
  const cells: Record<string, Record<string, { blocks: number; avgScore: number | null }>> = {};
  for (const dim of getDimensions()) {
    cells[dim.id] = Object.fromEntries(days.map((d) => [d, { blocks: 0, avgScore: null }]));
  }
  const sums: Record<string, number> = {};
  for (const r of runs) {
    const day = r.startedAt.toISOString().slice(0, 10);
    const cell = cells[r.dimensionId]?.[day];
    if (!cell) continue;
    cell.blocks++;
    const key = `${r.dimensionId}|${day}`;
    sums[key] = (sums[key] ?? 0) + (r.composite ?? 0);
    cell.avgScore = sums[key] / cell.blocks;
  }
  return { days, cells };
}

export const FORECAST_HORIZON_DAYS = 14;
const CHECK_HORIZON_DAYS = 7;

/**
 * Growth forecasts (shown) plus the twin's track record: once a week a 7-day forecast is stored;
 * when its date has passed, we check whether the estimate actually landed inside the forecast band.
 */
async function forecasts(userId: string, profile: ProfileView) {
  const dims = getDimensions();
  const now = new Date();
  const byDim: Record<string, Projection | null> = {};
  const toStore: Array<typeof schema.projections.$inferInsert> = [];

  const recent = await db
    .select({ dimensionId: schema.projections.dimensionId, createdAt: schema.projections.createdAt })
    .from(schema.projections)
    .where(and(eq(schema.projections.userId, userId), gte(schema.projections.createdAt, new Date(now.getTime() - 7 * DAY))));

  for (const d of profile.dimensions) {
    const dim = dims.find((x) => x.id === d.id)!;
    const history = d.history.filter((h) => h.measured).map((h) => ({ at: new Date(h.at), mean: h.mean, sd: (h.ciHigh - h.ciLow) / (2 * 1.6449) || 0.1 }));
    const drift = dim.profile.uncertainty.drift_sd_per_day;
    byDim[d.id] = projectGrowth(history, { mean: d.mean, sd: d.sd }, FORECAST_HORIZON_DAYS, drift, now);
    const weekly = projectGrowth(history, { mean: d.mean, sd: d.sd }, CHECK_HORIZON_DAYS, drift, now);
    if (weekly && !recent.some((r) => r.dimensionId === d.id)) {
      toStore.push({ userId, dimensionId: d.id, model: "trend_v1", horizonDays: CHECK_HORIZON_DAYS, mean: weekly.mean, ciLow: weekly.ciLow, ciHigh: weekly.ciHigh, fittedOnSnapshots: history.length });
    }
  }
  if (toStore.length) await db.insert(schema.projections).values(toStore);

  // Track record: past forecasts whose target date has passed and that have newer data to compare with.
  const past = await db.select().from(schema.projections).where(eq(schema.projections.userId, userId)).orderBy(desc(schema.projections.createdAt));
  const checks = [];
  for (const p of past) {
    const target = p.createdAt.getTime() + p.horizonDays * DAY;
    if (target > now.getTime()) continue;
    const d = profile.dimensions.find((x) => x.id === p.dimensionId);
    const after = d?.history.filter((h) => h.measured && new Date(h.at).getTime() > p.createdAt.getTime() && new Date(h.at).getTime() <= target).at(-1);
    if (!d || !after) continue;
    checks.push({ skill: d.name, madeAt: p.createdAt.toISOString(), forBand: [p.ciLow, p.ciHigh] as [number, number], actual: after.mean, hit: checkForecast(p, after.mean) });
  }
  return { byDim, checks, hitRate: checks.length ? checks.filter((c) => c.hit).length / checks.length : null };
}

export async function getDashboard(userId: string, rangeDays: RangeDays) {
  const [profile, plan, goals, heat, collab] = await Promise.all([
    getProfileView(userId),
    planView(userId),
    goalsView(userId),
    activity(userId, rangeDays),
    currentCollabScore(userId),
  ]);
  const forecast = await forecasts(userId, profile);
  return { profile, plan, goals, heat, collabScore: collab.score, rangeDays, forecast };
}
export type DashboardData = Awaited<ReturnType<typeof getDashboard>>;

export async function createGoal(userId: string, input: { kind: GoalKind; dimensionId?: string; target: number; deadlineDays: number }) {
  const deadline = new Date(Date.now() + input.deadlineDays * DAY).toISOString().slice(0, 10);
  if (input.kind === "consistency") {
    const [g] = await db
      .insert(schema.goals)
      .values({ userId, kind: "consistency", title: `Play ${input.target} sessions a week`, targetValue: input.target, deadline })
      .returning();
    return g;
  }
  const dim = getDimensions().find((d) => d.id === input.dimensionId);
  if (!dim) throw new HttpError(400, "Pick a skill for this goal.");
  const p = (await getPosteriors(userId))[dim.id];
  // currentValue holds the estimate when the goal was set: the meter measures progress from there.
  const [g] = await db
    .insert(schema.goals)
    .values({ userId, kind: "reach_score", dimensionId: dim.id, title: `${dim.name} to ${Math.round(input.target * 100)}%`, targetValue: input.target, currentValue: p.mean, deadline })
    .returning();
  return g;
}

export async function dropGoal(userId: string, goalId: string) {
  const [g] = await db.update(schema.goals).set({ status: "dropped" }).where(and(eq(schema.goals.id, goalId), eq(schema.goals.userId, userId))).returning();
  if (!g) throw new HttpError(404, "Goal not found");
}
