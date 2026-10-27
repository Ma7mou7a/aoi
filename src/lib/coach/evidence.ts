import type { PaceForecast } from "../profiler/pace";
import type { Dimension } from "../dimensions/schema";
import { credibleInterval, type Posterior } from "../profiler";
import { whatItWouldTake } from "../scoring/counterfactual";
import type { TrialRecord } from "../scoring/types";

// The evidence pack is everything the coach may talk about, with short references
// (R1 = a block, T1 = a set of trials) that claims must cite. References are mapped back to
// database ids server-side, so the model never sees or invents raw ids.

export type RunRow = {
  id: string;
  dimensionId: string;
  taskId: string;
  difficultyLevel: number;
  metrics: Record<string, number> | null;
  composite: number | null;
  validity: { valid: boolean; flags: string[] } | null;
  affect?: { fatigue: string; frustration: string } | null;
  /** "How sure are you?" guess of the block score (0..1), if the user made one. */
  selfEstimate?: number | null;
  startedAt: Date;
};

export type TrialRow = {
  id: string;
  taskRunId: string;
  trialIndex: number;
  isPractice: boolean;
  stimulus: Record<string, unknown>;
  response: unknown;
  outcome: string;
  correct: boolean | null;
  rtMs: number | null;
  behaviour: { focusLost?: boolean } | null;
};

export type SkillEvidence = {
  id: string;
  name: string;
  measured: boolean;
  estimatePct: number;
  bandPct: [number, number];
  blocks: number;
  /** Change in estimate since the first measurement, in % points (null if < 2 snapshots). */
  changePct: number | null;
};

export type RunEvidence = {
  ref: string;
  runId: string;
  skill: string;
  task: string;
  level: number;
  when: string;
  blockScorePct: number | null;
  metrics: Record<string, string>;
  reliable: boolean;
  reliabilityNotes: string[];
  /** e.g. "fatigue high" (behaviour-only inference), empty when calm or not consented. */
  engagement: string[];
  /** The user's own guess of the block score before seeing it, in %, or null. */
  yourGuessPct: number | null;
};

export type TrialFact = { ref: string; runRef: string; label: string; count: number; trialIds: string[] };

/** An exact "what it would take" recalculation of one block (W#), derived from the user's own trials. */
export type WhatIf = { ref: string; runRef: string; label: string; fromPct: number; toPct: number };

/** "If you keep playing N games a week" forecast for one skill (see profiler/pace.ts); cite as P#. */
export type PaceRef = PaceForecast & { ref: string; skill: string; skillName: string; runRef: string };
export type EvidencePack = { skills: SkillEvidence[]; runs: RunEvidence[]; facts: TrialFact[]; whatIf: WhatIf[]; pace: PaceRef[] };

/** Counterfactuals are computed for the most recent blocks only, to keep the pack focused. */
const WHAT_IF_RUNS = 3;

const pct = (x: number) => Math.round(x * 100);

function fmtMetric(key: string, v: number): string {
  if (key.endsWith("_ms")) return `${Math.round(v)} ms`;
  if (key.endsWith("_ratio")) return `+${pct(v)}%`;
  if (key.endsWith("_rate") || key.endsWith("accuracy")) return `${pct(v)}%`;
  if (key === "d_prime") return v.toFixed(2);
  return String(Math.round(v * 100) / 100);
}

