"use client";

import { useEffect, useState } from "react";
import type { BlockSpec } from "@/lib/tasks/registry";
import { Panda } from "./panda/Panda";

/**
 * "How sure are you?": between the end of a block and its result, the user guesses the block score.
 * Optional (Skip), keyboard-friendly (arrows move the slider, Enter confirms), and always shown
 * before the score so the guess can't be anchored on it.
 */
export function SelfEstimate({ spec, onDone }: { spec: BlockSpec; onDone: (guess: number | null) => void }) {
  const [value, setValue] = useState(50);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Enter") onDone(value / 100);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [value, onDone]);

  return (
    <div className="mx-auto max-w-md space-y-6 text-center">
      <div>
        <p className="text-sm font-medium" style={{ color: spec.dimension.color }}>{spec.dimension.name}</p>
        <div className="mt-2 flex justify-center"><Panda state="think" size={72} /></div>
        <h2 className="text-4xl">Guess your score?</h2>
        <p className="mt-2 text-base text-slate-600 dark:text-slate-300">
          Bao wants your guess before he shows you. Knowing how well you did is a skill too, and it helps you judge when to trust an AI.
        </p>
      </div>
      <div className="glass space-y-3 rounded-2xl p-5">
        <label htmlFor="self-estimate" className="block font-display text-6xl text-brand">{value}%</label>
        <input id="self-estimate" type="range" min={0} max={100} step={5} value={value} autoFocus
          onChange={(e) => setValue(Number(e.target.value))}
          aria-valuetext={`${value} percent`}
          className="w-full accent-[var(--brand)]" />
        <div className="flex justify-between text-xs text-slate-500"><span>it went badly</span><span>it went great</span></div>
      </div>
      <div className="flex flex-col gap-2">
        <button onClick={() => onDone(value / 100)} className="w-full rounded-xl bg-slate-900 py-3 font-medium text-white dark:bg-brand dark:text-slate-950">
          See my result
        </button>
        <button onClick={() => onDone(null)} className="text-sm text-slate-500 underline-offset-4 hover:underline">Skip</button>
      </div>
    </div>
  );
}
