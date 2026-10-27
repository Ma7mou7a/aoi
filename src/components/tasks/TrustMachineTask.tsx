"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { TrialRecord } from "@/lib/scoring/types";
import type { BlockSpec } from "@/lib/tasks/registry";
import { adviceFor, adviceSeed, generateTrustMachine, type Side, type TrustParams } from "@/lib/tasks/trustMachine";
import { Kbd, ProgressBar, TaskIntro, useCountdown, stampOnFrame, useFocusLoss } from "./common";
import type { TaskFinish } from "./NBackTask";

type Phase = "intro" | "countdown" | "running" | "transition";
type Stage = "blank" | "question" | "advice" | "feedback";

const BLANK_MS = 350;
const FEEDBACK_MS = 1600;
const TRANSITION_MS = 1800;

const total = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const label = (s: Side) => (s === "left" ? "left" : "right");

/**
 * "Second opinion" (two-stage judge–advisor task). Answer which total is larger, then see the AI helper's
 * answer and decide. Pressing nothing after the advice keeps your first answer.
 */
export function TrustMachineTask({ spec, onFinish }: { spec: BlockSpec; onFinish: TaskFinish }) {
  const p = spec.params as unknown as TrustParams;
  const items = useMemo(() => generateTrustMachine(p, spec.seed), [p, spec.seed]);

  const [phase, setPhase] = useState<Phase>("intro");
  const [idx, setIdx] = useState(0);
  const [stage, setStage] = useState<Stage>("blank");
  const [initial, setInitial] = useState<Side | null>(null);
  const [advice, setAdvice] = useState<{ advice: Side; aiCorrect: boolean; confident: boolean } | null>(null);
  const [lastCorrect, setLastCorrect] = useState<boolean | null>(null);

  const startedAt = useRef("");
  const onset = useRef(0);
  const adviceOnset = useRef(0);
  const shownAt = useRef("");
  const initialRt = useRef<number | null>(null);
  const done = useRef(false);
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
    if (next >= items.length) return finish("completed");
    setIdx(next);
    setStage("blank");
    if (items[idx].practice && !items[next].practice) setPhase("transition");
  }, [idx, items, finish]);

  /** First answer (or null on timeout): reveal the helper's advice. */
  const answerFirst = useCallback(
    (side: Side | null) => {
      if (stage !== "question") return;
      initialRt.current = side == null ? null : Math.round(performance.now() - onset.current);
      setInitial(side);
      setAdvice(adviceFor(items[idx], side, p, adviceSeed(spec.seed, idx)));
      setStage("advice");
    },
    [stage, items, idx, p, spec.seed],
  );

  /** Final answer; `null` = no key pressed in time, which keeps the first answer. */
  const answerFinal = useCallback(
    (side: Side | null) => {
      if (stage !== "advice" || done.current || !advice) return;
      done.current = true;
      const it = items[idx];
      const final = side ?? initial;
      const rt = side == null ? null : Math.round(performance.now() - adviceOnset.current);
      const correct = final === it.answer;
      records.current.push({
        trialIndex: idx,
        isPractice: it.practice,
        stimulus: { left: it.left, right: it.right, gap: it.gap, initial, initialRtMs: initialRt.current, advice: advice.advice, aiCorrect: advice.aiCorrect, ...(p.show_confidence ? { aiConfident: advice.confident } : {}) },
        expected: it.answer,
        response: final,
        outcome: final == null ? "timeout" : rt != null && rt < spec.task.validity.min_rt_ms ? "anticipation" : "response",
        correct: final == null ? false : correct,
        rtMs: rt,
        behaviour: focusLost.current ? { focusLost: true } : undefined,
        shownAt: shownAt.current,
      });
      if (it.practice) {
        setLastCorrect(correct);
        setStage("feedback");
      } else advance();
    },
    [stage, advice, items, idx, initial, p.show_confidence, spec.task.validity.min_rt_ms, advance],
  );

  useEffect(() => {
    if (phase === "transition") {
      const t = setTimeout(() => setPhase("running"), TRANSITION_MS);
      return () => clearTimeout(t);
    }
    if (phase !== "running") return;
    if (stage === "blank") {
      const t = setTimeout(() => setStage("question"), BLANK_MS);
      return () => clearTimeout(t);
    }
    if (stage === "question") {
      done.current = false;
      focusLost.current = false;
      setInitial(null);
      setAdvice(null);
      onset.current = performance.now();
      stampOnFrame(onset);
      shownAt.current = new Date().toISOString();
      const t = setTimeout(() => answerFirst(null), p.max_response_ms);
      return () => clearTimeout(t);
    }
    if (stage === "advice") {
      adviceOnset.current = performance.now();
      stampOnFrame(adviceOnset);
      const t = setTimeout(() => answerFinal(null), p.final_response_ms);
      return () => clearTimeout(t);
    }
    const t = setTimeout(advance, FEEDBACK_MS);
    return () => clearTimeout(t);
    // answerFirst/answerFinal change with stage; the timers only need restarting when the stage changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, stage, idx]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (phase === "running" && e.code === "Escape") return finish("abandoned");
      if (phase !== "running") return;
      const side: Side | null = e.code === "KeyF" ? "left" : e.code === "KeyJ" ? "right" : null;
      if (!side) return;
      if (stage === "question") answerFirst(side);
      else if (stage === "advice") answerFinal(side);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase, stage, answerFirst, answerFinal, finish]);

  if (phase === "intro") {
    return (
      <TaskIntro spec={spec} title="Second opinion" meta={`${p.practice_trials} practice + ${p.trials_per_block} trials · about 2 min · Esc to stop`} onStart={() => setPhase("countdown")}>
        <p>Two sums appear. Press <Kbd>F</Kbd> if the <b>left</b> total is larger, <Kbd>J</Kbd> if the <b>right</b> one is. Be quick: you won&apos;t have time to add everything up.</p>
        <p className="mt-3">Then an <b>AI helper</b> gives its answer. Press <Kbd>F</Kbd> or <Kbd>J</Kbd> for your final choice, or press nothing to keep your first answer.</p>
        <p className="mt-3 text-base">The helper is right most of the time but <b>sometimes wrong on purpose</b>. Follow it when it&apos;s right, keep your answer when it&apos;s wrong.</p>
        {p.show_confidence && (
          <p className="mt-3 text-base">At this level the helper also tells you <b>how sure it is</b>, and it&apos;s honest: when it says <i>very sure</i> it&apos;s usually right; when it says <i>not sure</i>, check its answer.</p>
        )}
      </TaskIntro>
    );
  }

  const it = items[idx];
  const running = phase === "running" && (stage === "question" || stage === "advice" || stage === "feedback");
  const scoredDone = Math.max(0, idx - p.practice_trials);
  const sideBox = (side: Side) => {
    const nums = side === "left" ? it.left : it.right;
    const mine = stage !== "question" && initial === side;
    const ai = stage !== "question" && advice?.advice === side;
    return (
      <button key={side} onPointerDown={() => (stage === "question" ? answerFirst(side) : stage === "advice" ? answerFinal(side) : undefined)}
        className={`relative flex min-h-36 flex-col items-center justify-center gap-2 rounded-3xl border-4 p-3 transition active:scale-95 ${ai ? "border-brand" : "border-slate-300 dark:border-slate-700"}`}>
        {running && <span className="font-mono text-2xl font-semibold sm:text-3xl">{nums.join(" + ")}</span>}
        {stage === "feedback" && <span className="text-sm text-slate-500">= {total(nums)}</span>}
        <span className="font-mono text-xs text-slate-500">{side === "left" ? "F" : "J"}</span>
        <span className="absolute -top-3 flex gap-1">
          {mine && <span className="rounded-full bg-slate-900 px-2 py-0.5 text-xs text-white dark:bg-slate-100 dark:text-slate-900">your answer</span>}
          {ai && (
            <span className="rounded-full bg-brand px-2 py-0.5 text-xs text-white dark:text-slate-950">
              AI helper{p.show_confidence && advice ? (advice.confident ? " · very sure" : " · not sure") : ""}
            </span>
          )}
        </span>
      </button>
    );
  };

  return (
    <div className="mx-auto flex max-w-2xl flex-col items-center gap-5 select-none">
      <ProgressBar value={it.practice ? 0 : scoredDone / p.trials_per_block} color={spec.dimension.color} />
      <p className="h-5 text-sm text-slate-500">{phase === "running" && it.practice ? "Practice" : ""}</p>
      {phase === "countdown" && <span className="text-5xl text-slate-400">{count || ""}</span>}
      {phase === "transition" && <span className="text-xl font-semibold text-slate-500">Practice done. Now for real!</span>}
      {running && (
        <>
          <p className="text-lg font-semibold" aria-live="polite">
            {stage === "question" && "Which total is larger?"}
            {stage === "advice" && (advice?.advice === initial
              ? "The AI helper agrees with you. Final answer?"
              : initial == null
                ? `Time's up. The AI helper says the ${label(advice!.advice)} total is larger. Final answer?`
                : `The AI helper${p.show_confidence ? (advice!.confident ? " is very sure and" : " is not sure, but") : ""} says the ${label(advice!.advice)} total is larger. Keep yours or switch?`)}
            {stage === "feedback" && (
              <span className={lastCorrect ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}>
                {lastCorrect ? "Right!" : "Not quite."} The {label(it.answer)} total is larger. The helper was {advice?.aiCorrect ? "right" : "wrong"} this time.
              </span>
            )}
          </p>
          <div className="grid w-full grid-cols-2 gap-3">{(["left", "right"] as const).map(sideBox)}</div>
          {stage === "advice" && <p className="text-sm text-slate-500">Press nothing to keep your first answer.</p>}
        </>
      )}
      <button onClick={() => finish("abandoned")} className="text-sm text-slate-500 underline-offset-4 hover:underline">Stop this block</button>
    </div>
  );
}
