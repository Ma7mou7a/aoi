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
        <div className="mx-auto max-w-lg space-y-2 text-center">
          <h1 className="text-3xl font-semibold tracking-tight">Meet your Brain Twin</h1>
          <p className="text-slate-600 dark:text-slate-300">
            Short science-based games build a living profile of six thinking skills, always showing how sure we are, and adapt to help you grow.
          </p>
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
