import { readFileSync } from "node:fs";
import path from "node:path";
import Link from "next/link";
import { AdaptiveVsRandom, CoverageBars, RecoveryScatter, type ValidationData } from "@/components/validation/ValidationCharts";
import { getDimensions } from "@/lib/dimensions/loader";

export const dynamic = "force-dynamic";

const pct = (x: number) => `${Math.round(x * 100)}%`;

function Stat({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="glass rounded-2xl p-4 " style={{ background: "var(--chart-surface)" }}>
      <p className="text-sm" style={{ color: "var(--chart-ink-2)" }}>{label}</p>
      <p className="text-3xl font-semibold" style={{ color: "var(--chart-ink)" }}>{value}</p>
      <p className="text-xs" style={{ color: "var(--chart-muted)" }}>{note}</p>
    </div>
  );
}

/** The validation study (scripts/validate.ts) rendered from public/validation.json. */
export default function ValidationPage() {
  const data = JSON.parse(readFileSync(path.join(process.cwd(), "public", "validation.json"), "utf8")) as ValidationData;
  const skills = getDimensions().map((d) => ({ id: d.id, name: d.name, color: d.color }));
  const after = Object.values(data.e1.after);
  const avg = (f: (x: (typeof after)[number]) => number) => after.reduce((s, x) => s + f(x), 0) / after.length;
  const last = data.e2.adaptive.length - 1;
  const gain = 1 - data.e2.adaptive[last].rmse / data.e2.random[last].rmse;
  const genuineFlags = data.e3.map((r) => Number(r.genuine));
  const cheatFlags = data.e3.flatMap((r) => ["random", "same_key", "no_response", "anticipate"].map((k) => Number(r[k])));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-5xl sm:text-6xl">Validation study</h1>
        <p className="text-slate-600 dark:text-slate-300">
          {data.meta.users} simulated users with <b>known</b> abilities went through the real pipeline (selector → tasks → scoring → Bayesian profiler).
          Calibration was fitted on {data.meta.fitUsers} users and every number below comes from the other {data.meta.evalUsers}. Reproduce with <code className="rounded bg-slate-100 px-1 dark:bg-slate-800">npm run validate</code>.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Band coverage" value={pct(avg((x) => x.coverage90))} note="average over 6 skills · target 90%" />
        <Stat label="Mean error" value={`±${pct(avg((x) => x.mae))}`} note={`after ${data.meta.blocksPerUser} blocks`} />
        <Stat label="Adaptive vs random" value={`${Math.round(gain * 100)}% better`} note="error at equal budget" />
        <Stat label="Cheating caught" value={pct(cheatFlags.reduce((a, b) => a + b, 0) / cheatFlags.length)} note={`false alarms ${pct(genuineFlags.reduce((a, b) => a + b, 0) / genuineFlags.length)}`} />
      </div>

      <RecoveryScatter data={data} skills={skills} />
      <div className="grid gap-6 lg:grid-cols-2">
        <CoverageBars data={data} skills={skills} />
        <AdaptiveVsRandom data={data} />
      </div>

      <section className="space-y-2 glass rounded-2xl p-4 " style={{ background: "var(--chart-surface)" }}>
        <h2 className="font-semibold">Is unreliable play caught?</h2>
        <p className="text-sm" style={{ color: "var(--chart-ink-2)" }}>Share of blocks flagged as unreliable, 200 blocks per cell. Flagged blocks still count, but with 2.5× the noise, so they barely move the profile.</p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm tabular-nums">
            <thead className="text-xs" style={{ color: "var(--chart-muted)" }}>
              <tr>{["Task", "Genuine (false alarm)", "Random answers", "Same key", "No response", "Too fast"].map((h) => <th key={h} className="py-1 pr-3 text-left font-medium">{h}</th>)}</tr>
            </thead>
            <tbody>
              {data.e3.map((r) => (
                <tr key={String(r.task)} className="border-t" style={{ borderColor: "var(--chart-grid)" }}>
                  <td className="py-1 pr-3">{skills.find((s) => s.id === r.dimension)?.name}</td>
                  {["genuine", "random", "same_key", "no_response", "anticipate"].map((k) => <td key={k} className="py-1 pr-3">{pct(Number(r[k]))}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-2 glass rounded-2xl p-4 " style={{ background: "var(--chart-surface)" }}>
        <h2 className="font-semibold">Does the twin follow real improvement?</h2>
        <p className="text-sm" style={{ color: "var(--chart-ink-2)" }}>
          100 users improving working memory by 15 points over a month. With the chosen forgetting rate ({data.e4.driftSdPerDay}/day), improvement was detected for {pct(data.e4.detectedImprovement)} of users
          and the final band contained the true level {pct(data.e4.finalCoverage90)} of the time. The estimate is deliberately cautious: it showed {pct(data.e4.meanEstimatedGain)} of a {pct(data.e4.meanTrueGain)} true gain.
        </p>
      </section>

      {data.e5 && (
        <section className="space-y-2 glass rounded-2xl p-4 " style={{ background: "var(--chart-surface)" }}>
          <h2 className="font-semibold">Are growth forecasts honest?</h2>
          <p className="text-sm" style={{ color: "var(--chart-ink-2)" }}>
            {data.e5.forecasts} seven-day forecasts compared with the true ability a week later, scored like the TADPOLE Alzheimer&apos;s forecasting challenge.
            Coverage probability accuracy (CPA) is the gap between how often the band holds the truth and how often it should: 0 is perfect.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm tabular-nums">
              <thead className="text-xs" style={{ color: "var(--chart-muted)" }}>
                <tr>{["Forecast", "Mean abs. error", "50% band holds truth (CPA)", "90% band holds truth (CPA)"].map((h) => <th key={h} className="py-1 pr-3 text-left font-medium">{h}</th>)}</tr>
              </thead>
              <tbody>
                {([["AI4Brain trend forecast", data.e5.forecast], ["No-change baseline", data.e5.noChange]] as const).map(([name, f]) => (
                  <tr key={name} className="border-t" style={{ borderColor: "var(--chart-grid)" }}>
                    <td className="py-1 pr-3">{name}</td>
                    <td className="py-1 pr-3">{pct(f.mae)}</td>
                    <td className="py-1 pr-3">{pct(f.coverage50)} ({f.cpa50})</td>
                    <td className="py-1 pr-3">{pct(f.coverage90)} ({f.cpa90})</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {data.e6 && (
        <section className="space-y-2 glass rounded-2xl p-4 " style={{ background: "var(--chart-surface)" }}>
          <h2 className="font-semibold">Is it fair to slower people and slower devices?</h2>
          <p className="text-sm" style={{ color: "var(--chart-ink-2)" }}>
            The same users re-run with device lag or a slower but equally accurate response style. Fair means a bias (estimate − truth) near 0 and a band that still holds the truth about 90% of the time.
            Processing speed is the exception by design: it measures speed.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm tabular-nums">
              <thead className="text-xs" style={{ color: "var(--chart-muted)" }}>
                <tr><th className="py-1 pr-3 text-left font-medium">Skill</th>{data.e6.map((g) => <th key={g.id} className="py-1 pr-3 text-left font-medium">{g.label}</th>)}</tr>
              </thead>
              <tbody>
                {skills.map((sk) => (
                  <tr key={sk.id} className="border-t" style={{ borderColor: "var(--chart-grid)" }}>
                    <td className="py-1 pr-3">{sk.name}</td>
                    {data.e6!.map((g) => {
                      const c = g.bySkill[sk.id];
                      return <td key={g.id} className="py-1 pr-3">{c.bias >= 0 ? "+" : ""}{Math.round(c.bias * 100)} pts · {pct(c.coverage90)}</td>;
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <p className="text-sm text-slate-500">
        Limits: abilities and task behaviour are simulated, so this shows the pipeline is consistent and calibratable, not that it measures cognition in real people. Next step: a pilot with real participants to refit the config.
        Full write-up: <Link href="https://github.com/ChaimaGhazali/aoi/blob/main/docs/validation.md" className="underline">docs/validation.md</Link>.
      </p>
    </div>
  );
}
