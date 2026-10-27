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

/** Average block score → the same sequential steps (bins of 25 points). */
const scoreStep = (avg: number | null) => (avg == null ? STEPS[0] : STEPS[Math.min(4, 1 + Math.floor(avg * 4))]);

/**
 * Skill × day grid, sequential blue, 2px surface gaps. Two views of the same cells:
 * practice (blocks played: consistency) and performance (average block score that day).
 */
export function ActivityHeatmap({ heat, skills }: { heat: Heat; skills: Array<{ id: string; name: string }> }) {
  const [hover, setHover] = useState<{ skill: string; day: string } | null>(null);
  const [mode, setMode] = useState<"blocks" | "score">("blocks");
  const colour = (c: { blocks: number; avgScore: number | null }) => (mode === "blocks" ? step(c.blocks) : scoreStep(c.avgScore));
  const cell = hover ? heat.cells[hover.skill]?.[hover.day] : null;
  const total = Object.values(heat.cells).reduce((s, row) => s + Object.values(row).reduce((a, c) => a + c.blocks, 0), 0);

  const table = (
    <DataTable
      head={["Day", "Skill", "Games", "Avg game score"]}
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
    <ChartCard
      title={mode === "blocks" ? "Practice heatmap" : "Performance heatmap"}
      subtitle={mode === "blocks"
        ? `${total} game${total === 1 ? "" : "s"} in the last ${heat.days.length} days. The stronger the colour, the more games that day.`
        : `Average game score per skill and day. The stronger the colour, the better the games went (empty = not played).`}
      table={table}
      actions={
        <div className="flex overflow-hidden rounded-md border border-slate-300 text-xs dark:border-slate-700" role="group" aria-label="Heatmap view">
          {(["blocks", "score"] as const).map((m) => (
            <button key={m} onClick={() => setMode(m)} aria-pressed={mode === m}
              className={`px-2 py-1 ${mode === m ? "bg-slate-900 text-white dark:bg-brand dark:text-slate-900" : ""}`}>
              {m === "blocks" ? "Practice" : "Performance"}
            </button>
          ))}
        </div>
      }
    >
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
                    aria-label={`${s.name}, ${fmtDay(d)}: ${c.blocks} game${c.blocks === 1 ? "" : "s"}`}
                    onMouseEnter={() => setHover({ skill: s.id, day: d })}
                    onMouseLeave={() => setHover(null)}
                    onFocus={() => setHover({ skill: s.id, day: d })}
                    onBlur={() => setHover(null)}
                    className="aspect-square min-h-[14px] rounded-[3px] outline-offset-1"
                    style={{ background: colour(c), outline: active ? "2px solid var(--chart-ink)" : undefined }}
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
            ? `${skills.find((s) => s.id === hover.skill)?.name}, ${fmtDay(hover.day)}: ${cell.blocks} game${cell.blocks === 1 ? "" : "s"}${cell.avgScore != null ? `, average game score ${Math.round(cell.avgScore * 100)}%` : ""}`
            : `${fmtDay(heat.days[0])} – ${fmtDay(heat.days.at(-1)!)}`}
        </p>
        <span className="flex items-center gap-1">
          {mode === "blocks" ? "0" : "none"} {STEPS.map((c, i) => <span key={i} className="inline-block h-3 w-3 rounded-[3px]" style={{ background: c }} />)} {mode === "blocks" ? "4+ blocks" : "75%+"}
        </span>
      </div>
    </ChartCard>
  );
}
