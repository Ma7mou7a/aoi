import { redirect } from "next/navigation";
import { AiLab } from "@/components/aiLab/AiLab";
import { activeProvider } from "@/lib/coach/llm";
import { getCurrentUser } from "@/lib/server/user";

export const dynamic = "force-dynamic";

export default async function AiLabPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/");
  const live = process.env.COACH_LLM !== "off" && activeProvider() !== null;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-5xl sm:text-6xl">AI Lab</h1>
        <p className="text-base text-slate-600 dark:text-slate-300">
          Two games against a real AI, built on research into how people get fooled, and how they stop. The AI writes every round live. The truth comes from checked facts, so your score never depends on the AI being right.
        </p>
        <p className="mt-2 text-xs text-slate-500">
          {live ? "Live AI is on. It only ever sees the puzzle, never anything about you." : "No AI provider is set up on this server, so the games use pre-written AI text."}
        </p>
      </div>
      <AiLab />
    </div>
  );
}
