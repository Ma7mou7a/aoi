import { createRng } from "@/lib/rng";
import { BambooIcon } from "./BambooIcon";

/**
 * The bamboo garden: one stalk per 50 bamboo (up to 30), varied heights from a fixed seed so the
 * garden looks the same on every visit. New stalks grow in with scaleY (transform only).
 */
export function BambooGarden({ stalks, total, streak, frozenDays }: { stalks: number; total: number; streak: number; frozenDays: string[] }) {
  const rng = createRng(2026);
  const heights = Array.from({ length: 30 }, () => 0.55 + rng.next() * 0.45);
  const w = 300;
  const step = w / 31;
  return (
    <div className="space-y-2 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-2xl">Your bamboo garden</h2>
        <p className="flex items-center gap-1 font-semibold tabular-nums"><BambooIcon /> {total} bamboo</p>
      </div>
      <svg viewBox={`0 0 ${w} 90`} className="h-24 w-full" role="img" aria-label={`${stalks} bamboo stalks grown`}>
        <rect x="0" y="82" width={w} height="8" rx="4" fill="var(--bamboo-dark)" opacity="0.35" />
        {heights.slice(0, stalks).map((h, i) => {
          const x = step * (i + 1) - 3;
          const top = 82 - 75 * h;
          return (
            <g key={i} className="stalk-grow" style={{ animationDelay: `${i * 40}ms` }}>
              <rect x={x} y={top} width="6" height={82 - top} rx="3" fill="var(--bamboo)" />
              <path d={`M${x} ${top + (82 - top) / 3}h6M${x} ${top + (2 * (82 - top)) / 3}h6`} stroke="var(--bamboo-dark)" strokeWidth="1.2" />
              <path d={`M${x + 6} ${top + 4}q6 -4 9 -9q-7 1 -9 6`} fill="var(--bamboo)" />
            </g>
          );
        })}
      </svg>
      <p className="text-sm text-slate-600 dark:text-slate-300">
        {stalks === 0 ? "Play a few games and your first stalk will sprout (one per 50 bamboo)." : `One stalk per 50 bamboo. ${stalks < 30 ? `${50 - (total % 50)} bamboo to the next one.` : "Your garden is full!"}`}
        {streak >= 2 && ` · ${streak}-day streak`}
        {frozenDays.length > 0 && " (a streak freeze covered a missed day)"}
      </p>
    </div>
  );
}
