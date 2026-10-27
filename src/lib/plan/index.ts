import type { Dimension, Paradigm } from "../dimensions/schema";
import { Z90, type Posterior } from "../profiler";
import { predictedComposite } from "../selector";
import { inSentence } from "../text";

export type PlanItemDraft = {
  dimensionId: string;
  taskId: string;
  targetLevel: number;
  blocks: number;
  reason: string;
};

export type PlanDraft = { rationale: string; items: PlanItemDraft[] };

export const DEFAULT_BLOCKS_PER_WEEK = 12;

const pct = (x: number) => Math.round(x * 100);

/**
 * Weekly plan from the current Brain Twin. Every playable skill gets at least one block; the rest
 * are shared out by priority = 0.6 · (band width relative to the prior) + 0.4 · (room to grow),
 * so the week both sharpens uncertain estimates and trains the weakest skills. Unmeasured skills
 * get top priority. Each skill is practised at the level where the expected score is closest to
 * its task's target success rate (~75%).
 */
export function generateWeeklyPlan(input: {
  dimensions: Dimension[];
  posteriors: Record<string, Posterior>;
  available: readonly Paradigm[];
  blocksPerWeek?: number;
}): PlanDraft {
  const total = input.blocksPerWeek ?? DEFAULT_BLOCKS_PER_WEEK;
  const playable = input.dimensions
    .map((dim) => ({ dim, task: dim.tasks.find((t) => input.available.includes(t.paradigm)) }))
    .filter((x): x is { dim: Dimension; task: NonNullable<typeof x.task> } => !!x.task);
  if (!playable.length) return { rationale: "No playable tasks yet.", items: [] };

  const scored = playable.map(({ dim, task }) => {
    const p = input.posteriors[dim.id];
    const measured = p.nObservations > 0;
    const uncertainty = Math.min(1, p.sd / dim.profile.prior.sd);
    const priority = measured ? 0.6 * uncertainty + 0.4 * (1 - p.mean) : 1.2;
    const target = task.difficulty.target_success;
    const level = task.difficulty.levels.reduce((best, l) =>
      Math.abs(predictedComposite(p.mean, l.ability_range) - target) < Math.abs(predictedComposite(p.mean, best.ability_range) - target) ? l : best,
    ).level;
    const reason = !measured
      ? `Not measured yet: a first block gives your ${inSentence(dim.name)} estimate a starting point.`
      : uncertainty > 0.6
        ? `The band is still ±${pct(Z90 * p.sd)}% wide: more blocks will sharpen the estimate.`
        : `About ${pct(p.mean)}% now: level ${level} keeps you in the growth zone (~${pct(target)}% success).`;
    return { dim, task, priority, level, reason };
  });

  // At least one block each, then largest-remainder allocation of the rest by priority.
  const base = scored.map(() => 1);
  const rest = Math.max(0, total - scored.length);
  const sum = scored.reduce((s, x) => s + x.priority, 0);
  const exact = scored.map((x) => (rest * x.priority) / sum);
  const floors = exact.map(Math.floor);
  let left = rest - floors.reduce((a, b) => a + b, 0);
  const order = exact.map((e, i) => ({ i, frac: e - Math.floor(e) })).sort((a, b) => b.frac - a.frac);
  for (const { i } of order) {
    if (left-- <= 0) break;
    floors[i]++;
  }

  const items: PlanItemDraft[] = scored
    .map((x, i) => ({ x, blocks: base[i] + floors[i] }))
    .sort((a, b) => b.x.priority - a.x.priority)
    .map(({ x, blocks }) => ({ dimensionId: x.dim.id, taskId: x.task.id, targetLevel: x.level, blocks, reason: x.reason }));

  const top = scored.sort((a, b) => b.priority - a.priority)[0];
  return {
    rationale: `${total} blocks this week, about 3 per session. Most go to ${inSentence(top.dim.name)}, where ${
      top.priority >= 1.2 ? "nothing is measured yet" : "the estimate is least certain or has the most room to grow"
    }.`,
    items,
  };
}

/** Monday (UTC) of the week containing `d`, as YYYY-MM-DD. */
export function weekStartOf(d: Date): string {
  const day = (d.getUTCDay() + 6) % 7;
  const m = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - day));
  return m.toISOString().slice(0, 10);
}
