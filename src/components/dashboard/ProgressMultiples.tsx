"use client";

import { Area, CartesianGrid, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { Projection } from "@/lib/profiler/projection";
import type { ProfileView } from "@/lib/server/profile";
import { ChartCard, DataTable } from "./ChartCard";

type Dim = ProfileView["dimensions"][number];
type Point = {
  t: number;
  mean?: number;
  band?: [number, number];
  measured: boolean;
  /** Forecast series (only on "now" and the horizon point). */
  proj?: number;
  projBand?: [number, number];
};

const DAY = 86_400_000;
const pct = (x: number) => Math.round(x * 100);
const fmtDay = (t: number) => new Date(t).toLocaleDateString(undefined, { month: "short", day: "numeric" });
const fmtTime = (t: number) => new Date(t).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });

/** History inside the range, starting from the estimate in force at the range start and ending at "now". */
function seriesFor(d: Dim, from: number, now: number): Point[] {
  const all = d.history.map((h) => ({ t: new Date(h.at).getTime(), mean: pct(h.mean), band: [pct(h.ciLow), pct(h.ciHigh)] as [number, number], measured: h.measured }));
  const before = all.filter((p) => p.t < from).at(-1);
  const inside = all.filter((p) => p.t >= from);
  const pts: Point[] = [...(before ? [{ ...before, t: from }] : []), ...inside];
  if (pts.length) pts.push({ t: now, mean: pct(d.mean), band: [pct(d.ci[0]), pct(d.ci[1])], measured: true });
  return pts;
}

/** Forecast segment: from today's estimate/band to the projected estimate/band at the horizon. */
function withForecast(pts: Point[], d: Dim, p: Projection | null, now: number): Point[] {
  if (!p || !pts.length) return pts;
  const today = pts.at(-1)!;
  return [
    ...pts.slice(0, -1),
    { ...today, proj: pct(d.mean), projBand: [pct(d.ci[0]), pct(d.ci[1])] },
    { t: now + p.horizonDays * DAY, measured: false, proj: pct(p.mean), projBand: [pct(p.ciLow), pct(p.ciHigh)] },
  ];
}

function TooltipBody({ active, payload, name }: { active?: boolean; payload?: Array<{ payload: Point }>; name: string }) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  const isForecast = p.mean == null && p.proj != null;
  return (
    <div className="rounded-lg border px-2.5 py-1.5 text-xs shadow-sm" style={{ background: "var(--chart-surface)", borderColor: "var(--chart-grid)", color: "var(--chart-ink)" }}>
      <p style={{ color: "var(--chart-ink-2)" }}>{isForecast ? `Forecast for ${fmtDay(p.t)}` : fmtTime(p.t)}</p>
      {isForecast ? (
        <p><b>{name}</b>: likely {p.projBand![0]}–{p.projBand![1]}% <span style={{ color: "var(--chart-ink-2)" }}>(centre {p.proj}%, if your pace continues)</span></p>
      ) : (
        <p><b>{name}</b>: {p.mean}% <span style={{ color: "var(--chart-ink-2)" }}>(likely {p.band![0]}–{p.band![1]}%)</span></p>
      )}
      {!p.measured && !isForecast && <p style={{ color: "var(--chart-muted)" }}>Starting assumption, before any games</p>}
    </div>
  );
}

