"use client";

import { useCallback, useEffect, useState } from "react";
import type { CoachClaim } from "@/db/schema";
import type { ClientCoachMessage, CollabView } from "@/lib/server/collab";
import { LocalTime } from "../LocalTime";
import { CollabScoreCard } from "./CollabScoreCard";
import { EvidencePanel } from "./EvidencePanel";
import { spokenText, useDictation, useSpeaker } from "./voice";

type ClaimAction = "opened_evidence" | "looks_right" | "something_off";
type FeedbackFn = (messageId: string, claimIndex: number, action: ClaimAction) => void;

const FALLBACK_TEXT: Record<string, string> = {
  no_llm_consent: "AI coaching is off in your settings, so this feedback comes from built-in rules.",
  no_data_yet: "",
  no_api_access: "The AI coach isn't configured on this server, so this feedback comes from built-in rules.",
  rate_limited: "The AI coach is busy right now, so this feedback comes from built-in rules.",
  network: "The AI coach couldn't be reached, so this feedback comes from built-in rules.",
};

function ClaimCard({ m, index, claim, onFeedback }: { m: ClientCoachMessage; index: number; claim: CoachClaim; onFeedback: FeedbackFn }) {
  const [open, setOpen] = useState(false);
  const [science, setScience] = useState<string | null>(null);
  const nTrials = claim.evidenceTrialIds.length;
  const verdict = m.meta?.feedback?.[index];
  const flaw = m.plantedFlaw && m.plantedFlaw.claimIndex === index ? m.plantedFlaw : null;

  function toggle() {
    if (!open && !m.meta?.opened?.includes(index)) onFeedback(m.id, index, "opened_evidence");
    setOpen(!open);
  }

  return (
    <li className="space-y-2 rounded-xl border border-slate-200 p-3 dark:border-slate-800">
      <p className="font-medium">{claim.claim}</p>
      <p className="text-sm text-slate-600 dark:text-slate-300"><span className="font-medium">Why: </span>{claim.why}</p>
      <div className="flex flex-wrap items-center gap-2">
        <button onClick={toggle} aria-expanded={open} className="rounded-full border border-slate-300 px-3 py-1 text-xs font-medium hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800">
          {open ? "Hide evidence" : `See the evidence${nTrials ? ` (${nTrials} trial${nTrials > 1 ? "s" : ""})` : ""}`}
        </button>
        {(claim.science ?? []).map((s) => (
          <button key={s.id} onClick={() => setScience(science === s.id ? null : s.id)} aria-expanded={science === s.id}
            className="rounded-full border border-brand/40 bg-brand/10 px-3 py-1 text-xs font-medium text-brand-deep hover:bg-brand/20 dark:text-brand-2">
            Science: {s.title}
          </button>
        ))}
      </div>
      {(claim.science ?? []).filter((s) => s.id === science).map((s) => (
        <div key={s.id} className="rounded-lg border-l-2 border-brand bg-brand/5 p-2 text-sm">
          <p>{s.finding}</p>
          <p className="mt-1 text-xs text-slate-500">
            <a href={s.url} target="_blank" rel="noreferrer" className="underline underline-offset-2 hover:text-brand">{s.citation}</a>
            {" · "}A general research finding that explains your result. It is not a comparison with other people.
          </p>
        </div>
      ))}
      {open && (
        <>
          {/* Labels summarise the evidence, so they live behind the toggle: checking means opening it. */}
          <p className="text-xs text-slate-500">Cited: {claim.evidenceLabels.join(" · ")}</p>
          <EvidencePanel runIds={claim.evidenceTaskRunIds} trialIds={claim.evidenceTrialIds} />
        </>
      )}

      {verdict ? (
        <p className="text-xs text-slate-500">You marked this as {verdict === "looks_right" ? "looks right ✓" : "something's off ✗"}.</p>
      ) : (
        <div className="flex gap-2">
          <button onClick={() => onFeedback(m.id, index, "looks_right")} className="rounded-lg border border-emerald-300 px-3 py-1 text-xs text-emerald-700 hover:bg-emerald-50 dark:border-emerald-800 dark:text-emerald-300 dark:hover:bg-emerald-950">
            Looks right
          </button>
          <button onClick={() => onFeedback(m.id, index, "something_off")} className="rounded-lg border border-rose-300 px-3 py-1 text-xs text-rose-700 hover:bg-rose-50 dark:border-rose-800 dark:text-rose-300 dark:hover:bg-rose-950">
            Something&apos;s off
          </button>
        </div>
      )}

      {flaw && (
        <div className={`rounded-lg p-2 text-sm ${flaw.caught ? "bg-emerald-50 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200" : "bg-amber-50 text-amber-900 dark:bg-amber-950 dark:text-amber-200"}`}>
          <b>{flaw.caught ? "Well spotted! " : "This one had a deliberate error. "}</b>
          {flaw.description} {flaw.caught ? "Checking the AI is exactly the right habit." : "Opening the evidence would have shown it."} The text above is now corrected.
        </div>
      )}
    </li>
  );
}

