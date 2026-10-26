import { redirect } from "next/navigation";
import { CoachChat } from "@/components/coach/CoachChat";
import { listCoachMessages } from "@/lib/server/coach";
import { getCollabView } from "@/lib/server/collab";
import { getConsentState } from "@/lib/server/privacy";
import { getCurrentUser } from "@/lib/server/user";

export const dynamic = "force-dynamic";

export default async function CoachPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/");

  const [messages, collab, consents] = await Promise.all([listCoachMessages(user.id), getCollabView(user.id), getConsentState(user.id)]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-5xl sm:text-6xl">Coach</h1>
        <p className="text-slate-600 dark:text-slate-300">
          Every statement is linked to the exact blocks and trials behind it. Tap <b>See the evidence</b> to check it yourself.
        </p>
      </div>
      <CoachChat
        initial={messages}
        initialCollab={collab}
        llmOn={consents.current.llm_coaching}
        spotTheError={consents.current.planted_flaws}
        micOn={consents.current.microphone}
      />
    </div>
  );
}
