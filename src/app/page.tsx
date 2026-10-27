import { and, count, eq } from "drizzle-orm";
import Link from "next/link";
import { db, schema } from "@/db";
import { BandBar } from "@/components/BandBar";
import { BrainTwinArt, EkgLine } from "@/components/BrainTwinArt";
import { Onboarding } from "@/components/Onboarding";
import { Panda } from "@/components/panda/Panda";
import { getProfileView } from "@/lib/server/profile";
import { getCurrentUser } from "@/lib/server/user";

export const dynamic = "force-dynamic";

const STATS: Array<[string, string]> = [
  ["6+1", "Cognitive skills + AI reliance"],
  ["90%", "Honest uncertainty bands"],
  ["500", "Simulated users in validation"],
  ["0", "Cameras or microphones needed"],
];

const PILLARS: Array<[string, string, string, string, string]> = [
  ["01", "Play", "Six classic tasks from cognitive science (N-back, Stroop, Corsi, task switching, symbol coding, generated matrices), plus a second-opinion game that measures how well you rely on an AI helper. Bao picks whichever game teaches him most about you.", "/try", "Try a task, no sign-up"],
  ["02", "Understand", "A Bayesian Brain Twin: every skill has a score and a range that shows how sure we are, and it narrows as you play. Tested on 500 simulated users, the range holds the true level about 9 times in 10.", "/validation", "See the validation"],
  ["03", "Coach", "Every sentence the AI coach writes cites the exact trials behind it, and a filter keeps it non-clinical. Spot-the-error mode trains you to check AI instead of trusting it.", "/skills", "How each skill is measured"],
  ["04", "Grow", "Adaptive difficulty keeps you near 75% success, a weekly plan targets what matters, and forecasts with bands show where you are heading.", "/dashboard", "Open the dashboard"],
];

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <p className="flex items-center justify-center gap-3 font-display text-sm tracking-[0.25em] text-brand uppercase">
      <span className="h-px w-10 bg-brand/50" />{children}<span className="h-px w-10 bg-brand/50" />
    </p>
  );
}

