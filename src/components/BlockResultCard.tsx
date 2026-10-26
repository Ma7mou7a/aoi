"use client";

import type { ValidityFlag } from "@/lib/scoring/types";
import type { RunResult } from "@/lib/server/blocks";
import type { BlockSpec } from "@/lib/tasks/registry";
import { BandBar } from "./BandBar";

const pct = (x: number) => `${Math.round(x * 100)}%`;
const halfWidth = (ci: [number, number]) => `±${Math.round(((ci[1] - ci[0]) / 2) * 100)}%`;

const METRIC_LABELS: Record<string, string> = {
  d_prime: "Signal detection (d′)",
  median_rt_ms: "Typical response time",
  accuracy: "Accuracy",
  hit_rate: "Matches caught",
  false_alarm_rate: "False alarms",
  interference_cost_ms: "Slow-down when word ≠ colour",
  interference_ratio: "Slow-down when word ≠ colour (share of your usual speed)",
  incongruent_accuracy: "Accuracy when word ≠ colour",
  span: "Longest sequence recalled",
  total_score: "Total blocks recalled",
  correct_per_minute: "Correct per minute",
  switch_cost_ms: "Slow-down after a rule switch",
  switch_cost_ratio: "Slow-down after a switch (share of your usual speed)",
  switch_cost_errors: "Extra errors after a switch",
};

/** One extra plain-language line per paradigm. */
function detail(paradigm: string, m: Record<string, number>) {
  if (paradigm === "n_back") return `Matches caught ${fmt("hit_rate", m.hit_rate)}, false alarms ${fmt("false_alarm_rate", m.false_alarm_rate)}.`;
  if (paradigm === "stroop") return `Overall accuracy ${fmt("accuracy", m.accuracy)}. Conflicting words slowed you by ${fmt("interference_cost_ms", m.interference_cost_ms)}.`;
  if (paradigm === "corsi") return `You recalled sequences of up to ${m.span ?? 0} blocks.`;
  if (paradigm === "symbol_digit") return `${fmt("correct_per_minute", m.correct_per_minute)} correct per minute at ${fmt("accuracy", m.accuracy)} accuracy.`;
  if (paradigm === "task_switching") return `Switching rules slowed you by ${fmt("switch_cost_ms", m.switch_cost_ms)}; overall accuracy ${fmt("accuracy", m.accuracy)}.`;
  if (paradigm === "matrices") return `You solved ${fmt("accuracy", m.accuracy)} of the puzzles.`;
  return "";
}

const FLAG_TEXT: Record<ValidityFlag, string> = {
  too_few_trials: "Not enough usable answers in this block.",
  near_chance: "Results were close to random guessing. Maybe the level was too hard, or attention drifted.",
  response_streak: "Very long runs of the same answer.",
  many_anticipations: "Many presses came faster than is humanly possible to react.",
  many_timeouts: "Many answers came too late.",
  focus_lost: "The window lost focus several times during the block.",
};

function fmt(metric: string, v: number) {
  if (!Number.isFinite(v)) return "n/a";
  if (metric.endsWith("_ms")) return `${Math.round(v)} ms`;
  if (metric.endsWith("_ratio")) return `+${Math.round(v * 100)}%`;
  if (metric.endsWith("_rate") || metric.endsWith("accuracy")) return pct(v);
  if (metric === "span" || metric === "total_score" || metric === "correct_per_minute") return String(Math.round(v));
  if (metric === "switch_cost_errors") return `${Math.round(v * 100)} pts`;
  return v.toFixed(2);
}

export function BlockResultCard({ spec, result, next, onContinue, onEnd }: { spec: BlockSpec; result: RunResult; next: BlockSpec | null; onContinue: () => void; onEnd?: () => void }) {
  const { score, before, after } = result;
  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div>
        <p className="text-sm font-medium" style={{ color: spec.dimension.color }}>{spec.dimension.name}</p>
        <h2 className="text-2xl font-semibold">
          {after ? <>Estimate now {pct(after.mean)} <span className="text-slate-400">({halfWidth(after.ci)})</span></> : "Block stopped"}
        </h2>
      </div>

      {after && (
        <div className="space-y-2 glass rounded-2xl p-4 ">
          <BandBar label="Before" mean={before.mean} ci={before.ci} color="#94a3b8" />
          <BandBar label="After" mean={after.mean} ci={after.ci} color={spec.dimension.color} />
          <p className="pt-1 text-sm text-slate-600 dark:text-slate-300">
            The band shows where your current level most likely is (90% range). It went from {halfWidth(before.ci)} to {halfWidth(after.ci)}: the more you play, the narrower it gets.
          </p>
        </div>
      )}

      <div className="glass rounded-2xl p-4 ">
        <h3 className="mb-2 font-medium">How this block was scored</h3>
        <table className="w-full text-sm">
          <tbody>
            {score.components.map((c) => (
              <tr key={c.metric} className="border-t border-slate-100 dark:border-slate-800">
                <td className="py-1.5">{METRIC_LABELS[c.metric] ?? c.metric}</td>
                <td className="py-1.5 text-right font-mono">{fmt(c.metric, c.raw)}</td>
                <td className="py-1.5 text-right text-slate-500">× {Math.round(c.weight * 100)}% weight</td>
                <td className="py-1.5 text-right font-mono">{pct(c.contribution)}</td>
              </tr>
            ))}
            <tr className="border-t-2 border-slate-200 font-medium dark:border-slate-700">
              <td className="py-1.5" colSpan={3}>Block score at level {spec.level}</td>
              <td className="py-1.5 text-right font-mono">{pct(score.composite)}</td>
            </tr>
          </tbody>
        </table>
        <p className="mt-2 text-xs text-slate-500">
          {detail(spec.task.paradigm, score.metrics)}
          {score.censored && " The score hit the edge of this level, so it counts a little less."}
        </p>
      </div>

      {!score.validity.valid && (
        <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200">
          <p className="font-medium">This block counts less toward your profile:</p>
          <ul className="ml-4 list-disc">
            {score.validity.flags.map((f) => <li key={f}>{FLAG_TEXT[f]}</li>)}
          </ul>
        </div>
      )}

      {result.wins.length > 0 && (
        <ul className="space-y-1 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-950 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-100">
          {result.wins.map((w) => <li key={w}><span aria-hidden>★ </span>{w}</li>)}
        </ul>
      )}

      {result.affect?.suggestion && (
        <div className="space-y-2 rounded-2xl border border-indigo-200 bg-indigo-50 p-4 text-sm text-indigo-950 dark:border-indigo-900 dark:bg-indigo-950 dark:text-indigo-100">
          <p className="font-medium">{result.affect.suggestion}</p>
          <p className="text-xs opacity-80">
            Why we think so: {result.affect.cues.join("; ")}. This is a guess from your timing and errors only (never a camera or microphone), and you know best.
          </p>
          {next && onEnd && (
            <div className="flex gap-2 pt-1">
              <button onClick={onEnd} className="rounded-lg bg-indigo-900 px-3 py-1.5 text-white dark:bg-indigo-200 dark:text-indigo-950">Take a break</button>
              <button onClick={onContinue} className="rounded-lg px-3 py-1.5">Keep going</button>
            </div>
          )}
        </div>
      )}

      {next && <p className="text-sm text-slate-600 dark:text-slate-300"><b>Next:</b> {next.reason.note}</p>}
      <button onClick={onContinue} className="w-full rounded-xl bg-slate-900 py-3 font-medium text-white dark:bg-brand dark:text-slate-900">
        {next ? "Continue" : "Finish session"}
      </button>
    </div>
  );
}
