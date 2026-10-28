import Link from "next/link";
import { redirect } from "next/navigation";
import { PlaySession } from "@/components/PlaySession";
import { getCurrentUser } from "@/lib/server/user";

export const dynamic = "force-dynamic";

export default async function PlayPage({ searchParams }: { searchParams: Promise<{ mode?: string; focus?: string }> }) {
  if (!(await getCurrentUser())) redirect("/");
  const { mode: m, focus } = await searchParams;
  const mode = m === "training" ? "training" : "assessment";
  const href = (m: "assessment" | "training") => `/play${m === "training" ? "?mode=training" : ""}${focus ? `${m === "training" ? "&" : "?"}focus=${focus}` : ""}`;
  return (
    <div className="space-y-4">
      {/* The two ways to play, side by side, so nobody has to know what "assess" means. */}
      <div role="tablist" aria-label="How to play" className="glass mx-auto flex max-w-md gap-1 rounded-xl p-1 text-sm">
        {(["assessment", "training"] as const).map((m) => (
          <Link key={m} href={href(m)} role="tab" aria-selected={mode === m}
            className={`flex-1 rounded-lg px-3 py-2 text-center transition ${mode === m ? "bg-brand font-semibold text-white dark:text-slate-950" : "text-slate-600 hover:text-foreground dark:text-slate-300"}`}>
            {m === "assessment" ? "Measure me" : "Just practise"}
          </Link>
        ))}
      </div>
      <p className="text-center text-xs text-slate-500">
        {mode === "assessment" ? "Bao picks the game that tells him most about you, and your scores update." : "Practise at the level where you grow fastest. Bao cheers you on as you play."}
      </p>
      <PlaySession key={`${mode}:${focus ?? ""}`} mode={mode} focus={focus} />
    </div>
  );
}
