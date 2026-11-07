"use client";

import { useEffect, useRef, useState } from "react";
import { pandaBus } from "@/lib/panda/bus";
import { liveRushCheck, type RushAnswer } from "@/lib/scenarios/rush";
import type { BlockSpec } from "@/lib/tasks/registry";

/** Seconds the nudge stays up; then at least `COOLDOWN` more answers before it can show again. */
const SHOW_MS = 3500;
const COOLDOWN = 8;

/**
 * Button-masher nudge, during the game: when the last few answers are too fast to have been read and
 * mostly wrong, Bao says so in the moment (no pause, no penalty). The full verdict comes after the game.
 */
export function RushNudge({ spec }: { spec: BlockSpec }) {
  const [show, setShow] = useState(false);
  const answers = useRef<RushAnswer[]>([]);
  const quietUntil = useRef(0);

  useEffect(() => {
    answers.current = [];
    quietUntil.current = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const off = pandaBus.on((e) => {
      if (e.type !== "trial:data") return;
      answers.current.push({ rtMs: e.rtMs, correct: e.correct, isPractice: e.isPractice, outcome: e.outcome as RushAnswer["outcome"] });
      const n = answers.current.length;
      if (n < quietUntil.current) return;
      if (liveRushCheck(answers.current, spec.task.validity.min_rt_ms).rushing) {
        quietUntil.current = n + COOLDOWN;
        setShow(true);
        clearTimeout(timer);
        timer = setTimeout(() => setShow(false), SHOW_MS);
      }
    });
    return () => {
      off();
      clearTimeout(timer);
    };
  }, [spec.seed, spec.task.validity.min_rt_ms]);

  if (!show) return null;
  return (
    <div role="status" className="pointer-events-none fixed inset-x-0 top-36 z-50 flex justify-center px-4">
      <div className="flex items-center gap-3 rounded-2xl border-2 border-amber-400 bg-white/95 px-5 py-3 shadow-[0_18px_50px_rgba(0,0,0,0.3)] dark:bg-slate-900/95">
        <span aria-hidden className="text-2xl">🐼</span>
        <div>
          <p className="font-display text-lg tracking-wide text-amber-600 uppercase">Whoa, slow down</p>
          <p className="text-sm text-slate-600 dark:text-slate-300">Those answers are faster than anyone can read. Accuracy counts more than speed.</p>
        </div>
      </div>
    </div>
  );
}

/** A format change chosen by the engine after a plateau: shown above the game, before it starts. */
export function VariantBanner({ spec }: { spec: BlockSpec }) {
  const v = spec.reason.variant;
  if (!v) return null;
  return (
    <aside aria-label="Format change" className="mx-auto mb-4 max-w-xl space-y-1 rounded-2xl border-2 border-violet-300 bg-violet-50 p-4 text-violet-950 dark:border-violet-700 dark:bg-violet-950 dark:text-violet-100">
      <p className="text-sm font-semibold tracking-wide uppercase">{v.title}</p>
      <p className="text-sm">{v.detail}</p>
      {v.strategy && (
        <p className="rounded-lg bg-white/70 p-2 text-base dark:bg-slate-900/60">
          <b>{v.strategy.name}:</b> {v.strategy.how}
        </p>
      )}
    </aside>
  );
}
