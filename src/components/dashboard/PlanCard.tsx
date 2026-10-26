"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { DashboardData } from "@/lib/server/dashboard";

export function PlanCard({ plan, colors }: { plan: DashboardData["plan"]; colors: Record<string, string> }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const done = plan.items.reduce((s, i) => s + Math.min(i.blocksDone, i.blocksTarget), 0);
  const total = plan.items.reduce((s, i) => s + i.blocksTarget, 0);

  async function rebuild() {
    setBusy(true);
    await fetch("/api/plan", { method: "POST" });
    setBusy(false);
    router.refresh();
  }

  return (
    <section className="space-y-3 rounded-2xl border border-slate-200 p-4 dark:border-slate-800" style={{ background: "var(--chart-surface)" }}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold" style={{ color: "var(--chart-ink)" }}>This week&apos;s plan</h2>
          <p className="text-sm" style={{ color: "var(--chart-ink-2)" }}>{plan.rationale}</p>
        </div>
        <button onClick={rebuild} disabled={busy} className="shrink-0 rounded-md border border-slate-300 px-2 py-1 text-xs disabled:opacity-40 dark:border-slate-700" title="Rebuild from your current profile">
          {busy ? "Rebuilding…" : "Rebuild"}
        </button>
      </div>

      <p className="text-sm tabular-nums" style={{ color: "var(--chart-ink)" }}>
        <b>{done}</b> of {total} blocks done
      </p>
      <ul className="space-y-3">
        {plan.items.map((i) => {
          const f = Math.min(1, i.blocksDone / i.blocksTarget);
          return (
            <li key={i.id} className="space-y-1">
              <div className="flex items-baseline justify-between gap-2 text-sm">
                <span className="flex items-center gap-1.5 font-medium" style={{ color: "var(--chart-ink)" }}>
                  <span className="inline-block h-2 w-2 rounded-full" style={{ background: colors[i.dimensionId] }} aria-hidden />
                  {i.task} <span className="font-normal" style={{ color: "var(--chart-muted)" }}>· level {i.level}</span>
                </span>
                <span className="text-xs tabular-nums" style={{ color: "var(--chart-ink-2)" }}>{Math.min(i.blocksDone, i.blocksTarget)}/{i.blocksTarget}</span>
              </div>
              <div className="flex gap-[2px]" aria-hidden>
                {Array.from({ length: i.blocksTarget }, (_, k) => (
                  <span key={k} className="h-2 flex-1 rounded-[3px]" style={{ background: k < i.blocksDone ? "var(--chart-accent)" : "var(--chart-empty)" }} />
                ))}
              </div>
              <p className="text-xs" style={{ color: "var(--chart-ink-2)" }}>{i.reason}</p>
              <span className="sr-only">{f === 1 ? "Done" : `${i.blocksDone} of ${i.blocksTarget} blocks done`}</span>
            </li>
          );
        })}
      </ul>
      <Link href="/play?mode=training" className="block rounded-xl bg-slate-900 py-2.5 text-center text-sm font-medium text-white dark:bg-white dark:text-slate-900">
        Start a training session
      </Link>
    </section>
  );
}
