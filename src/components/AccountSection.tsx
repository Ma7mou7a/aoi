"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { SigninKeyCard } from "./SigninKeyCard";

/** Settings: create or replace the sign-in key, and sign out of this browser. */
export function AccountSection({ hasKey, displayName }: { hasKey: boolean; displayName: string }) {
  const router = useRouter();
  const [key, setKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function newKey() {
    if (hasKey && !confirm("Create a new sign-in key? Your old key will stop working.")) return;
    setBusy(true);
    const res = await fetch("/api/me/signin-key", { method: "POST" });
    setBusy(false);
    if (res.ok) setKey((await res.json()).key);
  }
  async function signOut() {
    const msg = hasKey
      ? "Sign out of this browser? You can come back with your sign-in key."
      : "You don't have a sign-in key yet, so you won't be able to come back to this profile after signing out. Sign out anyway?";
    if (!confirm(msg)) return;
    await fetch("/api/signout", { method: "POST" });
    router.push("/");
    router.refresh();
  }

  if (key) return <SigninKeyCard signinKey={key} doneLabel="Done" onDone={() => { setKey(null); router.refresh(); }} />;

  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold">Sign-in &amp; account</h2>
      <p className="text-sm text-slate-600 dark:text-slate-300">
        Signed in as <b>{displayName}</b> on this browser. {hasKey
          ? "You have a sign-in key: use it at /signin on another browser or device."
          : "You don't have a sign-in key yet. Create one so you can come back from another browser or device."}
      </p>
      <div className="flex flex-wrap gap-2">
        <button onClick={newKey} disabled={busy} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-brand dark:text-slate-950">
          {hasKey ? "Replace my sign-in key" : "Create my sign-in key"}
        </button>
        <button onClick={signOut} className="glass rounded-lg px-4 py-2 text-sm font-medium hover:border-brand">Sign out</button>
      </div>
    </section>
  );
}
