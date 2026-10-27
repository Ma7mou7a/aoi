import { redirect } from "next/navigation";
import { BandBar } from "@/components/BandBar";
import { DeleteMyData } from "@/components/DeleteMyData";
import { BadgeShelf } from "@/components/rewards/BadgeShelf";
import { getRewards } from "@/lib/server/rewards";
import { getProfileView } from "@/lib/server/profile";
import { getCurrentUser } from "@/lib/server/user";

export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/");
  const [profile, rewards] = await Promise.all([getProfileView(user.id), getRewards(user.id)]);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-5xl sm:text-6xl">Brain Twin</h1>
        <p className="text-slate-600 dark:text-slate-300">
          Each bar is your score now. The shaded part is where your level most likely is (90% of the time). Skills you haven&apos;t played yet show a wide range around 50.
        </p>
      </div>
      <div className="space-y-6">
        {profile.dimensions.map((d) => (
          <section key={d.id} className="space-y-2">
            <div className="flex items-baseline justify-between">
              <h2 className="font-medium">{d.name}</h2>
              <span className="text-xs text-slate-500">
                {d.nObservations ? `${d.nObservations} games · ${d.nTrials} answers · ${Math.round(d.ci[0] * 100)}–${Math.round(d.ci[1] * 100)}%` : "not measured yet"}
              </span>
            </div>
            <BandBar label="Now" mean={d.mean} ci={d.ci} color={d.nObservations ? d.color : "#cbd5e1"} />
            <p className="text-sm text-slate-500">{d.definition}</p>
          </section>
        ))}
      </div>
      <BadgeShelf earned={rewards.badges} />
      <footer className="border-t border-slate-200 pt-4 dark:border-slate-800">
        <DeleteMyData />
      </footer>
    </div>
  );
}
