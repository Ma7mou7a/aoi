"use client";

import { useEffect, useState } from "react";

type PasswordCredentialCtor = new (data: { id: string; password: string; name?: string }) => Credential;

/**
 * Shows a freshly created sign-in key once, with ways to keep it that don't involve copying it by hand:
 * the password manager, a file or paper. `backup` frames it as the safety net next to a passkey.
 * The key sits in a username/password form so the browser offers to save it on "continue", and the
 * sign-in form asks for the same pair, so a saved key fills itself in.
 */
export function SigninKeyCard({ signinKey, onDone, doneLabel = "I've saved it, continue", backup = false, username = "AI4Brain" }: {
  signinKey: string;
  onDone: () => void;
  doneLabel?: string;
  backup?: boolean;
  username?: string;
}) {
  const [copied, setCopied] = useState(false);
  const [stored, setStored] = useState<"idle" | "saved" | "failed">("idle");
  const [canStore, setCanStore] = useState(false);
  useEffect(() => setCanStore(typeof window !== "undefined" && "PasswordCredential" in window), []);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(signinKey);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };
  const text = `AI4Brain sign-in key\n\n${signinKey}\n\nUse it at /signin to open your Brain Twin on another browser or device.\nKeep it private: anyone with this key can open your profile.\n`;
  const download = () => {
    const blob = new Blob([text], { type: "text/plain" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "ai4brain-sign-in-key.txt";
    a.click();
    URL.revokeObjectURL(a.href);
  };
  const print = () => {
    const w = window.open("", "_blank", "width=480,height=360");
    if (!w) return;
    w.document.title = "AI4Brain sign-in key";
    const pre = w.document.createElement("pre");
    pre.style.cssText = "font: 16px/1.5 ui-monospace, monospace; white-space: pre-wrap; padding: 24px";
    pre.textContent = text;
    w.document.body.appendChild(pre);
    w.print();
    w.close();
  };
  const store = async () => {
    try {
      const Ctor = (window as unknown as { PasswordCredential: PasswordCredentialCtor }).PasswordCredential;
      await navigator.credentials.store(new Ctor({ id: username, password: signinKey, name: username }));
      setStored("saved");
    } catch {
      setStored("failed");
    }
  };

  return (
    <form onSubmit={(e) => { e.preventDefault(); onDone(); }} className="glass mx-auto max-w-lg space-y-4 rounded-2xl p-6 text-center">
      <h2 className="text-3xl">{backup ? "Your backup key" : "Your sign-in key"}</h2>
      <p className="text-sm text-slate-600 dark:text-slate-300">
        {backup
          ? "Your passkey is how you'll sign in. Keep this key somewhere safe for the day you lose every device: it opens your Brain Twin from anywhere."
          : "We never ask for an email or a password. This key is how you get back to your Brain Twin on another browser or device."}{" "}
        We only store a scrambled version, so <b>we can&apos;t show it again</b>.
      </p>
      {/* For password managers: they save this pair, and the sign-in form asks for the same one. */}
      <input type="text" name="username" autoComplete="username" value={username} readOnly className="sr-only" tabIndex={-1} aria-hidden />
      <input type="password" name="password" autoComplete="new-password" value={signinKey} readOnly className="sr-only" tabIndex={-1} aria-hidden />
      <p className="rounded-xl bg-slate-100 px-4 py-3 font-mono text-2xl tracking-widest select-all dark:bg-slate-800" aria-label="Your sign-in key">{signinKey}</p>
      <div className="flex flex-wrap justify-center gap-2">
        {canStore && (
          <button type="button" onClick={store} className="glass rounded-lg px-4 py-2 text-sm font-medium hover:border-brand">
            {stored === "saved" ? "Saved to password manager ✓" : "Save to password manager"}
          </button>
        )}
        <button type="button" onClick={download} className="glass rounded-lg px-4 py-2 text-sm font-medium hover:border-brand">Download</button>
        <button type="button" onClick={print} className="glass rounded-lg px-4 py-2 text-sm font-medium hover:border-brand">Print</button>
        <button type="button" onClick={copy} className="glass rounded-lg px-4 py-2 text-sm font-medium hover:border-brand">{copied ? "Copied ✓" : "Copy"}</button>
      </div>
      {stored === "failed" && <p role="alert" className="text-xs text-rose-600 dark:text-rose-400">Your browser didn&apos;t save it. Use Download or Print instead.</p>}
      <p className="text-xs text-slate-500">Keep it private: anyone with the key can open your profile. You can replace it any time in Settings.</p>
      <button type="submit" className="w-full rounded-xl bg-slate-900 py-3 font-medium text-white dark:bg-brand dark:text-slate-950">{doneLabel}</button>
    </form>
  );
}
