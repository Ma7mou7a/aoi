"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function SigninForm() {
  const router = useRouter();
  const [key, setKey] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch("/api/signin", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ key }) });
    setBusy(false);
    if (!res.ok) return setError((await res.json()).error ?? "Sign-in failed.");
    router.push("/");
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="glass mx-auto max-w-md space-y-4 rounded-2xl p-6">
      <label className="block">
        <span className="text-sm font-medium">Your sign-in key</span>
        <input value={key} onChange={(e) => setKey(e.target.value)} required autoFocus autoComplete="off" spellCheck={false}
          placeholder="K7QM-2XRP-9TFD-W4HN" aria-describedby="signin-help"
          className="mt-1 w-full rounded-xl border border-slate-300 bg-transparent px-3 py-3 font-mono text-lg tracking-widest uppercase dark:border-slate-700" />
      </label>
      <p id="signin-help" className="text-xs text-slate-500">You got it when you created your twin, or in Settings. Dashes and capitals don&apos;t matter.</p>
      {error && <p role="alert" className="text-sm text-rose-600 dark:text-rose-400">{error}</p>}
      <button disabled={busy} className="w-full rounded-xl bg-slate-900 py-3 font-medium text-white disabled:opacity-50 dark:bg-brand dark:text-slate-950">
        {busy ? "Signing in…" : "Sign in"}
      </button>
      <p className="text-center text-sm text-slate-500">New here? <Link href="/#start" className="font-semibold text-brand hover:underline">Build your Brain Twin</Link></p>
    </form>
  );
}
