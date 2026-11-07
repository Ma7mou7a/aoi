"use client";

import Link from "next/link";
import { pandaBus } from "@/lib/panda/bus";
import { PandaCorner } from "./panda/PandaCorner";
import { useCallback, useEffect, useRef, useState } from "react";
import type { RunResult } from "@/lib/server/blocks";
import type { BlockSpec } from "@/lib/tasks/registry";
import { BlockResultCard } from "./BlockResultCard";
import { SelfEstimate } from "./SelfEstimate";
import { CorsiTask } from "./tasks/CorsiTask";
import { MatricesTask } from "./tasks/MatricesTask";
import { TrustMachineTask } from "./tasks/TrustMachineTask";
import { SymbolDigitTask } from "./tasks/SymbolDigitTask";
import { TaskSwitchingTask } from "./tasks/TaskSwitchingTask";
import { NBackTask, type TaskFinish } from "./tasks/NBackTask";

type Finished = Parameters<TaskFinish>[0];
import { StroopTask } from "./tasks/StroopTask";
import { markLookedAway } from "@/lib/focus/gaze";
import { useFocusGuard, type FocusStatus } from "@/lib/focus/useFocusGuard";
import { isChimeMuted, playFocusChime, setChimeMuted } from "@/lib/focus/chime";
import { RushNudge, VariantBanner } from "./scenarios/LiveGuards";
import { BetSeal } from "./scenarios/BetCard";

const FOCUS_TEXT: Record<Exclude<FocusStatus, "off">, string> = {
  starting: "Starting Focus Guard…",
  on: "Focus Guard on · on this device only",
  away: "Focus Guard: looking away",
  denied: "Camera blocked, so Focus Guard is off for this session",
  unavailable: "Focus Guard can’t run on this device, so it’s off",
};

type State =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "block"; spec: BlockSpec }
  | { kind: "guess"; spec: BlockSpec; finished: Finished }
  | { kind: "result"; spec: BlockSpec; result: RunResult; next: BlockSpec | null }
  | { kind: "done" };

function device() {
  const touch = matchMedia("(pointer: coarse)").matches;
  const w = window.innerWidth;
  return { type: w < 640 ? "phone" : w < 1024 && touch ? "tablet" : "desktop", input: touch ? "touch" : "keyboard", screen: [w, window.innerHeight] } as const;
}

async function post<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error ?? res.statusText);
  return json as T;
}

