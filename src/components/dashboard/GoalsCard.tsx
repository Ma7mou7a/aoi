"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { DashboardData } from "@/lib/server/dashboard";

type Goals = DashboardData["goals"]["goals"];
const pct = (x: number) => Math.round(x * 100);

function Meter({ fraction, done }: { fraction: number; done: boolean }) {
  return (
    <div className="h-2 rounded-full" style={{ background: "var(--seq-1)", opacity: done ? 1 : 0.9 }}>
      <div className="h-full rounded-full" style={{ width: `${Math.max(3, fraction * 100)}%`, background: done ? "#0ca30c" : "var(--chart-accent)" }} />
    </div>
  );
}

export function GoalsCard({ goals, skills }: { goals: Goals; skills: Array<{ id: string; name: string; mean: number; measured: boolean }> }) {
  const router = useRouter();
  const measured = skills.filter((s) => s.measured);
  const [kind, setKind] = useState<"reach_score" | "consistency">(measured.length ? "reach_score" : "consistency");
  const [skill, setSkill] = useState(measured[0]?.id ?? "");
  const current = skills.find((s) => s.id === skill);
  const [target, setTarget] = useState(current ? Math.min(95, pct(current.mean) + 10) : 60);
  const [sessions, setSessions] = useState(4);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create() {
    setError(null);
    const body = kind === "consistency" ? { kind, target: sessions } : { kind, dimensionId: skill, target: target / 100 };
    const res = await fetch("/api/goals", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    if (!res.ok) return setError((await res.json()).error);
    setAdding(false);
    router.refresh();
  }

  async function drop(id: string) {
    await fetch(`/api/goals/${id}`, { method: "DELETE" });
    router.refresh();
  }

  return (
    <section className="space-y-3 glass rounded-2xl p-4 " style={{ background: "var(--chart-surface)" }}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold" style={{ color: "var(--chart-ink)" }}>Goals</h2>
          <p className="text-sm" style={{ color: "var(--chart-ink-2)" }}>A score goal counts as reached only when your whole band is above the target.</p>
        </div>
        {!adding && <button onClick={() => setAdding(true)} className="shrink-0 rounded-md border border-slate-300 px-2 py-1 text-xs dark:border-slate-700">+ New goal</button>}
      </div>

      {goals.length === 0 && !adding && <p className="text-sm" style={{ color: "var(--chart-muted)" }}>No goals yet.</p>}
      <ul className="space-y-3">
        {goals.map((g) => (
          <li key={g.id} className="space-y-1.5">
            <div className="flex items-baseline justify-between gap-2 text-sm">
              <span className="font-medium" style={{ color: "var(--chart-ink)" }}>
                {g.status === "achieved" && <span aria-label="achieved">✓ </span>}
                {g.title}
              </span>
              <span className="text-xs" style={{ color: "var(--chart-muted)" }}>
                {g.status === "achieved" ? "Reached" : g.status === "expired" ? "Deadline passed" : g.deadline ? `by ${new Date(g.deadline).toLocaleDateString(undefined, { month: "short", day: "numeric" })}` : ""}
                {g.status === "active" && <button onClick={() => drop(g.id)} className="ml-2 underline-offset-2 hover:underline">drop</button>}
              </span>
            </div>
            <Meter fraction={g.progress.fraction} done={g.status === "achieved"} />
            <p className="text-xs" style={{ color: "var(--chart-ink-2)" }}>{g.progress.label}</p>
          </li>
        ))}
      </ul>

      {adding && (
        <div className="space-y-3 rounded-xl border p-3 text-sm" style={{ borderColor: "var(--chart-grid)" }}>
          <div className="flex gap-2">
            {(["reach_score", "consistency"] as const).map((k) => (
              <button key={k} onClick={() => setKind(k)} disabled={k === "reach_score" && !measured.length} aria-pressed={kind === k}
                className={`rounded-lg border px-3 py-1 disabled:opacity-40 ${kind === k ? "border-slate-900 bg-slate-900 text-white dark:border-brand dark:bg-brand dark:text-slate-900" : "border-slate-300 dark:border-slate-700"}`}>
                {k === "reach_score" ? "Reach a score" : "Play regularly"}
              </button>
            ))}
          </div>
          {kind === "reach_score" ? (
            <div className="flex flex-wrap items-center gap-2">
              <select value={skill} onChange={(e) => { setSkill(e.target.value); const s = skills.find((x) => x.id === e.target.value); if (s) setTarget(Math.min(95, pct(s.mean) + 10)); }}
                className="rounded-lg border border-slate-300 bg-transparent px-2 py-1 dark:border-slate-700">
                {measured.map((s) => <option key={s.id} value={s.id}>{s.name} (now {pct(s.mean)}%)</option>)}
              </select>
              <label className="flex items-center gap-2">to <input type="number" min={5} max={95} value={target} onChange={(e) => setTarget(Number(e.target.value))} className="w-16 rounded-lg border border-slate-300 bg-transparent px-2 py-1 dark:border-slate-700" />%</label>
              <span className="text-xs" style={{ color: "var(--chart-muted)" }}>in 2 weeks</span>
            </div>
          ) : (
            <label className="flex items-center gap-2">
              <input type="number" min={1} max={14} value={sessions} onChange={(e) => setSessions(Number(e.target.value))} className="w-16 rounded-lg border border-slate-300 bg-transparent px-2 py-1 dark:border-slate-700" /> sessions per week
            </label>
          )}
          {error && <p className="text-xs text-red-600">{error}</p>}
          <div className="flex gap-2">
            <button onClick={create} className="rounded-lg bg-slate-900 px-3 py-1.5 text-white dark:bg-brand dark:text-slate-900">Set goal</button>
            <button onClick={() => setAdding(false)} className="px-3 py-1.5" style={{ color: "var(--chart-muted)" }}>Cancel</button>
          </div>
        </div>
      )}
    </section>
  );
}
