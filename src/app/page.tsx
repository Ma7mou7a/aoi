import Link from "next/link";
import { BandBar } from "@/components/BandBar";
import { Onboarding } from "@/components/Onboarding";
import { getProfileView } from "@/lib/server/profile";
import { getCurrentUser } from "@/lib/server/user";

export const dynamic = "force-dynamic";

export default async function Home() {
  const user = await getCurrentUser();
  if (!user) {
    return (
      <div className="space-y-8">
        <div className="mx-auto max-w-2xl space-y-3 text-center">
          <h1 className="text-4xl font-semibold tracking-tight">Meet your Brain Twin</h1>
          <p className="text-lg text-slate-600 dark:text-slate-300">
            Short games from cognitive science build a living profile of six thinking skills. It always shows how sure it is, and it adapts to help you grow.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          {[
            ["Real science, not quizzes", "N-back, Stroop, Corsi, task switching, symbol coding and generated matrices: classic tasks with published references.", "/skills", "How each skill is measured"],
            ["Honest about uncertainty", "Every estimate has a band that narrows as you play. Tested on 500 simulated users: the band holds the true level about 9 times in 10.", "/validation", "See the validation"],
            ["A coach you can check", "Every claim links to the exact trials behind it. Optional spot-the-error mode trains you to verify AI.", "/try", "Try a task, no sign-up"],
          ].map(([title, text, href, cta]) => (
            <div key={title} className="space-y-2 rounded-2xl border border-slate-200 p-4 dark:border-slate-800">
              <p className="font-semibold">{title}</p>
              <p className="text-sm text-slate-600 dark:text-slate-300">{text}</p>
              <Link href={href} className="text-sm underline underline-offset-4">{cta} →</Link>
            </div>
          ))}
        </div>
        <Onboarding />
      </div>
    );
  }

  const profile = await getProfileView(user.id);
  const measured = profile.dimensions.filter((d) => d.nObservations > 0);
  return (
    <div className="space-y-8">
      <h1 className="text-3xl font-semibold tracking-tight">Hi {user.displayName}</h1>
      <div className="grid gap-4 sm:grid-cols-2">
        <Link href="/play" className="rounded-2xl bg-slate-900 p-6 text-white dark:bg-white dark:text-slate-900">
          <p className="text-lg font-semibold">{measured.length ? "Continue assessment" : "Start your first assessment"}</p>
          <p className="text-sm opacity-70">About 5 minutes. The agent picks the task that teaches it most about you.</p>
        </Link>
        <Link href="/profile" className="rounded-2xl border border-slate-200 p-6 dark:border-slate-800">
          <p className="text-lg font-semibold">Brain Twin</p>
          <p className="text-sm text-slate-500">{measured.length} of {profile.dimensions.length} skills measured so far</p>
        </Link>
      </div>
      {measured.length > 0 && (
        <div className="space-y-3">
          {measured.map((d) => <BandBar key={d.id} label={d.name.split(" ")[0]} mean={d.mean} ci={d.ci} color={d.color} />)}
        </div>
      )}
    </div>
  );
}
