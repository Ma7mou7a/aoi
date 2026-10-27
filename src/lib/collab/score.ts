/**
 * AI Collaboration Score (0–100): how effectively the user works with the AI coach.
 *
 *   score = round(100 · Σ_c w_c · s_c)
 *   s_c   = (Σ v_i + m·k) / (n_c + k)      (Bayesian-smoothed mean of the component's signal values)
 *
 * Each interaction emits signals with a value v ∈ [0, 1]. Each component starts at the neutral prior
 * m = 0.5 with strength k = 2 pseudo-events, so a few interactions can't swing the score to 0 or 100.
 * Weights follow the challenge brief's proposal (a design proposal, not a validated instrument).
 * Full documentation: docs/collaboration-score.md.
 */

export const FORMULA_VERSION = "collab-v1";

export const COMPONENTS = ["clarification", "critical_verification", "iteration", "autonomy", "responsible_use"] as const;
export type Component = (typeof COMPONENTS)[number];

export const WEIGHTS: Record<Component, number> = {
  clarification: 0.2,
  critical_verification: 0.25,
  iteration: 0.2,
  autonomy: 0.2,
  responsible_use: 0.15,
};

export const PRIOR = { mean: 0.5, strength: 2 };

export const COMPONENT_INFO: Record<Component, { name: string; measures: string; improve: string }> = {
  clarification: {
    name: "Clarification",
    measures: "Asking the coach to explain, especially about a specific result.",
    improve: "Ask why a result came out the way it did, or what a number means.",
  },
  critical_verification: {
    name: "Critical verification",
    measures: "Checking the coach's claims against the evidence instead of accepting them blindly.",
    improve: "Open “See the evidence” before marking a claim as right, and flag anything that doesn't match.",
  },
  iteration: {
    name: "Iteration",
    measures: "Building on the coach's answers: follow-up questions and acting on suggestions.",
    improve: "Ask a follow-up, or play the block the coach suggested.",
  },
  autonomy: {
    name: "Autonomy",
    measures: "Thinking for yourself first: predicting how a session went before asking the AI.",
    improve: "Make a prediction before each debrief instead of skipping.",
  },
  responsible_use: {
    name: "Responsible use",
    measures: "Using the AI within its limits and staying in control of your data.",
    improve: "Keep questions about learning (not health), and review your data settings now and then.",
  },
};

/** Every signal the app can emit, with its component and value. Single source of truth for code, UI and docs. */
export const SIGNALS = {
  asked_question: { component: "clarification", value: 0.7, label: "Asked the coach a question" },
  asked_specific_question: { component: "clarification", value: 1.0, label: "Asked about a specific result or why" },

  opened_evidence: { component: "critical_verification", value: 0.8, label: "Opened the evidence behind a claim" },
  verified_then_accepted: { component: "critical_verification", value: 1.0, label: "Checked the evidence, then confirmed a claim" },
  accepted_unchecked: { component: "critical_verification", value: 0.3, label: "Confirmed a claim without checking the evidence" },
  caught_planted_flaw: { component: "critical_verification", value: 1.0, label: "Spotted a deliberate error" },
  missed_planted_flaw: { component: "critical_verification", value: 0.0, label: "Missed a deliberate error" },
  flagged_correct_claim: { component: "critical_verification", value: 0.4, label: "Flagged a claim that was actually correct" },
  // Second-opinion game, one graded event per block (value = the block's rate, not this default).
  trust_kept_right_answer: { component: "critical_verification", value: 0.5, label: "Second opinion: kept your right answer when the AI was wrong" },

  follow_up_question: { component: "iteration", value: 1.0, label: "Asked a follow-up question" },
  acted_on_advice: { component: "iteration", value: 1.0, label: "Started a session after the coach's suggestion" },

  prediction_correct: { component: "autonomy", value: 1.0, label: "Predicted how a session went, correctly" },
  prediction_wrong: { component: "autonomy", value: 0.6, label: "Predicted how a session went (not quite right)" },
  prediction_skipped: { component: "autonomy", value: 0.2, label: "Skipped the self-prediction" },

  in_scope_question: { component: "responsible_use", value: 1.0, label: "Asked a question within the coach's scope" },
  clinical_question: { component: "responsible_use", value: 0.3, label: "Asked the coach a health question it can't answer" },
  reviewed_data_settings: { component: "responsible_use", value: 1.0, label: "Reviewed privacy and data settings" },
  trust_used_right_help: { component: "responsible_use", value: 0.5, label: "Second opinion: switched to the AI when it was right" },
} as const satisfies Record<string, { component: Component; value: number; label: string }>;

export type Signal = keyof typeof SIGNALS;

export type ComponentScore = { score: number; n: number; contribution: number };
export type CollabScore = {
  score: number;
  components: Record<Component, ComponentScore>;
  weights: Record<Component, number>;
  formulaVersion: string;
  nEvents: number;
};

/**
 * Second-opinion game → collaboration events. One graded event per kind and block (the block's
 * relative self-reliance / relative AI reliance), so a game block counts like one coach interaction
 * instead of flooding the score with per-trial events. Needs ≥ 2 cases of that kind in the block.
 */
export function trustSignals(metrics: Record<string, number>, cases: { self: number; ai: number }): Array<{ signal: Signal; value: number }> {
  const out: Array<{ signal: Signal; value: number }> = [];
  if (cases.self >= 2 && Number.isFinite(metrics.relative_self_reliance)) out.push({ signal: "trust_kept_right_answer", value: metrics.relative_self_reliance });
  if (cases.ai >= 2 && Number.isFinite(metrics.relative_ai_reliance)) out.push({ signal: "trust_used_right_help", value: metrics.relative_ai_reliance });
  return out;
}

export function computeCollabScore(events: Array<{ component: Component; value: number }>): CollabScore {
  const components = {} as Record<Component, ComponentScore>;
  let total = 0;
  for (const c of COMPONENTS) {
    const vs = events.filter((e) => e.component === c).map((e) => Math.min(1, Math.max(0, e.value)));
    const score = (vs.reduce((a, b) => a + b, 0) + PRIOR.mean * PRIOR.strength) / (vs.length + PRIOR.strength);
    const contribution = WEIGHTS[c] * score;
    components[c] = { score, n: vs.length, contribution };
    total += contribution;
  }
  return { score: Math.round(100 * total), components, weights: WEIGHTS, formulaVersion: FORMULA_VERSION, nEvents: events.length };
}

/** "Why did my score drop?" → specific; "hi" → generic. Used to grade clarification questions. */
export function isSpecificQuestion(q: string): boolean {
  return /\b(why|how|what does|what is|explain|mean|which)\b|\d|%|\b(level|score|band|block|trial|match|error|n-back|stroop|corsi|memory|attention|speed|reasoning|flexib)/i.test(q);
}

export type Prediction = "better" | "same" | "worse";

/** Compare the latest estimate with the previous one: ±2 points counts as "about the same". */
export function actualDirection(previous: number, latest: number): Prediction {
  const d = latest - previous;
  return d > 0.02 ? "better" : d < -0.02 ? "worse" : "same";
}
