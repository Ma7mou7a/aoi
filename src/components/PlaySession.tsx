"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { RunResult } from "@/lib/server/blocks";
import type { BlockSpec } from "@/lib/tasks/registry";
import { BlockResultCard } from "./BlockResultCard";
import { NBackTask, type TaskFinish } from "./tasks/NBackTask";

type State =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "block"; spec: BlockSpec }
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

  const onFinish = useCallback<TaskFinish>(
    ({ trials, status, startedAt }) => {
      if (state.kind !== "block") return;
      const spec = state.spec;
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
      })
        .then(({ result, next }) => setState(status === "abandoned" ? (next ? { kind: "block", spec: next } : { kind: "done" }) : { kind: "result", spec, result, next }))
        .catch((e) => setState({ kind: "error", message: e.message }));
    },
    [state],
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
      if (state.spec.task.paradigm === "n_back") return <NBackTask key={state.spec.seed} spec={state.spec} onFinish={onFinish} />;
      return <p>Task “{state.spec.task.paradigm}” is not available yet.</p>;
    case "result":
      return (
        <BlockResultCard
          spec={state.spec}
          result={state.result}
          next={state.next}
          onContinue={() => setState(state.next ? { kind: "block", spec: state.next } : { kind: "done" })}
        />
      );
    case "done":
      return (
        <div className="mx-auto max-w-md space-y-4 text-center">
          <h2 className="text-2xl font-semibold">Session complete</h2>
          <p className="text-slate-600 dark:text-slate-300">Your Brain Twin has been updated. Take a break: rested sessions give more reliable results.</p>
          <Link href="/profile" className="inline-block rounded-xl bg-slate-900 px-6 py-3 font-medium text-white dark:bg-white dark:text-slate-900">
            See my profile
          </Link>
        </div>
      );
  }
}
