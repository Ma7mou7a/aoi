"use client";

import { Area, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { ProfileView } from "@/lib/server/profile";
import { ChartCard, DataTable } from "./ChartCard";

type Dim = ProfileView["dimensions"][number];
type Point = { t: number; mean: number; band: [number, number]; measured: boolean };

const DAY = 86_400_000;
const pct = (x: number) => Math.round(x * 100);
const fmtDay = (t: number) => new Date(t).toLocaleDateString(undefined, { month: "short", day: "numeric" });
const fmtTime = (t: number) => new Date(t).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });

/** History inside the range, starting from the estimate in force at the range start and ending at "now". */
function seriesFor(d: Dim, from: number, now: number): Point[] {
  const all = d.history.map((h) => ({ t: new Date(h.at).getTime(), mean: pct(h.mean), band: [pct(h.ciLow), pct(h.ciHigh)] as [number, number], measured: h.measured }));
  const before = all.filter((p) => p.t < from).at(-1);
  const inside = all.filter((p) => p.t >= from);
  const pts = [...(before ? [{ ...before, t: from }] : []), ...inside];
  if (pts.length) pts.push({ t: now, mean: pct(d.mean), band: [pct(d.ci[0]), pct(d.ci[1])], measured: true });
  return pts;
}

function TooltipBody({ active, payload, name }: { active?: boolean; payload?: Array<{ payload: Point }>; name: string }) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div className="rounded-lg border px-2.5 py-1.5 text-xs shadow-sm" style={{ background: "var(--chart-surface)", borderColor: "var(--chart-grid)", color: "var(--chart-ink)" }}>
      <p style={{ color: "var(--chart-ink-2)" }}>{fmtTime(p.t)}</p>
      <p><b>{name}</b>: {p.mean}% <span style={{ color: "var(--chart-ink-2)" }}>(band {p.band[0]}–{p.band[1]}%)</span></p>
      {!p.measured && <p style={{ color: "var(--chart-muted)" }}>Starting assumption, before any blocks</p>}
    </div>
  );
}

function Multiple({ d, from, now }: { d: Dim; from: number; now: number }) {
  const data = seriesFor(d, from, now);
  const color = `var(--dim-${d.id}, ${d.color})`;
  // Change since the first real estimate in range (the starting prior is not a measurement).
  const first = data.find((p) => p.measured);
  const change = first && first !== data.at(-1) ? pct(d.mean) - first.mean : 0;
  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between gap-2">
        <p className="flex items-center gap-1.5 text-sm font-medium" style={{ color: "var(--chart-ink)" }}>
          <span className="inline-block h-2 w-2 rounded-full" style={{ background: color }} aria-hidden /> {d.name}
        </p>
        <p className="text-xs tabular-nums" style={{ color: "var(--chart-ink-2)" }}>
          {pct(d.mean)}% now{change !== 0 ? ` · ${change > 0 ? "+" : ""}${change} since first estimate` : ""}
        </p>
      </div>
      {data.length ? (
        <div className="h-[150px]">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data} margin={{ top: 6, right: 8, bottom: 0, left: -18 }}>
              <CartesianGrid vertical={false} stroke="var(--chart-grid)" strokeWidth={1} />
              <XAxis dataKey="t" type="number" scale="time" domain={[from, now]} tickFormatter={fmtDay} tickCount={4} tick={{ fontSize: 10, fill: "var(--chart-muted)" }} axisLine={{ stroke: "var(--chart-axis)" }} tickLine={false} />
              <YAxis domain={[0, 100]} ticks={[0, 50, 100]} tick={{ fontSize: 10, fill: "var(--chart-muted)" }} axisLine={false} tickLine={false} unit="%" />
              <Tooltip content={<TooltipBody name={d.name} />} cursor={{ stroke: "var(--chart-axis)", strokeWidth: 1 }} />
              <Area dataKey="band" type="stepAfter" stroke="none" fill={color} fillOpacity={0.12} isAnimationActive={false} activeDot={false} />
              <Line dataKey="mean" type="stepAfter" stroke={color} strokeWidth={2} dot={false} activeDot={{ r: 4.5, stroke: "var(--chart-surface)", strokeWidth: 2, fill: color }} isAnimationActive={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="flex h-12 items-center justify-center rounded-lg text-xs" style={{ background: "var(--chart-empty)", color: "var(--chart-muted)" }}>
          Not measured yet
        </div>
      )}
    </div>
  );
}

/** One small chart per skill on the same 0–100% scale: estimate (line) and 90% credible band (wash). */
export function ProgressMultiples({ dims, rangeDays, now }: { dims: Dim[]; rangeDays: number; now: number }) {
  const from = now - rangeDays * DAY;
  const table = (
    <DataTable
      head={["When", "Skill", "Estimate", "90% band"]}
      rows={dims.flatMap((d) => seriesFor(d, from, now).slice(0, -1).map((p) => [fmtTime(p.t), d.name, `${p.mean}%`, `${p.band[0]}–${p.band[1]}%`]))}
    />
  );
  const ordered = [...dims].sort((a, b) => Number(b.nObservations > 0) - Number(a.nObservations > 0));
  return (
    <ChartCard title="Progress over time" subtitle={`Last ${rangeDays} days. The band narrows as evidence builds up and widens slowly between sessions.`} table={table}>
      <div className="grid gap-x-6 gap-y-5 sm:grid-cols-2 lg:grid-cols-3">
        {ordered.map((d) => <Multiple key={d.id} d={d} from={from} now={now} />)}
      </div>
    </ChartCard>
  );
}