function CoachBubble({ m, onFeedback, voice }: { m: ClientCoachMessage; onFeedback: FeedbackFn; voice?: ReturnType<typeof useSpeaker> }) {
  const dropped = m.meta?.dropped?.length ?? 0;
  const note = m.meta?.source === "rules" && m.meta.fallbackReason ? FALLBACK_TEXT[m.meta.fallbackReason] ?? "This feedback comes from built-in rules." : "";
  return (
    <div className="space-y-3">
      {m.hasHiddenFlaw && (
        <p className="rounded-lg bg-brand/10 px-3 py-1.5 text-xs text-brand-deep dark:text-brand-2">
          Spot-the-error mode: this message contains one deliberate mistake. Can you find it?
        </p>
      )}
      <p>{m.content}</p>
      {m.claims.length > 0 && <ul className="space-y-2">{m.claims.map((c, i) => <ClaimCard key={i} m={m} index={i} claim={c} onFeedback={onFeedback} />)}</ul>}
      {m.nextStep && (
        <p className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200"><b>Next step: </b>{m.nextStep}</p>
      )}
      <p className="text-xs text-slate-500">
        {voice?.supported && (
          <button onClick={() => (voice.speakingId === m.id ? voice.stop() : voice.speak(m.id, spokenText(m)))} className="mr-2 rounded-md border border-slate-300 px-2 py-0.5 dark:border-slate-700" aria-pressed={voice.speakingId === m.id}>
            {voice.speakingId === m.id ? "■ Stop" : "🔊 Listen"}
          </button>
        )}
        {m.meta?.source === "llm" ? `AI coach (${m.model})` : "Rule-based coach"} · <LocalTime at={m.createdAt} />
        {dropped > 0 && ` · ${dropped} statement${dropped > 1 ? "s" : ""} removed by the checks (no evidence, a number that did not match your data, or clinical language)`}
        {note && <><br />{note}</>}
      </p>
    </div>
  );
}

