import { notFound } from "next/navigation";
import { Panda } from "@/components/panda/Panda";
import { PandaSay } from "@/components/panda/PandaSay";
import type { PandaState } from "@/lib/panda/bus";

const STATES: PandaState[] = ["idle", "wave", "watch", "think", "cheer", "proud", "oops", "sleep", "celebrate", "quiet", "calm"];

/** Development only: every pose of Bao side by side, in light and dark, for visual review. */
export default function PandaReview() {
  if (process.env.NODE_ENV === "production") notFound();
  return (
    <div className="space-y-6">
      <h1 className="text-4xl">Bao: all poses</h1>
      {(["light", "dark"] as const).map((theme) => (
        <section key={theme} data-theme={theme} className="rounded-2xl p-6" style={{ background: theme === "dark" ? "#031426" : "#f4f8fb", color: theme === "dark" ? "#f4f9fc" : "#031426" }}>
          <p className="mb-4 font-semibold">{theme}</p>
          <div className="grid grid-cols-2 gap-6 sm:grid-cols-4 lg:grid-cols-6">
            {STATES.map((s) => (
              <figure key={s} className="flex flex-col items-center gap-2">
                <Panda state={s} size={110} />
                <figcaption className="text-sm">{s}</figcaption>
              </figure>
            ))}
          </div>
          <div className="mt-6 flex items-end gap-2">
            <PandaSay text="Ooh, working memory! I'll grab my bamboo and watch." />
            <Panda state="wave" size={76} />
          </div>
        </section>
      ))}
    </div>
  );
}
