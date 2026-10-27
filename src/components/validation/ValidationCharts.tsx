"use client";

import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis } from "recharts";
import { ChartCard, DataTable } from "../dashboard/ChartCard";

export type ValidationData = {
  meta: { users: number; fitUsers: number; evalUsers: number; blocksPerUser: number; generatedAt: string };
  e1: {
    before: Record<string, { r: number; mae: number; coverage90: number; meanWidth: number }>;
    after: Record<string, { r: number; mae: number; coverage90: number; meanWidth: number }>;
    scatter: Record<string, Array<{ truth: number; estimate: number }>>;
  };
  e2: { adaptive: Array<{ blocks: number; rmse: number; meanSd: number; coverage: number }>; random: Array<{ blocks: number; rmse: number; meanSd: number; coverage: number }> };
  e3: Array<Record<string, string | number>>;
  e4: { driftSdPerDay: number; meanTrueGain: number; meanEstimatedGain: number; detectedImprovement: number; finalCoverage90: number; sweep: Array<{ driftSdPerDay: number; meanTrueGain: number; meanEstimatedGain: number; detectedImprovement: number; finalCoverage90: number }> };
  e5?: { forecasts: number; horizonDays: number; forecast: ForecastScore; noChange: ForecastScore };
  e6?: Array<{ id: string; label: string; bySkill: Record<string, { bias: number; coverage90: number }> }>;
};
type ForecastScore = { mae: number; coverage50: number; cpa50: number; coverage90: number; cpa90: number };

type Skill = { id: string; name: string; color: string };
const pct = (x: number) => `${Math.round(x * 100)}%`;
const axis = { tick: { fontSize: 10, fill: "var(--chart-muted)" }, axisLine: { stroke: "var(--chart-axis)" }, tickLine: false } as const;
/** Legend text stays in ink; only the swatch carries the series colour. */
const inkLegend = (value: string) => <span style={{ color: "var(--chart-ink-2)" }}>{value}</span>;

function Tip({ active, payload, render }: { active?: boolean; payload?: Array<{ payload: Record<string, number> }>; render: (p: Record<string, number>) => React.ReactNode }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border px-2.5 py-1.5 text-xs shadow-sm" style={{ background: "var(--chart-surface)", borderColor: "var(--chart-grid)", color: "var(--chart-ink)" }}>
      {render(payload[0].payload)}
    </div>
  );
}

/** E1: estimate vs true ability, one small multiple per skill, identity line as reference. */
export function RecoveryScatter({ data, skills }: { data: ValidationData; skills: Skill[] }) {
  const table = (
    <DataTable
      head={["Skill", "r", "Mean abs. error", "90% coverage", "Band width"]}
      rows={skills.map((s) => {
        const a = data.e1.after[s.id];
        return [s.name, a.r.toFixed(2), pct(a.mae), pct(a.coverage90), pct(a.meanWidth)];
      })}
    />
  );
  return (
    <ChartCard title="Does the profile find the true ability?" subtitle={`${data.meta.evalUsers} held-out simulated users, ${data.meta.blocksPerUser} adaptive blocks each. Dots on the diagonal = perfect recovery.`} table={table}>
      <div className="grid gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
        {skills.map((s) => {
          const a = data.e1.after[s.id];
          const color = `var(--dim-${s.id}, ${s.color})`;
          return (
            <div key={s.id}>
              <div className="flex items-baseline justify-between text-sm">
                <span className="flex items-center gap-1.5 font-medium" style={{ color: "var(--chart-ink)" }}>
                  <span className="inline-block h-2 w-2 rounded-full" style={{ background: color }} aria-hidden /> {s.name}
                </span>
                <span className="text-xs tabular-nums" style={{ color: "var(--chart-ink-2)" }}>r = {a.r.toFixed(2)} · ±{pct(a.mae)}</span>
              </div>
              <div className="h-[170px]">
                <ResponsiveContainer width="100%" height="100%">
                  <ScatterChart margin={{ top: 6, right: 8, bottom: 0, left: -18 }}>
                    <CartesianGrid stroke="var(--chart-grid)" />
                    <XAxis type="number" dataKey="truth" domain={[0, 1]} ticks={[0, 0.5, 1]} tickFormatter={pct} {...axis} />
                    <YAxis type="number" dataKey="estimate" domain={[0, 1]} ticks={[0, 0.5, 1]} tickFormatter={pct} {...axis} />
                    <ReferenceLine segment={[{ x: 0, y: 0 }, { x: 1, y: 1 }]} stroke="var(--chart-axis)" strokeWidth={1} ifOverflow="hidden" />
                    <Tooltip cursor={false} content={<Tip render={(p) => <>True {pct(p.truth)} → estimated {pct(p.estimate)}</>} />} />
                    <Scatter data={data.e1.scatter[s.id]} fill={color} fillOpacity={0.45} shape="circle" isAnimationActive={false} />
                  </ScatterChart>
                </ResponsiveContainer>
              </div>
            </div>
          );
        })}
      </div>
      <p className="text-xs" style={{ color: "var(--chart-muted)" }}>x: true ability · y: estimated ability</p>
    </ChartCard>
  );
}

