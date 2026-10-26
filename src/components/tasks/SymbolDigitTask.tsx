"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { TrialRecord } from "@/lib/scoring/types";
import type { BlockSpec } from "@/lib/tasks/registry";
import { makeKey, symbolStream, type SymbolDigitParams } from "@/lib/tasks/symbolDigit";
import { ProgressBar, TaskIntro, useCountdown, stampOnFrame, useFocusLoss } from "./common";
import type { TaskFinish } from "./NBackTask";

type Phase = "intro" | "countdown" | "preview" | "running";

/**
 * Symbol-digit coding: a key pairs glyphs with digits; type the digit for each glyph as fast as
 * possible until time runs out. At the hardest level the key is shown first, then hidden.
 */
export function SymbolDigitTask({ spec, onFinish }: { spec: BlockSpec; onFinish: TaskFinish }) {
  const p = spec.params as unknown as SymbolDigitParams;
  const key = useMemo(() => makeKey(p, spec.seed), [p, spec.seed]);
  const stream = useMemo(() => symbolStream(key, spec.seed, 400), [key, spec.seed]);
  const digitOf = useMemo(() => Object.fromEntries(key.map((k) => [k.glyph, k.digit])), [key]);

  const [phase, setPhase] = useState<Phase>("intro");
  const [idx, setIdx] = useState(0);
  const [left, setLeft] = useState(p.block_duration_s);
  const [preview, setPreview] = useState(p.key_preview_s ?? 0);
  const [flash, setFlash] = useState<number | null>(null);

  const startedAt = useRef("");
  const onset = useRef(0);
  const shownAt = useRef("");
  const blockStart = useRef(0);
  const focusLost = useRef(false);
  const records = useRef<TrialRecord[]>([]);
  const finished = useRef(false);

  const finish = useCallback(
    (status: "completed" | "abandoned") => {
      if (finished.current) return;
      finished.current = true;
      onFinish({ trials: records.current, status, startedAt: startedAt.current || new Date().toISOString() });
    },
    [onFinish],
  );

  const startRunning = useCallback(() => {
    blockStart.current = performance.now();
    onset.current = performance.now();
    shownAt.current = new Date().toISOString();
    setPhase("running");
    stampOnFrame(onset);
  }, []);
  const afterCountdown = useCallback(() => {
    startedAt.current = new Date().toISOString();
    if (!p.key_visible && (p.key_preview_s ?? 0) > 0) setPhase("preview");
    else startRunning();
  }, [p.key_visible, p.key_preview_s, startRunning]);
  const count = useCountdown(phase === "countdown", afterCountdown);
  useFocusLoss(useCallback(() => (focusLost.current = true), []));

  // Key preview (hidden-key level): study the key, then it disappears.
  useEffect(() => {
    if (phase !== "preview") return;
    if (preview <= 0) return startRunning();
    const t = setTimeout(() => setPreview((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [phase, preview, startRunning]);

  // Block timer.
  useEffect(() => {
    if (phase !== "running") return;
    const t = setInterval(() => {
      const remaining = p.block_duration_s - (performance.now() - blockStart.current) / 1000;
      setLeft(Math.max(0, Math.ceil(remaining)));
      if (remaining <= 0) finish("completed");
    }, 200);
    return () => clearInterval(t);
  }, [phase, p.block_duration_s, finish]);

  const respond = useCallback(
    (digit: number) => {
      if (phase !== "running" || finished.current) return;
      const glyph = stream[idx];
      const rt = performance.now() - onset.current;
      records.current.push({
        trialIndex: idx,
        stimulus: { glyph },
        expected: digitOf[glyph],
        response: digit,
        outcome: rt < spec.task.validity.min_rt_ms ? "anticipation" : "response",
        correct: digit === digitOf[glyph],
        rtMs: Math.round(rt),
        behaviour: focusLost.current ? { focusLost: true } : undefined,
        shownAt: shownAt.current,
      });
      focusLost.current = false;
      setFlash(digit);
      setTimeout(() => setFlash(null), 120);
      onset.current = performance.now();
      shownAt.current = new Date().toISOString();
      setIdx(idx + 1);
      stampOnFrame(onset);
    },
    [phase, stream, idx, digitOf, spec.task.validity.min_rt_ms],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "Escape" && phase !== "intro") return finish("abandoned");
      const d = Number(e.key);
      if (d >= 1 && d <= p.symbols) respond(d);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase, respond, finish, p.symbols]);

  const keyRow = (
    <div className="flex flex-wrap justify-center gap-1.5">
      {key.map((k) => (
        <div key={k.glyph} className="flex w-10 flex-col items-center rounded-lg border border-slate-200 py-1 dark:border-slate-700">
          <span className="text-xl">{k.glyph}</span>
          <span className="font-mono text-sm">{k.digit}</span>
        </div>
      ))}
    </div>
  );

  if (phase === "intro") {
    return (
      <TaskIntro spec={spec} title="Symbol-digit coding" meta={`${p.block_duration_s} seconds · Esc to stop`} onStart={() => setPhase("countdown")}>
        <p>
          Each symbol has a number. Press the number for the symbol in the middle, as fast as you can, until time runs out.
          {!p.key_visible && <> At this level you will see the key for {p.key_preview_s} seconds, <b>then it disappears</b>.</>}
        </p>
        <div className="mt-4">{keyRow}</div>
      </TaskIntro>
    );
  }

  const showKey = phase === "preview" || (phase === "running" && p.key_visible);
  return (
    <div className="mx-auto flex max-w-xl flex-col items-center gap-6 select-none">
      <ProgressBar value={phase === "running" ? 1 - left / p.block_duration_s : 0} color={spec.dimension.color} />
      <p className="h-5 text-sm text-slate-500">
        {phase === "preview" ? `Memorise the key: ${preview}s` : phase === "running" ? `${left}s left · ${records.current.filter((r) => r.correct).length} correct` : ""}
      </p>
      <div className="min-h-[4.5rem]">{showKey ? keyRow : phase === "running" && <p className="pt-5 text-sm text-slate-400">Key hidden: from memory now</p>}</div>
      <div className="flex h-32 w-32 items-center justify-center rounded-3xl border-4 border-slate-200 text-7xl dark:border-slate-800" aria-live="polite">
        {phase === "countdown" ? <span className="text-4xl text-slate-400">{count || ""}</span> : phase === "running" ? stream[idx] : ""}
      </div>
      <div className="grid w-full max-w-sm grid-cols-5 gap-2 sm:grid-cols-9">
        {key.map((k) => (
          <button key={k.digit} onPointerDown={() => respond(k.digit)} disabled={phase !== "running"}
            className={`rounded-xl border-2 py-3 font-mono text-lg active:scale-95 disabled:opacity-40 ${flash === k.digit ? "border-slate-900 dark:border-white" : "border-slate-200 dark:border-slate-700"}`}>
            {k.digit}
          </button>
        ))}
      </div>
      <button onClick={() => finish("abandoned")} className="text-sm text-slate-500 underline-offset-4 hover:underline">Stop this block</button>
    </div>
  );
}
