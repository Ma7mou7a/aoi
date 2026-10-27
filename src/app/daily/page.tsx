import { DailyGuest } from "@/components/DailyGuest";
import { PlaySession } from "@/components/PlaySession";
import { dailyChallenge, todayUtc } from "@/lib/daily";
import { getDimensions } from "@/lib/dimensions/loader";
import { getCurrentUser } from "@/lib/server/user";

export const dynamic = "force-dynamic";
export const metadata = { title: "Bao's daily challenge · AI4Brain" };

/** Today's shared puzzle. Signed in, it counts as a normal game (and earns bamboo once); signed out, it's practice. */
export default async function DailyPage() {
  const user = await getCurrentUser();
  const dims = getDimensions();
  const c = dailyChallenge(todayUtc(), dims);
  const dim = dims.find((d) => d.id === c.dimensionId)!;
  return (
    <div className="space-y-6">
      <div className="text-center">
        <h1 className="text-5xl sm:text-6xl">Bao&apos;s daily challenge</h1>
        <p className="mt-2 text-lg text-slate-600 dark:text-slate-300">
          Today: {dim.name}. Everyone gets the same puzzle today, and only you see your result.
        </p>
      </div>
      {user ? <PlaySession mode="training" daily /> : <DailyGuest dim={dim} taskId={c.taskId} level={c.level} seed={c.seed} />}
    </div>
  );
}
