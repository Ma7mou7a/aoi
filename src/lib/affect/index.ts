import { median } from "../scoring/metrics";
import type { TrialRecord } from "../scoring/types";

/**
 * Emotion-aware layer, inferred from BEHAVIOUR ONLY (timing, errors, focus, abandons): never from a
 * camera or microphone. It is a gentle, dismissible hint, never a judgement, and never used to
 * change a score. Requires the user's behavioural_signals consent.
 */

export type Level = "low" | "elevated" | "high";
export type AffectState = {
  fatigue: Level;
  frustration: Level;
  /** Plain-language observations behind the inference (shown to the user). */
  cues: string[];
  suggestion: string | null;
  /** True when the next block should be a bit easier (frustration). */
  easeOff: boolean;
};

export type SessionBlock = { taskId: string; composite: number | null; status: "completed" | "abandoned" | "active" };

const level = (points: number): Level => (points >= 2 ? "high" : points === 1 ? "elevated" : "low");

/** Longest run of wrong answers among scored, judged trials. */
export function errorStreak(trials: TrialRecord[]): number {
  let best = 0;
  let run = 0;
  for (const t of trials) {
    if (t.isPractice || t.correct === null) continue;
    run = t.correct ? 0 : run + 1;
    best = Math.max(best, run);
  }
  return best;
}

/** Median RT of correct answers in the last third ÷ the first third (> 1 = slowing down). */
export function slowingRatio(trials: TrialRecord[]): number | null {
  const rts = trials.filter((t) => !t.isPractice && t.correct && t.rtMs != null).map((t) => t.rtMs as number);
  if (rts.length < 9) return null;
  const third = Math.floor(rts.length / 3);
  const first = median(rts.slice(0, third));
  const last = median(rts.slice(-third));
  return first > 0 ? last / first : null;
}

export function inferAffect(input: {
  trials: TrialRecord[];
  composite: number;
  taskId: string;
  /** Earlier blocks in this session, oldest first (not including the current one). */
  earlier: SessionBlock[];
  sessionMinutes: number;
}): AffectState {
  const cues: string[] = [];
  let fatigue = 0;
  let frustration = 0;

  const slow = slowingRatio(input.trials);
  if (slow != null && slow >= 1.25) {
    fatigue++;
    cues.push(`your answers got about ${Math.round((slow - 1) * 100)}% slower towards the end of the block`);
  }
  const completed = input.earlier.filter((b) => b.status === "completed").length + 1;
  if (input.sessionMinutes >= 25 || completed >= 6) {
    fatigue++;
    cues.push(`this session is already ${completed} blocks / ${Math.round(input.sessionMinutes)} minutes long`);
  }
  const focus = input.trials.filter((t) => t.behaviour?.focusLost).length;
  if (focus >= 2) {
    fatigue++;
    cues.push(`the window lost focus ${focus} times`);
  }

  const streak = errorStreak(input.trials);
  if (streak >= 4) {
    frustration++;
    cues.push(`there was a run of ${streak} misses in a row`);
  }
  const sameTask = input.earlier.filter((b) => b.taskId === input.taskId && b.status === "completed" && b.composite != null);
  if (sameTask.length && input.composite < Math.max(...sameTask.map((b) => b.composite!)) - 0.15) {
    frustration++;
    cues.push("this block went noticeably less well than your earlier one");
  }
  const abandoned = input.earlier.filter((b) => b.status === "abandoned").length;
  if (abandoned >= 1) {
    frustration++;
    cues.push(`${abandoned} block${abandoned > 1 ? "s were" : " was"} stopped early`);
  }

  const f = level(fatigue);
  const fr = level(frustration);
  const suggestion =
    f === "high"
      ? "You might be getting tired. A 5-minute break usually helps, and tired blocks make your profile less precise."
      : fr === "high"
        ? "That looked tough. It's completely normal: the next block will be a little easier so you can find your rhythm."
        : f === "elevated" && fr === "elevated"
          ? "Feeling the effort? Taking a short pause now is a good idea."
          : null;
  return { fatigue: f, frustration: fr, cues, suggestion, easeOff: fr === "high" };
}