export function PlaySession({ mode, focus, daily = false, focusGuard = false }: { mode: "assessment" | "training"; focus?: string; daily?: boolean; focusGuard?: boolean }) {
  const [state, setState] = useState<State>({ kind: "loading" });
  // Focus Guard (camera consent) watches scored games only; practice needs no protection.
  const guard = useFocusGuard(focusGuard && mode === "assessment");
  const takeIntervals = guard.takeIntervals;
  const sessionId = useRef<string | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return; // StrictMode double-invoke guard
    started.current = true;
    post<{ sessionId: string; next: BlockSpec | null }>("/api/sessions", { mode, focus, daily, device: device() })
      .then(({ sessionId: id, next }) => {
        sessionId.current = id;
        setState(next ? { kind: "block", spec: next } : { kind: "done" });
      })
      .catch((e) => setState({ kind: "error", message: e.message }));
  }, [mode, focus, daily]);

  const submit = useCallback((spec: BlockSpec, { trials: raw, status, startedAt }: Finished, selfEstimate: number | null) => {
    setState({ kind: "loading" });
    // Only one yes-or-no per trial leaves the device: did it overlap a moment of looking away?
    const trials = markLookedAway(raw, takeIntervals());
    post<{ result: RunResult; next: BlockSpec | null }>(`/api/sessions/${sessionId.current}/runs`, {
      dimensionId: spec.dimension.id,
      taskId: spec.task.id,
      level: spec.level,
      params: { ...spec.params, seed: spec.seed },
      reason: spec.reason,
      startedAt,
      status,
      trials,
      selfEstimate,
      focus,
    })
      .then(({ result, next }) => setState(status === "abandoned" ? (next ? { kind: "block", spec: next } : { kind: "done" }) : { kind: "result", spec, result, next }))
      .catch((e) => setState({ kind: "error", message: e.message }));
  }, [takeIntervals, focus]);

  // A finished block first asks "How sure are you?" (the guess must come before the score is shown).
  const onFinish = useCallback<TaskFinish>(
    (finished) => {
      if (state.kind !== "block") return;
      if (finished.status === "completed") setState({ kind: "guess", spec: state.spec, finished });
      else submit(state.spec, finished, null);
    },
    [state, submit],
  );

  // Bao: a game starting or ending is an event; during the game he reacts only in training mode.
  const phase = state.kind === "block" ? `block:${state.spec.seed}` : state.kind;
  useEffect(() => {
    if (phase.startsWith("block:")) takeIntervals(); // only count looking away during the game itself
  }, [phase, takeIntervals]);
  useEffect(() => {
    if (phase.startsWith("block:")) pandaBus.emit({ type: "block:start" });
    else if (phase === "guess" || phase === "result") pandaBus.emit({ type: "block:end" });
  }, [phase]);

  // Focus Guard's reminder: only during a game, after a sustained look away, with one chime per look away.
  const [muted, setMuted] = useState(false);
  useEffect(() => setMuted(isChimeMuted()), []);
  const alertOn = guard.alert && state.kind === "block";
  useEffect(() => {
    if (alertOn && !muted) playFocusChime();
  }, [alertOn, muted]);

  return (
    <>
      {alertOn && (
        <div role="alert" className="fixed inset-x-0 top-24 z-50 flex justify-center px-4">
          <div className="flex items-center gap-4 rounded-2xl border-2 border-accent bg-white/95 px-5 py-3 shadow-[0_18px_50px_rgba(0,0,0,0.35)] dark:bg-slate-900/95">
            <span aria-hidden className="text-2xl">👀</span>
            <div>
              <p className="font-display text-xl tracking-wide text-accent uppercase">Eyes back on the game</p>
              <p className="text-sm text-slate-600 dark:text-slate-300">Rounds don&apos;t count while you look away.</p>
            </div>
            <button
              type="button"
              onClick={() => { setMuted(!muted); setChimeMuted(!muted); }}
              aria-pressed={muted}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-600 hover:border-brand dark:border-slate-600 dark:text-slate-300"
            >
              {muted ? "Sound off" : "Mute sound"}
            </button>
          </div>
        </div>
      )}
      {guard.status !== "off" && (
        <p role="status" className={`mx-auto mb-3 w-fit rounded-full border px-3 py-1 text-xs ${guard.status === "away" ? "border-accent text-accent" : "border-slate-300 text-slate-500 dark:border-slate-700 dark:text-slate-400"}`}>
          {FOCUS_TEXT[guard.status]}
        </p>
      )}
      {state.kind === "block" && <RushNudge spec={state.spec} />}
      {state.kind === "block" && <VariantBanner spec={state.spec} />}
      {state.kind === "block" && <BetSeal spec={state.spec} />}
      {renderState()}
      <PandaCorner mode={mode === "assessment" ? "quiet" : "lively"} />
    </>
  );

  function renderState() {
  switch (state.kind) {
    case "loading":
      return <p className="text-center text-slate-500">Loading…</p>;
    case "error":
      return (
        <div className="text-center">
          <p className="text-red-600">{state.message}</p>
          <Link href="/" className="mt-4 inline-block underline">Back home</Link>
        </div>
      );
    case "block":
      switch (state.spec.task.paradigm) {
        case "n_back":
          return <NBackTask key={state.spec.seed} spec={state.spec} onFinish={onFinish} />;
        case "stroop":
          return <StroopTask key={state.spec.seed} spec={state.spec} onFinish={onFinish} />;
        case "corsi":
          return <CorsiTask key={state.spec.seed} spec={state.spec} onFinish={onFinish} />;
        case "symbol_digit":
          return <SymbolDigitTask key={state.spec.seed} spec={state.spec} onFinish={onFinish} />;
        case "task_switching":
          return <TaskSwitchingTask key={state.spec.seed} spec={state.spec} onFinish={onFinish} />;
        case "matrices":
          return <MatricesTask key={state.spec.seed} spec={state.spec} onFinish={onFinish} />;
        case "trust_machine":
          return <TrustMachineTask key={state.spec.seed} spec={state.spec} onFinish={onFinish} />;
        default:
          return <p>Task “{state.spec.task.paradigm}” is not available yet.</p>;
      }
    case "guess":
      return <SelfEstimate spec={state.spec} onDone={(guess) => submit(state.spec, state.finished, guess)} />;
    case "result":
      return (
        <BlockResultCard
          spec={state.spec}
          result={state.result}
          next={state.next}
          onContinue={() => setState(state.next ? { kind: "block", spec: state.next } : { kind: "done" })}
          onEnd={() => setState({ kind: "done" })}
        />
      );
    case "done":
      return (
        <div className="mx-auto max-w-md space-y-4 text-center">
          <h2 className="text-2xl font-semibold">Session complete</h2>
          <p className="text-slate-600 dark:text-slate-300">Your Brain Twin has been updated. Take a break: rested sessions give more reliable results.</p>
          <div className="flex justify-center gap-3">
            <Link href="/coach" className="inline-block rounded-xl bg-slate-900 px-6 py-3 font-medium text-white dark:bg-brand dark:text-slate-900">
              Get coach feedback
            </Link>
            <Link href="/profile" className="inline-block rounded-xl border border-slate-300 px-6 py-3 font-medium dark:border-slate-700">
              See my profile
            </Link>
          </div>
        </div>
      );
  }
  }
}
