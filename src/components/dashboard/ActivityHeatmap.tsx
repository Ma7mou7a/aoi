"use client";

import { useState } from "react";
import type { DashboardData } from "@/lib/server/dashboard";
import { ChartCard, DataTable } from "./ChartCard";

type Heat = DashboardData["heat"];

/** Blocks per cell → one-hue sequential step (0 = empty surface). */
const STEPS = ["var(--chart-empty)", "var(--seq-1)", "var(--seq-2)", "var(--seq-3)", "var(--seq-4)"];
const step = (blocks: number) => STEPS[Math.min(blocks, 4)];
const fmtDay = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" });
const weekday = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString(undefined, { weekday: "narrow", timeZone: "UTC" });

/** Skill × day grid of blocks played (training consistency), sequential blue, 2px surface gaps. */
export function ActivityHeatmap({ heat, skills }: { heat: Heat; skills: Array<{ id: string; name: string }> }) {
  const [hover, setHover] = useState<{ skill: string; day: string } | null>(null);
  const cell = hover ? heat.cells[hover.skill]?.[hover.day] : null;
  const total = Object.values(heat.cells).reduce((s, row) => s + Object.values(row).reduce((a, c) => a + c.blocks, 0), 0);

  const table = (
    <DataTable
      head={["Day", "Skill", "Blocks", "Avg block score"]}
      rows={heat.days.flatMap((day) =>
        skills
          .filter((s) => heat.cells[s.id][day].blocks > 0)
          .map((s) => {
            const c = heat.cells[s.id][day];
            return [fmtDay(day), s.name, c.blocks, c.avgScore == null ? "–" : `${Math.round(c.avgScore * 100)}%`];
          }),
      )}
    />
  );

  return (
    <ChartCard title="Practice heatmap" subtitle={`${total} block${total === 1 ? "" : "s"} in the last ${heat.days.length} days. The stronger the colour, the more blocks that day.`} table={table}>
      <div className="overflow-x-auto">
        <div className="grid min-w-fit gap-[2px]" style={{ gridTemplateColumns: `minmax(7.5rem, auto) repeat(${heat.days.length}, minmax(14px, 1fr))` }}>
          <span />
          {heat.days.map((d, i) => (
            <span key={d} className="text-center text-[10px]" style={{ color: "var(--chart-muted)" }}>{heat.days.length <= 14 || i % 7 === 0 ? weekday(d) : ""}</span>
          ))}
          {skills.map((s) => (
            <div key={s.id} className="contents">
              <span className="truncate pr-2 text-xs" style={{ color: "var(--chart-ink-2)" }}>{s.name}</span>
              {heat.days.map((d) => {
                const c = heat.cells[s.id][d];
                const active = hover?.skill === s.id && hover.day === d;
                return (
                  <button
                    key={d}
                    aria-label={`${s.name}, ${fmtDay(d)}: ${c.blocks} block${c.blocks === 1 ? "" : "s"}`}
                    onMouseEnter={() => setHover({ skill: s.id, day: d })}
                    onMouseLeave={() => setHover(null)}
                    onFocus={() => setHover({ skill: s.id, day: d })}
                    onBlur={() => setHover(null)}
                    className="aspect-square min-h-[14px] rounded-[3px] outline-offset-1"
                    style={{ background: step(c.blocks), outline: active ? "2px solid var(--chart-ink)" : undefined }}
                  />
                );
              })}
            </div>
          ))}
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 text-xs" style={{ color: "var(--chart-ink-2)" }}>
        <p className="min-h-[1.25rem]" aria-live="polite">
          {hover && cell
            ? `${skills.find((s) => s.id === hover.skill)?.name}, ${fmtDay(hover.day)}: ${cell.blocks} block${cell.blocks === 1 ? "" : "s"}${cell.avgScore != null ? `, average block score ${Math.round(cell.avgScore * 100)}%` : ""}`
            : `${fmtDay(heat.days[0])} – ${fmtDay(heat.days.at(-1)!)}`}
        </p>
        <span className="flex items-center gap-1">
          0 {STEPS.map((c, i) => <span key={i} className="inline-block h-3 w-3 rounded-[3px]" style={{ background: c }} />)} 4+
        </span>
      </div>
    </ChartCard>
  );
}
