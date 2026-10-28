"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { SecurityOverview } from "@/lib/server/security";
import { addPasskey, passkeysSupported } from "@/lib/passkeyClient";
import { LocalTime } from "./LocalTime";

const METHOD: Record<string, string> = { signup: "created here", key: "sign-in key", passkey: "passkey", device_link: "code from another device", dev: "developer link" };
const FIELD_WORDS: Record<string, string> = {
  "users.display_name": "your name",
  "users.coach_memory": "what Bao remembers about you",
  "coach_messages.content": "your questions and Bao's answers",
  "trials.behaviour": "behaviour signals (timing, focus)",
  "task_runs.affect": "tiredness and frustration guesses",
};

type Link = { url: string; code: string; expiresAt: string; qrSvg: string };

async function call(url: string, method: string, body?: unknown) {
  const res = await fetch(url, { method, headers: body ? { "content-type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error ?? "Something went wrong. Please try again.");
  return json;
}

/** Settings → Security & privacy: encryption, devices, another-device sign-in, passkeys, activity, display. */
export function SecuritySection({ initial, highContrast }: { initial: SecurityOverview; highContrast: boolean }) {
  const router = useRouter();
  const [data, setData] = useState(initial);
  const [link, setLink] = useState<Link | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [contrast, setContrast] = useState(highContrast);
  const [canPasskey, setCanPasskey] = useState(false);

  useEffect(() => setCanPasskey(passkeysSupported()), []);
  useEffect(() => {
    if (!link) return;
    const tick = () => {
      const left = Math.max(0, Math.round((new Date(link.expiresAt).getTime() - Date.now()) / 1000));
      setSecondsLeft(left);
      if (!left) setLink(null);
    };
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [link]);

  async function run(action: () => Promise<unknown>, done?: string) {
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      await action();
      setData(await call("/api/me/security", "GET"));
      if (done) setNote(done);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const signOutDevice = (id: string, current: boolean) =>
    run(async () => {
      if (current && !confirm("Sign out of this browser? You can come back with your sign-in key or a passkey.")) return;
      await call(`/api/me/devices/${id}`, "DELETE");
      if (current) {
        router.push("/");
        router.refresh();
      }
    }, "Signed out.");

  const signOutAll = (scope: "others" | "all") =>
    run(async () => {
      const msg = scope === "all" ? "Sign out on every device, including this one?" : "Sign out on every other device? This one stays signed in.";
      if (!confirm(msg)) return;
      await call("/api/me/devices/signout", "POST", { scope });
      if (scope === "all") {
        router.push("/");
        router.refresh();
      }
    }, scope === "others" ? "Every other device is signed out." : undefined);

  async function changeContrast(on: boolean) {
    setContrast(on);
    try {
      await call("/api/me", "PATCH", { highContrast: on });
      router.refresh();
    } catch (e) {
      setContrast(!on);
      setError((e as Error).message);
    }
  }

  const enc = data.encryption;

  return (
    <section className="space-y-6" aria-labelledby="security-heading">
      <h2 id="security-heading" className="text-3xl">Security &amp; privacy</h2>

      <div className="glass space-y-2 rounded-2xl p-4">
        <p className="font-semibold">🔒 Encryption: on</p>
        <p className="text-sm text-slate-600 dark:text-slate-300">
          These are stored encrypted with a key that belongs to your profile alone: {enc.encryptedFields.map((f) => FIELD_WORDS[f] ?? f).join(", ")}.
          Deleting your profile destroys that key, so even old backups can no longer be read ({enc.algorithm}).
        </p>
        <p className="text-sm text-slate-600 dark:text-slate-300">
          Game scores and response times are not encrypted: the app needs them to work out your profile, and they don&apos;t say who you are.
        </p>
        {enc.developmentKey && (
          <p className="text-sm font-medium text-amber-700 dark:text-amber-300">This server runs with the public development key (fine for a demo, not for real use).</p>
        )}
      </div>

      <div className="space-y-3">
        <h3 className="text-lg font-semibold">Signed-in devices</h3>
        <ul className="space-y-2">
          {data.devices.map((d) => (
            <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 p-3 dark:border-slate-800">
              <span>
                <span className="font-medium">{d.deviceLabel}</span>
                {d.current && <span className="ml-2 rounded-full bg-brand px-2 py-0.5 text-xs font-semibold text-white dark:text-slate-950">this device</span>}
                <span className="block text-sm text-slate-600 dark:text-slate-400">
                  Signed in with {METHOD[d.method] ?? d.method} · last active <LocalTime at={d.lastSeenAt} />
                </span>
              </span>
              <button type="button" disabled={busy} onClick={() => signOutDevice(d.id, d.current)} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm hover:border-brand disabled:opacity-50 dark:border-slate-700">
                Sign out
              </button>
            </li>
          ))}
        </ul>
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={busy || data.devices.length < 2} onClick={() => signOutAll("others")} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm hover:border-brand disabled:opacity-50 dark:border-slate-700">
            Sign out all other devices
          </button>
          <button type="button" disabled={busy} onClick={() => signOutAll("all")} className="rounded-lg border border-rose-400 px-3 py-1.5 text-sm text-rose-700 hover:bg-rose-50 disabled:opacity-50 dark:text-rose-300 dark:hover:bg-rose-950">
            Sign out everywhere
          </button>
        </div>
        <p className="text-xs text-slate-600 dark:text-slate-400">Devices sign out by themselves after 30 days without use, and 90 days after signing in.</p>
      </div>

      <div className="space-y-3">
        <h3 className="text-lg font-semibold">Sign in on another device</h3>
        {link ? (
          <div className="flex flex-wrap items-center gap-4 rounded-xl border border-slate-200 p-4 dark:border-slate-800">
            {/* Server-generated SVG of our own link: no user input inside. */}
            <div className="h-44 w-44 shrink-0 rounded-lg bg-white p-1" dangerouslySetInnerHTML={{ __html: link.qrSvg }} />
            <div className="space-y-2 text-sm">
              <p>Scan this with the camera of your other device, or open <b>/signin</b> there and type this code:</p>
              <p className="font-mono text-2xl tracking-widest">{link.code}</p>
              <p className="text-slate-600 dark:text-slate-400">Works once, for {Math.floor(secondsLeft / 60)}:{String(secondsLeft % 60).padStart(2, "0")} more. Only show it to your own devices: anyone with it can open your profile.</p>
              <button type="button" onClick={() => setLink(null)} className="rounded-lg border border-slate-300 px-3 py-1.5 dark:border-slate-700">Hide</button>
            </div>
          </div>
        ) : (
          <button type="button" disabled={busy} onClick={() => run(async () => setLink(await call("/api/me/devices/link", "POST", {})))} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-brand dark:text-slate-950">
            Show a QR code for my phone
          </button>
        )}
      </div>

      <div className="space-y-3">
        <h3 className="text-lg font-semibold">Passkeys</h3>
        <p className="text-sm text-slate-600 dark:text-slate-300">
          Optional: sign in with your fingerprint, face or device PIN instead of typing your key. The secret part never leaves your device, and a passkey can&apos;t be used on a fake copy of this site.
        </p>
        {data.passkeys.length > 0 && (
          <ul className="space-y-2">
            {data.passkeys.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 p-3 dark:border-slate-800">
                <span>
                  <span className="font-medium">{p.label}</span>
                  <span className="block text-sm text-slate-600 dark:text-slate-400">
                    Added <LocalTime at={p.createdAt} options={{ dateStyle: "medium" }} />
                    {p.lastUsedAt ? <> · last used <LocalTime at={p.lastUsedAt} options={{ dateStyle: "medium" }} /></> : " · not used yet"}
                    {p.backedUp ? " · synced by your device" : ""}
                  </span>
                </span>
                <button type="button" disabled={busy} onClick={() => confirm(`Remove "${p.label}"? It will stop working here.`) && run(() => call(`/api/passkeys/${p.id}`, "DELETE"), "Passkey removed.")} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm hover:border-brand disabled:opacity-50 dark:border-slate-700">
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
        {canPasskey ? (
          <button type="button" disabled={busy} onClick={() => run(() => addPasskey(), "Passkey added. Next time, choose “Sign in with a passkey”.")} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-brand dark:text-slate-950">
            Add a passkey on this device
          </button>
        ) : (
          <p className="text-sm text-slate-600 dark:text-slate-400">This browser doesn&apos;t support passkeys. Your sign-in key works everywhere.</p>
        )}
      </div>

      <div className="space-y-3">
        <h3 className="text-lg font-semibold">Recent security activity</h3>
        <p className="text-sm text-slate-600 dark:text-slate-300">
          {data.logCheck.ok ? `✓ The security log is intact (${data.logCheck.checked} entries checked). ` : "⚠ The security log failed its integrity check. "}
          Each entry is sealed to the one before it, so any later change or deletion would show up here.
        </p>
        <ul className="text-sm">
          {data.activity.map((e) => (
            <li key={e.seq} className="border-t border-slate-100 py-1.5 dark:border-slate-800">
              <LocalTime at={e.at} />: {e.label}
            </li>
          ))}
        </ul>
      </div>

      <div className="space-y-3">
        <h3 className="text-lg font-semibold">Display</h3>
        <label className="flex gap-3 rounded-xl border border-slate-200 p-3 dark:border-slate-800">
          <input type="checkbox" aria-label="High contrast" className="mt-1 h-4 w-4" checked={contrast} onChange={(e) => changeContrast(e.target.checked)} />
          <span>
            <span className="font-medium">High contrast</span>
            <span className="block text-sm text-slate-600 dark:text-slate-400">Pure black and white, stronger text and borders, underlined links and a thick focus outline. Saved with your profile, so it follows you to every device.</span>
          </span>
        </label>
      </div>

      {note && <p role="status" className="text-sm text-emerald-700 dark:text-emerald-300">{note}</p>}
      {error && <p role="alert" className="text-sm text-rose-700 dark:text-rose-300">{error}</p>}
    </section>
  );
}
