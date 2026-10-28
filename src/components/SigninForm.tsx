"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { clearFirstGame } from "@/lib/firstGame";
import { passkeysSupported, signInWithPasskey } from "@/lib/passkeyClient";

type Mode = "key" | "code";

export function SigninForm() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("key");
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [canPasskey, setCanPasskey] = useState(false);
  useEffect(() => setCanPasskey(passkeysSupported()), []);

  async function finish(attempt: () => Promise<Response | unknown>) {
    setBusy(true);
    setError(null);
    // A first game played before signing in belongs to nobody yet: never import it into this account.
    clearFirstGame(sessionStorage);
    try {
      const res = await attempt();
      if (res instanceof Response && !res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Sign-in failed.");
      router.push("/");
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const [url, body] = mode === "key" ? ["/api/signin", { key: value }] : ["/api/signin/link", { code: value }];
    void finish(() => fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }));
  };

  return (
    <div className="glass mx-auto max-w-md space-y-4 rounded-2xl p-6">
      {canPasskey && (
        <>
          <button type="button" disabled={busy} onClick={() => finish(signInWithPasskey)} className="w-full rounded-xl bg-slate-900 py-3 font-medium text-white disabled:opacity-50 dark:bg-brand dark:text-slate-950">
            🔑 Sign in with a passkey
          </button>
          <p className="text-center text-xs text-slate-500">If you added one in Settings: your fingerprint, face or device PIN.</p>
          <div className="flex items-center gap-3 text-xs text-slate-500" aria-hidden><span className="h-px flex-1 bg-slate-300 dark:bg-slate-700" />or<span className="h-px flex-1 bg-slate-300 dark:bg-slate-700" /></div>
        </>
      )}
      <div role="tablist" aria-label="How to sign in" className="flex gap-2 text-sm">
        {(["key", "code"] as const).map((m) => (
          <button key={m} type="button" role="tab" aria-selected={mode === m} onClick={() => { setMode(m); setValue(""); setError(null); }}
            className={`flex-1 rounded-lg border px-3 py-1.5 ${mode === m ? "border-brand font-semibold" : "border-slate-300 dark:border-slate-700"}`}>
            {m === "key" ? "Sign-in key" : "Code from another device"}
          </button>
        ))}
      </div>
      <form onSubmit={submit} className="space-y-4">
        <label className="block">
          <span className="text-sm font-medium">{mode === "key" ? "Your sign-in key" : "The 10-character code"}</span>
          <input value={value} onChange={(e) => setValue(e.target.value)} required autoFocus autoComplete="off" spellCheck={false}
            placeholder={mode === "key" ? "K7QM-2XRP-9TFD-W4HN" : "AB3DE-7GH9K"} aria-describedby="signin-help" maxLength={mode === "key" ? 64 : 32}
            className="mt-1 w-full rounded-xl border border-slate-300 bg-transparent px-3 py-3 font-mono text-lg tracking-widest uppercase dark:border-slate-700" />
        </label>
        <p id="signin-help" className="text-xs text-slate-500">
          {mode === "key"
            ? "You got it when you created your twin, or in Settings. Dashes and capitals don't matter."
            : "On a device that's already signed in: Settings → Security & privacy → Show a QR code. Scan it, or type the code shown under it."}
        </p>
        {error && <p role="alert" className="text-sm text-rose-600 dark:text-rose-400">{error}</p>}
        <button disabled={busy} className="w-full rounded-xl border border-slate-300 py-3 font-medium disabled:opacity-50 dark:border-slate-600">
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </form>
      <p className="text-center text-sm text-slate-500">New here? <Link href="/#start" className="font-semibold text-brand hover:underline">Build your Brain Twin</Link></p>
    </div>
  );
}
