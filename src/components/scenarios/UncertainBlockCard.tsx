"use client";

import { useState } from "react";
import { RUSH_CONTEXT, type RushContext, type RushProfile, type ShieldReceipt } from "@/lib/scenarios/rush";
import type { ValidityFlag } from "@/lib/scoring/types";
import type { Engagement } from "@/lib/scenarios/engagement";

/**
 * Layer A, made visible. An unreliable game is not read as a collapse in ability: it is flagged as
 * uncertain, the player sees exactly how much the flag protected their Brain Twin ("damage avoided"),
 * and Bao asks what happened instead of assuming. The answer is saved with the game.
 */
export function UncertainBlockCard({
  runId,
  flags,
  flagText,
  rush,
  shield,
  skill,
  engagement = null,
}: {
  runId: string;
  flags: ValidityFlag[];
  flagText: Record<ValidityFlag, string>;
  rush: RushProfile;
  shield: ShieldReceipt | null;
  skill: string;
  engagement?: Engagement | null;
}) {
  const [answer, setAnswer] = useState<RushContext | null>(null);
  const [reply, setReply] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const rushed = flags.includes("rushing");

  async function send(context: RushContext) {
    setBusy(true);
    setAnswer(context);
    try {
      const res = await fetch(`/api/runs/${runId}/context`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ context }) });
      const json = await res.json();
      setReply(res.ok ? json.reply : "Saved on this device only: the server didn't answer.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-label="Uncertain game" className="space-y-3 rounded-2xl border-2 border-amber-300 bg-amber-50 p-4 text-amber-950 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100">
      <p className="flex items-center gap-2 text-sm font-semibold tracking-wide uppercase">
        <span aria-hidden className="inline-block h-2.5 w-2.5 rounded-full bg-amber-500" /> Flagged as uncertain
      </p>
      {rushed ? (
        <p className="text-base">
          <b>{Math.round(rush.fastShare * 100)}%</b> of your answers came in under <b>{rush.fastMs} ms</b>, faster than the words can be read, and{" "}
          <b>{Math.round(rush.fastErrorRate * 100)}%</b> of those were wrong. That looks like rushing, not like your real level.
        </p>
      ) : (
        <p className="text-base">{flags.map((f) => flagText[f]).join(" ")}</p>
      )}

      {engagement && engagement.guessPct > 0 && (
        <p className="rounded-xl bg-white/70 p-3 text-sm dark:bg-slate-900/60">
          <b>Fast-guess model:</b> about <b>{engagement.guessPct}%</b> of these answers look like guesses (likely {engagement.lowPct}–{engagement.highPct}%),
          compared with your usual accuracy of {engagement.engagedAccuracyPct}% when you take your time.
        </p>
      )}

      {shield && (
        <div className="grid grid-cols-3 gap-2 rounded-xl bg-white/70 p-3 text-center dark:bg-slate-900/60">
          <div>
            <p className="text-xs text-slate-500 dark:text-slate-400">Before</p>
            <p className="font-display text-2xl">{shield.beforePct}%</p>
          </div>
          <div>
            <p className="text-xs text-slate-500 dark:text-slate-400">If I&apos;d trusted it</p>
            <p className="font-display text-2xl text-red-600 line-through decoration-2 dark:text-red-400">{shield.naivePct}%</p>
          </div>
          <div>
            <p className="text-xs text-slate-500 dark:text-slate-400">What I recorded</p>
            <p className="font-display text-2xl text-emerald-700 dark:text-emerald-300">{shield.actualPct}%</p>
          </div>
          <p className="col-span-3 text-sm">
            {shield.avoidedPts > 0
              ? <>Counting this game as uncertain kept <b>{shield.avoidedPts} points</b> of false change out of your {skill} score.</>
              : <>Your {skill} score barely moves: this game counts with a much wider margin of error.</>}
          </p>
        </div>
      )}

      {!answer ? (
        <div className="space-y-2">
          <p className="font-medium">🐼 Bao: {rushed ? "Were you rushing, or is something going on?" : "What happened in that game?"}</p>
          <div className="flex flex-wrap gap-2">
            {(Object.keys(RUSH_CONTEXT) as RushContext[]).map((k) => (
              <button key={k} type="button" disabled={busy} onClick={() => send(k)}
                className="rounded-full border border-amber-400 bg-white px-3 py-1.5 text-sm font-medium hover:bg-amber-100 disabled:opacity-50 dark:bg-amber-900 dark:hover:bg-amber-800">
                {RUSH_CONTEXT[k]}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <p role="status" className="rounded-xl bg-white/70 p-3 text-base dark:bg-slate-900/60">🐼 {reply ?? "Thanks, noting that…"}</p>
      )}
    </section>
  );
}