function Multiple({ d, from, now, projection }: { d: Dim; from: number; now: number; projection: Projection | null }) {
  const history = seriesFor(d, from, now);
  const data = withForecast(history, d, projection, now);
  const end = projection ? now + projection.horizonDays * DAY : now;
  const color = `var(--dim-${d.id}, ${d.color})`;
  // Change since the first real estimate in range (the starting prior is not a measurement).
  const first = history.find((p) => p.measured);
  const change = first && first !== history.at(-1) ? pct(d.mean) - first.mean! : 0;
  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between gap-2">
        <p className="flex items-center gap-1.5 text-sm font-medium" style={{ color: "var(--chart-ink)" }}>
          <span className="inline-block h-2 w-2 rounded-full" style={{ background: color }} aria-hidden /> {d.name}
        </p>
        <p className="text-xs tabular-nums" style={{ color: "var(--chart-ink-2)" }}>
          {pct(d.mean)}% now{change !== 0 ? ` · ${change > 0 ? "+" : ""}${change} since your first game` : ""}
        </p>
      </div>
      {history.length ? (
        <>
          <div className="h-[150px]">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={data} margin={{ top: 6, right: 8, bottom: 0, left: -18 }}>
                <CartesianGrid vertical={false} stroke="var(--chart-grid)" strokeWidth={1} />
                <XAxis dataKey="t" type="number" scale="time" domain={[from, end]} tickFormatter={fmtDay} tickCount={4} tick={{ fontSize: 10, fill: "var(--chart-muted)" }} axisLine={{ stroke: "var(--chart-axis)" }} tickLine={false} />
                <YAxis domain={[0, 100]} ticks={[0, 50, 100]} tick={{ fontSize: 10, fill: "var(--chart-muted)" }} axisLine={false} tickLine={false} unit="%" />
                <Tooltip content={<TooltipBody name={d.name} />} cursor={{ stroke: "var(--chart-axis)", strokeWidth: 1 }} />
                {projection && <ReferenceLine x={now} stroke="var(--chart-axis)" strokeWidth={1} label={{ value: "today", position: "insideTopLeft", fontSize: 9, fill: "var(--chart-muted)" }} />}
                <Area dataKey="band" type="stepAfter" stroke="none" fill={color} fillOpacity={0.12} isAnimationActive={false} activeDot={false} connectNulls={false} />
                <Line dataKey="mean" type="stepAfter" stroke={color} strokeWidth={2} dot={false} activeDot={{ r: 4.5, stroke: "var(--chart-surface)", strokeWidth: 2, fill: color }} isAnimationActive={false} connectNulls={false} />
                {projection && (
                  <>
                    <Area dataKey="projBand" type="linear" stroke="none" fill={color} fillOpacity={0.06} isAnimationActive={false} activeDot={false} connectNulls />
                    {/* Dashed = forecast: the one place a dash means what it should. */}
                    <Line dataKey="proj" type="linear" stroke={color} strokeWidth={2} strokeDasharray="4 3" dot={false} activeDot={false} isAnimationActive={false} connectNulls />
                  </>
                )}
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          {projection && (
            <p className="text-xs" style={{ color: "var(--chart-ink-2)" }}>
              In {projection.horizonDays} days: likely {pct(projection.ciLow)}–{pct(projection.ciHigh)}% if your current pace ({projection.slopePerWeek >= 0 ? "+" : ""}{(projection.slopePerWeek * 100).toFixed(1)} pts/week) continues. A forecast, not a promise.
            </p>
          )}
        </>
      ) : (
        <div className="flex h-12 items-center justify-center rounded-lg text-xs" style={{ background: "var(--chart-empty)", color: "var(--chart-muted)" }}>
          Not measured yet
        </div>
      )}
    </div>
  );
}

/** One small chart per skill on the same 0–100% scale: estimate (line), 90% credible band (wash), dashed forecast. */
export function ProgressMultiples({ dims, rangeDays, now, projections, track }: {
  dims: Dim[];
  rangeDays: number;
  now: number;
  projections: Record<string, Projection | null>;
  track: { hitRate: number | null; checks: Array<{ skill: string; madeAt: string; forBand: [number, number]; actual: number; hit: boolean }> };
}) {
  const from = now - rangeDays * DAY;
  const table = (
    <DataTable
      head={["When", "Skill", "Score", "Likely range (90%)"]}
      rows={[
        ...dims.flatMap((d) => seriesFor(d, from, now).slice(0, -1).map((p) => [fmtTime(p.t), d.name, `${p.mean}%`, `${p.band![0]}–${p.band![1]}%`])),
        ...dims.filter((d) => projections[d.id]).map((d) => {
          const p = projections[d.id]!;
          return [`Forecast +${p.horizonDays} days`, d.name, `${pct(p.mean)}%`, `${pct(p.ciLow)}–${pct(p.ciHigh)}%`];
        }),
      ]}
    />
  );
  const ordered = [...dims].sort((a, b) => Number(b.nObservations > 0) - Number(a.nObservations > 0));
  return (
    <ChartCard title="Progress and forecast" subtitle={`Last ${rangeDays} days, then a dashed ${Object.values(projections).find(Boolean)?.horizonDays ?? 7}-day forecast. Bands narrow with evidence and widen with time.`} table={table}>
      {track.checks.length > 0 && (
        <div className="rounded-xl p-3 text-sm" style={{ background: "var(--chart-empty)", color: "var(--chart-ink)" }}>
          <b>Twin track record:</b> {track.checks.filter((c) => c.hit).length} of {track.checks.length} past weekly forecasts came true (the real score landed inside the forecast range).
          <span className="block text-xs" style={{ color: "var(--chart-ink-2)" }}>
            {track.checks.slice(0, 3).map((c) => `${c.skill}: forecast ${pct(c.forBand[0])}–${pct(c.forBand[1])}%, actual ${pct(c.actual)}% ${c.hit ? "✓" : "✗"}`).join(" · ")}
          </span>
        </div>
      )}
      <div className="grid gap-x-6 gap-y-5 sm:grid-cols-2 lg:grid-cols-3">
        {ordered.map((d) => <Multiple key={d.id} d={d} from={from} now={now} projection={projections[d.id] ?? null} />)}
      </div>
    </ChartCard>
  );
}
