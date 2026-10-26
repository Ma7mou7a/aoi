"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function Onboarding() {
  const router = useRouter();
  const [name, setName] = useState("");
  // Every consent is opt-in: nothing pre-ticked.
  const [consents, setConsents] = useState({ data_processing: false, behavioural_signals: false, llm_coaching: false });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch("/api/onboard", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ displayName: name, consents }) });
    setBusy(false);
    if (!res.ok) return setError((await res.json()).error);
    router.refresh();
  }

  const box = (key: keyof typeof consents, title: string, text: string, required = false) => (
    <label className="flex gap-3 rounded-xl border border-slate-200 p-3 dark:border-slate-800">
      <input type="checkbox" className="mt-1 h-4 w-4" checked={consents[key]} onChange={(e) => setConsents({ ...consents, [key]: e.target.checked })} />
      <span>
        <span className="font-medium">{title}</span> {required && <span className="text-xs text-red-600">required</span>}
        <span className="block text-sm text-slate-600 dark:text-slate-400">{text}</span>
      </span>
    </label>
  );

  return (
    <form onSubmit={submit} className="mx-auto max-w-lg space-y-4">
      <label className="block">
        <span className="text-sm font-medium">What should we call you?</span>
        <input value={name} onChange={(e) => setName(e.target.value)} required maxLength={40} placeholder="A first name or nickname" className="mt-1 w-full rounded-xl border border-slate-300 bg-transparent px-3 py-2 dark:border-slate-700" />
      </label>
      {box("data_processing", "Store my task results", "Scores, response times and errors are stored to build your profile. Kept 180 days; delete everything any time with one click.", true)}
      {box("behavioural_signals", "Use behaviour signals", "Things like losing window focus mid-task, used only to judge how reliable a block was.")}
      {box("llm_coaching", "AI coaching", "A summary of your profile (never your name) is sent to an AI model to write coaching feedback.")}
      <p className="text-xs text-slate-500">
        AI4Brain is a learning tool, not a medical or diagnostic test. No camera or microphone is used.
      </p>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button disabled={busy || !consents.data_processing} className="w-full rounded-xl bg-slate-900 py-3 font-medium text-white disabled:opacity-40 dark:bg-white dark:text-slate-900">
        {busy ? "Creating…" : "Create my Brain Twin"}
      </button>
    </form>
  );
}
