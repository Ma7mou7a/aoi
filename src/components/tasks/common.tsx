"use client";

import { useEffect, useState } from "react";
import type { BlockSpec } from "@/lib/tasks/registry";

/** Shared intro screen: dimension badge, title, rules, example, start button (SPACE also starts). */
export function TaskIntro({ spec, title, children, meta, onStart }: { spec: BlockSpec; title: string; children: React.ReactNode; meta: string; onStart: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        e.preventDefault();
        onStart();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onStart]);

  return (
    <div className="mx-auto flex max-w-xl flex-col items-center gap-6 text-center">
      <span className="rounded-full px-3 py-1 text-xs font-medium text-white" style={{ background: spec.dimension.color }}>
        {spec.dimension.name} · level {spec.level}
      </span>
      <h2 className="text-3xl font-semibold">{title}</h2>
      <div className="text-lg text-slate-600 dark:text-slate-300">{children}</div>
      <p className="text-sm text-slate-500">{meta}</p>
      <button onClick={onStart} className="rounded-xl bg-slate-900 px-8 py-3 text-lg font-medium text-white hover:bg-slate-700 dark:bg-brand dark:text-slate-900">
        Start
      </button>
    </div>
  );
}

/** 3-2-1 countdown; calls onDone once. */
export function useCountdown(active: boolean, onDone: () => void) {
  const [count, setCount] = useState(3);
  useEffect(() => {
    if (!active) return;
    if (count === 0) {
      onDone();
      return;
    }
    const t = setTimeout(() => setCount((c) => c - 1), 700);
    return () => clearTimeout(t);
  }, [active, count, onDone]);
  return count;
}

export function ProgressBar({ value, color }: { value: number; color: string }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
      <div className="h-full transition-all" style={{ width: `${Math.min(1, value) * 100}%`, background: color }} />
    </div>
  );
}

export function Kbd({ children }: { children: React.ReactNode }) {
  return <kbd className="rounded border border-slate-300 bg-slate-100 px-1.5 py-0.5 font-mono text-sm dark:border-slate-600 dark:bg-slate-800">{children}</kbd>;
}

/**
 * Frame-accurate stimulus onset (the technique jsPsych uses): call right after the stimulus is
 * committed; the timestamp is that of the animation frame that paints it, not of the state change.
 * RTs measured as `performance.now() - onset` are then not inflated by render latency.
 */
export function stampOnFrame(ref: { current: number }) {
  if (typeof requestAnimationFrame === "undefined") return;
  requestAnimationFrame((t) => {
    ref.current = t;
  });
}

/** Track window focus loss so blocks with distraction can be down-weighted. */
export function useFocusLoss(onLoss: () => void) {
  useEffect(() => {
    window.addEventListener("blur", onLoss);
    document.addEventListener("visibilitychange", onLoss);
    return () => {
      window.removeEventListener("blur", onLoss);
      document.removeEventListener("visibilitychange", onLoss);
    };
  }, [onLoss]);
}
