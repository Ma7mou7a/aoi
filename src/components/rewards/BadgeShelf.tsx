import { BADGES } from "@/lib/rewards";

/** All badges: earned ones in colour with a tick, the rest greyed with how to earn them. */
export function BadgeShelf({ earned }: { earned: string[] }) {
  const have = new Set(earned);
  return (
    <section id="badges" className="scroll-mt-28 space-y-3">
      <h2 className="text-3xl">Badges · {earned.length} of {BADGES.length}</h2>
      <p className="text-base text-slate-600 dark:text-slate-300">Badges reward showing up and being curious, never how high your scores are.</p>
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {BADGES.map((b) => {
          const got = have.has(b.id);
          return (
            <li key={b.id} className={`flex items-start gap-3 rounded-xl border p-3 ${got ? "border-emerald-300 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950" : "border-slate-200 opacity-70 dark:border-slate-700"}`}>
              <span aria-hidden className={`grid h-9 w-9 shrink-0 place-items-center rounded-full text-lg ${got ? "bg-emerald-600 text-white" : "border border-dashed border-slate-400 text-slate-400"}`}>{got ? "✓" : "?"}</span>
              <span>
                <span className="block font-semibold">{b.title}</span>
                <span className="block text-sm text-slate-600 dark:text-slate-300">{got ? "Earned" : b.text}</span>
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
