"use client";

import Link from "next/link";
import type { ClientAction } from "@/lib/coach/actions";

/** The coach's buttons: links (play, progress, goal, daily) or an in-chat forecast request. */
export function ActionButtons({ actions, onForecast, disabled }: { actions: ClientAction[]; onForecast: (f: NonNullable<ClientAction["forecast"]>) => void; disabled?: boolean }) {
  if (!actions.length) return null;
  const cls =
    "inline-flex min-h-10 items-center rounded-full border px-4 py-1.5 text-sm font-medium transition-[transform,background-color] active:scale-[0.97] disabled:opacity-50";
  return (
    <div className="flex flex-wrap gap-2">
      {actions.map((a, i) =>
        a.kind === "forecast" && a.forecast ? (
          <button key={a.label} type="button" disabled={disabled} onClick={() => onForecast(a.forecast!)} className={`${cls} border-slate-300 hover:bg-slate-100 dark:border-slate-600 dark:hover:bg-slate-800`}>
            {a.label}
          </button>
        ) : (
          <Link key={a.label} href={a.href ?? "/"}
            className={`${cls} ${i === 0 ? "border-brand bg-brand text-white hover:bg-brand-deep dark:text-slate-950 dark:hover:bg-brand-2" : "border-slate-300 hover:bg-slate-100 dark:border-slate-600 dark:hover:bg-slate-800"}`}>
            {a.label}
          </Link>
        ),
      )}
    </div>
  );
}
