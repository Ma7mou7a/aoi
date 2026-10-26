/** One trial as recorded by a task renderer (mirrors the `trials` table). */
export type TrialRecord = {
  trialIndex: number;
  isPractice?: boolean;
  stimulus: Record<string, unknown>;
  expected?: unknown;
  /** null/undefined = no response in the window. */
  response?: unknown;
  outcome: "response" | "no_response" | "timeout" | "anticipation" | "abandoned";
  correct: boolean | null;
  rtMs: number | null;
  behaviour?: { hesitationMs?: number; focusLost?: boolean; changedAnswer?: boolean; pointerDistancePx?: number };
  shownAt?: string;
};

export type Metrics = Record<string, number>;

export type ValidityFlag =
  | "too_few_trials"
  | "near_chance"
  | "response_streak"
  | "many_anticipations"
  | "many_timeouts"
  | "focus_lost";

export type Validity = { valid: boolean; validTrials: number; flags: ValidityFlag[] };

export type ComponentScore = { metric: string; raw: number; normalised: number; weight: number; contribution: number };

export type BlockScore = {
  metrics: Metrics;
  validity: Validity;
  /** Per-component breakdown, shown to the user and the coach (explainability). */
  components: ComponentScore[];
  composite: number;
  /** Composite mapped into the difficulty level's ability range, before calibration. */
  rawObservation: number;
  /** Calibrated observation on the 0..1 ability scale (what the profiler uses). */
  observation: number;
  observationSd: number;
  /** True when the composite hit the floor or ceiling of the level, so the observation is less informative. */
  censored: boolean;
};
