import { notFound } from "next/navigation";
import { PERSONAS, type Persona } from "@/lib/server/jury";

/** Development only: the defense control room. One click builds a persona and opens its scenario. */
export default function JuryMode() {
  if (process.env.NODE_ENV === "production") notFound();
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header className="space-y-2">
        <p className="text-sm font-semibold tracking-wide text-brand uppercase">Jury mode</p>
        <h1 className="text-4xl">Six surprise scenarios, four players</h1>
        <p className="text-slate-600 dark:text-slate-300">
          Each button creates a fresh player through the real pipeline (simulated answers, real scoring, real Brain Twin), signs in as them and
          opens the page where their scenario starts. Every answer you will see is computed from data, never improvised by a model.
        </p>
      </header>
      <div className="grid gap-4 md:grid-cols-2">
        {(Object.keys(PERSONAS) as Persona[]).map((k) => {
          const p = PERSONAS[k];
          return (
            <section key={k} className="glass space-y-3 rounded-2xl p-5">
              <div className="flex items-baseline justify-between gap-2">
                <h2 className="text-2xl">{p.title}</h2>
                <span className="text-sm text-slate-500 dark:text-slate-400">{p.name}</span>
              </div>
              <ul className="flex flex-wrap gap-1.5">
                {p.scenarios.map((s) => (
                  <li key={s} className="rounded-full bg-brand/10 px-2.5 py-0.5 text-xs font-medium text-brand-deep dark:text-brand-2">{s}</li>
                ))}
              </ul>
              <ol className="list-decimal space-y-1 pl-5 text-sm text-slate-600 dark:text-slate-300">
                {p.script.map((line) => <li key={line}>{line}</li>)}
              </ol>
              {/* A plain link: the route builds the persona server-side, then redirects. */}
              <a href={`/api/dev/jury?persona=${k}`} className="inline-block rounded-xl bg-slate-900 px-5 py-2.5 font-medium text-white hover:bg-slate-700 dark:bg-brand dark:text-slate-900">
                Load {p.name} and start
              </a>
            </section>
          );
        })}
      </div>
    </div>
  );
}
