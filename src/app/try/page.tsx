import Link from "next/link";
import { getDimensions } from "@/lib/dimensions/loader";
import { AVAILABLE_PARADIGMS } from "@/lib/tasks/registry";

/** Task gallery: every task, playable in practice mode without an account. */
export default function TryIndex() {
  const dims = getDimensions();
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Try the tasks</h1>
        <p className="text-slate-600 dark:text-slate-300">Each skill is measured with a classic task from cognitive science. Practise any of them here: nothing is stored.</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {dims.flatMap((d) =>
          d.tasks.filter((t) => AVAILABLE_PARADIGMS.includes(t.paradigm)).map((t) => (
            <Link key={t.id} href={`/try/${t.id}`} className="space-y-1 rounded-2xl border border-slate-200 p-4 hover:border-slate-400 dark:border-slate-800">
              <p className="flex items-center gap-2 text-sm" style={{ color: "var(--chart-ink-2)" }}>
                <span className="inline-block h-2 w-2 rounded-full" style={{ background: `var(--dim-${d.id}, ${d.color})` }} aria-hidden /> {d.name}
              </p>
              <p className="text-lg font-semibold">{t.name}</p>
              <p className="text-sm text-slate-500">{t.instructions.trim()}</p>
            </Link>
          )),
        )}
      </div>
      <p className="text-sm text-slate-500">Want the science behind each one? See the <Link href="/skills" className="underline">measurement cards</Link>.</p>
    </div>
  );
}
