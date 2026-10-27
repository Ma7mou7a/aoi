"use client";

import Link from "next/link";
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

export function PlaySession({ mode }: { mode: "assessment" | "training" }) {
  const [state, setState] = useState<State>({ kind: "loading" });
  const sessionId = useRef<string | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return; // StrictMode double-invoke guard
    started.current = true;
    post<{ sessionId: string; next: BlockSpec | null }>("/api/sessions", { mode, device: device() })
      .then(({ sessionId: id, next }) => {
        sessionId.current = id;
        setState(next ? { kind: "block", spec: next } : { kind: "done" });
      })
      .catch((e) => setState({ kind: "error", message: e.message }));
  }, [mode]);

  const submit = useCallback((spec: BlockSpec, { trials, status, startedAt }: Finished, selfEstimate: number | null) => {
    setState({ kind: "loading" });
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
    })
      .then(({ result, next }) => setState(status === "abandoned" ? (next ? { kind: "block", spec: next } : { kind: "done" }) : { kind: "result", spec, result, next }))
      .catch((e) => setState({ kind: "error", message: e.message }));
  }, []);

  // A finished block first asks "How sure are you?" (the guess must come before the score is shown).
  const onFinish = useCallback<TaskFinish>(
    (finished) => {
      if (state.kind !== "block") return;
      if (finished.status === "completed") setState({ kind: "guess", spec: state.spec, finished });
      else submit(state.spec, finished, null);
    },
    [state, submit],
  );

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
