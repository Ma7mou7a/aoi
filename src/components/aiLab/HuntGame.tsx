"use client";

import { useEffect, useState } from "react";
import { BTN, labStep, PRIMARY_BTN } from "./lab";

type Round = { roundId: string; gameId: string; round: number; rounds: number; topic: string; sentences: string[]; tokens: number; realAi: boolean };
type Summary = { caught: number; rounds: number; tokens: number; wagerGap: number | null; bamboo: number; verdict: string };
type Reveal = { fake: number; caught: boolean; why: string; delta: number; tokens: number; summary: Summary | null };

const WAGERS = [
  { n: 1 as const, label: "1 · a guess" },
  { n: 2 as const, label: "2 · fairly sure" },
  { n: 3 as const, label: "3 · certain" },
];

/** Fabrication Hunt: a real AI writes three true sentences and one invented one; find it and bet on it. */
export function HuntGame({ onExit }: { onExit: () => void }) {
  const [round, setRound] = useState<Round | null>(null);
  const [pick, setPick] = useState<number | null>(null);
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

  const next = (gameId?: string) => run(() => labStep<Round>({ action: "hunt_start", gameId }), (r) => { setRound(r); setPick(null); setReveal(null); });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => void next(), []);

  const bet = (wager: 1 | 2 | 3) => round && pick !== null && run(() => labStep<Reveal>({ action: "hunt_answer", roundId: round.roundId, pick, wager }), setReveal);

  if (!round) return <p className="animate-pulse text-center text-slate-500">{error ?? "The AI is writing…"}</p>;

  if (reveal?.summary) {
    const s = reveal.summary;
    return (
      <div className="glass space-y-4 rounded-2xl p-6 text-center">
        <h2 className="text-3xl">Hunt over</h2>
        <p className="text-lg">You caught {s.caught} of {s.rounds} fabrications and finished with {s.tokens} tokens.</p>
        <p className="text-sm text-slate-600 dark:text-slate-300">{s.verdict}</p>
        <p className="text-xs text-slate-500">Each catch feeds the critical-verification part of your AI Collaboration Score. +{s.bamboo} bamboo.</p>
        <div className="flex justify-center gap-2">
          <button type="button" onClick={() => next()} className={PRIMARY_BTN}>Hunt again</button>
          <button type="button" onClick={onExit} className={BTN}>Back to AI Lab</button>
        </div>
      </div>
    );
  }

  const tokens = reveal ? reveal.tokens : round.tokens;
  return (
    <div className="glass space-y-5 rounded-2xl p-6">
      <div className="flex items-center justify-between text-sm text-slate-500">
        <span>Fabrication Hunt · round {round.round} of {round.rounds} · {tokens} tokens</span>
        <button type="button" onClick={onExit} className="hover:underline">Leave</button>
      </div>
      <div>
        <p className="text-xs font-semibold tracking-wide text-brand uppercase">{round.realAi ? "Live AI" : "AI (pre-written)"} explains</p>
        <h2 className="text-2xl normal-case">{round.topic}</h2>
      </div>
      <p className="text-sm text-slate-600 dark:text-slate-300">Three sentences are true. One was made up. Which one?</p>
      <div className="space-y-2">
        {round.sentences.map((s, i) => {
          const state = reveal ? (i === reveal.fake ? "fake" : i === pick ? "wrong" : "true") : i === pick ? "picked" : "";
          const ring = state === "fake" ? "border-rose-500 bg-rose-500/10" : state === "picked" ? "border-brand bg-brand/10" : state === "wrong" ? "border-slate-400 opacity-70" : "";
          return (
            <button key={i} type="button" disabled={busy || !!reveal} onClick={() => setPick(i)} aria-pressed={pick === i} className={`${BTN} block w-full ${ring}`}>
              {s}
              {reveal && i === reveal.fake && <span className="mt-1 block text-xs font-semibold text-rose-600 dark:text-rose-400">Made up</span>}
            </button>
          );
        })}
      </div>

      {!reveal && pick !== null && (
        <div className="space-y-2">
          <p className="text-sm text-slate-600 dark:text-slate-300">How many tokens do you bet that this is the fake? Win them if you&apos;re right, lose them if not.</p>
          <div className="grid gap-2 sm:grid-cols-3">
            {WAGERS.map((w) => (
              <button key={w.n} type="button" disabled={busy} onClick={() => bet(w.n)} className={BTN}>Bet {w.label}</button>
            ))}
          </div>
        </div>
      )}

      {reveal && (
        <div className="space-y-3 rounded-xl bg-slate-100 p-4 dark:bg-slate-800/60">
          <p className="font-semibold">{reveal.caught ? `Caught it! +${reveal.delta} tokens.` : `Not that one. ${reveal.delta} tokens.`}</p>
          <p className="text-sm">{reveal.why}</p>
          <p className="text-xs text-slate-500">Fabrications often hide in exact-sounding details: a date, a number, a superlative. Checking one specific detail is faster than doubting everything.</p>
          <button type="button" disabled={busy} onClick={() => next(round.gameId)} className={PRIMARY_BTN}>Next topic</button>
        </div>
      )}
      {error && <p role="alert" className="text-sm text-rose-600 dark:text-rose-400">{error}</p>}
    </div>
  );
}
