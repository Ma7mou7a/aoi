import { and, desc, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { CoachChat } from "@/components/coach/CoachChat";
import { db, schema } from "@/db";
import { listCoachMessages } from "@/lib/server/coach";
import { getCurrentUser } from "@/lib/server/user";

export const dynamic = "force-dynamic";

export default async function CoachPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/");

  const [messages, [consent]] = await Promise.all([
    listCoachMessages(user.id),
    db
      .select({ granted: schema.consents.granted })
      .from(schema.consents)
      .where(and(eq(schema.consents.userId, user.id), eq(schema.consents.kind, "llm_coaching")))
      .orderBy(desc(schema.consents.createdAt))
      .limit(1),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Coach</h1>
        <p className="text-slate-600 dark:text-slate-300">
          Every statement is linked to the exact blocks and trials behind it. Tap <b>See the evidence</b> to check it yourself.
        </p>
      </div>
      <CoachChat
        llmOn={consent?.granted ?? false}
        initial={messages.map((m) => ({ ...m, createdAt: m.createdAt.toISOString() }))}
      />
    </div>
  );
}
