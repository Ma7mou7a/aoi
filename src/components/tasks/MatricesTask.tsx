"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { TrialRecord } from "@/lib/scoring/types";
import { generateMatrices, type Cell, type MatricesParams } from "@/lib/tasks/matrices";
import type { BlockSpec } from "@/lib/tasks/registry";
import { ProgressBar, TaskIntro, useCountdown, stampOnFrame, useFocusLoss } from "./common";
import type { TaskFinish } from "./NBackTask";

const SIZE = [0.42, 0.62, 0.82];

function ShapePath({ shape, cx, cy, r }: { shape: Cell["shape"]; cx: number; cy: number; r: number }) {
  const pts = (n: number, rot = -Math.PI / 2, rr = r) =>
    Array.from({ length: n }, (_, i) => {
      const a = rot + (i * 2 * Math.PI) / n;
      return `${(cx + Math.cos(a) * rr).toFixed(1)},${(cy + Math.sin(a) * rr).toFixed(1)}`;
    }).join(" ");
  const common = { fill: "currentColor" };
  switch (shape) {
    case "circle": return <circle cx={cx} cy={cy} r={r} {...common} />;
    case "square": return <rect x={cx - r * 0.85} y={cy - r * 0.85} width={r * 1.7} height={r * 1.7} {...common} />;
    case "triangle": return <polygon points={pts(3)} {...common} />;
    case "diamond": return <polygon points={pts(4)} {...common} />;
    case "hexagon": return <polygon points={pts(6, 0)} {...common} />;
    case "star": {
      const star = Array.from({ length: 10 }, (_, i) => {
        const a = -Math.PI / 2 + (i * Math.PI) / 5;
        const rr = i % 2 ? r * 0.45 : r;
        return `${(cx + Math.cos(a) * rr).toFixed(1)},${(cy + Math.sin(a) * rr).toFixed(1)}`;
      }).join(" ");
      return <polygon points={star} {...common} />;
    }
  }
}

/** One matrix cell: `count` copies of a shape at a size, laid out in a row. Monochrome (no colour cues). */
export function CellSvg({ cell, label }: { cell: Cell; label?: string }) {
  const r = 14 * SIZE[cell.size];
  const xs = cell.count === 1 ? [50] : cell.count === 2 ? [32, 68] : [20, 50, 80];
  return (
    <svg viewBox="0 0 100 100" className="h-full w-full" role="img" aria-label={label ?? `${cell.count} ${["small", "medium", "large"][cell.size]} ${cell.shape}${cell.count > 1 ? "s" : ""}`}>
      {xs.map((x) => <ShapePath key={x} shape={cell.shape} cx={x} cy={50} r={r} />)}
    </svg>
  );
}

