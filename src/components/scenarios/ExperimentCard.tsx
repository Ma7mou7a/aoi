"use client";

import type { RunResult } from "@/lib/server/blocks";

/**
 * The plateau self-experiment readout: strategy games vs the plateau, with a 90% range on the
 * difference. A range that crosses zero is reported as "not clear yet", never as a win.
 */
export function ExperimentCard({ e }: { e: NonNullable<RunResult["experiment"]> }) {
  const scale = (x: number) => 50 + Math.max(-50, Math.min(50, x)) * 1.6;
  const verdict = {
    helped: `“${e.strategy}” is working: even the low end of the range is above your plateau.`,
    hurt: `“${e.strategy}” isn't helping you: the whole range is below your plateau. We'll try something else.`,
    unclear: `Too early to tell: the range still includes “no difference”. One or two more strategy games will settle it.`,
  }[e.verdict];
  return (
    <section aria-label="Strategy experiment" className="space-y-3 rounded-2xl border border-violet-300 bg-violet-50 p-4 text-violet-950 dark:border-violet-800 dark:bg-violet-950 dark:text-violet-100">
      <p className="text-sm font-semibold tracking-wide uppercase">Your experiment · {e.strategy}</p>
      <p className="text-base">
        Plateau: <b>{e.baselinePct}%</b> over {e.nBaseline} games · With the strategy: <b>{e.strategyPct}%</b> over {e.nStrategy} game{e.nStrategy > 1 ? "s" : ""}.
      </p>
      <div aria-hidden className="relative h-8 rounded-lg bg-white/70 dark:bg-slate-900/60">
        <div className="absolute inset-y-0 w-px bg-slate-400" style={{ left: "50%" }} />
        <div className="absolute top-2 h-4 rounded bg-violet-400/60" style={{ left: `${scale(e.lowPts)}%`, width: `${Math.max(1, scale(e.highPts) - scale(e.lowPts))}%` }} />
        <div className="absolute top-1 h-6 w-1 rounded bg-violet-700 dark:bg-violet-300" style={{ left: `${scale(e.diffPts)}%` }} />
      </div>
      <p className="text-sm">
        Difference <b>{e.diffPts >= 0 ? "+" : ""}{e.diffPts} pts</b> (likely {e.lowPts} to {e.highPts}). {verdict}
      </p>
    </section>
  );
}