/** E1: band coverage before vs after calibration, against the 90% target. */
export function CoverageBars({ data, skills }: { data: ValidationData; skills: Skill[] }) {
  const rows = skills.map((s) => ({ name: s.name, before: Math.round(data.e1.before[s.id].coverage90 * 100), after: Math.round(data.e1.after[s.id].coverage90 * 100) }));
  const table = <DataTable head={["Skill", "Before calibration", "After calibration"]} rows={rows.map((r) => [r.name, `${r.before}%`, `${r.after}%`])} />;
  return (
    <ChartCard title="Are the bands honest?" subtitle="Share of users whose true ability lies inside their 90% band. Target: 90%. Calibration fitted on separate users." table={table}>
      <div className="h-[260px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} layout="vertical" margin={{ top: 20, right: 16, bottom: 4, left: 40 }} barCategoryGap={8} barGap={2}>
            <CartesianGrid horizontal={false} stroke="var(--chart-grid)" />
            <XAxis type="number" domain={[0, 100]} ticks={[0, 50, 90, 100]} unit="%" {...axis} />
            <YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 11, fill: "var(--chart-ink-2)" }} axisLine={false} tickLine={false} />
            <ReferenceLine x={90} stroke="var(--chart-ink-2)" strokeWidth={1} label={{ value: "target 90%", position: "top", fontSize: 10, fill: "var(--chart-ink-2)" }} />
            <Tooltip cursor={{ fill: "var(--chart-empty)" }} content={<Tip render={(p) => <>Before {p.before}% → after {p.after}%</>} />} />
            <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} formatter={inkLegend} />
            <Bar dataKey="before" name="Hand-set levels" fill="var(--chart-axis)" radius={[0, 4, 4, 0]} barSize={10} isAnimationActive={false} />
            <Bar dataKey="after" name="Fitted levels" fill="var(--chart-accent)" radius={[0, 4, 4, 0]} barSize={10} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </ChartCard>
  );
}

/** Direct label at a line's last point (text in ink, not the series colour). */
const endLabel = (text: string, n: number) =>
  function EndLabel(p: { index?: number; x?: number | string; y?: number | string }) {
    if (p.index !== n - 1) return <g />;
    return <text x={Number(p.x) + 6} y={Number(p.y) + 4} fontSize={11} fill="var(--chart-ink-2)">{text}</text>;
  };

/** E2: error vs blocks played, adaptive selection vs random, one axis. */
export function AdaptiveVsRandom({ data }: { data: ValidationData }) {
  const rows = data.e2.adaptive.map((a, i) => ({ blocks: a.blocks, adaptive: +(a.rmse * 100).toFixed(1), random: +(data.e2.random[i].rmse * 100).toFixed(1) }));
  const last = rows.at(-1)!;
  const gain = Math.round((1 - last.adaptive / last.random) * 100);
  const table = <DataTable head={["Blocks", "Adaptive error", "Random error"]} rows={rows.map((r) => [r.blocks, `${r.adaptive}%`, `${r.random}%`])} />;
  return (
    <ChartCard title="Does choosing the most informative block help?" subtitle={`Average error (RMSE across all skills) after each block. After ${last.blocks} blocks, adaptive selection is ${gain}% more accurate than random order.`} table={table}>
      <div className="h-[240px]">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={rows} margin={{ top: 8, right: 70, bottom: 12, left: -10 }}>
            <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
            <XAxis dataKey="blocks" {...axis} label={{ value: "blocks played", position: "insideBottomRight", offset: -2, fontSize: 10, fill: "var(--chart-muted)" }} />
            <YAxis domain={[0, "auto"]} unit="%" {...axis} />
            <Tooltip cursor={{ stroke: "var(--chart-axis)" }} content={<Tip render={(p) => <>After {p.blocks} blocks: adaptive {p.adaptive}%, random {p.random}%</>} />} />
            <Legend iconType="plainline" wrapperStyle={{ fontSize: 11, paddingTop: 8 }} formatter={inkLegend} />
            <Line dataKey="random" name="Random order" stroke="var(--chart-series-2)" strokeWidth={2} dot={false} isAnimationActive={false} label={endLabel("random", rows.length)} />
            <Line dataKey="adaptive" name="Adaptive (ours)" stroke="var(--chart-accent)" strokeWidth={2} dot={false} isAnimationActive={false} label={endLabel("adaptive", rows.length)} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </ChartCard>
  );
}