export function CoachChat({ initial, initialCollab, llmOn, spotTheError, micOn }: { initial: ClientCoachMessage[]; initialCollab: CollabView; llmOn: boolean; spotTheError: boolean; micOn: boolean }) {
  const [messages, setMessages] = useState(initial);
  const [collab, setCollab] = useState(initialCollab);
  const [question, setQuestion] = useState("");
  const [predicting, setPredicting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
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
    const json = await res.json();
    if (!res.ok) throw new Error(json.error ?? res.statusText);
    return json;
  }

  async function ask(body: { question?: string; prediction?: string }) {
    setBusy(true);
    setPredicting(false);
    setError(null);
    try {
      const json = await call("/api/coach", body);
      setMessages(json.messages);
      setCollab(json.collab);
      setQuestion("");
      const newest = (json.messages as ClientCoachMessage[]).at(-1);
      if (autoRead && newest?.role === "coach") voice.speak(newest.id, spokenText(newest));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const onFeedback: FeedbackFn = (messageId, claimIndex, action) => {
    call("/api/coach/feedback", { messageId, claimIndex, action })
      .then((json) => {
        setMessages((ms) => ms.map((x) => (x.id === json.message.id ? json.message : x)));
        setCollab(json.collab);
      })
      .catch((e) => setError(e.message));
  };

  return (
    <div className="space-y-6">
      <CollabScoreCard view={collab} />
      {spotTheError && (
        <p className="text-sm text-slate-500">Spot-the-error mode is on: some debriefs contain one deliberate mistake for you to catch. You can turn it off in Settings.</p>
      )}
      {messages.length === 0 && <p className="text-slate-500">No feedback yet. Ask for a debrief of your latest session.</p>}
      <ol className="space-y-6">
        {messages.map((m) => (
          <li key={m.id} className={m.role === "user" ? "ml-auto max-w-[80%] rounded-2xl bg-slate-900 px-4 py-2 text-white dark:bg-brand dark:text-slate-900" : "glass rounded-2xl p-4 "}>
            {m.role === "user" ? m.content : <CoachBubble m={m} onFeedback={onFeedback} voice={voice} />}
          </li>
        ))}
      </ol>
      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="space-y-3 border-t border-slate-200 pt-4 dark:border-slate-800">
        {predicting ? (
          <div className="space-y-2 rounded-xl border border-slate-200 p-3 dark:border-slate-800">
            <p className="font-medium">Before I tell you: how do you think your last block went, compared with before?</p>
            <div className="grid grid-cols-4 gap-2">
              {(["better", "same", "worse"] as const).map((p) => (
                <button key={p} onClick={() => ask({ prediction: p })} className="rounded-lg border border-slate-300 py-2 text-sm capitalize dark:border-slate-700">
                  {p === "same" ? "About the same" : p}
                </button>
              ))}
              <button onClick={() => ask({ prediction: "skip" })} className="rounded-lg py-2 text-sm text-slate-500">Skip</button>
            </div>
          </div>
        ) : (
          <button onClick={() => setPredicting(true)} disabled={busy} className="w-full rounded-xl bg-slate-900 py-3 font-medium text-white disabled:opacity-40 dark:bg-brand dark:text-slate-900">
            {busy ? "Thinking…" : "Debrief my latest session"}
          </button>
        )}
        <form onSubmit={(e) => { e.preventDefault(); if (question.trim()) ask({ question: question.trim() }); }} className="flex gap-2">
          <input
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            maxLength={500}
            disabled={busy || !llmOn}
            placeholder={llmOn ? "Ask about your results, e.g. why did my score drop?" : "Turn on AI coaching in Settings to ask questions"}
            className="flex-1 rounded-xl border border-slate-300 bg-transparent px-3 py-2 disabled:opacity-50 dark:border-slate-700"
          />
          {micOn && dictation.supported && llmOn && (
            <button type="button" onClick={() => (dictation.listening ? dictation.stop() : dictation.start())} aria-pressed={dictation.listening}
              aria-label={dictation.listening ? "Stop listening" : "Ask by voice"} className="rounded-xl border border-slate-300 px-3 dark:border-slate-700">
              {dictation.listening ? "■" : "🎙️"}
            </button>
          )}
          <button disabled={busy || !llmOn || !question.trim()} className="rounded-xl border border-slate-900 px-4 font-medium disabled:opacity-40 dark:border-brand">Ask</button>
        </form>
        {dictation.error && <p className="text-xs text-red-600">{dictation.error}</p>}
        {voice.supported && (
          <label className="flex items-center gap-2 text-xs text-slate-500">
            <input type="checkbox" checked={autoRead} onChange={(e) => toggleAutoRead(e.target.checked)} /> Read new feedback aloud
            {micOn && dictation.supported ? " · voice questions are transcribed by your browser, then you review them before sending" : ""}
          </label>
        )}
      </div>
    </div>
  );
}
