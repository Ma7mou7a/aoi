import type { DimensionTask } from "../dimensions/schema";
import { compositeScore } from ".";
import { computeMetrics, median } from "./metrics";
import type { TrialRecord } from "./types";

/**
 * "What it would take": exact counterfactuals for one block. Each one changes a single, concrete thing
 * (one more match caught, one fewer error, answers 50 ms faster), re-runs the real scoring function and
 * reports the block score it would have produced. Nothing is estimated or model-guessed, so the coach can
 * cite these and the number check can verify them.
 */
export type Counterfactual = { label: string; from: number; to: number };

const SPEED_MS = 50;
const MAX = 2;

type Scenario = { label: string; apply: (trials: TrialRecord[]) => TrialRecord[] | null };

const scored = (t: TrialRecord) => !t.isPractice;
const correctRt = (ts: TrialRecord[], pred: (t: TrialRecord) => boolean, fallback = 700) => {
  const rts = ts.filter((t) => scored(t) && t.correct && t.rtMs != null && pred(t)).map((t) => t.rtMs!);
  return rts.length ? median(rts) : fallback;
};

/** Replace the first scored trial matching `pred` with `fix(trial)`; null when there is none. */
const fixOne = (pred: (t: TrialRecord) => boolean, fix: (t: TrialRecord, all: TrialRecord[]) => TrialRecord) => (trials: TrialRecord[]) => {
  const i = trials.findIndex((t) => scored(t) && pred(t));
  return i < 0 ? null : trials.map((t, j) => (j === i ? fix(t, trials) : t));
};
/** Make a wrong or missed answer right, at the person's own typical speed for that kind of trial. */
const madeRight = (kind: (t: TrialRecord) => boolean) => (t: TrialRecord, all: TrialRecord[]): TrialRecord => ({
  ...t,
  response: t.expected ?? t.response,
  outcome: "response",
  correct: true,
  rtMs: correctRt(all, kind),
});
const faster = (pred: (t: TrialRecord) => boolean) => (trials: TrialRecord[]) =>
  trials.some((t) => scored(t) && t.correct && t.rtMs != null && pred(t))
    ? trials.map((t) => (scored(t) && t.correct && t.rtMs != null && pred(t) ? { ...t, rtMs: Math.max(150, t.rtMs - SPEED_MS) } : t))
    : null;

function scenarios(paradigm: DimensionTask["paradigm"]): Scenario[] {
  const isTarget = (t: TrialRecord) => t.stimulus.isTarget === true;
  const conflict = (t: TrialRecord) => t.stimulus.congruent === false;
  const switched = (t: TrialRecord) => t.stimulus.switch === true;
  const wrong = (t: TrialRecord) => t.correct === false;
  switch (paradigm) {
    case "n_back":
      return [
        { label: "1 more match caught", apply: fixOne((t) => isTarget(t) && t.response == null, (t, all) => ({ ...t, response: "match", outcome: "response", correct: true, rtMs: correctRt(all, isTarget) })) },
        { label: "1 fewer false alarm", apply: fixOne((t) => !isTarget(t) && t.response != null, (t) => ({ ...t, response: null, outcome: "no_response", correct: true, rtMs: null })) },
      ];
    case "stroop":
      return [
        { label: "1 fewer error on conflicting words", apply: fixOne((t) => conflict(t) && wrong(t), madeRight(conflict)) },
        { label: `conflicting words answered ${SPEED_MS} ms faster`, apply: faster(conflict) },
      ];
    case "task_switching":
      return [
        { label: "1 fewer error right after a rule switch", apply: fixOne((t) => switched(t) && wrong(t), madeRight(switched)) },
        { label: `answers after a switch ${SPEED_MS} ms faster`, apply: faster(switched) },
      ];
    case "symbol_digit":
      return [
        { label: "1 fewer coding error", apply: fixOne(wrong, madeRight(() => true)) },
        { label: `each answer ${SPEED_MS} ms faster`, apply: faster(() => true) },
      ];
    case "matrices":
      return [{ label: "1 more puzzle solved", apply: fixOne(wrong, madeRight(() => true)) }];
    case "trust_machine": {
      const disagreed = (t: TrialRecord) => t.stimulus.initial != null && t.stimulus.initial !== t.stimulus.advice;
      return [{ label: "1 more disagreement with the AI resolved correctly", apply: fixOne((t) => disagreed(t) && wrong(t), madeRight(disagreed)) }];
    }
    default:
      // Corsi is adaptive inside the block (the staircase decides what comes next), so a single-trial
      // change has no well-defined outcome: no counterfactual rather than a made-up one.
      return [];
  }
}

export function whatItWouldTake(task: DimensionTask, trials: TrialRecord[]): Counterfactual[] {
  const score = (ts: TrialRecord[]) => compositeScore(computeMetrics(task.paradigm, ts, task.validity.min_rt_ms), task).composite;
  const from = score(trials);
  const out: Counterfactual[] = [];
  for (const s of scenarios(task.paradigm)) {
    const changed = s.apply(trials);
    if (!changed) continue;
    const to = score(changed);
    if (to > from + 0.005) out.push({ label: s.label, from, to });
  }
  return out.sort((a, b) => b.to - a.to).slice(0, MAX);
}
