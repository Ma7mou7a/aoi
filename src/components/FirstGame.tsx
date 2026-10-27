"use client";

import Link from "next/link";
import { useState } from "react";
import type { Dimension } from "@/lib/dimensions/schema";
import { saveFirstGame } from "@/lib/firstGame";
import { plainDid } from "@/lib/words";
import { Panda } from "./panda/Panda";
import { PandaSay } from "./panda/PandaSay";
import { TryTask, type TryComplete } from "./TryTask";

const FIRST_LEVEL = 2;

/** /start: one short game with Bao watching, a plain result, then the offer to keep it in a Brain Twin. */
export function FirstGame({ dim, taskId }: { dim: Dimension; taskId: string }) {
  const [done, setDone] = useState<TryComplete | null>(null);

  if (!done) {
    return (
      <div className="space-y-4">
        <div className="mx-auto flex max-w-xl items-end justify-center gap-2">
          <PandaSay text="Watch the blocks light up, then tap them in the same order. I'll be right here!" />
          <Panda state="wave" size={64} />
        </div>
        <TryTask
          dim={dim}
          taskId={taskId}
          level={FIRST_LEVEL}
          onComplete={(r) => {
            saveFirstGame(sessionStorage, { dimensionId: dim.id, taskId, level: r.level, params: r.params, startedAt: r.startedAt, trials: r.trials });
            setDone(r);
          }}
        />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-xl space-y-6 text-center">
      <Panda state="celebrate" size={120} className="mx-auto" />
      <div className="space-y-2">
        <h1 className="text-5xl">Nice one!</h1>
        <p className="text-xl">{plainDid("corsi", done.score.metrics)}</p>
        <p className="text-base text-slate-600 dark:text-slate-300">
          That&apos;s your visual memory: holding where things were, in order. Want me to remember this game and start your Brain Twin?
        </p>
      </div>
      <div className="flex flex-col justify-center gap-3 sm:flex-row">
        <Link href="/?signup=1#start" className="rounded-xl bg-brand px-6 py-3 text-lg font-medium text-white transition-transform hover:bg-brand-deep active:scale-[0.98] dark:text-slate-950 dark:hover:bg-brand-2">
          Yes, start my twin
        </Link>
        <Link href="/try" className="rounded-xl border border-slate-300 px-6 py-3 text-lg font-medium transition-transform hover:bg-slate-100 active:scale-[0.98] dark:border-slate-600 dark:hover:bg-slate-800">
          Just play more
        </Link>
      </div>
      <p className="text-sm text-slate-500 dark:text-slate-400">Nothing is saved unless you say yes. No email needed.</p>
    </div>
  );
}