export default async function Home() {
  const user = await getCurrentUser();
  if (!user) {
    return (
      <div className="space-y-16">
        <section className="relative text-center">
          <EkgLine className="pointer-events-none absolute top-44 left-0 hidden h-12 w-1/3 md:block" />
          <EkgLine className="pointer-events-none absolute top-56 right-0 hidden h-12 w-1/3 -scale-x-100 md:block" />
          <h1 className="mx-auto max-w-4xl text-6xl sm:text-8xl">Play a 1-minute game</h1>
          <p className="mx-auto mt-5 max-w-2xl text-xl text-slate-600 dark:text-slate-300">
            Bao will tell you what it says about your mind, in plain words. Keep playing and your <b className="text-brand">Brain Twin</b> learns six thinking skills, plus how well you work with AI.
          </p>
          <div className="mt-7 flex flex-wrap justify-center gap-3">
            <Link href="/start" className="rounded-xl bg-brand px-7 py-4 font-display text-xl tracking-wider text-white uppercase transition-transform hover:bg-brand-deep active:scale-[0.98] dark:text-slate-950 dark:hover:bg-brand-2">Play a 1-minute game</Link>
            <a href="#how" className="rounded-xl border border-slate-300 px-6 py-4 font-display text-xl tracking-wider uppercase transition-transform hover:border-brand active:scale-[0.98] dark:border-slate-600">How it works</a>
          </div>
          <p className="mt-3 text-base text-slate-500 dark:text-slate-300">
            Already have a twin? <Link href="/signin" className="font-semibold text-brand hover:underline">Sign in with your key</Link> · No email needed
          </p>
          <div className="relative mx-auto mt-6 max-w-xl">
            <BrainTwinArt decor className="w-full drop-shadow-[0_30px_60px_rgba(0,98,155,0.45)]" />
            <div className="absolute right-0 bottom-0 flex items-end gap-1 sm:-right-16">
              <Panda state="wave" size={110} />
            </div>
          </div>
          <p className="mt-4 text-sm text-slate-500 dark:text-slate-400">Built for CISTAC 1.0 · AI4Brain challenge · not a medical test</p>
        </section>

        <section id="how" className="glass grid scroll-mt-28 grid-cols-2 divide-slate-200 rounded-2xl py-6 sm:grid-cols-4 sm:divide-x dark:divide-slate-800">
          {STATS.map(([n, label]) => (
            <div key={label} className="px-4 py-2 text-center">
              <p className="font-display text-5xl text-brand">{n}</p>
              <p className="text-xs font-semibold tracking-widest text-slate-500 uppercase dark:text-slate-300">{label}</p>
            </div>
          ))}
        </section>

        <section className="grid gap-4 md:grid-cols-2">
          {PILLARS.map(([num, title, text, href, cta]) => (
            <div key={num} className="glass group relative overflow-hidden rounded-2xl p-6 transition hover:border-brand/60">
              <span className="pointer-events-none absolute -top-4 right-3 font-display text-8xl text-brand/10 transition group-hover:text-brand/20">{num}</span>
              <p className="font-display text-sm tracking-[0.25em] text-accent">{num}</p>
              <h2 className="mt-1 text-4xl">{title}</h2>
              <p className="mt-2 text-slate-600 dark:text-slate-300">{text}</p>
              <Link href={href} className="mt-4 inline-block font-semibold text-brand hover:underline">{cta} →</Link>
            </div>
          ))}
        </section>

        <section id="start" className="scroll-mt-28 space-y-4">
          <Eyebrow>Start in a minute</Eyebrow>
          <h2 className="text-center text-5xl">Build your twin</h2>
          <Onboarding />
        </section>
      </div>
    );
  }

  const profile = await getProfileView(user.id);
  const measured = profile.dimensions.filter((d) => d.nObservations > 0);
  const [{ n: coachMessages }] = await db.select({ n: count() }).from(schema.coachMessages)
    .where(and(eq(schema.coachMessages.userId, user.id), eq(schema.coachMessages.role, "coach")));
  // First-run checklist: each step ticks itself off from real data, and the card disappears when all are done.
  const steps = [
    { done: user.signinKeyHash != null, label: "Save your sign-in key", hint: "so you can come back on another device", href: "/settings" },
    { done: measured.length >= 3, label: "Measure three skills", hint: "about 5 minutes of assessment", href: "/play" },
    { done: coachMessages > 0, label: "Get a coach debrief", hint: "every claim links to your trials", href: "/coach" },
    { done: profile.dimensions.some((d) => d.id === "ai_reliance" && d.nObservations > 0), label: "Play Second opinion", hint: "how well do you trust an AI?", href: "/play?mode=training&focus=ai_reliance" },
  ];
  const open = steps.filter((x) => !x.done).length;
  const skills = profile.dimensions.map((d) => ({ id: d.id, name: d.name, mean: d.nObservations > 0 ? d.mean : 0, color: `var(--dim-${d.id}, ${d.color})` }));
  return (
    <div className="grid items-center gap-10 lg:grid-cols-[1fr_1.1fr]">
      <div className="space-y-6">
        <div>
          <p className="font-display text-sm tracking-[0.25em] text-brand uppercase">Welcome back</p>
          <h1 className="text-6xl sm:text-7xl">Hi <span className="text-gradient">{user.displayName}</span></h1>
          <p className="mt-3 text-slate-600 dark:text-slate-300">{measured.length} of {profile.dimensions.length} skills measured. Every game teaches your twin a little more about you.</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Link href="/play" className="rounded-2xl bg-brand p-5 text-white dark:text-slate-950 shadow-[0_0_30px_rgba(0,181,226,0.3)] transition hover:bg-brand-2">
            <p className="font-display text-2xl tracking-wide uppercase">{measured.length ? "Continue assessment" : "Start your first assessment"}</p>
            <p className="text-sm opacity-80">About 5 minutes. Bao picks the game that teaches him most about you.</p>
          </Link>
          <Link href="/play?mode=training" className="glass rounded-2xl p-5 transition hover:border-brand">
            <p className="font-display text-2xl tracking-wide uppercase">Train</p>
            <p className="text-sm text-slate-500 dark:text-slate-300">Your weakest skill, at the level where you grow fastest.</p>
          </Link>
        </div>
        {open > 0 && (
          <div className="glass rounded-2xl p-5">
            <p className="font-display text-sm tracking-[0.2em] text-brand uppercase">Getting started · {steps.length - open}/{steps.length}</p>
            <ol className="mt-2 space-y-2">
              {steps.map((x) => (
                <li key={x.label} className="flex items-start gap-3">
                  <span aria-hidden className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full text-xs ${x.done ? "bg-emerald-600 text-white" : "border border-slate-400"}`}>{x.done ? "✓" : ""}</span>
                  {x.done
                    ? <span className="text-slate-500 line-through">{x.label}</span>
                    : <Link href={x.href} className="hover:text-brand"><b>{x.label}</b> <span className="text-sm text-slate-500 dark:text-slate-300">· {x.hint}</span></Link>}
                  <span className="sr-only">{x.done ? "(done)" : "(to do)"}</span>
                </li>
              ))}
            </ol>
          </div>
        )}
        {measured.length > 0 && (
          <div className="glass space-y-3 rounded-2xl p-5">
            {measured.map((d) => <BandBar key={d.id} label={d.name.split(" ")[0]} mean={d.mean} ci={d.ci} color={`var(--dim-${d.id}, ${d.color})`} />)}
            <Link href="/dashboard" className="inline-block pt-1 text-sm font-semibold text-brand hover:underline">Open the dashboard →</Link>
          </div>
        )}
      </div>
      <div className="relative">
        <BrainTwinArt decor skills={skills} className="w-full drop-shadow-[0_30px_60px_rgba(0,98,155,0.45)]" title="Your Brain Twin: each glowing node is a skill, larger means a higher estimate" />
        <ul className="mt-2 flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs text-slate-500 dark:text-slate-300">
          {skills.map((s) => (
            <li key={s.id} className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ background: s.color }} />{s.name}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}
