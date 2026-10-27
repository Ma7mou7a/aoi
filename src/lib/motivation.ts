import { inSentence } from "./text";
/** Consecutive days (UTC) with at least one completed block, counting back from today or yesterday. */
export function dayStreak(activeDays: string[], today = new Date()): number {
  const days = new Set(activeDays);
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const cursor = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  if (!days.has(iso(cursor))) cursor.setUTCDate(cursor.getUTCDate() - 1); // today not played yet: streak still alive
  let n = 0;
  while (days.has(iso(cursor))) {
    n++;
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }
  return n;
}

/**
 * Celebrations earned by a block, only from real improvements against the user's own history
 * (never against other people). Empty when nothing new happened: no fake praise.
 */
export function milestones(input: {
  taskName: string;
  level: number;
  composite: number;
  bestPreviousComposite: number | null;
  skillName: string;
  newMean: number | null;
  bestPreviousMean: number | null;
  streak: number;
  valid: boolean;
}): string[] {
  const out: string[] = [];
  if (!input.valid) return out;
  if (input.bestPreviousComposite != null && input.composite > input.bestPreviousComposite + 0.02) {
    out.push(`New personal best on ${input.taskName} level ${input.level}: ${Math.round(input.composite * 100)}% (was ${Math.round(input.bestPreviousComposite * 100)}%).`);
  }
  if (input.newMean != null && input.bestPreviousMean != null && input.newMean > input.bestPreviousMean + 0.01) {
    out.push(`Your highest ${inSentence(input.skillName)} estimate so far: ${Math.round(input.newMean * 100)}%.`);
  }
  if ([3, 5, 7, 14, 30].includes(input.streak)) out.push(`${input.streak}-day streak. Regular practice is what moves the estimates.`);
  return out;
}
