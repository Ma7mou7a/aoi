"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { TrialRecord } from "@/lib/scoring/types";
import type { BlockSpec } from "@/lib/tasks/registry";
import { generateStroop, INK, type StroopParams } from "@/lib/tasks/stroop";
import { Kbd, ProgressBar, TaskIntro, useCountdown, stampOnFrame, useFocusLoss } from "./common";
import type { TaskFinish } from "./NBackTask";

type Phase = "intro" | "countdown" | "running" | "transition";
type Stage = "fixation" | "stimulus" | "feedback";

const FIXATION_MS = 400;
const FEEDBACK_MS = 500;
const TRANSITION_MS = 1800;

/**
 * Colour-word Stroop. Fixation cross, then the word until a response or the level's deadline.
 * Practice trials give right/wrong feedback; scored trials do not.
 */
export function StroopTask({ spec, onFinish }: { spec: BlockSpec; onFinish: TaskFinish }) {
  const p = spec.params as unknown as StroopParams;
  const deadline = p.deadline_ms ?? p.max_response_ms;
  const seq = useMemo(() => generateStroop(p, spec.seed), [p, spec.seed]);
  const keyToColour = useMemo(() => Object.fromEntries(Object.entries(p.keys).map(([c, k]) => [k.toLowerCase(), c])), [p.keys]);

  const [phase, setPhase] = useState<Phase>("intro");
  const [idx, setIdx] = useState(0);
  const [stage, setStage] = useState<Stage>("fixation");
  const [lastCorrect, setLastCorrect] = useState<boolean | null>(null);

  const startedAt = useRef("");
  const onset = useRef(0);
  const shownAt = useRef("");
  const answered = useRef(false);
  const focusLost = useRef(false);
  const records = useRef<TrialRecord[]>([]);
  const finished = useRef(false);

  const finish = useCallback(
    (status: "completed" | "abandoned") => {
      if (finished.current) return;
      finished.current = true;
      onFinish({ trials: records.current, status, startedAt: startedAt.current || new Date().toISOString() });
    },
    [onFinish],
  );

  const begin = useCallback(() => {
    startedAt.current = new Date().toISOString();
    setPhase("running");
  }, []);
  const count = useCountdown(phase === "countdown", begin);
  useFocusLoss(useCallback(() => (focusLost.current = true), []));

  const advance = useCallback(() => {
    const next = idx + 1;
    if (next >= seq.length) return finish("completed");
    setIdx(next);
    setStage("fixation");
    if (seq[idx].practice && !seq[next].practice) setPhase("transition");
  }, [idx, seq, finish]);

  const record = useCallback(
    (response: string | null) => {
      if (answered.current) return;
      answered.current = true;
      const s = seq[idx];
      const rt = response == null ? null : performance.now() - onset.current;
      const correct = response === s.ink;
      records.current.push({
        trialIndex: idx,
        isPractice: s.practice,
        stimulus: { word: s.word, ink: s.ink, congruent: s.congruent },
        expected: s.ink,
        response,
        outcome: response == null ? "timeout" : rt! < spec.task.validity.min_rt_ms ? "anticipation" : "response",
        correct,
        rtMs: rt == null ? null : Math.round(rt),
        behaviour: focusLost.current ? { focusLost: true } : undefined,
        shownAt: shownAt.current,
      });
      if (s.practice) {
        setLastCorrect(correct);
        setStage("feedback");
      } else advance();
    },
    [idx, seq, spec.task.validity.min_rt_ms, advance],
  );

  // Per-trial timeline.
  useEffect(() => {
    if (phase === "transition") {
      const t = setTimeout(() => setPhase("running"), TRANSITION_MS);
      return () => clearTimeout(t);
    }
    if (phase !== "running") return;
    if (stage === "fixation") {
      const t = setTimeout(() => {
        answered.current = false;
        focusLost.current = false;
        onset.current = performance.now();
        shownAt.current = new Date().toISOString();
        setStage("stimulus");
        stampOnFrame(onset);
      }, FIXATION_MS);
      return () => clearTimeout(t);
    }
    if (stage === "stimulus") {
      const t = setTimeout(() => record(null), deadline);
      return () => clearTimeout(t);
    }
    const t = setTimeout(advance, FEEDBACK_MS);
    return () => clearTimeout(t);
  }, [phase, stage, deadline, record, advance]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (phase === "running" && e.code === "Escape") return finish("abandoned");
      const colour = keyToColour[e.key.toLowerCase()];
      if (colour && phase === "running" && stage === "stimulus") record(colour);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase, stage, keyToColour, record, finish]);

  if (phase === "intro") {
    return (
      <TaskIntro
        spec={spec}
        title="Colour-word Stroop"
        meta={`${p.practice_trials} practice + ${p.trials_per_block} trials · about ${Math.round((seq.length * 1.3) / 10) * 10} s · Esc to stop`}
        onStart={() => setPhase("countdown")}
      >
        <p>
          Press the key for the <b>ink colour</b>, not the word. If <span className="font-bold" style={{ color: INK.blue }}>RED</span> appears,
          the answer is <b>blue</b>. Be fast but accurate.
        </p>
        <div className="mt-4 flex justify-center gap-3 text-base">
          {p.colours.map((c) => (
            <span key={c} className="flex items-center gap-1.5">
              <span className="h-3 w-3 rounded-full" style={{ background: INK[c] }} /> {c} <Kbd>{p.keys[c].toUpperCase()}</Kbd>
            </span>
          ))}
        </div>
      </TaskIntro>
    );
  }

  const s = seq[idx];
  const scoredDone = Math.max(0, idx - p.practice_trials);
  return (
    <div className="mx-auto flex max-w-xl flex-col items-center gap-8 select-none">
      <ProgressBar value={s.practice ? 0 : scoredDone / p.trials_per_block} color={spec.dimension.color} />
      <p className="h-5 text-sm text-slate-500">{phase === "running" && s.practice ? "Practice" : ""}</p>
      <div className="flex h-48 items-center justify-center text-7xl font-extrabold tracking-wide" aria-live="polite">
        {phase === "countdown" && <span className="text-slate-400">{count || ""}</span>}
        {phase === "transition" && <span className="text-2xl font-semibold text-slate-500">Practice done. Now for real!</span>}
        {phase === "running" && stage === "fixation" && <span className="text-slate-400">+</span>}
        {phase === "running" && stage === "stimulus" && <span style={{ color: INK[s.ink] }}>{s.word.toUpperCase()}</span>}
        {phase === "running" && stage === "feedback" && (
          <span className={`text-3xl ${lastCorrect ? "text-emerald-500" : "text-rose-500"}`}>{lastCorrect ? "Correct" : `It was ${s.ink}`}</span>
        )}
      </div>
      <div className="grid w-full max-w-md grid-cols-4 gap-2">
        {p.colours.map((c) => (
          <button
            key={c}
            onPointerDown={() => phase === "running" && stage === "stimulus" && record(c)}
            className="flex flex-col items-center gap-1 rounded-xl border-2 border-slate-200 py-3 active:scale-95 dark:border-slate-700"
          >
            <span className="h-4 w-4 rounded-full" style={{ background: INK[c] }} />
            <span className="text-sm">{c}</span>
            <span className="font-mono text-xs text-slate-500">{p.keys[c].toUpperCase()}</span>
          </button>
        ))}
      </div>
      <button onClick={() => finish("abandoned")} className="text-sm text-slate-500 underline-offset-4 hover:underline">
        Stop this block
      </button>
    </div>
  );
}
