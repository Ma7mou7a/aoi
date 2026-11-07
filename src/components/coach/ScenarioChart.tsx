"use client";

import type { CoachChart } from "@/lib/scenarios/chart";

const DAYS_LABEL: Record<number, string> = { 0: "today", 7: "1 week", 14: "2 weeks", 30: "1 month", 90: "3 months" };

/** The chart inside a scenario reply: drawn from the stored numbers, readable as a table by screen readers. */
export function ScenarioChart({ chart }: { chart: CoachChart }) {
  if (chart.kind === "fan") return <Fan chart={chart} />;
  if (chart.kind === "decision") return <Decision chart={chart} />;
  if (chart.kind === "plateau") return <PlateauChart chart={chart} />;
  return <Reweigh chart={chart} />;
}

function Frame({ title, children, note }: { title: string; children: React.ReactNode; note?: React.ReactNode }) {
  return (
    <figure className="space-y-2 rounded-xl border p-3" style={{ borderColor: "var(--chart-grid)", background: "var(--chart-surface)" }}>
      <figcaption className="text-xs font-semibold tracking-wide uppercase" style={{ color: "var(--chart-ink-2)" }}>{title}</figcaption>
      {children}
      {note && <p className="text-xs" style={{ color: "var(--chart-ink-2)" }}>{note}</p>}
    </figure>
  );
}

/** Cone of uncertainty: 90% band (light), 50% band (darker), middle line. Never a single point. */
function Fan({ chart }: { chart: Extract<CoachChart, { kind: "fan" }> }) {
  const W = 460;
  const H = 190;
  const L = 34;
  const R = 12;
  const T = 12;
  const B = 28;
  const maxDays = chart.points[chart.points.length - 1].days || 1;
  const x = (d: number) => L + ((W - L - R) * d) / maxDays;
  // Round ticks to tens so the axis reads cleanly (0%, 50%, 100% rather than 49%, 98%).
  const lo = Math.max(0, Math.floor((Math.min(...chart.points.map((p) => p.low90)) - 2) / 10) * 10);
  const hi = Math.min(100, Math.ceil((Math.max(...chart.points.map((p) => p.high90)) + 2) / 10) * 10);
  const y = (v: number) => T + ((H - T - B) * (hi - v)) / Math.max(1, hi - lo);
  const band = (a: "low90" | "low50", b: "high90" | "high50") =>
    chart.points.map((p, i) => `${i ? "L" : "M"}${x(p.days).toFixed(1)},${y(p[b]).toFixed(1)}`).join("") +
    [...chart.points].reverse().map((p) => `L${x(p.days).toFixed(1)},${y(p[a]).toFixed(1)}`).join("") + "Z";
  const mid = chart.points.map((p, i) => `${i ? "L" : "M"}${x(p.days).toFixed(1)},${y(p.midPct).toFixed(1)}`).join("");
  const asked = chart.points.find((p) => p.days === chart.horizonDays);
  return (
    <Frame
      title={`${chart.skillName}: range, not a promise`}
      note={
        <>
          Dark: 50% chance. Light: 90% chance. It widens with time because the future is less certain.
          {chart.track && chart.track.total >= 3 && <> Track record on your history: <b>{chart.track.hits}/{chart.track.total}</b> results landed inside the 90% range.</>}
        </>
      }
    >
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img"
        aria-label={chart.points.map((p) => `${DAYS_LABEL[p.days] ?? `${p.days} days`}: 90% range ${p.low90} to ${p.high90}%`).join("; ")}>
        {[lo, Math.round((lo + hi) / 20) * 10, hi].filter((v, i, a) => a.indexOf(v) === i).map((v) => (
          <g key={v}>
            <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke="var(--chart-grid)" />
            <text x={L - 4} y={y(v) + 3} fontSize={10} textAnchor="end" fill="var(--chart-muted)">{Math.round(v)}%</text>
          </g>
        ))}
        <path d={band("low90", "high90")} fill={chart.color} fillOpacity={0.16} />
        <path d={band("low50", "high50")} fill={chart.color} fillOpacity={0.32} />
        <path d={mid} fill="none" stroke={chart.color} strokeWidth={2} strokeDasharray="5 4" />
        {chart.points.filter((p, i, a) => i === 0 || x(p.days) - x(a[i - 1].days) > 48 || p.days === chart.horizonDays).map((p) => (
          <text key={p.days} x={x(p.days)} y={H - 10} fontSize={10} textAnchor={p.days === 0 ? "start" : p.days === maxDays ? "end" : "middle"} fill="var(--chart-ink-2)">
            {DAYS_LABEL[p.days] ?? `${p.days} d`}
          </text>
        ))}
        {asked && (
          <g>
            <line x1={x(asked.days)} x2={x(asked.days)} y1={y(asked.high90)} y2={y(asked.low90)} stroke="var(--chart-ink)" strokeWidth={1.5} />
            <text x={x(asked.days) - 4} y={y(asked.high90) - 4} fontSize={11} fontWeight={700} textAnchor="end" fill="var(--chart-ink)">
              {asked.low90}–{asked.high90}%
            </text>
          </g>
        )}
      </svg>
    </Frame>
  );
}