/** Facts worth pointing at for one block, grouped so a claim can cite them in one reference. */
function factsFor(paradigm: string, trials: TrialRow[]): Array<{ label: string; trials: TrialRow[] }> {
  const scored = trials.filter((t) => !t.isPractice);
  const by = (pred: (t: TrialRow) => boolean) => scored.filter(pred);
  const slowest = (ts: TrialRow[], n = 3) => [...ts].filter((t) => t.rtMs != null).sort((a, b) => b.rtMs! - a.rtMs!).slice(0, n);
  const facts: Array<{ label: string; trials: TrialRow[] }> = [];

  if (paradigm === "n_back") {
    const targets = by((t) => t.stimulus.isTarget === true);
    facts.push({ label: "matches you caught", trials: targets.filter((t) => t.response != null) });
    facts.push({ label: "matches you missed", trials: targets.filter((t) => t.response == null) });
    facts.push({ label: "presses on non-matching letters (false alarms)", trials: by((t) => t.stimulus.isTarget === false && t.response != null) });
    facts.push({ label: "your slowest correct matches", trials: slowest(targets.filter((t) => t.correct)) });
  } else if (paradigm === "stroop") {
    facts.push({ label: "errors when word and colour conflicted", trials: by((t) => t.stimulus.congruent === false && t.correct === false) });
    facts.push({ label: "errors when word and colour matched", trials: by((t) => t.stimulus.congruent === true && t.correct === false) });
    facts.push({ label: "your slowest answers on conflicting words", trials: slowest(by((t) => t.stimulus.congruent === false && !!t.correct)) });
    facts.push({ label: "answers that ran out of time", trials: by((t) => t.outcome === "timeout") });
  } else if (paradigm === "corsi") {
    const ok = by((t) => !!t.correct);
    const best = ok.length ? Math.max(...ok.map((t) => Number(t.stimulus.span))) : 0;
    facts.push({ label: `longest sequence recalled (${best} blocks)`, trials: ok.filter((t) => Number(t.stimulus.span) === best) });
    facts.push({ label: "sequences you didn't get right", trials: by((t) => t.correct === false) });
  } else if (paradigm === "symbol_digit") {
    facts.push({ label: "symbols coded correctly", trials: by((t) => !!t.correct) });
    facts.push({ label: "coding errors", trials: by((t) => t.correct === false) });
    facts.push({ label: "your slowest correct answers", trials: slowest(by((t) => !!t.correct)) });
  } else if (paradigm === "task_switching") {
    facts.push({ label: "errors right after a rule switch", trials: by((t) => t.stimulus.switch === true && t.correct === false) });
    facts.push({ label: "errors when the rule stayed the same", trials: by((t) => t.stimulus.switch === false && t.correct === false) });
    facts.push({ label: "your slowest answers after a switch", trials: slowest(by((t) => t.stimulus.switch === true && !!t.correct)) });
  } else if (paradigm === "trust_machine") {
    const disagreed = (t: TrialRow) => t.stimulus.initial != null && t.stimulus.initial !== t.stimulus.advice;
    facts.push({ label: "times you kept your right answer when the AI disagreed", trials: by((t) => disagreed(t) && t.stimulus.aiCorrect === false && !!t.correct) });
    facts.push({ label: "times you switched to a wrong AI suggestion", trials: by((t) => disagreed(t) && t.stimulus.aiCorrect === false && t.correct === false) });
    facts.push({ label: "times you switched to correct AI advice", trials: by((t) => disagreed(t) && t.stimulus.aiCorrect === true && !!t.correct) });
    facts.push({ label: "times you kept your answer when the AI was right", trials: by((t) => disagreed(t) && t.stimulus.aiCorrect === true && t.correct === false) });
    facts.push({ label: "times you went with the AI when it said it was very sure", trials: by((t) => disagreed(t) && t.stimulus.aiConfident === true && t.response === t.stimulus.advice) });
    facts.push({ label: "times you went with the AI when it said it was not sure", trials: by((t) => disagreed(t) && t.stimulus.aiConfident === false && t.response === t.stimulus.advice) });
  } else if (paradigm === "matrices") {
    facts.push({ label: "puzzles solved", trials: by((t) => !!t.correct) });
    facts.push({ label: "puzzles missed", trials: by((t) => t.correct === false) });
  } else {
    facts.push({ label: "errors", trials: by((t) => t.correct === false) });
  }
  facts.push({ label: "trials where the window lost focus", trials: by((t) => !!t.behaviour?.focusLost) });
  return facts.filter((f) => f.trials.length > 0);
}

