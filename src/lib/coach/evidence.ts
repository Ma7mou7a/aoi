import type { Dimension } from "../dimensions/schema";
import { credibleInterval, type Posterior } from "../profiler";

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
};

export type TrialFact = { ref: string; runRef: string; label: string; count: number; trialIds: string[] };

export type EvidencePack = { skills: SkillEvidence[]; runs: RunEvidence[]; facts: TrialFact[] };

const pct = (x: number) => Math.round(x * 100);

function fmtMetric(key: string, v: number): string {
  if (key.endsWith("_ms")) return `${Math.round(v)} ms`;
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
    });
    const runTrials = input.trials.filter((t) => t.taskRunId === r.id).sort((a, b) => a.trialIndex - b.trialIndex);
    for (const f of factsFor(task.paradigm, runTrials)) {
      facts.push({ ref: `T${facts.length + 1}`, runRef: ref, label: f.label, count: f.trials.length, trialIds: f.trials.map((t) => t.id) });
    }
  });

  return { skills, runs, facts };
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
        (r.reliable ? "" : ` [LOW RELIABILITY: ${r.reliabilityNotes.join(", ")}]`),
    )
    .join("\n");
  const facts = pack.facts.map((f) => `- ${f.ref} (in ${f.runRef}): ${f.count} ${f.label}`).join("\n");
  return `SKILLS\n${skills}\n\nBLOCKS (R1 = most recent)\n${runs || "- none yet"}\n\nTRIAL FACTS\n${facts || "- none yet"}`;
}
