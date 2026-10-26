"use client";

import { useState } from "react";
import type { CoachClaim, CoachMeta } from "@/db/schema";
import { EvidencePanel } from "./EvidencePanel";

export type CoachMessageView = {
  id: string;
  role: "user" | "coach" | "system";
  content: string;
  nextStep: string | null;
  claims: CoachClaim[];
  filteredTerms: string[];
  model: string | null;
  meta: CoachMeta | null;
  createdAt: string;
};

const FALLBACK_TEXT: Record<string, string> = {
  no_llm_consent: "AI coaching is off in your consent settings, so this feedback comes from built-in rules.",
  no_data_yet: "",
  no_api_access: "The AI coach isn't configured on this server, so this feedback comes from built-in rules.",
  rate_limited: "The AI coach is busy right now, so this feedback comes from built-in rules.",
  network: "The AI coach couldn't be reached, so this feedback comes from built-in rules.",
};

function ClaimCard({ claim }: { claim: CoachClaim }) {
  const [open, setOpen] = useState(false);
  const nTrials = claim.evidenceTrialIds.length;
  return (
    <li className="space-y-2 rounded-xl border border-slate-200 p-3 dark:border-slate-800">
      <p className="font-medium">{claim.claim}</p>
      <p className="text-sm text-slate-600 dark:text-slate-300"><span className="font-medium">Why: </span>{claim.why}</p>
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => setOpen(!open)}
          aria-expanded={open}
          className="rounded-full border border-slate-300 px-3 py-1 text-xs font-medium hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
        >
          {open ? "Hide evidence" : `See the evidence${nTrials ? ` (${nTrials} trial${nTrials > 1 ? "s" : ""})` : ""}`}
        </button>
        {claim.evidenceLabels.map((l, i) => (
          <span key={i} className="text-xs text-slate-500">{l}{i < claim.evidenceLabels.length - 1 ? " ·" : ""}</span>
        ))}
      </div>
      {open && <EvidencePanel runIds={claim.evidenceTaskRunIds} trialIds={claim.evidenceTrialIds} />}
    </li>
  );
}

function CoachBubble({ m }: { m: CoachMessageView }) {
  const dropped = m.meta?.dropped?.length ?? 0;
  const note = m.meta?.source === "rules" && m.meta.fallbackReason ? FALLBACK_TEXT[m.meta.fallbackReason] ?? "This feedback comes from built-in rules." : "";
  return (
    <div className="space-y-3">
      <p>{m.content}</p>
      {m.claims.length > 0 && <ul className="space-y-2">{m.claims.map((c, i) => <ClaimCard key={i} claim={c} />)}</ul>}
      {m.nextStep && (
        <p className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200"><b>Next step: </b>{m.nextStep}</p>
      )}
      <p className="text-xs text-slate-500">
        {m.meta?.source === "llm" ? `AI coach (${m.model})` : "Rule-based coach"} · {new Date(m.createdAt).toLocaleString()}
        {dropped > 0 && ` · ${dropped} statement${dropped > 1 ? "s" : ""} removed for lacking evidence or using clinical language`}
        {note && <><br />{note}</>}
      </p>
    </div>
  );
}

export function CoachChat({ initial, llmOn }: { initial: CoachMessageView[]; llmOn: boolean }) {
  const [messages, setMessages] = useState(initial);
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function ask(q?: string) {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/coach", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(q ? { question: q } : {}) });
    const json = await res.json();
    setBusy(false);
    if (!res.ok) return setError(json.error);
    setMessages(json.messages);
    setQuestion("");
  }

  return (
    <div className="space-y-6">
      {messages.length === 0 && <p className="text-slate-500">No feedback yet. Ask for a debrief of your latest session.</p>}
      <ol className="space-y-6">
        {messages.map((m) => (
          <li key={m.id} className={m.role === "user" ? "ml-auto max-w-[80%] rounded-2xl bg-slate-900 px-4 py-2 text-white dark:bg-white dark:text-slate-900" : "rounded-2xl border border-slate-200 p-4 dark:border-slate-800"}>
            {m.role === "user" ? m.content : <CoachBubble m={m} />}
          </li>
        ))}
      </ol>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="space-y-3 border-t border-slate-200 pt-4 dark:border-slate-800">
        <button onClick={() => ask()} disabled={busy} className="w-full rounded-xl bg-slate-900 py-3 font-medium text-white disabled:opacity-40 dark:bg-white dark:text-slate-900">
          {busy ? "Thinking…" : "Debrief my latest session"}
        </button>
        <form onSubmit={(e) => { e.preventDefault(); if (question.trim()) ask(question.trim()); }} className="flex gap-2">
          <input
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            maxLength={500}
            disabled={busy || !llmOn}
            placeholder={llmOn ? "Ask about your results, e.g. why did my score drop?" : "Turn on AI coaching to ask questions"}
            className="flex-1 rounded-xl border border-slate-300 bg-transparent px-3 py-2 disabled:opacity-50 dark:border-slate-700"
          />
          <button disabled={busy || !llmOn || !question.trim()} className="rounded-xl border border-slate-900 px-4 font-medium disabled:opacity-40 dark:border-white">Ask</button>
        </form>
      </div>
    </div>
  );
}
