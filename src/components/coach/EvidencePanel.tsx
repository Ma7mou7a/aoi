"use client";

import { useEffect, useState } from "react";

type EvidenceRun = { id: string; skill: string; task: string; paradigm: string | null; level: number; startedAt: string; composite: number | null; metrics: Record<string, number> | null; validity: { valid: boolean; flags: string[] } | null };
type EvidenceTrial = { id: string; taskRunId: string; trialIndex: number; stimulus: Record<string, unknown>; expected: unknown; response: unknown; outcome: string; correct: boolean | null; rtMs: number | null };

const show = (v: unknown) => (v == null ? "—" : Array.isArray(v) ? v.map((x) => Number(x) + 1).join(" → ") : String(v));

/** One row's "what was shown / what you did", per task type. */
function describe(paradigm: string | null, t: EvidenceTrial): [string, string] {
  const s = t.stimulus;
  if (paradigm === "n_back") return [`${s.letter}${s.isTarget ? " (match)" : ""}`, t.response ? "pressed" : "no press"];
  if (paradigm === "stroop") return [`“${String(s.word).toUpperCase()}” in ${s.ink}${s.congruent ? "" : " (conflict)"}`, show(t.response)];
  if (paradigm === "corsi") return [`${s.span} blocks: ${show(t.expected)}`, show(t.response)];
  if (paradigm === "symbol_digit") return [`${s.glyph} → ${t.expected}`, show(t.response)];
  if (paradigm === "task_switching") return [`${s.digit}, ${s.rule === "parity" ? "odd/even" : "smaller/larger"}${s.switch ? " (switch)" : ""}`, show(t.response)];
  if (paradigm === "matrices") {
    const rules = Object.entries((s.rules ?? {}) as Record<string, string>).filter(([, r]) => r !== "constant").map(([a]) => a).join(" + ");
    return [`Puzzle (${rules || "pattern"}): option ${Number(t.expected) + 1}`, t.response == null ? "—" : `option ${Number(t.response) + 1}`];
  }
  return [JSON.stringify(s), show(t.response)];
}

/** The exact blocks and trials behind one coach claim. */
export function EvidencePanel({ runIds, trialIds }: { runIds: string[]; trialIds: string[] }) {
  const [data, setData] = useState<{ runs: EvidenceRun[]; trials: EvidenceTrial[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const qs = new URLSearchParams({ runs: runIds.join(","), trials: trialIds.join(",") });
    fetch(`/api/evidence?${qs}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("Could not load evidence"))))
      .then(setData)
      .catch((e) => setError(e.message));
  }, [runIds, trialIds]);

  if (error) return <p className="text-sm text-red-600">{error}</p>;
  if (!data) return <p className="text-sm text-slate-500">Loading evidence…</p>;

  return (
    <div className="space-y-3 rounded-xl bg-slate-50 p-3 text-sm dark:bg-slate-900">
      {data.runs.map((r) => {
        const rows = data.trials.filter((t) => t.taskRunId === r.id);
        return (
          <div key={r.id} className="space-y-2">
            <p>
              <b>{r.task}</b>, level {r.level} · {new Date(r.startedAt).toLocaleString()} · block score {r.composite == null ? "n/a" : `${Math.round(r.composite * 100)}%`}
              {r.validity && !r.validity.valid && <span className="ml-2 text-amber-600">(counted less: {r.validity.flags.join(", ").replaceAll("_", " ")})</span>}
            </p>
            {rows.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead className="text-xs text-slate-500">
                    <tr>
                      <th className="py-1 pr-2">Trial</th>
                      <th className="py-1 pr-2">Shown</th>
                      <th className="py-1 pr-2">You</th>
                      <th className="py-1 pr-2 text-right">Time</th>
                      <th className="py-1 text-right">Result</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((t) => {
                      const [shown, you] = describe(r.paradigm, t);
                      return (
                        <tr key={t.id} className="border-t border-slate-200 dark:border-slate-800">
                          <td className="py-1 pr-2 font-mono">#{t.trialIndex + 1}</td>
                          <td className="py-1 pr-2">{shown}</td>
                          <td className="py-1 pr-2">{you}</td>
                          <td className="py-1 pr-2 text-right font-mono">{t.rtMs == null ? "—" : `${t.rtMs} ms`}</td>
                          <td className={`py-1 text-right ${t.correct ? "text-emerald-600" : "text-rose-600"}`}>
                            {t.correct ? "correct" : t.outcome === "timeout" ? "too late" : t.response == null ? "missed" : "wrong"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
