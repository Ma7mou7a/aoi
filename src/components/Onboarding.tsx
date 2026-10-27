"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { takeFirstGame } from "@/lib/firstGame";
import type { PandaState } from "@/lib/panda/bus";
import { AI_CONSENT_COPY } from "./coach/AiConsentCard";
import { Panda } from "./panda/Panda";
import { SigninKeyCard } from "./SigninKeyCard";

const GOALS: Array<[string, string]> = [
  ["working_memory", "Memory"],
  ["attention_inhibition", "Focus"],
  ["processing_speed", "Speed"],
  ["reasoning", "Reasoning"],
  ["ai_reliance", "Working with AI"],
  ["curious", "Just curious"],
];

type Consents = { data_processing: boolean; behavioural_signals: boolean; llm_coaching: boolean };

/** If the visitor played the 60-second first game, submit it as their first real game (scored again on the server). */
async function carryOverFirstGame() {
  const g = takeFirstGame(sessionStorage);
  if (!g) return;
  try {
    const json = (body: unknown) => ({ method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const res = await fetch("/api/sessions", json({ mode: "assessment" }));
    if (!res.ok) return;
    const { sessionId } = await res.json();
    await fetch(`/api/sessions/${sessionId}/runs`, json({
      dimensionId: g.dimensionId,
      taskId: g.taskId,
      level: g.level,
      params: g.params,
      reason: { rule: "first_game", expectedSdReduction: 0, note: "Your first game" },
      startedAt: g.startedAt,
      status: "completed",
      trials: g.trials,
      selfEstimate: null,
    }));
  } catch {
    // Optional: if it fails, the twin simply starts from the next game.
  }
}

/** Signup as a short conversation with Bao: name, each consent as its own yes/no, a goal, then the sign-in key. */
export function Onboarding() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const [consents, setConsents] = useState<Consents>({ data_processing: false, behavioural_signals: false, llm_coaching: false });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [signinKey, setSigninKey] = useState<string | null>(null);

  async function create(goal: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/onboard", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ displayName: name.trim(), consents, goal }) });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "Couldn't create your twin. Please try again.");
      setSigninKey(json.signinKey);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  // Right after signup: show the sign-in key once, bring the first game over, then enter the app.
  if (signinKey) {
    return (
      <SigninKeyCard
        signinKey={signinKey}
        onDone={async () => {
          await carryOverFirstGame();
          router.refresh();
        }}
      />
    );
  }

  const yesNo = (key: keyof Consents, next: number) => (
    <div className="flex flex-wrap justify-center gap-2">
      <button type="button" onClick={() => { setConsents({ ...consents, [key]: true }); setStep(next); }} className={PRIMARY}>Yes</button>
      <button type="button" onClick={() => { setConsents({ ...consents, [key]: false }); setStep(next); }} className={SECONDARY}>No thanks</button>
    </div>
  );

  const STEPS: Array<{ pose: PandaState; say: React.ReactNode; body: React.ReactNode }> = [
    {
      pose: "wave",
      say: "Hi! I'm Bao. What should I call you?",
      body: (
        <form onSubmit={(e) => { e.preventDefault(); if (name.trim()) setStep(1); }} className="flex gap-2">
          <label htmlFor="ob-name" className="sr-only">Your name or nickname</label>
          <input id="ob-name" value={name} onChange={(e) => setName(e.target.value)} required maxLength={40} placeholder="A first name or nickname"
            className="min-w-0 flex-1 rounded-xl border border-slate-300 bg-transparent px-3 py-3 text-base dark:border-slate-600" />
          <button disabled={!name.trim()} className={`${PRIMARY} disabled:opacity-40`}>Next</button>
        </form>
      ),
    },
    {
      pose: "calm",
      say: <>Nice to meet you, {name.trim()}! To build your twin I need to keep your game results. They stay 180 days, and you can delete everything with one click.</>,
      body: (
        <div className="flex flex-wrap justify-center gap-2">
          <button type="button" onClick={() => { setConsents({ ...consents, data_processing: true }); setStep(2); }} className={PRIMARY}>OK, keep my results</button>
          <button type="button" onClick={() => setStep(0)} className={SECONDARY}>Back</button>
        </div>
      ),
    },
    {
      pose: "think",
      say: "May I also look at how you play (timing, errors, the window losing focus) to judge how reliable a game was? Never a camera or microphone.",
      body: yesNo("behavioural_signals", 3),
    },
    { pose: "wave", say: AI_CONSENT_COPY, body: yesNo("llm_coaching", 4) },
    {
      pose: "cheer",
      say: "Last one: what would you like to grow?",
      body: (
        <div className="flex flex-wrap justify-center gap-2" role="group" aria-label="Your goal">
          {GOALS.map(([id, label]) => (
            <button key={id} type="button" disabled={busy} onClick={() => create(id)} className={`${SECONDARY} disabled:opacity-50`}>{label}</button>
          ))}
        </div>
      ),
    },
  ];
  const s = STEPS[step];

  return (
    <div className="mx-auto max-w-lg space-y-5 rounded-2xl border border-slate-200 bg-white p-6 text-center dark:border-slate-700 dark:bg-slate-900">
      <p className="text-sm text-slate-500 dark:text-slate-400">Step {step + 1} of {STEPS.length}</p>
      <Panda state={busy ? "think" : s.pose} size={96} className="mx-auto" />
      <p className="text-lg" aria-live="polite">{s.say}</p>
      {s.body}
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      <p className="text-xs text-slate-500 dark:text-slate-400">AI4Brain is a learning tool, not a medical or diagnostic test. You can change every choice later in Settings.</p>
    </div>
  );
}

const PRIMARY = "rounded-xl bg-brand px-5 py-3 font-medium text-white transition-transform hover:bg-brand-deep active:scale-[0.98] dark:text-slate-950 dark:hover:bg-brand-2";
const SECONDARY = "rounded-xl border border-slate-300 px-5 py-3 font-medium transition-transform hover:bg-slate-100 active:scale-[0.98] dark:border-slate-600 dark:hover:bg-slate-800";
