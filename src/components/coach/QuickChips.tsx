"use client";

export const QUICK_CHIPS = ["How am I doing?", "Let's play", "What if I play every day?", "Debrief my last game"] as const;

/** One-tap starters above the input, so nobody has to think of what to type. */
export function QuickChips({ onPick, disabled }: { onPick: (text: (typeof QUICK_CHIPS)[number]) => void; disabled?: boolean }) {
  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label="Quick questions">
      {QUICK_CHIPS.map((c) => (
        <button key={c} type="button" disabled={disabled} onClick={() => onPick(c)}
          className="rounded-full border border-brand/50 bg-brand/10 px-3 py-1.5 text-sm font-medium text-brand-deep transition-transform hover:bg-brand/20 active:scale-[0.97] disabled:opacity-50 dark:text-brand-2">
          {c}
        </button>
      ))}
    </div>
  );
}
