import { redirect } from "next/navigation";
import { BandBar } from "@/components/BandBar";
import { DeleteMyData } from "@/components/DeleteMyData";
import { getProfileView } from "@/lib/server/profile";
import { getCurrentUser } from "@/lib/server/user";

export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/");
  const profile = await getProfileView(user.id);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Brain Twin</h1>
        <p className="text-slate-600 dark:text-slate-300">
          Each bar is your current estimate. The shaded band is where your level most likely is (90% range). Unmeasured skills show a wide band around 50%.
        </p>
      </div>
      <div className="space-y-6">
        {profile.dimensions.map((d) => (
          <section key={d.id} className="space-y-2">
            <div className="flex items-baseline justify-between">
              <h2 className="font-medium">{d.name}</h2>
              <span className="text-xs text-slate-500">
                {d.nObservations ? `${d.nObservations} blocks · ${d.nTrials} trials · ${Math.round(d.ci[0] * 100)}–${Math.round(d.ci[1] * 100)}%` : "not measured yet"}
              </span>
            </div>
            <BandBar label="Now" mean={d.mean} ci={d.ci} color={d.nObservations ? d.color : "#cbd5e1"} />
            <p className="text-sm text-slate-500">{d.definition}</p>
          </section>
        ))}
      </div>
      <footer className="border-t border-slate-200 pt-4 dark:border-slate-800">
        <DeleteMyData />
      </footer>
    </div>
  );
}
