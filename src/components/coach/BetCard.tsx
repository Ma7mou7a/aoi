"use client";

import { Panda } from "../panda/Panda";

const CHOICES = [
  ["better", "Better"],
  ["same", "About the same"],
  ["worse", "A bit lower"],
] as const;

/** "Bet with Bao": guess how your last game went before the debrief (an occasional, playful card). */
export function BetCard({ onAnswer, disabled }: { onAnswer: (p: "better" | "same" | "worse" | "skip") => void; disabled?: boolean }) {
  return (
    <div className="flex gap-3 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
      <Panda state="think" size={56} className="shrink-0" />
      <div className="space-y-3">
        <p className="font-medium">Quick bet! Compared with last time, how do you think your last game went?</p>
        <div className="flex flex-wrap gap-2">
          {CHOICES.map(([value, label]) => (
            <button key={value} type="button" disabled={disabled} onClick={() => onAnswer(value)}
              className="rounded-full border border-slate-300 px-4 py-1.5 text-sm font-medium transition-transform hover:bg-slate-100 active:scale-[0.97] dark:border-slate-600 dark:hover:bg-slate-800">
              {label}
            </button>
          ))}
          <button type="button" disabled={disabled} onClick={() => onAnswer("skip")} className="rounded-full px-3 py-1.5 text-sm text-slate-500 dark:text-slate-400">Skip</button>
        </div>
      </div>
    </div>
  );
}