/** The decision record: how every skill ranked when the game was chosen, plus the chosen skill's curve. */
function Decision({ chart }: { chart: Extract<CoachChart, { kind: "decision" }> }) {
  const max = Math.max(1, ...chart.ranking.map((r) => r.score));
  const S = chart.series;
  const sx = (i: number) => 6 + (i * 168) / Math.max(1, S.length - 1);
  const sy = (v: number) => 54 - (v / 100) * 48;
  return (
    <Frame title="My decision record" note={`Bars: ${chart.scoreLabel} when I chose. Line: your recent games in that skill (hollow = flagged as uncertain).`}>
      <div className="grid gap-3 sm:grid-cols-[1fr_180px]">
        <ul className="space-y-1.5">
          {chart.ranking.map((r) => (
            <li key={r.skill} className="grid grid-cols-[120px_1fr_44px] items-center gap-2 text-xs" style={{ color: "var(--chart-ink)" }}>
              <span className={r.skill === chart.chosen ? "font-bold" : ""}>
                {r.skill === chart.chosen ? "✓ " : r.skill === chart.runnerUp ? "2nd " : ""}{r.name}
              </span>
              <span className="h-2.5 rounded-full" style={{ width: `${Math.max(4, (r.score / max) * 100)}%`, background: r.skill === chart.chosen ? chart.color : "var(--chart-axis)" }} />
              <span className="text-right font-mono">{r.score}</span>
            </li>
          ))}
        </ul>
        {S.length > 1 && (
          <svg viewBox="0 0 180 62" className="w-full" role="img" aria-label={`Recent game scores: ${S.map((p) => `${p.pct}%`).join(", ")}`}>
            <line x1={0} x2={180} y1={sy(50)} y2={sy(50)} stroke="var(--chart-grid)" />
            <path d={S.map((p, i) => `${i ? "L" : "M"}${sx(i)},${sy(p.pct)}`).join("")} fill="none" stroke={chart.color} strokeWidth={2} />
            {S.map((p, i) => (
              <circle key={i} cx={sx(i)} cy={sy(p.pct)} r={3} fill={p.flagged ? "var(--chart-surface)" : chart.color} stroke={chart.color} strokeWidth={1.5} />
            ))}
          </svg>
        )}
      </div>
      {chart.heatmap && <HeatStrip rows={chart.heatmap} chosen={chart.chosen} color={chart.color} />}
    </Frame>
  );
}

/** The practice heatmap the "Why" answer cites: one row per skill, one cell per day (last 7 days). */
function HeatStrip({ rows, chosen, color }: { rows: NonNullable<Extract<CoachChart, { kind: "decision" }>["heatmap"]>; chosen: string; color: string }) {
  const shown = rows.filter((r) => r.activeDays > 0 || r.skill === chosen).slice(0, 7);
  if (!shown.length) return null;
  const max = Math.max(1, ...shown.flatMap((r) => r.days));
  return (
    <div className="space-y-1" role="table" aria-label="Practice heatmap, last 7 days">
      <p className="text-xs font-semibold" style={{ color: "var(--chart-ink-2)" }}>Practice heatmap · last 7 days</p>
      {shown.map((r) => (
        <div key={r.skill} role="row" className="grid grid-cols-[120px_repeat(7,1fr)_52px] items-center gap-1 text-xs" style={{ color: "var(--chart-ink)" }}>
          <span role="rowheader" className={r.skill === chosen ? "font-bold" : ""}>{r.skill === chosen ? "✓ " : ""}{r.name}</span>
          {r.days.map((n, i) => (
            <span key={i} role="cell" aria-label={`${n} games`} className="h-3.5 rounded-sm"
              style={{ background: n ? (r.skill === chosen ? color : "var(--chart-axis)") : "var(--chart-empty)", opacity: n ? 0.35 + (0.65 * n) / max : 1, outline: r.skill === chosen ? `1px solid ${color}` : undefined }} />
          ))}
          <span className="text-right font-mono">{r.activeDays} d</span>
        </div>
      ))}
    </div>
  );
}

