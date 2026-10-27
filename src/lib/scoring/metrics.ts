import type { Paradigm } from "../dimensions/schema";
import type { Metrics, TrialRecord } from "./types";

// Every paradigm turns its trials into named metrics; YAML scoring components
// refer to these names. Missing/undefined metrics come back as NaN.

export function median(xs: number[]): number {
  if (!xs.length) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

const rate = (num: number, den: number) => (den ? num / den : NaN);

/** Inverse standard-normal CDF (Acklam's rational approximation, |error| < 1.2e-9). */
export function probit(p: number): number {
  const a = [-39.6968302866538, 220.946098424521, -275.928510446969, 138.357751867269, -30.6647980661472, 2.50662827745924];
  const b = [-54.4760987982241, 161.585836858041, -155.698979859887, 66.8013118877197, -13.2806815528857];
  const c = [-0.00778489400243029, -0.322396458041136, -2.40075827716184, -2.54973253934373, 4.37466414146497, 2.93816398269878];
  const d = [0.00778469570904146, 0.32246712907004, 2.445134137143, 3.75440866190742];
  const lo = 0.02425;
  if (p < lo) {
    const q = Math.sqrt(-2 * Math.log(p));
    return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  if (p > 1 - lo) return -probit(1 - p);
  const q = p - 0.5;
  const r = q * q;
  return ((((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q) / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
}

const scored = (trials: TrialRecord[]) => trials.filter((t) => !t.isPractice && t.outcome !== "abandoned");
const correctRts = (trials: TrialRecord[]) =>
  trials.filter((t) => t.correct && t.rtMs != null).map((t) => t.rtMs as number);

function basic(trials: TrialRecord[]): Metrics {
  const judged = trials.filter((t) => t.correct !== null);
  return {
    accuracy: rate(judged.filter((t) => t.correct).length, judged.length),
    median_rt_ms: median(correctRts(trials)),
  };
}

function nBack(trials: TrialRecord[]): Metrics {
  const targets = trials.filter((t) => t.stimulus.isTarget === true);
  const lures = trials.filter((t) => t.stimulus.isTarget === false);
  const pressed = (t: TrialRecord) => t.response != null;
  // An anticipation on a target is not a hit; on a lure it still counts as a false alarm.
  const hits = targets.filter((t) => pressed(t) && t.outcome !== "anticipation").length;
  const fas = lures.filter(pressed).length;
  // Log-linear correction (Hautus, 1995) keeps d' finite at 0% / 100%.
  const hitRateCorr = (hits + 0.5) / (targets.length + 1);
  const faRateCorr = (fas + 0.5) / (lures.length + 1);
  const hitRate = rate(hits, targets.length);
  const faRate = rate(fas, lures.length);
  return {
    hit_rate: hitRate,
    false_alarm_rate: faRate,
    d_prime: probit(hitRateCorr) - probit(faRateCorr),
    // Balanced accuracy: "never press" scores 0.5, i.e. chance.
    accuracy: (hitRate + (1 - faRate)) / 2,
    median_rt_ms: median(correctRts(targets)),
    n_targets: targets.length,
  };
}

function conflictCost(trials: TrialRecord[], key: string, prefix: "interference" | "switch"): Metrics {
  const hard = trials.filter((t) => t.stimulus[key] === (prefix === "interference" ? false : true));
  const easy = trials.filter((t) => t.stimulus[key] === (prefix === "interference" ? true : false));
  const err = (ts: TrialRecord[]) => rate(ts.filter((t) => t.correct === false).length, ts.filter((t) => t.correct !== null).length);
  const base = median(correctRts(easy));
  const cost = median(correctRts(hard)) - base;
  const out: Metrics = {
    ...basic(trials),
    [`${prefix}_cost_ms`]: cost,
    // Proportional cost (cost ÷ the person's own baseline RT): unaffected by overall response speed,
    // so slower but equally accurate people are not scored as worse at inhibition or switching.
    [prefix === "interference" ? "interference_ratio" : "switch_cost_ratio"]: base > 0 ? cost / base : NaN,
  };
  if (prefix === "interference") out.incongruent_accuracy = 1 - err(hard);
  else out.switch_cost_errors = err(hard) - err(easy);
  return out;
}

function symbolDigit(trials: TrialRecord[]): Metrics {
  const elapsedMs = trials.reduce((s, t) => s + (t.rtMs ?? 0), 0);
  const correct = trials.filter((t) => t.correct).length;
  return { ...basic(trials), correct_per_minute: elapsedMs ? (correct / elapsedMs) * 60_000 : NaN };
}

function corsi(trials: TrialRecord[]): Metrics {
  const ok = trials.filter((t) => t.correct);
  const spanOf = (t: TrialRecord) => Number(t.stimulus.span ?? 0);
  return {
    ...basic(trials),
    span: ok.length ? Math.max(...ok.map(spanOf)) : 0,
    total_score: ok.reduce((s, t) => s + spanOf(t), 0),
  };
}

/**
 * Appropriate reliance on AI advice (Schemmer et al., IUI 2023). Only trials where the helper DISAGREED
 * with the initial answer are informative:
 *   rsr  = share of (initial right, helper wrong) trials where the final answer stayed right,
 *   rair = share of (initial wrong, helper right) trials where the final answer switched to right.
 * Both use the log-linear correction (k + 0.5) / (n + 1), like d′, so 0/n and n/n stay finite.
 * appropriate_reliance = their mean: "always follow" and "always keep" both land at 0.5, chance level.
 */
function trustMachine(trials: TrialRecord[]): Metrics {
  const withInitial = trials.filter((t) => t.stimulus.initial != null && t.stimulus.aiCorrect != null);
  const initialRight = (t: TrialRecord) => t.stimulus.initial === t.expected;
  const selfCases = withInitial.filter((t) => initialRight(t) && t.stimulus.aiCorrect === false);
  const aiCases = withInitial.filter((t) => !initialRight(t) && t.stimulus.aiCorrect === true);
  const corrected = (ts: TrialRecord[]) => (ts.length ? (ts.filter((t) => t.correct).length + 0.5) / (ts.length + 1) : NaN);
  const rsr = corrected(selfCases);
  const rair = corrected(aiCases);
  const both = [rsr, rair].filter(Number.isFinite);
  // Confident-helper level: how much more often you went with the helper when it said it was very sure.
  const disagreed = withInitial.filter((t) => t.stimulus.initial !== t.stimulus.advice && typeof t.stimulus.aiConfident === "boolean");
  const followRate = (ts: TrialRecord[]) => rate(ts.filter((t) => t.response === t.stimulus.advice).length, ts.length);
  const confidenceUse = followRate(disagreed.filter((t) => t.stimulus.aiConfident)) - followRate(disagreed.filter((t) => !t.stimulus.aiConfident));
  return {
    confidence_use: confidenceUse,
    ...basic(trials),
    appropriate_reliance: both.length ? both.reduce((a, b) => a + b, 0) / both.length : NaN,
    relative_self_reliance: rsr,
    relative_ai_reliance: rair,
    initial_accuracy: rate(withInitial.filter(initialRight).length, withInitial.length),
    followed_advice_rate: rate(trials.filter((t) => t.response != null && t.response === t.stimulus.advice).length, trials.length),
    n_disagreements: selfCases.length + aiCases.length,
  };
}

const METRIC_FNS: Record<Paradigm, (trials: TrialRecord[]) => Metrics> = {
  n_back: nBack,
  stroop: (ts) => conflictCost(ts, "congruent", "interference"),
  task_switching: (ts) => conflictCost(ts, "switch", "switch"),
  symbol_digit: symbolDigit,
  corsi,
  matrices: basic,
  trust_machine: trustMachine,
};

/**
 * Metrics over the scored (non-practice, non-abandoned) trials. Responses faster than `minRtMs`
 * are anticipations: they are kept but always count as errors, so key-mashing can't earn points.
 */
export function computeMetrics(paradigm: Paradigm, trials: TrialRecord[], minRtMs = 0): Metrics {
  const usable = scored(trials).map((t) =>
    t.rtMs != null && t.rtMs < minRtMs ? { ...t, outcome: "anticipation" as const, correct: false } : t,
  );
  return METRIC_FNS[paradigm](usable);
}
