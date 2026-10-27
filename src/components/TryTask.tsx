"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { Dimension } from "@/lib/dimensions/schema";
import { newSeed } from "@/lib/rng";
import { levelOf, scoreBlock, type BlockScore } from "@/lib/scoring";
import type { BlockSpec } from "@/lib/tasks/registry";
import { CorsiTask } from "./tasks/CorsiTask";
import { MatricesTask } from "./tasks/MatricesTask";
import { TrustMachineTask } from "./tasks/TrustMachineTask";
import { NBackTask, type TaskFinish } from "./tasks/NBackTask";
import { StroopTask } from "./tasks/StroopTask";
import { SymbolDigitTask } from "./tasks/SymbolDigitTask";
import { TaskSwitchingTask } from "./tasks/TaskSwitchingTask";

const RENDERERS = { n_back: NBackTask, stroop: StroopTask, corsi: CorsiTask, symbol_digit: SymbolDigitTask, task_switching: TaskSwitchingTask, matrices: MatricesTask, trust_machine: TrustMachineTask } as const;
const pct = (x: number) => `${Math.round(x * 100)}%`;

/** Practice mode: play any task at any level; scored in the browser with the real pipeline, nothing stored. */
export function TryTask({ dim, taskId }: { dim: Dimension; taskId: string }) {
  const task = dim.tasks.find((t) => t.id === taskId)!;
  const [level, setLevel] = useState(task.difficulty.levels[Math.floor(task.difficulty.levels.length / 2)].level);
  // The seed is drawn in the browser only: a server-rendered seed would mismatch on hydration.
  const [seed, setSeed] = useState<number | null>(null);
  const [result, setResult] = useState<BlockScore | null>(null);
  useEffect(() => setSeed(newSeed()), []);

  const spec: BlockSpec = {
    dimension: { id: dim.id, name: dim.name, color: dim.color },
    task: { id: task.id, name: task.name, paradigm: task.paradigm, instructions: task.instructions, params: task.params, validity: { min_rt_ms: task.validity.min_rt_ms } },
    level,
    params: { ...task.params, ...levelOf(task, level).params },
    seed: seed ?? 0,
    reason: { rule: "practice", expectedSdReduction: 0, note: "Practice mode" },
  };

  const onFinish = useCallback<TaskFinish>(({ trials, status }) => {
    if (status === "completed") setResult(scoreBlock(dim, task, level, trials));
    else setSeed(newSeed());
  }, [dim, task, level]);

  const Renderer = RENDERERS[task.paradigm];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-500">Practice mode: nothing is stored and your profile doesn&apos;t change.</p>
        <div className="flex items-center gap-2 text-sm">
          Level
          {task.difficulty.levels.map((l) => (
            <button key={l.level} onClick={() => { setLevel(l.level); setResult(null); setSeed(newSeed()); }} aria-pressed={level === l.level}
              className={`rounded-lg border px-3 py-1 ${level === l.level ? "border-slate-900 bg-slate-900 text-white dark:border-brand dark:bg-brand dark:text-slate-900" : "border-slate-300 dark:border-slate-700"}`}>
              {l.level}
            </button>
          ))}
        </div>
      </div>
      {result ? (
        <div className="mx-auto max-w-md space-y-3 glass rounded-2xl p-4 ">
          <h2 className="text-xl font-semibold">Block score {pct(result.composite)}</h2>
          <ul className="text-sm">
            {result.components.map((c) => (
              <li key={c.metric} className="flex justify-between border-t border-slate-100 py-1 dark:border-slate-800">
                <span>{c.metric.replaceAll("_", " ")}</span>
                <span className="font-mono">{Number.isFinite(c.raw) ? Math.round(c.raw * 100) / 100 : "n/a"} → {pct(c.contribution)}</span>
              </li>
            ))}
          </ul>
          <p className="text-sm text-slate-500">
            In the real app this block would count as an ability observation of {pct(result.observation)} (±{pct(1.645 * result.observationSd)}){result.validity.valid ? "" : `, down-weighted for: ${result.validity.flags.join(", ").replaceAll("_", " ")}`}.
          </p>
          <div className="flex gap-2">
            <button onClick={() => { setResult(null); setSeed(newSeed()); }} className="rounded-lg bg-slate-900 px-4 py-2 text-sm text-white dark:bg-brand dark:text-slate-900">Play again</button>
            <Link href="/try" className="rounded-lg border border-slate-300 px-4 py-2 text-sm dark:border-slate-700">All tasks</Link>
          </div>
        </div>
      ) : seed == null ? (
        <p className="text-center text-slate-500">Loading…</p>
      ) : (
        <Renderer key={`${seed}-${level}`} spec={spec} onFinish={onFinish} />
      )}
    </div>
  );
}
