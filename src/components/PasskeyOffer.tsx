"use client";

import { useState } from "react";
import { addPasskey } from "@/lib/passkeyClient";
import { Panda } from "./panda/Panda";

/**
 * Right after signup: offer a passkey first, so most people never need to keep a key by hand.
 * Apple and Google sync passkeys to the person's other devices; the sign-in key stays as the backup.
 */
export function PasskeyOffer({ onDone }: { onDone: (added: boolean) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await addPasskey("Saved at signup");
      onDone(true);
    } catch (e) {
      // Cancelling the browser prompt lands here too: let them try again or skip.
      setError((e as Error).name === "NotAllowedError" ? "No passkey was saved. You can try again or skip." : (e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="glass mx-auto max-w-lg space-y-4 rounded-2xl p-6 text-center">
      <div className="flex justify-center"><Panda size={96} state="wave" /></div>
      <h2 className="text-3xl">Save your sign-in to this device</h2>
      <p className="text-sm text-slate-600 dark:text-slate-300">
        Come back with your fingerprint, face or device PIN: nothing to write down or remember. Your phone or computer keeps it, and Apple or Google can sync it to your other devices.
      </p>
      <button type="button" disabled={busy} onClick={save} className="w-full rounded-xl bg-brand py-3 font-medium text-white disabled:opacity-50 dark:text-slate-950">
        {busy ? "Waiting for your device…" : "Use fingerprint, face or PIN"}
      </button>
      {error && <p role="alert" className="text-sm text-rose-600 dark:text-rose-400">{error}</p>}
      <button type="button" disabled={busy} onClick={() => onDone(false)} className="text-sm text-slate-500 underline-offset-2 hover:underline">
        Not now, give me a sign-in key instead
      </button>
    </div>
  );
}
