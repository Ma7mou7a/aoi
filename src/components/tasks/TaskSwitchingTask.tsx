"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { TrialRecord } from "@/lib/scoring/types";
import type { BlockSpec } from "@/lib/tasks/registry";
import { generateTaskSwitching, type Rule, type TaskSwitchingParams } from "@/lib/tasks/taskSwitching";
import { Kbd, ProgressBar, TaskIntro, useCountdown, stampOnFrame, useFocusLoss, pushTrial } from "./common";
import type { TaskFinish } from "./NBackTask";

type Phase = "intro" | "countdown" | "running" | "transition";
type Stage = "blank" | "cue" | "stimulus" | "feedback";

const BLANK_MS = 350;
const FEEDBACK_MS = 600;
const TRANSITION_MS = 1800;

/** The rule is carried by a label AND a frame style, never by colour alone. */
const RULE_UI: Record<Rule, { question: string; left: string; right: string; frame: string }> = {
  parity: { question: "Odd or even?", left: "Odd", right: "Even", frame: "border-solid" },
  magnitude: { question: "Smaller or larger than 5?", left: "Smaller", right: "Larger", frame: "border-double border-[6px]" },
};

/**
 * Number task switching: the frame/label says which rule applies to the digit. Switching rules costs
 * time and accuracy; that cost (vs repeating the rule) is the measure of flexibility.
 */
export function TaskSwitchingTask({ spec, onFinish }: { spec: BlockSpec; onFinish: TaskFinish }) {
  const p = spec.params as unknown as TaskSwitchingParams;
  const seq = useMemo(() => generateTaskSwitching(p, spec.seed), [p, spec.seed]);

  const [phase, setPhase] = useState<Phase>("intro");
  const [idx, setIdx] = useState(0);
  const [stage, setStage] = useState<Stage>("blank");
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
    setStage("blank");
    if (seq[idx].practice && !seq[next].practice) setPhase("transition");
  }, [idx, seq, finish]);

  const record = useCallback(
    (side: "left" | "right" | null) => {
      if (answered.current) return;
      answered.current = true;
      const s = seq[idx];
      const rt = side == null ? null : performance.now() - onset.current;
      const correct = side === s.expected;
      pushTrial(records.current, {
        trialIndex: idx,
        isPractice: s.practice,
        stimulus: { digit: s.digit, rule: s.rule, switch: s.switch },
        expected: s.expected,
        response: side,
        outcome: side == null ? "timeout" : rt! < spec.task.validity.min_rt_ms ? "anticipation" : "response",
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

  useEffect(() => {
    if (phase === "transition") {
      const t = setTimeout(() => setPhase("running"), TRANSITION_MS);
      return () => clearTimeout(t);
    }
    if (phase !== "running") return;
    if (stage === "blank") {
      const t = setTimeout(() => setStage(p.cue_lead_ms > 0 ? "cue" : "stimulus"), BLANK_MS);
      return () => clearTimeout(t);
    }
    if (stage === "cue") {
      const t = setTimeout(() => setStage("stimulus"), p.cue_lead_ms);
      return () => clearTimeout(t);
    }
    if (stage === "stimulus") {
      answered.current = false;
      focusLost.current = false;
      onset.current = performance.now();
      stampOnFrame(onset);
      shownAt.current = new Date().toISOString();
      const t = setTimeout(() => record(null), p.max_response_ms);
      return () => clearTimeout(t);
    }
    const t = setTimeout(advance, FEEDBACK_MS);
    return () => clearTimeout(t);
  }, [phase, stage, p.cue_lead_ms, p.max_response_ms, record, advance]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (phase === "running" && e.code === "Escape") return finish("abandoned");
      if (phase !== "running" || stage !== "stimulus") return;
      if (e.code === "KeyF") record("left");
      if (e.code === "KeyJ") record("right");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase, stage, record, finish]);

  if (phase === "intro") {
    return (
      <TaskIntro spec={spec} title="Number task switching" meta={`${p.practice_trials} practice + ${p.trials_per_block} trials · Esc to stop`} onStart={() => setPhase("countdown")}>
        <p>A number appears in a frame. The frame tells you the rule:</p>
        <div className="mt-3 grid gap-2 text-left text-base sm:grid-cols-2">
          {(["parity", "magnitude"] as const).map((r) => (
            <div key={r} className={`rounded-xl border-4 border-slate-400 p-3 ${RULE_UI[r].frame}`}>
              <b>{RULE_UI[r].question}</b>
              <p className="text-sm"><Kbd>F</Kbd> {RULE_UI[r].left} · <Kbd>J</Kbd> {RULE_UI[r].right}</p>
            </div>
          ))}
        </div>
        <p className="mt-3">The rule can change at any time. Be fast but accurate.</p>
      </TaskIntro>
    );
  }

  const s = seq[idx];
  const ui = RULE_UI[s.rule];
  const showCue = phase === "running" && (stage === "cue" || stage === "stimulus" || stage === "feedback");
  const scoredDone = Math.max(0, idx - p.practice_trials);
  return (
    <div className="mx-auto flex max-w-xl flex-col items-center gap-6 select-none">
      <ProgressBar value={s.practice ? 0 : scoredDone / p.trials_per_block} color={spec.dimension.color} />
      <p className="h-5 text-sm text-slate-500">{phase === "running" && s.practice ? "Practice" : ""}</p>
      <div className={`flex h-52 w-full max-w-sm flex-col items-center justify-center gap-2 rounded-3xl border-4 ${showCue ? `border-slate-500 ${ui.frame}` : "border-transparent"}`} aria-live="polite">
        {phase === "countdown" && <span className="text-5xl text-slate-400">{count || ""}</span>}
        {phase === "transition" && <span className="text-xl font-semibold text-slate-500">Practice done. Now for real!</span>}
        {showCue && <span className="text-lg font-semibold">{ui.question}</span>}
        {phase === "running" && stage === "stimulus" && <span className="text-7xl font-bold">{s.digit}</span>}
        {phase === "running" && stage === "feedback" && (
          <span className={`text-2xl ${lastCorrect ? "text-emerald-500" : "text-rose-500"}`}>{lastCorrect ? "Correct" : `It was ${s.expected === "left" ? ui.left : ui.right}`}</span>
        )}
      </div>
      <div className="grid w-full max-w-sm grid-cols-2 gap-3">
        {(["left", "right"] as const).map((side) => (
          <button key={side} onPointerDown={() => phase === "running" && stage === "stimulus" && record(side)}
            className="rounded-2xl border-2 border-slate-300 py-4 text-lg font-semibold active:scale-95 dark:border-slate-700">
            {showCue ? (side === "left" ? ui.left : ui.right) : "·"} <span className="ml-1 font-mono text-xs text-slate-500">{side === "left" ? "F" : "J"}</span>
          </button>
        ))}
      </div>
      <button onClick={() => finish("abandoned")} className="text-sm text-slate-500 underline-offset-4 hover:underline">Stop this block</button>
    </div>
  );
}
