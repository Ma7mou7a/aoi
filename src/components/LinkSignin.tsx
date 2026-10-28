"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { clearFirstGame } from "@/lib/firstGame";

/**
 * Reads the one-time token from the URL fragment (never sent to the server by the browser), removes it
 * from the address bar and history, then exchanges it for a session on this device.
 */
export function LinkSignin() {
  const router = useRouter();
  const [state, setState] = useState<"working" | "error">("working");
  const [message, setMessage] = useState("");
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const token = window.location.hash.slice(1);
    history.replaceState(null, "", window.location.pathname);
    if (!token) {
      setState("error");
      setMessage("This link has no code in it. Scan the QR code again.");
      return;
    }
    clearFirstGame(sessionStorage);
    void fetch("/api/signin/link", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token }) }).then(async (res) => {
      if (res.ok) {
        router.replace("/");
        router.refresh();
      } else {
        setState("error");
        setMessage((await res.json().catch(() => ({}))).error ?? "This link didn't work.");
      }
    });
  }, [router]);

  return (
    <div className="glass mx-auto max-w-md space-y-3 rounded-2xl p-6" aria-live="polite">
      {state === "working" ? (
        <p>One moment…</p>
      ) : (
        <>
          <p role="alert">{message}</p>
          <p className="text-sm text-slate-500">
            Make a new code in Settings on your other device, or <Link href="/signin" className="font-semibold text-brand hover:underline">sign in with your key</Link>.
          </p>
        </>
      )}
    </div>
  );
}
