"use client";

import { useState } from "react";
import type { ClientAction } from "@/lib/coach/actions";
import type { PandaState } from "@/lib/panda/bus";
import type { ClientCoachMessage } from "@/lib/server/collab";
import { LocalTime } from "../LocalTime";
import { Panda } from "../panda/Panda";
import { ActionButtons } from "./ActionButtons";
import { ClaimCard, type FeedbackFn } from "./ClaimCard";
import { spokenText, type useSpeaker } from "./voice";

const MOODS: PandaState[] = ["cheer", "think", "proud", "calm", "wave"];

/** The reply fades in word by word (opacity/transform only, ≤ 600 ms in total); instant under reduced motion. */
function Reply({ text, animate }: { text: string; animate: boolean }) {
  if (!animate) return <p className="text-base">{text}</p>;
  const words = text.split(" ");
  const step = Math.min(30, 600 / Math.max(1, words.length));
  return (
    <p className="text-base">
      {words.map((w, i) => (
        <span key={i} className="word-in" style={{ animationDelay: `${Math.round(i * step)}ms` }}>
          {w}{i < words.length - 1 ? " " : ""}
        </span>
      ))}
    </p>
  );
}

export function CoachBubble({
  m,
  fresh,
  researchMode,
  onFeedback,
  onForecast,
  busy,
  voice,
}: {
  m: ClientCoachMessage;
  fresh: boolean;
  researchMode: boolean;
  onFeedback: FeedbackFn;
  onForecast: (f: NonNullable<ClientAction["forecast"]>) => void;
  busy: boolean;
  voice?: ReturnType<typeof useSpeaker>;
}) {
  const [why, setWhy] = useState(false);
  const mood = MOODS.includes(m.mood as PandaState) ? (m.mood as PandaState) : "calm";
  const dropped = m.meta?.dropped?.length ?? 0;
  const actions = m.actions ?? [];

  return (
    <div className="flex items-start gap-3">
      <Panda state={fresh ? mood : "calm"} size={44} className="mt-1 shrink-0" />
      <div className="min-w-0 flex-1 space-y-3 rounded-2xl rounded-tl-sm border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
        {researchMode && m.hasHiddenFlaw && (
          <p className="rounded-lg bg-brand/10 px-3 py-1.5 text-xs text-brand-deep dark:text-brand-2">
            Spot-the-error mode: this message contains one deliberate mistake. Can you find it?
          </p>
        )}
        <Reply text={m.content} animate={fresh} />
        <ActionButtons actions={actions} onForecast={onForecast} disabled={busy} />
        {m.claims.length > 0 && (
          <div>
            <button type="button" onClick={() => setWhy(!why)} aria-expanded={why} className="text-sm font-semibold text-brand-deep underline-offset-2 hover:underline dark:text-brand-2">
              {why ? "Hide why" : `Why? (${m.claims.length} thing${m.claims.length > 1 ? "s" : ""} I noticed)`}
            </button>
            {why && (
              <ul className="mt-2 space-y-2">
                {m.claims.map((c, i) => <ClaimCard key={i} m={m} index={i} claim={c} onFeedback={onFeedback} researchMode={researchMode} />)}
              </ul>
            )}
          </div>
        )}
        <p className="text-xs text-slate-500 dark:text-slate-400">
          {voice?.supported && (
            <button type="button" onClick={() => (voice.speakingId === m.id ? voice.stop() : voice.speak(m.id, spokenText(m)))}
              className="mr-2 rounded-md border border-slate-300 px-2 py-0.5 dark:border-slate-600" aria-pressed={voice.speakingId === m.id}>
              {voice.speakingId === m.id ? "■ Stop" : "Listen"}
            </button>
          )}
          {m.meta?.source === "llm" ? "Written with AI, checked against your games" : "Bao's built-in replies"} · <LocalTime at={m.createdAt} />
          {dropped > 0 && ` · ${dropped} statement${dropped > 1 ? "s" : ""} removed because they didn't match your games`}
        </p>
      </div>
    </div>
  );
}
