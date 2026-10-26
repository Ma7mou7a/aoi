"use client";

import { useState } from "react";
import type { ProfileView } from "@/lib/server/profile";
import { ChartCard, DataTable } from "./ChartCard";

type Dim = ProfileView["dimensions"][number];

// Wide canvas: side labels ("Cognitive flexibility") need ~140px beyond the outer ring.
const W = 580;
const H = 360;
const CX = W / 2;
const CY = H / 2 + 6;
const R = 115;
const pct = (x: number) => Math.round(x * 100);

function point(i: number, n: number, v: number): [number, number] {
  const a = -Math.PI / 2 + (i * 2 * Math.PI) / n;
  return [CX + Math.cos(a) * R * v, CY + Math.sin(a) * R * v];
}
const poly = (pts: Array<[number, number]>) => pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join("") + "Z";

/**
 * Current profile as a radar: one series (slot-1 accent). The shaded ring between the low and
 * high polygons is the 90% credible band, so the shape shows how sure we are, not just where.
 */
export function RadarBand({ dims }: { dims: Dim[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const n = dims.length;
  const mean = dims.map((d, i) => point(i, n, d.mean));
  const hi = dims.map((d, i) => point(i, n, d.ci[1]));
  const lo = dims.map((d, i) => point(i, n, d.ci[0])).reverse();
  const h = hover == null ? null : dims[hover];

  const table = (
    <DataTable
      head={["Skill", "Estimate", "90% band", "Blocks"]}
      rows={dims.map((d) => [d.name, d.nObservations ? `${pct(d.mean)}%` : "not measured", `${pct(d.ci[0])}–${pct(d.ci[1])}%`, d.nObservations])}
    />
  );

  return (
    <ChartCard title="Your profile now" subtitle="Line: current estimate. Shaded ring: where your level most likely is (90%). Narrower = more certain." table={table}>
      <div className="relative mx-auto w-full max-w-[580px]">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={dims.map((d) => `${d.name} ${pct(d.mean)}%, band ${pct(d.ci[0])} to ${pct(d.ci[1])}`).join("; ")}>
          {[0.25, 0.5, 0.75, 1].map((r) => (
            <path key={r} d={poly(dims.map((_, i) => point(i, n, r)))} fill="none" stroke="var(--chart-grid)" strokeWidth={1} />
          ))}
          {dims.map((_, i) => {
            const [x, y] = point(i, n, 1);
            return <line key={i} x1={CX} y1={CY} x2={x} y2={y} stroke="var(--chart-grid)" strokeWidth={1} />;
          })}
          {/* Ring labels sit between the first two axes, away from the data markers. */}
          {[50, 100].map((v) => {
            const a = -Math.PI / 2 + Math.PI / n;
            return (
              <text key={v} x={CX + Math.cos(a) * R * (v / 100) + 3} y={CY + Math.sin(a) * R * (v / 100) - 3} fontSize={10} fill="var(--chart-muted)">{v}%</text>
            );
          })}

          <path d={poly(hi) + poly(lo)} fill="var(--chart-accent)" fillOpacity={0.14} fillRule="evenodd" stroke="none" />
          <path d={poly(mean)} fill="none" stroke="var(--chart-accent)" strokeWidth={2} strokeLinejoin="round" />
          {dims.map((d, i) => {
            const [x, y] = mean[i];
            return (
              <circle key={d.id} cx={x} cy={y} r={hover === i ? 6 : 4.5} stroke="var(--chart-surface)" strokeWidth={2}
                fill={d.nObservations ? "var(--chart-accent)" : "var(--chart-surface)"} {...(!d.nObservations && { stroke: "var(--chart-accent)", strokeWidth: 1.5 })} />
            );
          })}

          {dims.map((d, i) => {
            const [x, y] = point(i, n, 1.2);
            const anchor = Math.abs(x - CX) < 8 ? "middle" : x > CX ? "start" : "end";
            return (
              <g key={d.id}>
                <text x={x} y={y} textAnchor={anchor} fontSize={12} fontWeight={600} fill="var(--chart-ink)">{d.name}</text>
                <text x={x} y={y + 14} textAnchor={anchor} fontSize={11} fill={d.nObservations ? "var(--chart-ink-2)" : "var(--chart-muted)"}>
                  {d.nObservations ? `${pct(d.mean)}%` : "not measured"}
                </text>
              </g>
            );
          })}

          {/* Hit targets: one generous wedge-point per axis, keyboard-focusable */}
          {dims.map((d, i) => {
            const [x, y] = mean[i];
            return (
              <circle key={d.id} cx={x} cy={y} r={16} fill="transparent" tabIndex={0} aria-label={`${d.name}: ${pct(d.mean)}%`}
                onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} onFocus={() => setHover(i)} onBlur={() => setHover(null)} className="outline-none" />
            );
          })}
        </svg>
        {h && (
          <div className="pointer-events-none absolute left-1/2 top-2 -translate-x-1/2 rounded-lg border px-3 py-2 text-xs shadow-sm" style={{ background: "var(--chart-surface)", borderColor: "var(--chart-grid)", color: "var(--chart-ink)" }}>
            <b>{h.name}</b>: {h.nObservations ? `${pct(h.mean)}%` : "not measured yet"} · band {pct(h.ci[0])}–{pct(h.ci[1])}% · {h.nObservations} block{h.nObservations === 1 ? "" : "s"}
          </div>
        )}
      </div>
    </ChartCard>
  );
}
