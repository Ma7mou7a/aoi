/** A 0–100% track with the 90% credible band shaded and the estimate marked. */
export function BandBar({ label, mean, ci, color }: { label: string; mean: number; ci: [number, number]; color: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-16 shrink-0 text-xs text-slate-500">{label}</span>
      <div className="relative h-3 flex-1 rounded-full bg-slate-100 dark:bg-slate-800" role="img" aria-label={`${label}: ${Math.round(mean * 100)}%, likely between ${Math.round(ci[0] * 100)}% and ${Math.round(ci[1] * 100)}%`}>
        <div className="absolute inset-y-0 rounded-full opacity-30" style={{ left: `${ci[0] * 100}%`, width: `${(ci[1] - ci[0]) * 100}%`, background: color }} />
        <div className="absolute -top-1 h-5 w-1.5 -translate-x-1/2 rounded-full" style={{ left: `${mean * 100}%`, background: color }} />
      </div>
      <span className="w-10 shrink-0 text-right font-mono text-sm">{Math.round(mean * 100)}%</span>
    </div>
  );
}
