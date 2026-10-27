import Link from "next/link";
import { BandBar } from "@/components/BandBar";
import { BrainTwinArt, EkgLine } from "@/components/BrainTwinArt";
import { Onboarding } from "@/components/Onboarding";
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
  ["01", "Assess", "Six classic tasks from cognitive science (N-back, Stroop, Corsi, task switching, symbol coding, generated matrices), plus a second-opinion game that measures how well you rely on an AI helper. The agent picks whichever block teaches it most about you.", "/try", "Try a task, no sign-up"],
  ["02", "Understand", "A Bayesian Brain Twin: every skill has an estimate and a 90% band that narrows as you play. Tested on 500 simulated users, the band holds the true level about 9 times in 10.", "/validation", "See the validation"],
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
          <Eyebrow>CISTAC 1.0 · AI4Brain challenge</Eyebrow>
          <h1 className="mt-4 text-6xl sm:text-8xl">
            Meet your <span className="text-gradient">Brain Twin</span>
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-lg text-slate-600 dark:text-slate-300">
            <b className="text-brand">Artificial intelligence</b> meets <b className="text-accent">cognitive science</b>: short games build a living, honest profile of six thinking skills, then an evidence-linked coach helps you grow them.
          </p>
          <div className="mt-7 flex flex-wrap justify-center gap-3">
            <a href="#start" className="rounded-lg bg-brand px-6 py-3 font-display text-lg tracking-wider text-white uppercase dark:text-slate-950 shadow-[0_0_30px_rgba(0,181,226,0.4)] transition hover:bg-brand-2">Create my twin</a>
            <Link href="/try" className="glass rounded-lg px-6 py-3 font-display text-lg tracking-wider uppercase transition hover:border-brand">Try a task first</Link>
          </div>
          <div className="relative mx-auto mt-6 max-w-xl">
            <BrainTwinArt decor className="w-full drop-shadow-[0_30px_60px_rgba(0,98,155,0.45)]" />
            <span className="absolute top-1/3 left-0 hidden -translate-x-1/2 font-display text-sm tracking-[0.2em] text-slate-500 uppercase sm:block dark:text-slate-300">You</span>
            <span className="absolute top-1/3 right-0 hidden translate-x-1/2 font-display text-sm tracking-[0.2em] text-brand uppercase sm:block">Your twin</span>
          </div>
        </section>

        <section className="glass grid grid-cols-2 divide-slate-200 rounded-2xl py-6 sm:grid-cols-4 sm:divide-x dark:divide-slate-800">
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
  const skills = profile.dimensions.map((d) => ({ id: d.id, name: d.name, mean: d.nObservations > 0 ? d.mean : 0, color: `var(--dim-${d.id}, ${d.color})` }));
  return (
    <div className="grid items-center gap-10 lg:grid-cols-[1fr_1.1fr]">
      <div className="space-y-6">
        <div>
          <p className="font-display text-sm tracking-[0.25em] text-brand uppercase">Welcome back</p>
          <h1 className="text-6xl sm:text-7xl">Hi <span className="text-gradient">{user.displayName}</span></h1>
          <p className="mt-3 text-slate-600 dark:text-slate-300">{measured.length} of {profile.dimensions.length} skills measured. The glowing nodes on your twin grow with each estimate.</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Link href="/play" className="rounded-2xl bg-brand p-5 text-white dark:text-slate-950 shadow-[0_0_30px_rgba(0,181,226,0.3)] transition hover:bg-brand-2">
            <p className="font-display text-2xl tracking-wide uppercase">{measured.length ? "Continue assessment" : "Start your first assessment"}</p>
            <p className="text-sm opacity-80">About 5 minutes. The agent picks the task that teaches it most about you.</p>
          </Link>
          <Link href="/play?mode=training" className="glass rounded-2xl p-5 transition hover:border-brand">
            <p className="font-display text-2xl tracking-wide uppercase">Train</p>
            <p className="text-sm text-slate-500 dark:text-slate-300">Your weakest skill, at the level where you grow fastest.</p>
          </Link>
        </div>
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
