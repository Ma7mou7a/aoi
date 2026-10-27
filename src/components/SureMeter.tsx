"use client";

import { useEffect, useRef } from "react";

/**
 * The "sure-o-meter": the range the score most likely sits in. After a game the range narrows from
 * the old width to the new one with a scaleX transition (transform only); the marker is the score.
 */
export function SureMeter({ before, after, mean, color }: { before: [number, number]; after: [number, number]; mean: number; color: string }) {
  const band = useRef<HTMLDivElement>(null);
  const newW = Math.max(0.01, after[1] - after[0]);
  const startScale = Math.min(4, Math.max(0.25, (before[1] - before[0]) / newW));
  useEffect(() => {
    const el = band.current;
    if (!el) return;
    el.style.transform = `scaleX(${startScale})`;
    // Next frame: let the transition run to the new width.
    const id = requestAnimationFrame(() => requestAnimationFrame(() => (el.style.transform = "scaleX(1)")));
    return () => cancelAnimationFrame(id);
  }, [startScale]);

  const pct = (x: number) => Math.round(x * 100);
  return (
    <div
      className="relative h-4 rounded-full bg-slate-100 dark:bg-slate-800"
      role="img"
      aria-label={`Score about ${pct(mean)}, most likely between ${pct(after[0])} and ${pct(after[1])}`}
    >
      <div
        ref={band}
        className="absolute inset-y-0 rounded-full opacity-35 transition-transform duration-700 ease-out motion-reduce:transition-none"
        style={{ left: `${after[0] * 100}%`, width: `${newW * 100}%`, background: color }}
      />
      <div className="absolute -top-1 h-6 w-1.5 -translate-x-1/2 rounded-full" style={{ left: `${mean * 100}%`, background: color }} />
    </div>
  );
}
