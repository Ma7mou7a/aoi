"use client";

import { useState } from "react";

/** Shows a freshly created sign-in key once, with copy and save, and asks the user to confirm they kept it. */
export function SigninKeyCard({ signinKey, onDone, doneLabel = "I've saved it, continue" }: { signinKey: string; onDone: () => void; doneLabel?: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(signinKey);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };
  const download = () => {
    const blob = new Blob([`AI4Brain sign-in key\n\n${signinKey}\n\nUse it at /signin to open your Brain Twin on another browser or device.\nKeep it private: anyone with this key can open your profile.\n`], { type: "text/plain" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "ai4brain-sign-in-key.txt";
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div className="glass mx-auto max-w-lg space-y-4 rounded-2xl p-6 text-center">
      <h2 className="text-3xl">Your sign-in key</h2>
      <p className="text-sm text-slate-600 dark:text-slate-300">
        We never ask for an email or a password. This key is how you get back to your Brain Twin on another browser or device. We only store a scrambled version, so <b>we can&apos;t show it again</b>.
      </p>
      <p className="rounded-xl bg-slate-100 px-4 py-3 font-mono text-2xl tracking-widest select-all dark:bg-slate-800" aria-label="Your sign-in key">{signinKey}</p>
      <div className="flex flex-wrap justify-center gap-2">
        <button onClick={copy} className="glass rounded-lg px-4 py-2 text-sm font-medium hover:border-brand">{copied ? "Copied ✓" : "Copy"}</button>
        <button onClick={download} className="glass rounded-lg px-4 py-2 text-sm font-medium hover:border-brand">Save as a file</button>
      </div>
      <p className="text-xs text-slate-500">Keep it private: anyone with the key can open your profile. You can replace it any time in Settings.</p>
      <button onClick={onDone} className="w-full rounded-xl bg-slate-900 py-3 font-medium text-white dark:bg-brand dark:text-slate-950">{doneLabel}</button>
    </div>
  );
}
