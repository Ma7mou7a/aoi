"use client";

import { useState } from "react";
import { shareText, todayUtc } from "@/lib/daily";

/** Copy today's result as text with five squares. Only your own result and the date, no name. */
export function ShareDaily({ taskName, score, detail }: { taskName: string; score: number; detail: string }) {
  const [state, setState] = useState<"idle" | "copied" | "error">("idle");
  const text = shareText({ day: todayUtc(), taskName, score, detail });
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setState("copied");
      setTimeout(() => setState("idle"), 2000);
    } catch {
      setState("error");
    }
  }
  return (
    <div className="space-y-2 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
      <p className="font-semibold">Share today&apos;s result</p>
      <p className="rounded-lg bg-slate-100 px-3 py-2 font-mono text-sm dark:bg-slate-800">{text}</p>
      <button type="button" onClick={copy} className="rounded-xl border border-slate-300 px-4 py-2 font-medium transition-transform hover:bg-slate-100 active:scale-[0.98] dark:border-slate-600 dark:hover:bg-slate-800">
        {state === "copied" ? "Copied!" : "Copy my result"}
      </button>
      {state === "error" && <p role="alert" className="text-sm text-red-600">Couldn&apos;t copy. Select the text above and copy it yourself.</p>}
    </div>
  );
}
