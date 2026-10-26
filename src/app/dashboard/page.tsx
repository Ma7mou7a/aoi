import Link from "next/link";
import { redirect } from "next/navigation";
import { ActivityHeatmap } from "@/components/dashboard/ActivityHeatmap";
import { GoalsCard } from "@/components/dashboard/GoalsCard";
import { PlanCard } from "@/components/dashboard/PlanCard";
import { ProgressMultiples } from "@/components/dashboard/ProgressMultiples";
import { RadarBand } from "@/components/dashboard/RadarBand";
import { getDashboard, RANGE_OPTIONS, type RangeDays } from "@/lib/server/dashboard";
import { getCurrentUser } from "@/lib/server/user";

export const dynamic = "force-dynamic";

function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="glass rounded-2xl p-4 " style={{ background: "var(--chart-surface)" }}>
      <p className="text-xs font-semibold tracking-widest uppercase" style={{ color: "var(--chart-ink-2)" }}>{label}</p>
      <p className="font-display text-5xl leading-tight text-brand">{value}</p>
      {note && <p className="text-xs" style={{ color: "var(--chart-muted)" }}>{note}</p>}
    </div>
  );
}

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ range?: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/");
  const r = Number((await searchParams).range);
  const range: RangeDays = (RANGE_OPTIONS as readonly number[]).includes(r) ? (r as RangeDays) : 14;
  const data = await getDashboard(user.id, range);
  const dims = data.profile.dimensions;
  const measured = dims.filter((d) => d.nObservations > 0);
  const blocksThisWeek = data.plan.items.reduce((s, i) => s + i.blocksDone, 0);
  const colors = Object.fromEntries(dims.map((d) => [d.id, `var(--dim-${d.id}, ${d.color})`]));
  const now = Date.now();

  return (
    <div className="space-y-6">
      <div>
        <p className="font-display text-sm tracking-[0.25em] text-brand uppercase">Your Brain Twin</p>
        <h1 className="text-6xl">Dashboard</h1>
        <p className="text-slate-600 dark:text-slate-300">Your Brain Twin, your plan and your goals. Every estimate comes with a band showing how sure we are.</p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Skills measured" value={`${measured.length}/${dims.length}`} />
        <Stat label="Blocks this week" value={String(blocksThisWeek)} note={`plan: ${data.plan.items.reduce((s, i) => s + i.blocksTarget, 0)}`} />
        <Stat label="Day streak" value={String(data.streak)} note={`${data.goals.sessionsLast7Days} session${data.goals.sessionsLast7Days === 1 ? "" : "s"} in the last 7 days`} />
        <Stat label="AI collaboration" value={String(data.collabScore)} note="out of 100 · see Coach" />
      </div>

      <div className="grid gap-6 lg:grid-cols-[3fr_2fr]">
        <RadarBand dims={dims} />
        <PlanCard plan={data.plan} colors={colors} />
      </div>

      <GoalsCard goals={data.goals.goals} skills={dims.map((d) => ({ id: d.id, name: d.name, mean: d.mean, measured: d.nObservations > 0 }))} />

      {/* One filter row above everything it scopes (progress + heatmap). */}
      <div className="flex flex-wrap items-center gap-2 border-t border-slate-200 pt-4 text-sm dark:border-slate-800">
        <span style={{ color: "var(--chart-ink-2)" }}>Time range</span>
        {RANGE_OPTIONS.map((d) => (
          <Link key={d} href={`/dashboard?range=${d}`} scroll={false} aria-current={d === range ? "true" : undefined}
            className={`rounded-lg border px-3 py-1 ${d === range ? "border-slate-900 bg-slate-900 text-white dark:border-brand dark:bg-brand dark:text-slate-900" : "border-slate-300 dark:border-slate-700"}`}>
            {d} days
          </Link>
        ))}
      </div>
      <ProgressMultiples dims={dims} rangeDays={range} now={now} projections={data.forecast.byDim} track={data.forecast} />
      <ActivityHeatmap heat={data.heat} skills={dims.map((d) => ({ id: d.id, name: d.name }))} />
    </div>
  );
}
