"use client";

import { useState } from "react";
import type { CoachClaim } from "@/db/schema";
import type { ClientCoachMessage } from "@/lib/server/collab";
import { EvidencePanel } from "./EvidencePanel";

export type ClaimAction = "opened_evidence" | "looks_right" | "something_off";
export type FeedbackFn = (messageId: string, claimIndex: number, action: ClaimAction) => void;

/**
 * One evidence-backed observation behind "Why?". The rating buttons and the spot-the-error reveal
 * appear only in research mode: day to day, people just read the evidence if they want it.
 */
export function ClaimCard({ m, index, claim, onFeedback, researchMode }: { m: ClientCoachMessage; index: number; claim: CoachClaim; onFeedback: FeedbackFn; researchMode: boolean }) {
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
    <li className="space-y-2 rounded-xl border border-slate-200 p-3 dark:border-slate-700">
      <p className="font-medium">{claim.claim}</p>
      <p className="text-sm text-slate-600 dark:text-slate-300">{claim.why}</p>
      <div className="flex flex-wrap items-center gap-2">
        <button onClick={toggle} aria-expanded={open} className="rounded-full border border-slate-300 px-3 py-1 text-xs font-medium hover:bg-slate-100 dark:border-slate-600 dark:hover:bg-slate-800">
          {open ? "Hide the games behind this" : `Show the games behind this${nTrials ? ` (${nTrials} answer${nTrials > 1 ? "s" : ""})` : ""}`}
        </button>
        {(claim.science ?? []).map((s) => (
          <button key={s.id} onClick={() => setScience(science === s.id ? null : s.id)} aria-expanded={science === s.id}
            className="rounded-full border border-brand/40 bg-brand/10 px-3 py-1 text-xs font-medium text-brand-deep hover:bg-brand/20 dark:text-brand-2">
            Research: {s.title}
          </button>
        ))}
      </div>
      {(claim.science ?? []).filter((s) => s.id === science).map((s) => (
        <div key={s.id} className="rounded-lg border-l-2 border-brand bg-brand/5 p-2 text-sm">
          <p>{s.finding}</p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            <a href={s.url} target="_blank" rel="noreferrer" className="underline underline-offset-2 hover:text-brand">{s.citation}</a>
            {" · "}A general research finding that explains your result. It is not a comparison with other people.
          </p>
        </div>
      ))}
      {open && (
        <>
          <p className="text-xs text-slate-500 dark:text-slate-400">Based on: {claim.evidenceLabels.join(" · ")}</p>
          <EvidencePanel runIds={claim.evidenceTaskRunIds} trialIds={claim.evidenceTrialIds} />
        </>
      )}

      {researchMode &&
        (verdict ? (
          <p className="text-xs text-slate-500 dark:text-slate-400">You marked this as {verdict === "looks_right" ? "looks right ✓" : "something's off ✗"}.</p>
        ) : (
          <div className="flex gap-2">
            <button onClick={() => onFeedback(m.id, index, "looks_right")} className="rounded-lg border border-emerald-300 px-3 py-1 text-xs text-emerald-700 hover:bg-emerald-50 dark:border-emerald-800 dark:text-emerald-300 dark:hover:bg-emerald-950">
              Looks right
            </button>
            <button onClick={() => onFeedback(m.id, index, "something_off")} className="rounded-lg border border-rose-300 px-3 py-1 text-xs text-rose-700 hover:bg-rose-50 dark:border-rose-800 dark:text-rose-300 dark:hover:bg-rose-950">
              Something&apos;s off
            </button>
          </div>
        ))}

      {flaw && (
        <div className={`rounded-lg p-2 text-sm ${flaw.caught ? "bg-emerald-50 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200" : "bg-amber-50 text-amber-900 dark:bg-amber-950 dark:text-amber-200"}`}>
          <b>{flaw.caught ? "Well spotted! " : "This one had a deliberate error. "}</b>
          {flaw.description} {flaw.caught ? "Checking the AI is exactly the right habit." : "Opening the evidence would have shown it."} The text above is now corrected.
        </div>
      )}
    </li>
  );
}