/** The plateau check: game scores (dots) and the Brain Twin estimate after each game (line), plus strategy memory. */
function PlateauChart({ chart }: { chart: Extract<CoachChart, { kind: "plateau" }> }) {
  const S = chart.series;
  const W = 460;
  const H = 150;
  const L = 34;
  const x = (i: number) => L + ((W - L - 12) * i) / Math.max(1, S.length - 1);
  const y = (v: number) => 10 + ((H - 34) * (100 - v)) / 100;
  const twin = S.map((p, i) => (p.twin == null ? null : `${x(i)},${y(p.twin)}`)).filter(Boolean);
  return (
    <Frame
      title={`${chart.skillName}: ${chart.plateau ? "a plateau" : "not a plateau yet"}`}
      note={<>Dots: each game&apos;s score (hollow = flagged). Line: my estimate after each game. {chart.plateau ? "Scores bounce, the estimate stays flat: no progress visible beyond the noise." : "Four games in a row that don't move the estimate make a plateau."}</>}
    >
      {S.length > 0 && (
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={S.map((p, i) => `game ${i + 1}: score ${p.pct}%, estimate ${p.twin ?? "?"}%, level ${p.level}`).join("; ")}>
          {[0, 50, 100].map((v) => (
            <g key={v}>
              <line x1={L} x2={W - 12} y1={y(v)} y2={y(v)} stroke="var(--chart-grid)" />
              <text x={L - 4} y={y(v) + 3} fontSize={10} textAnchor="end" fill="var(--chart-muted)">{v}%</text>
            </g>
          ))}
          {twin.length > 1 && <polyline points={twin.join(" ")} fill="none" stroke={chart.color} strokeWidth={2.5} />}
          {S.map((p, i) => (
            <g key={i}>
              <circle cx={x(i)} cy={y(p.pct)} r={4} fill={p.flagged ? "var(--chart-surface)" : "var(--chart-axis)"} stroke="var(--chart-ink-2)" strokeWidth={1} />
              <text x={x(i)} y={H - 8} fontSize={9} textAnchor="middle" fill="var(--chart-muted)">L{p.level}</text>
            </g>
          ))}
        </svg>
      )}
      {chart.tried.length > 0 && (
        <ul className="space-y-0.5 text-xs" style={{ color: "var(--chart-ink)" }}>
          {chart.tried.map((t) => (
            <li key={t.name}>
              Strategy memory · <b>{t.name}</b>: {t.diffPts >= 0 ? "+" : ""}{t.diffPts} pts (likely {t.lowPts} to {t.highPts}) · {t.verdict === "helped" ? "helped" : t.verdict === "hurt" ? "hurt" : "too early to tell"}
            </li>
          ))}
        </ul>
      )}
    </Frame>
  );
}

/** Pushback: the band before and after re-weighing, and the collaboration score change. */
function Reweigh({ chart }: { chart: Extract<CoachChart, { kind: "reweigh" }> }) {
  const bar = (b: { pct: number; low: number; high: number }, label: string, faded: boolean) => (
    <div className="grid grid-cols-[52px_1fr_40px] items-center gap-2 text-xs" style={{ color: "var(--chart-ink)" }}>
      <span>{label}</span>
      <span className="relative h-4 rounded-full" style={{ background: "var(--chart-empty)" }}>
        <span className="absolute inset-y-0 rounded-full" style={{ left: `${b.low}%`, width: `${Math.max(1, b.high - b.low)}%`, background: chart.color, opacity: faded ? 0.35 : 0.55 }} />
        <span className="absolute inset-y-[-3px] w-[3px] rounded" style={{ left: `${b.pct}%`, background: chart.color }} />
      </span>
      <span className="text-right font-mono">{b.pct}%</span>
    </div>
  );
  return (
    <Frame title={`${chart.skillName}: re-weighed after your pushback`} note="The range got wider on purpose: after your correction I'm less sure, and I show it.">
      <div className="space-y-2">
        {bar(chart.before, "Before", true)}
        {bar(chart.after, "After", false)}
      </div>
      <p className="text-sm" style={{ color: "var(--chart-ink)" }}>
        AI Collaboration Score <b className="font-mono">{chart.collab.before}</b> → <b className="font-mono text-emerald-600 dark:text-emerald-400">{chart.collab.after}</b>
      </p>
    </Frame>
  );
}
