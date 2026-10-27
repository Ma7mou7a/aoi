import { redirect } from "next/navigation";
import { CoachChat } from "@/components/coach/CoachChat";
import { getCoachState, listCoachMessages } from "@/lib/server/coach";
import { getCollabView } from "@/lib/server/collab";
import { getConsentState } from "@/lib/server/privacy";
import { getCurrentUser } from "@/lib/server/user";

export const dynamic = "force-dynamic";

export default async function CoachPage({ searchParams }: { searchParams: Promise<{ ask?: string }> }) {
  const { ask } = await searchParams;
  const user = await getCurrentUser();
  if (!user) redirect("/");

  const [messages, collab, state, consents] = await Promise.all([listCoachMessages(user.id), getCollabView(user.id), getCoachState(user.id), getConsentState(user.id)]);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-5xl sm:text-6xl">Ask Bao</h1>
        <p className="text-base text-slate-600 dark:text-slate-300">
          Bao explains your games in plain words, starts the right game for you and looks ahead. Every number he says is checked against your own games.
        </p>
      </div>
      <CoachChat initial={{ messages, collab, ...state }} micOn={consents.current.microphone} autoDebrief={ask === "debrief"} />
    </div>
  );
}
