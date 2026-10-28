"use client";

import { useState } from "react";
import { DeleteMyData } from "./DeleteMyData";
import { LocalTime } from "./LocalTime";

type Editable = "behavioural_signals" | "llm_coaching" | "planted_flaws" | "microphone";
type HistoryRow = { kind: string; granted: boolean; policyVersion: string; at: string };

const CONSENTS: Array<{ kind: Editable; title: string; text: string }> = [
  {
    kind: "llm_coaching",
    title: "AI coaching",
    text: "A summary of your results (never your name) is sent to an AI model (Claude by Anthropic, or an open model on Groq) so Bao can answer in his own words. Off: Bao uses his built-in replies instead.",
  },
  {
    kind: "behavioural_signals",
    title: "Behaviour signals",
    text: "Timing, errors and the window losing focus, used to judge how reliable a block was and to gently suggest a break when you seem tired. Never from a camera or microphone. Off: they are dropped before storage.",
  },
  {
    kind: "microphone",
    title: "Voice questions to the coach",
    text: "Lets you ask the coach by voice. Your browser turns speech into text (it may use its own online service); you review the text before sending. AI4Brain stores no audio and decides nothing from your voice. Listening to the coach needs no permission.",
  },
  {
    kind: "planted_flaws",
    title: "Spot-the-error mode",
    text: "Only in Research mode (below): some coach debriefs will contain one deliberate number mistake for you to catch. It is always revealed right after you answer. Trains (and measures) critical checking of AI.",
  },
];

const RETENTION = [30, 90, 180, 365];

export function SettingsForm({ initial, retentionDays, history, researchMode }: { initial: Record<string, boolean>; retentionDays: number; history: HistoryRow[]; researchMode: boolean }) {
  const [state, setState] = useState(initial);
  const [rows, setRows] = useState(history);
  const [retention, setRetention] = useState(retentionDays);
  const [saved, setSaved] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [research, setResearch] = useState(researchMode);

  async function changeResearch(on: boolean) {
    setResearch(on);
    setError(null);
    const res = await fetch("/api/me", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ researchMode: on }) });
    if (res.ok) setSaved("Saved");
    else {
      setResearch(!on);
      setError("Couldn't save Research mode. Please try again.");
    }
  }

  async function toggle(kind: Editable, granted: boolean) {
    setState({ ...state, [kind]: granted });
    const res = await fetch("/api/consents", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ kind, granted }) });
    if (res.ok) {
      const json = await res.json();
      setState(json.current);
      setRows(json.history);
      setSaved("Saved");
    } else setState(state);
  }

  async function changeRetention(days: number) {
    if (days < retention && !confirm(`Anything older than ${days} days will be deleted now. Continue?`)) return;
    const res = await fetch("/api/me", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ retentionDays: days }) });
    if (res.ok) {
      setRetention(days);
      setSaved("Saved");
    }
  }

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">What you allow</h2>
        <div className="flex gap-3 rounded-xl border border-slate-200 p-3 opacity-80 dark:border-slate-800">
          <input type="checkbox" aria-label="Store my task results (required)" checked disabled className="mt-1 h-4 w-4" />
          <span>
            <span className="font-medium">Store my task results</span> <span className="text-xs text-slate-500">required to use the app</span>
            <span className="block text-sm text-slate-600 dark:text-slate-400">To withdraw this, delete all your data below.</span>
          </span>
        </div>
        {CONSENTS.map((c) => (
          <label key={c.kind} className="flex gap-3 rounded-xl border border-slate-200 p-3 dark:border-slate-800">
            <input type="checkbox" aria-label={c.title} className="mt-1 h-4 w-4" checked={!!state[c.kind]} onChange={(e) => toggle(c.kind, e.target.checked)} />
            <span>
              <span className="font-medium">{c.title}</span>
              <span className="block text-sm text-slate-600 dark:text-slate-400">{c.text}</span>
            </span>
          </label>
        ))}
        <div className="flex gap-3 rounded-xl border border-dashed border-slate-200 p-3 text-sm text-slate-500 dark:border-slate-800">
          <span>📷🎙️</span>
          <span><b>Camera: never used. Microphone: only if you turn on voice questions above.</b> Profiling is fully non-biometric: no score or decision is ever based on your face or voice.</span>
        </div>
        {saved && <p className="text-sm text-emerald-600">{saved}</p>}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Research mode</h2>
        <label className="flex gap-3 rounded-xl border border-slate-200 p-3 dark:border-slate-800">
          <input type="checkbox" aria-label="Research mode" className="mt-1 h-4 w-4" checked={research} onChange={(e) => changeResearch(e.target.checked)} />
          <span>
            <span className="font-medium">Research mode</span>
            <span className="block text-sm text-slate-600 dark:text-slate-400">
              Shows rating buttons on each coach claim and lets the coach hide a deliberate mistake for you to spot (needs the spot-the-error consent). Used to measure how people check AI.
            </span>
          </span>
        </label>
        {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">How long we keep your data</h2>
        <div className="flex flex-wrap gap-2">
          {RETENTION.map((d) => (
            <button
              key={d}
              onClick={() => changeRetention(d)}
              aria-pressed={retention === d}
              className={`rounded-lg border px-3 py-1.5 text-sm ${retention === d ? "border-slate-900 bg-slate-900 text-white dark:border-brand dark:bg-brand dark:text-slate-900" : "border-slate-300 dark:border-slate-700"}`}
            >
              {d} days
            </button>
          ))}
        </div>
        <p className="text-sm text-slate-500">Older results, coach messages and history are deleted automatically.</p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Your data</h2>
        <a href="/api/me/export" className="inline-block rounded-lg border border-slate-300 px-3 py-1.5 text-sm dark:border-slate-700">Download all my data (JSON)</a>
        <div><DeleteMyData /></div>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Consent history</h2>
        <p className="text-sm text-slate-500">Every change is kept as a record (with the policy version you agreed to).</p>
        <ul className="text-sm">
          {rows.map((r, i) => (
            <li key={i} className="border-t border-slate-100 py-1 dark:border-slate-800">
              <LocalTime at={r.at} />: <b>{r.kind.replaceAll("_", " ")}</b> {r.granted ? "granted" : "not granted"} <span className="text-xs text-slate-400">(policy {r.policyVersion})</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
