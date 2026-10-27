import { redirect } from "next/navigation";
import { AccountSection } from "@/components/AccountSection";
import { SettingsForm } from "@/components/SettingsForm";
import { signalReviewedSettings } from "@/lib/server/collab";
import { getConsentState } from "@/lib/server/privacy";
import { getCurrentUser } from "@/lib/server/user";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/");
  const consents = await getConsentState(user.id);
  await signalReviewedSettings(user.id);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-5xl sm:text-6xl">Privacy &amp; data</h1>
        <p className="text-slate-600 dark:text-slate-300">You decide what AI4Brain may use and how long it keeps it. Changes apply immediately.</p>
      </div>
      <AccountSection hasKey={user.signinKeyHash != null} displayName={user.displayName} />
      <SettingsForm initial={consents.current} retentionDays={user.retentionDays} history={consents.history} />
    </div>
  );
}
