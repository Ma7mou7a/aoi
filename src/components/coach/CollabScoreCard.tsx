"use client";

import { useState } from "react";
import { COMPONENT_INFO, COMPONENTS, PRIOR } from "@/lib/collab/score";
import type { CollabView } from "@/lib/server/collab";

/** AI Collaboration Score with its component breakdown and the formula, always one tap away. */
export function CollabScoreCard({ view }: { view: CollabView }) {
  const [open, setOpen] = useState(false);
  const { score } = view;
  const weakest = [...COMPONENTS].sort((a, b) => score.components[a].score - score.components[b].score)[0];

  return (
    <section className="space-y-4 glass rounded-2xl p-4 ">
      <div className="flex items-baseline justify-between gap-4">
        <div>
          <h2 className="font-semibold">AI Collaboration Score</h2>
          <p className="text-sm text-slate-500">How well you work with the coach: checking it, questioning it, thinking for yourself.</p>
        </div>
        <p className="font-display text-6xl leading-none text-brand tabular-nums">{score.score}<span className="text-base font-normal text-slate-400">/100</span></p>
      </div>

      <div className="space-y-2">
        {COMPONENTS.map((c) => {
          const s = score.components[c];
          return (
            <div key={c} className="grid grid-cols-[9rem_1fr_3rem] items-center gap-3 text-sm">
              <span title={COMPONENT_INFO[c].measures}>
                {COMPONENT_INFO[c].name} <span className="text-xs text-slate-400">{Math.round(score.weights[c] * 100)}%</span>
              </span>
              <div className="h-2 rounded-full bg-slate-100 dark:bg-slate-800">
                <div className="h-full rounded-full bg-brand" style={{ width: `${s.score * 100}%` }} />
              </div>
              <span className="text-right font-mono text-xs text-slate-500">{s.n ? `${Math.round(s.score * 100)}` : "–"}</span>
            </div>
          );
        })}
      </div>

      <p className="text-sm text-slate-600 dark:text-slate-300">
        <b>To raise it:</b> {COMPONENT_INFO[weakest].improve}
      </p>

      {view.recent.length > 0 && (
        <div className="text-xs text-slate-500">
          <p className="font-medium">Recent signals</p>
          <ul>
            {view.recent.slice(0, 4).map((e, i) => (
              <li key={i}>{e.label} <span className="font-mono">({Math.round(e.value * 100)})</span></li>
            ))}
          </ul>
        </div>
      )}

      <button onClick={() => setOpen(!open)} className="text-sm underline underline-offset-4">{open ? "Hide" : "How is this calculated?"}</button>
      {open && (
        <div className="space-y-2 rounded-xl bg-slate-50 p-3 text-sm dark:bg-slate-900">
          <p className="font-mono text-xs">score = round(100 × Σ weight × component)</p>
          <p className="font-mono text-xs">component = (sum of signal values + {PRIOR.mean} × {PRIOR.strength}) / (number of signals + {PRIOR.strength})</p>
          <p>
            Every interaction with the coach sends a signal worth 0–1 to one component, e.g. opening the evidence (0.8),
            spotting a deliberate error (1.0), or confirming a claim without checking (0.3). Each component starts at {Math.round(PRIOR.mean * 100)} as if you had
            done {PRIOR.strength} neutral things, so a couple of clicks can&apos;t swing it wildly. Weights follow the challenge&apos;s proposal; this is a design
            proposal, not a validated test. Based on {score.nEvents} signal{score.nEvents === 1 ? "" : "s"} ({score.formulaVersion}).
          </p>
          <ul className="list-disc pl-5">
            {COMPONENTS.map((c) => <li key={c}><b>{COMPONENT_INFO[c].name}</b>: {COMPONENT_INFO[c].measures}</li>)}
          </ul>
        </div>
      )}
    </section>
  );
}
