"use client";

import { Panda } from "../panda/Panda";

/** Exact consent copy (spec §4.1): Bao asks once, in the chat; "Not now" is remembered. */
export const AI_CONSENT_COPY =
  "Want me to use AI to answer in my own words? I'd send a summary of your scores (never your name) to an AI model. You can change this any time in Settings.";

export function AiConsentCard({ onAnswer, disabled }: { onAnswer: (granted: boolean) => void; disabled?: boolean }) {
  return (
    <div className="flex gap-3 rounded-2xl border border-brand/40 bg-white p-4 dark:bg-slate-900">
      <Panda state="wave" size={56} className="shrink-0" />
      <div className="space-y-3">
        <p>{AI_CONSENT_COPY}</p>
        <div className="flex gap-2">
          <button type="button" disabled={disabled} onClick={() => onAnswer(true)}
            className="rounded-full bg-brand px-4 py-1.5 text-sm font-medium text-white transition-transform hover:bg-brand-deep active:scale-[0.97] dark:text-slate-950 dark:hover:bg-brand-2">
            Yes, use AI
          </button>
          <button type="button" disabled={disabled} onClick={() => onAnswer(false)}
            className="rounded-full border border-slate-300 px-4 py-1.5 text-sm font-medium transition-transform hover:bg-slate-100 active:scale-[0.97] dark:border-slate-600 dark:hover:bg-slate-800">
            Not now
          </button>
        </div>
      </div>
    </div>
  );
}
