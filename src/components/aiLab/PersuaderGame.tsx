"use client";

import { useEffect, useState } from "react";
import { BTN, labStep, PRIMARY_BTN } from "./lab";

type Round = { roundId: string; gameId: string; round: number; rounds: number; question: string; options: [string, string] };
type Argued = { aiChoice: 0 | 1; argument: string; realAi: boolean };
type Summary = { right: number; rounds: number; challenged: number; discernment: number | null; resisted: number; misled: number; updated: number };
type Reveal = {
  answer: 0 | 1; aiSide: 0 | 1; aiWasRight: boolean; why: string;
  technique: { id: string; name: string; tell: string };
  outcome: "resisted" | "persuaded_wrong" | "updated_right" | "stuck_wrong" | "agreed";
  summary: Summary | null;
};

const OUTCOME: Record<Reveal["outcome"], string> = {
  resisted: "You held firm against a wrong AI. That's the skill.",
  persuaded_wrong: "The AI talked you out of a right answer. Notice the trick it used below.",
  updated_right: "You changed your mind when the AI had the facts. Good judgment, not weakness.",
  stuck_wrong: "The AI had it right this time, with real evidence, and you kept your answer.",
  agreed: "The AI argued for your own answer, so this round doesn't count toward your score.",
};

/** Resist the Persuader: answer, hear a real AI argue (for the truth or against it), answer again, see the trick. */
export function PersuaderGame({ onExit }: { onExit: () => void }) {
  const [round, setRound] = useState<Round | null>(null);
  const [initial, setInitial] = useState<0 | 1 | null>(null);
  const [argued, setArgued] = useState<Argued | null>(null);
  const [reveal, setReveal] = useState<Reveal | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run<T>(step: () => Promise<T>, then: (x: T) => void) {
    setBusy(true);
    setError(null);
    try {
      then(await step());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const next = (gameId?: string) => run(() => labStep<Round>({ action: "persuader_start", gameId }), (r) => { setRound(r); setInitial(null); setArgued(null); setReveal(null); });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => void next(), []);

  const commit = (choice: 0 | 1, sure: boolean) => {
    if (!round) return;
    setInitial(choice);
    void run(() => labStep<Argued>({ action: "persuader_commit", roundId: round.roundId, initial: choice, sure }), setArgued);
  };
  const final = (choice: 0 | 1) => round && run(() => labStep<Reveal>({ action: "persuader_final", roundId: round.roundId, final: choice }), setReveal);

  if (!round) return <p className="text-center text-slate-500">{error ?? "Setting up the debate…"}</p>;

  if (reveal?.summary) {
    const s = reveal.summary;
    return (
      <div className="glass space-y-4 rounded-2xl p-6 text-center">
        <h2 className="text-3xl">Debate over</h2>
        <p className="text-lg">{s.right} of {s.rounds} final answers right.</p>
        <p className="text-sm text-slate-600 dark:text-slate-300">
          The AI argued against your first answer {s.challenged} {s.challenged === 1 ? "time" : "times"}: you resisted {s.resisted} wrong {s.resisted === 1 ? "case" : "cases"}, were talked out of a right answer {s.misled} {s.misled === 1 ? "time" : "times"}, and switched to the truth {s.updated} {s.updated === 1 ? "time" : "times"}.
          {s.discernment !== null && <> Judgment when challenged: <b>{Math.round(s.discernment * 100)}%</b>.</>}
        </p>
        <p className="text-xs text-slate-500">This feeds the critical-verification part of your AI Collaboration Score. +10 bamboo.</p>
        <div className="flex justify-center gap-2">
          <button type="button" onClick={() => next()} className={PRIMARY_BTN}>Play again</button>
          <button type="button" onClick={onExit} className={BTN}>Back to AI Lab</button>
        </div>
      </div>
    );
  }

  return (
    <div className="glass space-y-5 rounded-2xl p-6">
      <div className="flex items-center justify-between text-sm text-slate-500">
        <span>Resist the Persuader · round {round.round} of {round.rounds}</span>
        <button type="button" onClick={onExit} className="hover:underline">Leave</button>
      </div>
      <h2 className="text-2xl normal-case">{round.question}</h2>

      {initial === null && (
        <div className="space-y-3">
          <p className="text-sm text-slate-600 dark:text-slate-300">Your first answer, before the AI says anything:</p>
          {round.options.map((o, i) => (
            <div key={o} className="flex gap-2">
              <button type="button" disabled={busy} onClick={() => commit(i as 0 | 1, true)} className={`${BTN} flex-1`}>{o} <span className="text-xs text-slate-500">· I&apos;m sure</span></button>
              <button type="button" disabled={busy} onClick={() => commit(i as 0 | 1, false)} className={`${BTN} flex-1`}>{o} <span className="text-xs text-slate-500">· I think so</span></button>
            </div>
          ))}
        </div>
      )}

      {initial !== null && !argued && <p className="animate-pulse text-slate-500">You said “{round.options[initial]}”. The AI is preparing its case…</p>}

      {argued && (
        <div className="space-y-4">
          <p className="text-sm text-slate-500">You said “{round.options[initial!]}”.</p>
          <blockquote className="rounded-xl border-l-4 border-brand bg-slate-100 p-4 dark:bg-slate-800/60">
            <p className="mb-1 text-xs font-semibold tracking-wide text-brand uppercase">{argued.realAi ? "Live AI" : "AI (pre-written)"} argues for “{round.options[argued.aiChoice]}”</p>
            <p>{argued.argument}</p>
          </blockquote>
          {!reveal && (
            <>
              <p className="text-sm text-slate-600 dark:text-slate-300">Your final answer. The AI is right about half the time.</p>
              <div className="grid gap-2 sm:grid-cols-2">
                {round.options.map((o, i) => (
                  <button key={o} type="button" disabled={busy} onClick={() => final(i as 0 | 1)} className={BTN}>{o}{i === initial ? " (keep my answer)" : " (change my answer)"}</button>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {reveal && (
        <div className="space-y-3 rounded-xl bg-slate-100 p-4 dark:bg-slate-800/60">
          <p className="font-semibold">The answer: {round.options[reveal.answer]}. {reveal.aiWasRight ? "The AI told the truth." : "The AI argued for the wrong answer."}</p>
          <p className="text-sm">{reveal.why}</p>
          <p className="text-sm"><b>The AI&apos;s technique: {reveal.technique.name}.</b> {reveal.technique.tell}</p>
          <p className="text-sm text-slate-600 dark:text-slate-300">{OUTCOME[reveal.outcome]}</p>
          <button type="button" disabled={busy} onClick={() => next(round.gameId)} className={PRIMARY_BTN}>Next question</button>
        </div>
      )}
      {error && <p role="alert" className="text-sm text-rose-600 dark:text-rose-400">{error}</p>}
    </div>
  );
}
