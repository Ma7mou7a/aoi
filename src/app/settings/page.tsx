import { redirect } from "next/navigation";
import { AccountSection } from "@/components/AccountSection";
import { SecuritySection } from "@/components/SecuritySection";
import { SettingsForm } from "@/components/SettingsForm";
import { signalReviewedSettings } from "@/lib/server/collab";
import { getConsentState } from "@/lib/server/privacy";
import { getSecurityOverview } from "@/lib/server/security";
import { getCurrentSession, getCurrentUser } from "@/lib/server/user";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const user = await getCurrentUser();
  const session = await getCurrentSession();
  if (!user || !session) redirect("/");
  const [consents, security] = await Promise.all([getConsentState(user.id), getSecurityOverview(user.id, session.id)]);
  await signalReviewedSettings(user.id);

  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-5xl sm:text-6xl">Privacy &amp; data</h1>
        <p className="text-slate-600 dark:text-slate-300">You decide what AI4Brain may use and how long it keeps it. Changes apply immediately.</p>
      </div>
      <AccountSection hasKey={user.signinKeyHash != null} displayName={user.displayName} />
      <SecuritySection initial={security} highContrast={!!user.preferences.highContrast} />
      <SettingsForm initial={consents.current} retentionDays={user.retentionDays} history={consents.history} researchMode={!!user.preferences.researchMode} />
    </div>
  );
}
