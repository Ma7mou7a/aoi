"use client";

import { useEffect, useState } from "react";
import { pandaBus } from "@/lib/panda/bus";
import { betVerdict, type Bet, type BetOutcome, type BetRecord } from "@/lib/scenarios/bet";
import type { BlockSpec } from "@/lib/tasks/registry";

const p = (x: number) => Math.round(x * 100);

/** The bet as a track: 90% band (light), 50% band (dark), and the actual score when known. */
function BetTrack({ bet, color, actual }: { bet: Bet; color: string; actual?: number }) {
  return (
    <div className="space-y-1">
      <div className="relative h-5 rounded-full bg-slate-200 dark:bg-slate-700" role="img"
        aria-label={`Bet: likely ${p(bet.low50)} to ${p(bet.high50)}%, almost surely ${p(bet.low90)} to ${p(bet.high90)}%${actual != null ? `; actual ${p(actual)}%` : ""}`}>
        <span className="absolute inset-y-0 rounded-full" style={{ left: `${p(bet.low90)}%`, width: `${Math.max(1, p(bet.high90) - p(bet.low90))}%`, background: color, opacity: 0.28 }} />
        <span className="absolute inset-y-0 rounded-full" style={{ left: `${p(bet.low50)}%`, width: `${Math.max(1, p(bet.high50) - p(bet.low50))}%`, background: color, opacity: 0.6 }} />
        {actual != null && (
          <span className="absolute -inset-y-1.5 w-1 -translate-x-1/2 rounded bg-slate-950 dark:bg-white" style={{ left: `${Math.min(99.5, Math.max(0.5, p(actual)))}%` }} />
        )}
      </div>
      <div className="flex justify-between text-xs text-slate-500 dark:text-slate-400"><span>0%</span><span>game score</span><span>100%</span></div>
    </div>
  );
}

/** Before the game: Bao seals his range. It disappears as soon as the first answer comes in. */
export function BetSeal({ spec }: { spec: BlockSpec }) {
  const bet = spec.reason.bet;
  const [playing, setPlaying] = useState(false);
  useEffect(() => {
    setPlaying(false);
    return pandaBus.on((e) => {
      if (e.type === "trial:data") setPlaying(true);
    });
  }, [spec.seed]);
  if (!bet || playing) return null;
  return (
    <aside aria-label="Bao's bet" className="mx-auto mb-4 max-w-xl space-y-2 rounded-2xl border-2 border-dashed border-sky-300 bg-sky-50 p-4 text-sky-950 dark:border-sky-700 dark:bg-sky-950 dark:text-sky-100">
      <p className="text-sm font-semibold tracking-wide uppercase">🐼 Bao&apos;s bet, sealed before you play</p>
      <p className="text-base">
        I expect your game score between <b>{p(bet.low50)}% and {p(bet.high50)}%</b> (likely), and almost surely between {p(bet.low90)}% and {p(bet.high90)}%.
        You&apos;ll see if I was right.
      </p>
      <BetTrack bet={bet} color={spec.dimension.color} />
    </aside>
  );
}

/** After the game: the bet, settled in the open, and the forecaster's running record. */
export function BetResult({ bet, outcome, record, actual, color }: { bet: Bet; outcome: BetOutcome; record: BetRecord; actual: number; color: string }) {
  const hit = outcome !== "outside";
  return (
    <section aria-label="Bao's bet, settled" className={`space-y-2 rounded-2xl border-2 p-4 ${hit ? "border-sky-300 bg-sky-50 text-sky-950 dark:border-sky-700 dark:bg-sky-950 dark:text-sky-100" : "border-amber-300 bg-amber-50 text-amber-950 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100"}`}>
      <p className="text-sm font-semibold tracking-wide uppercase">{hit ? "✓" : "✗"} Bao&apos;s bet: {p(bet.low50)}–{p(bet.high50)}% likely · you scored {p(actual)}%</p>
      <BetTrack bet={bet} color={color} actual={actual} />
      <p className="text-base">{betVerdict(outcome)}</p>
      {record.total >= 2 && (
        <p className="text-sm opacity-90">
          My record so far: <b>{record.hits90} of {record.total}</b> games inside the wide range (aim: about 9 in 10), {record.hits50} of {record.total} inside the likely one (aim: about half).
        </p>
      )}
    </section>
  );
}
