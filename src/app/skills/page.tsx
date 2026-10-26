import Link from "next/link";
import { describeScoring, describeUncertainty, describeValidity } from "@/lib/dimensions/card";
import { getDimensions } from "@/lib/dimensions/loader";

/** Measurement cards: definition, task, scoring, uncertainty, biases and references for every skill, from config. */
export default function SkillsPage() {
  const dims = getDimensions();
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-5xl sm:text-6xl">How each skill is measured</h1>
        <p className="text-slate-600 dark:text-slate-300">
          One card per skill, generated from the same configuration the app runs on. Scores describe task performance compared with your own history: never a diagnosis, never a norm.
        </p>
      </div>
      {dims.map((d) => {
        const task = d.tasks[0];
        return (
          <section key={d.id} id={d.id} className="space-y-4 glass rounded-2xl p-5 " style={{ background: "var(--chart-surface)" }}>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="flex items-center gap-2 text-xl font-semibold">
                <span className="inline-block h-3 w-3 rounded-full" style={{ background: `var(--dim-${d.id}, ${d.color})` }} aria-hidden /> {d.name}
              </h2>
              <Link href={`/try/${task.id}`} className="text-sm underline underline-offset-4">Try the task →</Link>
            </div>
            <p>{d.card.definition.trim()}</p>
            <p className="text-sm text-slate-500"><b>What it is not:</b> {d.card.what_it_is_not.trim()}</p>
            {d.card.design_note && <p className="text-sm text-slate-500"><b>Design note:</b> {d.card.design_note.trim()}</p>}

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2 text-sm">
                <h3 className="font-semibold">Task: {task.name}</h3>
                <p className="text-slate-600 dark:text-slate-300">{task.instructions.trim()}</p>
                <table className="w-full text-left text-xs tabular-nums">
                  <thead style={{ color: "var(--chart-muted)" }}><tr><th className="py-1">Level</th><th>Settings</th><th>Ability range</th></tr></thead>
                  <tbody>
                    {task.difficulty.levels.map((l) => (
                      <tr key={l.level} className="border-t" style={{ borderColor: "var(--chart-grid)" }}>
                        <td className="py-1">{l.level}</td>
                        <td>{Object.entries(l.params).map(([k, v]) => `${k.replaceAll("_", " ")}: ${Array.isArray(v) ? v.join("/") : v}`).join(", ")}</td>
                        <td>{l.ability_range.map((x) => x.toFixed(2)).join(" → ")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="space-y-2 text-sm">
                <h3 className="font-semibold">Scoring</h3>
                <ul className="list-disc space-y-1 pl-5 text-slate-600 dark:text-slate-300">
                  {describeScoring(d).map((s) => <li key={s.metric}><b>{s.metric}</b> × {s.weight}%: {s.rule}</li>)}
                </ul>
              </div>
              <div className="space-y-2 text-sm">
                <h3 className="font-semibold">Uncertainty</h3>
                <ul className="list-disc space-y-1 pl-5 text-slate-600 dark:text-slate-300">{describeUncertainty(d).map((s) => <li key={s}>{s}</li>)}</ul>
              </div>
              <div className="space-y-2 text-sm">
                <h3 className="font-semibold">Data quality checks</h3>
                <ul className="list-disc space-y-1 pl-5 text-slate-600 dark:text-slate-300">{describeValidity(d).map((s) => <li key={s}>{s}</li>)}</ul>
              </div>
            </div>

            <div className="space-y-1 text-sm">
              <h3 className="font-semibold">Known biases</h3>
              <ul className="list-disc space-y-1 pl-5 text-slate-600 dark:text-slate-300">{d.card.biases.map((b) => <li key={b}>{b}</li>)}</ul>
            </div>
            <details className="text-xs text-slate-500">
              <summary className="cursor-pointer">References</summary>
              <ul className="mt-1 list-disc pl-5">{d.card.citations.map((c) => <li key={c}>{c}</li>)}</ul>
            </details>
          </section>
        );
      })}
    </div>
  );
}