export function buildEvidencePack(input: {
  dimensions: Dimension[];
  posteriors: Record<string, Posterior>;
  firstMeans: Record<string, number>;
  runs: RunRow[];
  trials: TrialRow[];
  /** Forecasts at a pace, per skill id; each is tied to that skill's latest block in the pack. */
  pace?: Array<PaceForecast & { skill: string }>;
}): EvidencePack {
  const dimById = new Map(input.dimensions.map((d) => [d.id, d]));

  const skills: SkillEvidence[] = input.dimensions.map((d) => {
    const p = input.posteriors[d.id];
    const [lo, hi] = credibleInterval(p);
    const first = input.firstMeans[d.id];
    return {
      id: d.id,
      name: d.name,
      measured: p.nObservations > 0,
      estimatePct: pct(p.mean),
      bandPct: [pct(lo), pct(hi)],
      blocks: p.nObservations,
      changePct: first != null && p.nObservations > 1 ? pct(p.mean) - pct(first) : null,
    };
  });

  const runs: RunEvidence[] = [];
  const facts: TrialFact[] = [];
  const whatIf: WhatIf[] = [];
  // Newest first, so R1 is the most recent block.
  const ordered = [...input.runs].sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime());
  ordered.forEach((r, i) => {
    const dim = dimById.get(r.dimensionId);
    const task = dim?.tasks.find((t) => t.id === r.taskId);
    if (!dim || !task) return;
    const ref = `R${i + 1}`;
    const metrics = Object.fromEntries(
      Object.entries(r.metrics ?? {})
        .filter(([k, v]) => Number.isFinite(v) && k !== "n_targets")
        .map(([k, v]) => [k, fmtMetric(k, v)]),
    );
    runs.push({
      ref,
      runId: r.id,
      skill: dim.name,
      task: task.name,
      level: r.difficultyLevel,
      when: r.startedAt.toISOString().slice(0, 16).replace("T", " "),
      blockScorePct: r.composite == null ? null : pct(r.composite),
      metrics,
      reliable: r.validity?.valid ?? true,
      reliabilityNotes: r.validity?.flags ?? [],
      yourGuessPct: r.selfEstimate == null ? null : pct(r.selfEstimate),
      engagement: [
        ...(r.affect && r.affect.fatigue !== "low" ? [`fatigue ${r.affect.fatigue}`] : []),
        ...(r.affect && r.affect.frustration !== "low" ? [`frustration ${r.affect.frustration}`] : []),
      ],
    });
    const runTrials = input.trials.filter((t) => t.taskRunId === r.id).sort((a, b) => a.trialIndex - b.trialIndex);
    if (i < WHAT_IF_RUNS) {
      const records: TrialRecord[] = runTrials.map((t) => ({ trialIndex: t.trialIndex, isPractice: t.isPractice, stimulus: t.stimulus, response: t.response, outcome: t.outcome as TrialRecord["outcome"], correct: t.correct, rtMs: t.rtMs }));
      for (const w of whatItWouldTake(task, records)) {
        whatIf.push({ ref: `W${whatIf.length + 1}`, runRef: ref, label: w.label, fromPct: pct(w.from), toPct: pct(w.to) });
      }
    }
    for (const f of factsFor(task.paradigm, runTrials)) {
      facts.push({ ref: `T${facts.length + 1}`, runRef: ref, label: f.label, count: f.trials.length, trialIds: f.trials.map((t) => t.id) });
    }
  });

  const pace: PaceRef[] = [];
  for (const f of input.pace ?? []) {
    const name = dimById.get(f.skill)?.name;
    const latest = runs.find((r) => r.skill === name);
    if (name && latest) pace.push({ ...f, ref: `P${pace.length + 1}`, skillName: name, runRef: latest.ref });
  }

  return { skills, runs, facts, whatIf, pace };
}

/** Compact text form of the pack for the model prompt (no database ids). */
export function packToPrompt(pack: EvidencePack): string {
  const skills = pack.skills
    .map((s) =>
      s.measured
        ? `- ${s.name}: estimate ${s.estimatePct}% (90% band ${s.bandPct[0]}–${s.bandPct[1]}%), ${s.blocks} block(s)` +
          (s.changePct != null ? `, change since first measurement ${s.changePct >= 0 ? "+" : ""}${s.changePct} points` : "")
        : `- ${s.name}: not measured yet`,
    )
    .join("\n");
  const runs = pack.runs
    .map(
      (r) =>
        `- ${r.ref}: ${r.skill}, ${r.task}, level ${r.level}, ${r.when} UTC, block score ${r.blockScorePct ?? "n/a"}%, ` +
        `${Object.entries(r.metrics).map(([k, v]) => `${k}=${v}`).join(", ")}` +
        (r.yourGuessPct != null ? `, the user's own guess before seeing it: ${r.yourGuessPct}%` : "") +
        (r.reliable ? "" : ` [LOW RELIABILITY: ${r.reliabilityNotes.join(", ")}]`) +
        (r.engagement.length ? ` [BEHAVIOUR SIGNALS (timing/errors only, a guess): ${r.engagement.join(", ")}]` : ""),
    )
    .join("\n");
  const facts = pack.facts.map((f) => `- ${f.ref} (in ${f.runRef}): ${f.count} ${f.label}`).join("\n");
  const whatIf = pack.whatIf.map((w) => `- ${w.ref} (for ${w.runRef}): ${w.label} would have made the block score ${w.toPct}% instead of ${w.fromPct}%`).join("\n");
  const pace = pack.pace
    .map((p) => `- ${p.ref} (for ${p.runRef}): ${p.skillName} at ${p.gamesPerWeek} games/week → ${p.toPct}% (likely ${p.lowPct}–${p.highPct}%) in 7 days, from ${p.fromPct}%`)
    .join("\n");
  return (
    `SKILLS\n${skills}\n\nBLOCKS (R1 = most recent)\n${runs || "- none yet"}\n\nTRIAL FACTS\n${facts || "- none yet"}` +
    `\n\nWHAT IT WOULD TAKE (exact recalculations with the real scoring; cite as W#)\n${whatIf || "- none"}` +
    (pace ? `\n\nIF YOU KEEP PLAYING (forecasts at a pace, cite as P#; say "if your recent trend continues", never certain)\n${pace}` : "")
  );
}
