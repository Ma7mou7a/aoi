import type { Dimension } from "./dimensions/schema";

/**
 * Bao's daily challenge: one game a day, the same puzzle for everyone (a seed from the UTC date), the
 * skill rotating through all seven. Only your own result is ever shown or shared.
 */

/** Skill rotation, one per day. */
export const DAILY_ORDER = ["working_memory", "visuospatial_memory", "attention_inhibition", "processing_speed", "cognitive_flexibility", "reasoning", "ai_reliance"];

/** FNV-1a (32-bit) of "ai4brain-daily-<day>", as a non-negative seed below 2^31. */
export function dailySeed(day: string): number {
  let h = 0x811c9dc5;
  for (const ch of `ai4brain-daily-${day}`) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h % 2 ** 31;
}

export const todayUtc = (now = new Date()) => now.toISOString().slice(0, 10);

export function dailyChallenge(day: string, dims: Dimension[]) {
  const n = Math.floor(Date.parse(`${day}T00:00:00Z`) / 86_400_000);
  const dimensionId = DAILY_ORDER[((n % DAILY_ORDER.length) + DAILY_ORDER.length) % DAILY_ORDER.length];
  const dim = dims.find((d) => d.id === dimensionId)!;
  const task = dim.tasks[0];
  const levels = task.difficulty.levels.map((l) => l.level);
  return { day, dimensionId, taskId: task.id, level: levels[Math.floor(levels.length / 2)], seed: dailySeed(day) };
}

/** Was this block today's daily challenge? (today's skill, played with today's seed) */
export function isDailyRun(run: { dimensionId: string; params: Record<string, unknown> }, day: string, dims: Dimension[]): boolean {
  const c = dailyChallenge(day, dims);
  return run.dimensionId === c.dimensionId && run.params.seed === c.seed;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Text to paste anywhere: date, game, five squares for the score, one detail. No name, no ids. */
export function shareText({ day, taskName, score, detail }: { day: string; taskName: string; score: number; detail: string }): string {
  const [, m, d] = day.split("-").map(Number);
  const s = Math.max(0, Math.min(1, score)) * 5;
  const full = Math.floor(s);
  const half = s - full >= 0.5 ? 1 : 0;
  const squares = "🟩".repeat(full) + "🟨".repeat(half) + "⬜".repeat(5 - full - half);
  return [`Bao's daily · ${MONTHS[m - 1]} ${d} · ${taskName} ${squares}`, detail, "ai4brain"].filter(Boolean).join(" · ");
}
