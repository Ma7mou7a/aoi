"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createRng } from "@/lib/rng";
import type { TrialRecord } from "@/lib/scoring/types";
import { CORSI_LAYOUT, CorsiStaircase, corsiSequence, expectedOrder, type CorsiParams } from "@/lib/tasks/corsi";
import type { BlockSpec } from "@/lib/tasks/registry";
import { ProgressBar, TaskIntro, useCountdown, stampOnFrame, useFocusLoss } from "./common";
import type { TaskFinish } from "./NBackTask";

type Phase = "intro" | "countdown" | "present" | "respond" | "pause";

const PAUSE_MS = 900;
const TAP_FLASH_MS = 200;

/**
 * Corsi block-tapping with a span staircase inside the block: watch the blocks light up,
 * then tap them in the same order (or reverse order at the backward level).
 */
export function CorsiTask({ spec, onFinish }: { spec: BlockSpec; onFinish: TaskFinish }) {
  const p = spec.params as unknown as CorsiParams;
  const backward = !!p.backward;

  const rng = useRef(createRng(spec.seed));
  const stairs = useRef(new CorsiStaircase(p));
  const [phase, setPhase] = useState<Phase>("intro");
  const [trialIdx, setTrialIdx] = useState(0);
  const [sequence, setSequence] = useState<number[]>([]);
  const [lit, setLit] = useState<number | null>(null);
  const [taps, setTaps] = useState<number[]>([]);
  const [flash, setFlash] = useState<number | null>(null);

  const startedAt = useRef("");
  const shownAt = useRef("");
  const respondStart = useRef(0);
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

  const nextTrial = useCallback(() => {
    if (stairs.current.done) return finish("completed");
    setSequence(corsiSequence(rng.current, stairs.current.span, p.blocks));
    setTaps([]);
    focusLost.current = false;
    shownAt.current = new Date().toISOString();
    setPhase("present");
  }, [p.blocks, finish]);

  const begin = useCallback(() => {
    startedAt.current = new Date().toISOString();
    nextTrial();
  }, [nextTrial]);
  const count = useCountdown(phase === "countdown", begin);
  useFocusLoss(useCallback(() => (focusLost.current = true), []));

  // Play the sequence: each block lit for highlight_ms with gap_ms between.
  useEffect(() => {
    if (phase !== "present") return;
    const step = p.highlight_ms + p.gap_ms;
    const timers = sequence.flatMap((b, i) => [
      setTimeout(() => setLit(b), 500 + i * step),
      setTimeout(() => setLit(null), 500 + i * step + p.highlight_ms),
    ]);
    timers.push(
      setTimeout(() => {
        respondStart.current = performance.now();
        setPhase("respond");
        stampOnFrame(respondStart);
      }, 500 + sequence.length * step),
    );
    return () => timers.forEach(clearTimeout);
  }, [phase, sequence, p.highlight_ms, p.gap_ms]);

  useEffect(() => {
    if (phase !== "pause") return;
    const t = setTimeout(nextTrial, PAUSE_MS);
    return () => clearTimeout(t);
  }, [phase, nextTrial]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "Escape" && phase !== "intro") finish("abandoned");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase, finish]);

  function tap(block: number) {
    if (phase !== "respond") return;
    setFlash(block);
    setTimeout(() => setFlash(null), TAP_FLASH_MS);
    const next = [...taps, block];
    setTaps(next);
    if (next.length < sequence.length) return;

    const expected = expectedOrder(sequence, backward);
    const correct = expected.every((b, i) => b === next[i]);
    records.current.push({
      trialIndex: trialIdx,
      stimulus: { span: sequence.length, sequence, backward },
      expected,
      response: next,
      outcome: "response",
      correct,
      rtMs: Math.round(performance.now() - respondStart.current),
      behaviour: focusLost.current ? { focusLost: true } : undefined,
      shownAt: shownAt.current,
    });
    stairs.current.record(correct);
    setTrialIdx(trialIdx + 1);
    setPhase("pause");
  }

  if (phase === "intro") {
    return (
      <TaskIntro spec={spec} title={backward ? "Corsi blocks: backward" : "Corsi blocks"} meta={`Starts at ${p.start_span} blocks and grows while you keep up · Esc to stop`} onStart={() => setPhase("countdown")}>
        <p>
          Blocks light up one after another. When they stop, tap the same blocks in{" "}
          <b>{backward ? "reverse order (last one first)" : "the same order"}</b>.
        </p>
      </TaskIntro>
    );
  }

  const status =
    phase === "countdown" ? String(count || "") :
    phase === "present" ? "Watch…" :
    phase === "respond" ? `Your turn: ${taps.length} / ${sequence.length}${backward ? " (reverse order)" : ""}` :
    "";

  return (
    <div className="mx-auto flex max-w-xl flex-col items-center gap-6 select-none">
      <ProgressBar value={(stairs.current.span - p.start_span) / Math.max(1, p.max_span - p.start_span)} color={spec.dimension.color} />
      <p className="h-6 font-medium text-slate-600 dark:text-slate-300" aria-live="polite">
        {status} {phase !== "countdown" && <span className="ml-2 text-sm text-slate-400">span {stairs.current.span}</span>}
      </p>
      <div className="relative aspect-square w-full max-w-[420px] rounded-3xl bg-slate-100 dark:bg-slate-900">
        {CORSI_LAYOUT.slice(0, p.blocks).map(([x, y], b) => {
          const on = lit === b || flash === b;
          return (
            <button
              key={b}
              aria-label={`block ${b + 1}`}
              onPointerDown={() => tap(b)}
              disabled={phase !== "respond"}
              className="absolute h-[15%] w-[15%] -translate-x-1/2 -translate-y-1/2 rounded-xl transition-colors duration-100"
              style={{ left: `${x * 100}%`, top: `${y * 100}%`, background: on ? spec.dimension.color : undefined }}
            >
              {!on && <span className="block h-full w-full rounded-xl bg-slate-400 dark:bg-slate-600" />}
            </button>
          );
        })}
      </div>
      <button onClick={() => finish("abandoned")} className="text-sm text-slate-500 underline-offset-4 hover:underline">
        Stop this block
      </button>
    </div>
  );
}
