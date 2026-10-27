"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { TrialRecord } from "@/lib/scoring/types";
import { generateNBack, type NBackParams } from "@/lib/tasks/nback";
import { stampOnFrame, pushTrial } from "./common";
import type { BlockSpec } from "@/lib/tasks/registry";

export type TaskFinish = (r: { trials: TrialRecord[]; status: "completed" | "abandoned"; startedAt: string }) => void;

type Phase = "intro" | "countdown" | "running";

const ordinal = (n: number) => (n === 1 ? "1 letter" : `${n} letters`);

/**
 * N-back block. Each letter shows for stimulus_ms, then a blank for isi_ms; the response window is
 * the whole stimulus+blank interval. SPACE or the Match button responds; Esc quits (block abandoned).
 * No right/wrong feedback during the block, only a neutral "registered" flash.
 */
export function NBackTask({ spec, onFinish }: { spec: BlockSpec; onFinish: TaskFinish }) {
  const p = spec.params as unknown as NBackParams;
  const seq = useMemo(() => generateNBack(p, spec.seed), [p, spec.seed]);

  const [phase, setPhase] = useState<Phase>("intro");
  const [count, setCount] = useState(3);
  const [idx, setIdx] = useState(0);
  const [visible, setVisible] = useState(false);
  const [flash, setFlash] = useState(false);

  const startedAt = useRef<string>("");
  const onset = useRef(0);
  const records = useRef<TrialRecord[]>([]);
  const current = useRef<{ rt: number | null; focusLost: boolean }>({ rt: null, focusLost: false });
  const finished = useRef(false);

  const finish = useCallback(
    (status: "completed" | "abandoned") => {
      if (finished.current) return;
      finished.current = true;
      onFinish({ trials: records.current, status, startedAt: startedAt.current || new Date().toISOString() });
    },
    [onFinish],
  );

  // Countdown 3-2-1.
  useEffect(() => {
    if (phase !== "countdown") return;
    if (count === 0) {
      startedAt.current = new Date().toISOString();
      setPhase("running");
      return;
    }
    const t = setTimeout(() => setCount((c) => c - 1), 700);
    return () => clearTimeout(t);
  }, [phase, count]);

  // Trial loop: show → hide → record → next.
  useEffect(() => {
    if (phase !== "running") return;
    const s = seq[idx];
    current.current = { rt: null, focusLost: false };
    onset.current = performance.now();
    const shownAt = new Date().toISOString();
    setVisible(true);
    stampOnFrame(onset);
    const hide = setTimeout(() => setVisible(false), p.stimulus_ms);
    const end = setTimeout(() => {
      const { rt, focusLost } = current.current;
      const pressed = rt != null;
      pushTrial(records.current, {
        trialIndex: idx,
        isPractice: s.filler,
        stimulus: { letter: s.letter, isTarget: s.isTarget, n: p.n },
        expected: s.isTarget ? "match" : null,
        response: pressed ? "match" : null,
        outcome: pressed ? (rt < spec.task.validity.min_rt_ms ? "anticipation" : "response") : "no_response",
        correct: pressed === s.isTarget,
        rtMs: rt == null ? null : Math.round(rt),
        behaviour: focusLost ? { focusLost } : undefined,
        shownAt,
      });
      if (idx + 1 >= seq.length) finish("completed");
      else setIdx(idx + 1);
    }, p.stimulus_ms + p.isi_ms);
    return () => {
      clearTimeout(hide);
      clearTimeout(end);
    };
  }, [phase, idx, seq, p, spec.task.validity.min_rt_ms, finish]);

  const respond = useCallback(() => {
    if (phase !== "running" || current.current.rt != null) return;
    current.current.rt = performance.now() - onset.current;
    setFlash(true);
    setTimeout(() => setFlash(false), 120);
  }, [phase]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        e.preventDefault();
        if (phase === "intro") setPhase("countdown");
        else respond();
      } else if (e.code === "Escape" && phase === "running") finish("abandoned");
    };
    const onBlur = () => (current.current.focusLost = true);
    window.addEventListener("keydown", onKey);
    window.addEventListener("blur", onBlur);
    document.addEventListener("visibilitychange", onBlur);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("blur", onBlur);
      document.removeEventListener("visibilitychange", onBlur);
    };
  }, [phase, respond, finish]);

  if (phase === "intro") {
    return (
      <div className="mx-auto flex max-w-xl flex-col items-center gap-6 text-center">
        <span className="rounded-full px-3 py-1 text-xs font-medium text-white" style={{ background: spec.dimension.color }}>
          {spec.dimension.name} · level {spec.level}
        </span>
        <h2 className="text-3xl font-semibold">{p.n}-back</h2>
        <p className="text-lg text-slate-600 dark:text-slate-300">
          Letters appear one at a time. Press <Kbd>SPACE</Kbd> (or tap <b>Match</b>) when the letter is the same as the one{" "}
          <b>{ordinal(p.n)} ago</b>. Do nothing otherwise.
        </p>
        <NBackExample n={p.n} />
        <p className="text-sm text-slate-500">{seq.length} letters · about {Math.round((seq.length * (p.stimulus_ms + p.isi_ms)) / 1000)} s · Esc to stop</p>
        <button onClick={() => setPhase("countdown")} className="rounded-xl bg-slate-900 px-8 py-3 text-lg font-medium text-white hover:bg-slate-700 dark:bg-brand dark:text-slate-900">
          Start
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-xl flex-col items-center gap-8 select-none">
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
        <div className="h-full transition-all" style={{ width: `${(idx / seq.length) * 100}%`, background: spec.dimension.color }} />
      </div>
      <div
        className={`flex h-56 w-56 items-center justify-center rounded-3xl border-4 text-8xl font-bold transition-colors ${
          flash ? "border-slate-900 dark:border-brand" : "border-slate-200 dark:border-slate-800"
        }`}
        aria-live="polite"
      >
        {phase === "countdown" ? <span className="text-slate-400">{count || ""}</span> : visible ? seq[idx].letter : ""}
      </div>
      <button
        onPointerDown={respond}
        disabled={phase !== "running"}
        className="w-full max-w-xs rounded-2xl border-2 border-slate-900 py-5 text-xl font-semibold active:scale-95 disabled:opacity-40 dark:border-brand"
      >
        Match <span className="ml-2 text-sm font-normal text-slate-500">(SPACE)</span>
      </button>
      <button onClick={() => finish("abandoned")} className="text-sm text-slate-500 underline-offset-4 hover:underline">
        Stop this game
      </button>
    </div>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return <kbd className="rounded border border-slate-300 bg-slate-100 px-1.5 py-0.5 font-mono text-sm dark:border-slate-600 dark:bg-slate-800">{children}</kbd>;
}

/** Static worked example so the rule is clear before starting. */
function NBackExample({ n }: { n: number }) {
  const letters = n === 1 ? ["C", "K", "K", "B"] : n === 2 ? ["C", "K", "C", "B"] : ["C", "K", "B", "C"];
  const target = letters.length - (n === 1 ? 2 : n === 2 ? 2 : 1);
  return (
    <div className="flex gap-2">
      {letters.map((l, i) => (
        <div key={i} className={`flex h-12 w-12 items-center justify-center rounded-lg border-2 text-xl font-bold ${i === target ? "border-emerald-500 text-emerald-600" : "border-slate-200 text-slate-500 dark:border-slate-700"}`}>
          {l}
        </div>
      ))}
      <span className="self-center pl-2 text-sm text-emerald-600">← match</span>
    </div>
  );
}
