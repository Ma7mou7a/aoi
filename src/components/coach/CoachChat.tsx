"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ClientAction } from "@/lib/coach/actions";
import { pandaBus, type PandaState } from "@/lib/panda/bus";
import type { ClientCoachMessage, CollabView } from "@/lib/server/collab";
import { Panda } from "../panda/Panda";
import { AiConsentCard } from "./AiConsentCard";
import { BetCard } from "./BetCard";
import type { FeedbackFn } from "./ClaimCard";
import { CoachBubble } from "./CoachBubble";
import { CollabScoreCard } from "./CollabScoreCard";
import { QuickChips } from "./QuickChips";
import { spokenText, useDictation, useSpeaker } from "./voice";

type CoachView = { messages: ClientCoachMessage[]; collab: CollabView; needsAiAsk: boolean; offerBet: boolean; researchMode: boolean };
type AskBody = { question?: string; prediction?: string; forecast?: NonNullable<ClientAction["forecast"]>; consent?: boolean };

/** The chat with Bao: replies with buttons, quick chips, an occasional bet, and the one-time AI question. */
export function CoachChat({ initial, micOn }: { initial: CoachView; micOn: boolean }) {
  const [view, setView] = useState(initial);
  const [question, setQuestion] = useState("");
  const [betting, setBetting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [freshId, setFreshId] = useState<string | null>(null);
  const bottom = useRef<HTMLDivElement>(null);
  const voice = useSpeaker();
  const dictation = useDictation(useCallback((t: string) => setQuestion(t), []));
  const [autoRead, setAutoRead] = useState(false);
  useEffect(() => {
    try {
      setAutoRead(localStorage.getItem("ai4b_autoread") === "1");
    } catch {}
  }, []);
  const toggleAutoRead = (on: boolean) => {
    setAutoRead(on);
    try {
      localStorage.setItem("ai4b_autoread", on ? "1" : "0");
    } catch {}
  };

  async function call(url: string, body: unknown) {
    const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error ?? "Bao couldn't answer just now. Please try again.");
    return json;
  }

  async function ask(body: AskBody) {
    setBusy(true);
    setBetting(false);
    setError(null);
    if (body.question) setQuestion("");
    try {
      const json: CoachView = await call("/api/coach", body);
      setView(json);
      const newest = json.messages.at(-1);
      if (newest?.role === "coach") {
        setFreshId(newest.id);
        if (newest.mood) pandaBus.emit({ type: "coach:mood", mood: newest.mood as PandaState });
        if (autoRead) voice.speak(newest.id, spokenText(newest));
      }
    } catch (e) {
      if (body.question) setQuestion(body.question);
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (freshId || busy) bottom.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [freshId, busy]);

  // A debrief starts with Bao's bet when it's due (always in research mode, otherwise now and then).
  const debrief = () => (view.offerBet ? setBetting(true) : ask({}));

  const onFeedback: FeedbackFn = (messageId, claimIndex, action) => {
    call("/api/coach/feedback", { messageId, claimIndex, action })
      .then((json) => setView((v) => ({ ...v, collab: json.collab, messages: v.messages.map((x) => (x.id === json.message.id ? json.message : x)) })))
      .catch((e) => setError(e.message));
  };

  return (
    <div className="space-y-6">
      {view.messages.length === 0 && !view.needsAiAsk && (
        <div className="flex items-center gap-3">
          <Panda state="wave" size={56} />
          <p className="text-slate-600 dark:text-slate-300">Hi! I&apos;m Bao. Ask me anything about your games, or tap a button below.</p>
        </div>
      )}
      <ol className="space-y-5">
        {view.messages.map((m) => (
          <li key={m.id} className={m.role === "user" ? "ml-auto w-fit max-w-[85%] rounded-2xl rounded-tr-sm bg-slate-900 px-4 py-2 text-white dark:bg-brand dark:text-slate-950" : ""}>
            {m.role === "user" ? (
              m.content
            ) : (
              <CoachBubble m={m} fresh={m.id === freshId} researchMode={view.researchMode} onFeedback={onFeedback} onForecast={(forecast) => ask({ forecast })} busy={busy} voice={voice} />
            )}
          </li>
        ))}
      </ol>
      {view.needsAiAsk && <AiConsentCard disabled={busy} onAnswer={(consent) => ask({ consent })} />}
      {betting && <BetCard disabled={busy} onAnswer={(prediction) => ask({ prediction })} />}
      {busy && (
        <div className="flex items-center gap-3" aria-live="polite">
          <Panda state="think" size={44} />
          <p className="text-sm text-slate-500 dark:text-slate-400">Bao is thinking<span className="typing-dots" aria-hidden><span>.</span><span>.</span><span>.</span></span></p>
        </div>
      )}
      {error && (
        <p role="alert" className="rounded-xl border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200">
          {error}
        </p>
      )}
      <div ref={bottom} />

      <div className="sticky bottom-3 space-y-3 rounded-2xl border border-slate-200 bg-white/95 p-3 dark:border-slate-700 dark:bg-slate-900/95">
        {!busy && !betting && <QuickChips onPick={(c) => (c === "Debrief my last game" ? debrief() : ask({ question: c }))} />}
        <form onSubmit={(e) => { e.preventDefault(); if (question.trim()) ask({ question: question.trim() }); }} className="flex gap-2">
          <label htmlFor="coach-q" className="sr-only">Ask Bao</label>
          <input
            id="coach-q"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            maxLength={500}
            disabled={busy}
            placeholder="Ask Bao anything about your games"
            className="min-w-0 flex-1 rounded-xl border border-slate-300 bg-transparent px-3 py-2 text-base disabled:opacity-50 dark:border-slate-600"
          />
          {micOn && dictation.supported && (
            <button type="button" onClick={() => (dictation.listening ? dictation.stop() : dictation.start())} aria-pressed={dictation.listening}
              aria-label={dictation.listening ? "Stop listening" : "Ask by voice"} className="rounded-xl border border-slate-300 px-3 dark:border-slate-600">
              {dictation.listening ? "■" : "🎙️"}
            </button>
          )}
          <button disabled={busy || !question.trim()} className="rounded-xl bg-brand px-4 font-medium text-white disabled:opacity-40 dark:text-slate-950">Ask</button>
        </form>
        {dictation.error && <p className="text-xs text-red-600">{dictation.error}</p>}
        {voice.supported && (
          <label className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
            <input type="checkbox" checked={autoRead} onChange={(e) => toggleAutoRead(e.target.checked)} /> Read Bao&apos;s replies aloud
            {micOn && dictation.supported ? " · your browser turns speech into text, and you check it before sending" : ""}
          </label>
        )}
      </div>
      <CollabScoreCard view={view.collab} />
    </div>
  );
}