/** Generated Raven-style matrices: choose the piece that completes the 3×3 pattern. */
export function MatricesTask({ spec, onFinish }: { spec: BlockSpec; onFinish: TaskFinish }) {
  const p = spec.params as unknown as MatricesParams;
  const items = useMemo(() => generateMatrices(p, spec.seed), [p, spec.seed]);

  const [phase, setPhase] = useState<"intro" | "countdown" | "running">("intro");
  const [idx, setIdx] = useState(0);
  const startedAt = useRef("");
  const onset = useRef(0);
  const shownAt = useRef("");
  const focusLost = useRef(false);
  const changed = useRef(false);
  const records = useRef<TrialRecord[]>([]);
  const finished = useRef(false);
  const [picked, setPicked] = useState<number | null>(null);

  const finish = useCallback(
    (status: "completed" | "abandoned") => {
      if (finished.current) return;
      finished.current = true;
      onFinish({ trials: records.current, status, startedAt: startedAt.current || new Date().toISOString() });
    },
    [onFinish],
  );
  const begin = useCallback(() => {
    startedAt.current = new Date().toISOString();
    setPhase("running");
  }, []);
  const count = useCountdown(phase === "countdown", begin);
  useFocusLoss(useCallback(() => (focusLost.current = true), []));

  const submit = useCallback(
    (choice: number | null) => {
      const it = items[idx];
      const rt = performance.now() - onset.current;
      records.current.push({
        trialIndex: idx,
        stimulus: { rules: it.rules, grid: it.grid.slice(0, 8), options: it.options },
        expected: it.answer,
        response: choice,
        outcome: choice == null ? "timeout" : rt < spec.task.validity.min_rt_ms ? "anticipation" : "response",
        correct: choice === it.answer,
        rtMs: choice == null ? null : Math.round(rt),
        behaviour: focusLost.current || changed.current ? { focusLost: focusLost.current || undefined, changedAnswer: changed.current || undefined } : undefined,
        shownAt: shownAt.current,
      });
      if (idx + 1 >= items.length) return finish("completed");
      setIdx(idx + 1);
      setPicked(null);
    },
    [items, idx, spec.task.validity.min_rt_ms, finish],
  );

  // New item: reset timers; no strict deadline, only a generous timeout.
  useEffect(() => {
    if (phase !== "running") return;
    onset.current = performance.now();
    stampOnFrame(onset);
    shownAt.current = new Date().toISOString();
    focusLost.current = false;
    changed.current = false;
    const t = setTimeout(() => submit(null), p.max_response_ms);
    return () => clearTimeout(t);
  }, [phase, idx, p.max_response_ms, submit]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "Escape" && phase === "running") finish("abandoned");
      const n = Number(e.key);
      if (phase === "running" && n >= 1 && n <= p.options) {
        if (picked != null && picked !== n - 1) changed.current = true;
        setPicked(n - 1);
      }
      if (phase === "running" && e.code === "Enter" && picked != null) submit(picked);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase, picked, p.options, submit, finish]);

  if (phase === "intro") {
    return (
      <TaskIntro spec={spec} title="Pattern matrices" meta={`${p.items_per_block} puzzles · no time pressure · Esc to stop`} onStart={() => setPhase("countdown")}>
        <p>
          Each row of the 3×3 grid follows a rule (shape, size or number of items). One piece is missing:
          choose the option that completes the pattern, then confirm.
        </p>
      </TaskIntro>
    );
  }

  const it = items[idx];
  return (
    <div className="mx-auto flex max-w-xl flex-col items-center gap-5 select-none">
      <ProgressBar value={idx / items.length} color={spec.dimension.color} />
      {phase === "countdown" ? (
        <p className="py-20 text-5xl text-slate-400">{count || ""}</p>
      ) : (
        <>
          <p className="text-sm text-slate-500">Puzzle {idx + 1} of {items.length}</p>
          <div className="grid w-full max-w-[300px] grid-cols-3 gap-[2px] rounded-xl bg-slate-300 p-[2px] dark:bg-slate-700">
            {it.grid.slice(0, 8).map((c, i) => (
              <div key={i} className="aspect-square bg-white text-slate-800 dark:bg-slate-900 dark:text-slate-100"><CellSvg cell={c} /></div>
            ))}
            <div className="flex aspect-square items-center justify-center bg-white text-3xl font-bold text-slate-400 dark:bg-slate-900">?</div>
          </div>
          <div className="grid w-full grid-cols-3 gap-2 sm:grid-cols-6">
            {it.options.map((o, i) => (
              <button key={i} onClick={() => { if (picked != null && picked !== i) changed.current = true; setPicked(i); }} aria-pressed={picked === i} aria-label={`Option ${i + 1}`}
                className={`aspect-square rounded-xl border-2 text-slate-800 dark:text-slate-100 ${picked === i ? "border-slate-900 bg-slate-100 dark:border-white dark:bg-slate-800" : "border-slate-200 dark:border-slate-700"}`}>
                <CellSvg cell={o} />
              </button>
            ))}
          </div>
          <button onClick={() => picked != null && submit(picked)} disabled={picked == null}
            className="w-full max-w-xs rounded-xl bg-slate-900 py-3 font-medium text-white disabled:opacity-30 dark:bg-white dark:text-slate-900">
            Confirm
          </button>
        </>
      )}
      <button onClick={() => finish("abandoned")} className="text-sm text-slate-500 underline-offset-4 hover:underline">Stop this block</button>
    </div>
  );
}
