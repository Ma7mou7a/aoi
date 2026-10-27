"use client";

import Link from "next/link";
import { useState } from "react";
import type { Dimension } from "@/lib/dimensions/schema";
import { plainDid } from "@/lib/words";
import { Panda } from "./panda/Panda";
import { ShareDaily } from "./ShareDaily";
import { TryTask, type TryComplete } from "./TryTask";

/** The daily challenge for visitors without an account: today's puzzle, a plain result and a share card. */
export function DailyGuest({ dim, taskId, level, seed }: { dim: Dimension; taskId: string; level: number; seed: number }) {
  const [done, setDone] = useState<TryComplete | null>(null);
  const task = dim.tasks.find((t) => t.id === taskId)!;
  if (!done) return <TryTask dim={dim} taskId={taskId} level={level} seed={seed} onComplete={setDone} />;
  return (
    <div className="mx-auto max-w-xl space-y-5 text-center">
      <Panda state="celebrate" size={110} className="mx-auto" />
      <h2 className="text-4xl">Daily done!</h2>
      <p className="text-xl">{plainDid(task.paradigm, done.score.metrics)}</p>
      <ShareDaily taskName={task.name} score={done.score.composite} detail={dim.name} />
      <div className="flex flex-col justify-center gap-3 sm:flex-row">
        <Link href="/start" className="rounded-xl bg-brand px-6 py-3 font-medium text-white transition-transform hover:bg-brand-deep active:scale-[0.98] dark:text-slate-950">Start your Brain Twin</Link>
        <Link href="/try" className="rounded-xl border border-slate-300 px-6 py-3 font-medium dark:border-slate-600">Play more games</Link>
      </div>
    </div>
  );
}
