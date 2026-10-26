"use client";

import { useState } from "react";

/** Card with a title and a chart ⇄ table toggle: every chart has a table twin, so no value is hover-only. */
export function ChartCard({ title, subtitle, table, children, actions }: { title: string; subtitle?: string; table: React.ReactNode; children: React.ReactNode; actions?: React.ReactNode }) {
  const [asTable, setAsTable] = useState(false);
  return (
    <section className="space-y-3 glass rounded-2xl p-4 " style={{ background: "var(--chart-surface)" }}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold" style={{ color: "var(--chart-ink)" }}>{title}</h2>
          {subtitle && <p className="text-sm" style={{ color: "var(--chart-ink-2)" }}>{subtitle}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {actions}
          <button onClick={() => setAsTable(!asTable)} aria-pressed={asTable} className="rounded-md border border-slate-300 px-2 py-1 text-xs dark:border-slate-700" style={{ color: "var(--chart-ink-2)" }}>
            {asTable ? "Chart" : "Table"}
          </button>
        </div>
      </div>
      {asTable ? <div className="overflow-x-auto text-sm">{table}</div> : children}
    </section>
  );
}

export function DataTable({ head, rows }: { head: string[]; rows: Array<Array<React.ReactNode>> }) {
  return (
    <table className="w-full text-left tabular-nums">
      <thead className="text-xs" style={{ color: "var(--chart-muted)" }}>
        <tr>{head.map((h) => <th key={h} className="py-1 pr-3 font-medium">{h}</th>)}</tr>
      </thead>
      <tbody style={{ color: "var(--chart-ink)" }}>
        {rows.map((r, i) => (
          <tr key={i} className="border-t" style={{ borderColor: "var(--chart-grid)" }}>
            {r.map((c, j) => <td key={j} className="py-1 pr-3">{c}</td>)}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
