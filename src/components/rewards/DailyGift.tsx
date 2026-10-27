"use client";

import { useState } from "react";
import { pandaBus } from "@/lib/panda/bus";
import { Panda } from "../panda/Panda";
import { announceBamboo } from "./BambooCounter";

/** Today's gift: a chest that opens once per day for 5 bamboo, with Bao celebrating. */
export function DailyGift({ claimed }: { claimed: boolean }) {
  const [state, setState] = useState<"closed" | "opening" | "open">(claimed ? "open" : "closed");
  const [error, setError] = useState<string | null>(null);

  async function open() {
    setState("opening");
    setError(null);
    try {
      const res = await fetch("/api/rewards/gift", { method: "POST" });
      if (!res.ok) throw new Error();
      const json = await res.json();
      announceBamboo({ total: json.rewards.total });
      pandaBus.emit({ type: "reward" });
      setState("open");
    } catch {
      setState("closed");
      setError("The gift didn't open. Please try again.");
    }
  }

  if (state === "open") {
    return (
      <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
        <Panda state={claimed ? "calm" : "celebrate"} size={56} />
        <p className="text-base">{claimed ? "Today's gift is open. Come back tomorrow for another one!" : "+5 bamboo! Thanks for showing up today."}</p>
      </div>
    );
  }
  return (
    <div className="space-y-2">
      <button type="button" onClick={open} disabled={state === "opening"}
        className="group flex w-full items-center gap-4 rounded-2xl border border-brand/50 bg-white p-4 text-left transition-transform hover:border-brand active:scale-[0.99] disabled:opacity-70 dark:bg-slate-900">
        <svg viewBox="0 0 64 56" className="h-14 w-16 shrink-0" aria-hidden>
          <g className={`gift-lid ${state === "opening" ? "gift-lid-open" : ""}`}>
            <rect x="6" y="10" width="52" height="14" rx="4" fill="var(--accent)" />
            <rect x="28" y="10" width="8" height="14" fill="var(--bamboo)" />
          </g>
          <rect x="10" y="24" width="44" height="28" rx="4" fill="#c4611a" />
          <rect x="28" y="24" width="8" height="28" fill="var(--bamboo)" />
        </svg>
        <span>
          <span className="block text-lg font-semibold">Open today&apos;s gift</span>
          <span className="block text-sm text-slate-500 dark:text-slate-400">A little bamboo for coming back. One gift a day.</span>
        </span>
      </button>
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
