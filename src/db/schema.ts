import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  real,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

// Dimension and task ids are plain text, not foreign keys: they come from
// dimensions/*.yaml so a new dimension needs no migration.

const id = () => uuid("id").primaryKey().defaultRandom();
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const userRef = () => uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" });

// ── Users & ethics ───────────────────────────────────────────────────────────

export const users = pgTable("users", {
  id: id(),
  displayName: text("display_name").notNull(),
  locale: text("locale").notNull().default("en"),
  /** Data older than this is purged by the retention job. */
  retentionDays: integer("retention_days").notNull().default(180),
  preferences: jsonb("preferences").$type<{ highContrast?: boolean; coachTone?: "warm" | "direct" }>().notNull().default({}),
  /** SHA-256 of the user's sign-in key (the key itself is shown once and never stored). Null = no key yet. */
  signinKeyHash: text("signin_key_hash").unique(),
  createdAt: createdAt(),
  lastActiveAt: timestamp("last_active_at", { withTimezone: true }).notNull().defaultNow(),
});

export const consentKind = pgEnum("consent_kind", [
  "data_processing", // required to use the app
  "behavioural_signals", // hesitation, focus loss, response streaks
  "llm_coaching", // sending profile summaries to the LLM provider
  "planted_flaws", // opt-in critical-verification mode
  "camera", // optional, off by default; never the sole basis of a decision
  "microphone",
  "research_export", // anonymised export for validation
]);

/** Append-only: the latest row per (user, kind) is the current state, older rows are the audit trail. */
export const consents = pgTable("consents", {
  id: id(),
  userId: userRef(),
  kind: consentKind("kind").notNull(),
  granted: boolean("granted").notNull(),
  policyVersion: text("policy_version").notNull(),
  createdAt: createdAt(),
}, (t) => [index("consents_user_kind_idx").on(t.userId, t.kind, t.createdAt)]);

/** Proof that a one-click delete happened, with no personal data left behind. */
export const deletionLog = pgTable("deletion_log", {
  id: id(),
  userHash: text("user_hash").notNull(),
  reason: text("reason").notNull(), // "user_request" | "retention_expired"
  rowsDeleted: jsonb("rows_deleted").$type<Record<string, number>>().notNull(),
  createdAt: createdAt(),
});

// ── Assessment: sessions → task runs (blocks) → trials ──────────────────────

export const sessionMode = pgEnum("session_mode", ["assessment", "training"]);
export const runStatus = pgEnum("run_status", ["active", "completed", "abandoned"]);

export const sessions = pgTable("sessions", {
  id: id(),
  userId: userRef(),
  mode: sessionMode("mode").notNull(),
  status: runStatus("status").notNull().default("active"),
  /** Non-biometric is the default and the only mode that needs no extra consent. */
  biometric: boolean("biometric").notNull().default(false),
  device: jsonb("device").$type<{ type: "desktop" | "tablet" | "phone"; input: "keyboard" | "mouse" | "touch"; screen: [number, number] }>(),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  endedAt: timestamp("ended_at", { withTimezone: true }),
}, (t) => [index("sessions_user_idx").on(t.userId, t.startedAt)]);

export type BlockValidity = {
  valid: boolean;
  validTrials: number;
  flags: Array<"too_few_trials" | "near_chance" | "response_streak" | "many_anticipations" | "many_timeouts" | "focus_lost">;
};

/** One block of one task at one difficulty level; produces one observation for the profiler. */
export const taskRuns = pgTable("task_runs", {
  id: id(),
  sessionId: uuid("session_id").notNull().references(() => sessions.id, { onDelete: "cascade" }),
  userId: userRef(),
  dimensionId: text("dimension_id").notNull(),
  taskId: text("task_id").notNull(),
  configVersion: integer("config_version").notNull(),
  difficultyLevel: integer("difficulty_level").notNull(),
  /** Fully resolved params incl. RNG seed, so a block can be replayed exactly. */
  params: jsonb("params").$type<Record<string, unknown>>().notNull(),
  /** Why the adaptive selector chose this block (expected uncertainty reduction etc.), shown to the user. */
  selectionReason: jsonb("selection_reason").$type<{ rule: string; expectedSdReduction?: number; note?: string }>(),
  status: runStatus("status").notNull().default("active"),
  metrics: jsonb("metrics").$type<Record<string, number>>(),
  composite: real("composite"), // 0..1, weighted per scoring.components
  observation: real("observation"), // composite mapped into the level's ability_range
  observationSd: real("observation_sd"),
  validity: jsonb("validity").$type<BlockValidity>(),
  /** Behaviour-only fatigue/frustration inference (src/lib/affect); only with behavioural_signals consent. */
  affect: jsonb("affect").$type<{ fatigue: string; frustration: string; cues: string[]; suggestion: string | null; easeOff: boolean }>(),
  /** "How sure are you?": the user's guess of this block's score before seeing it (0..1); null = skipped. */
  selfEstimate: real("self_estimate"),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  endedAt: timestamp("ended_at", { withTimezone: true }),
}, (t) => [
  index("task_runs_user_dim_idx").on(t.userId, t.dimensionId, t.startedAt),
  index("task_runs_session_idx").on(t.sessionId),
]);

export const trialOutcome = pgEnum("trial_outcome", ["response", "no_response", "timeout", "anticipation", "abandoned"]);

export const trials = pgTable("trials", {
  id: id(),
  taskRunId: uuid("task_run_id").notNull().references(() => taskRuns.id, { onDelete: "cascade" }),
  userId: userRef(),
  trialIndex: integer("trial_index").notNull(),
  isPractice: boolean("is_practice").notNull().default(false),
  stimulus: jsonb("stimulus").$type<Record<string, unknown>>().notNull(),
  expected: jsonb("expected").$type<unknown>(),
  response: jsonb("response").$type<unknown>(),
  outcome: trialOutcome("outcome").notNull(),
  correct: boolean("correct"),
  rtMs: integer("rt_ms"),
  /** Behaviour signals (only stored with behavioural_signals consent). */
  behaviour: jsonb("behaviour").$type<{ hesitationMs?: number; focusLost?: boolean; changedAnswer?: boolean; pointerDistancePx?: number }>(),
  shownAt: timestamp("shown_at", { withTimezone: true }).notNull(),
}, (t) => [
  uniqueIndex("trials_run_index_uq").on(t.taskRunId, t.trialIndex),
  index("trials_user_idx").on(t.userId),
]);

// ── Brain Twin: historised profile + projections ────────────────────────────

export const snapshotTrigger = pgEnum("snapshot_trigger", ["prior", "task_run", "session_end", "time_decay"]);

/** Posterior per dimension after each update. Never updated in place: this table IS the history. */
export const profileSnapshots = pgTable("profile_snapshots", {
  id: id(),
  userId: userRef(),
  dimensionId: text("dimension_id").notNull(),
  sessionId: uuid("session_id").references(() => sessions.id, { onDelete: "set null" }),
  taskRunId: uuid("task_run_id").references(() => taskRuns.id, { onDelete: "set null" }),
  trigger: snapshotTrigger("trigger").notNull(),
  mean: real("mean").notNull(), // 0..1, shown as %
  sd: real("sd").notNull(),
  ciLow: real("ci_low").notNull(), // 90% credible interval
  ciHigh: real("ci_high").notNull(),
  nObservations: integer("n_observations").notNull(),
  nTrials: integer("n_trials").notNull(),
  createdAt: createdAt(),
}, (t) => [index("snapshots_user_dim_time_idx").on(t.userId, t.dimensionId, t.createdAt)]);

/** Forward-looking estimates; always stored and shown with a band, never as a single number. */
export const projections = pgTable("projections", {
  id: id(),
  userId: userRef(),
  dimensionId: text("dimension_id").notNull(),
  model: text("model").notNull(), // e.g. "power_law_v1"
  horizonDays: integer("horizon_days").notNull(),
  mean: real("mean").notNull(),
  ciLow: real("ci_low").notNull(),
  ciHigh: real("ci_high").notNull(),
  fittedOnSnapshots: integer("fitted_on_snapshots").notNull(),
  createdAt: createdAt(),
}, (t) => [index("projections_user_dim_idx").on(t.userId, t.dimensionId, t.createdAt)]);

// ── Coach & AI collaboration ────────────────────────────────────────────────

export const messageRole = pgEnum("message_role", ["user", "coach", "system"]);

export type CoachClaim = {
  claim: string;
  why: string;
  evidenceTaskRunIds: string[];
  evidenceTrialIds: string[];
  /** Human-readable label per cited reference, e.g. "6 matches you caught". */
  evidenceLabels: string[];
  /** Published findings cited alongside (absent on messages from before science cards). */
  science?: Array<{ id: string; title: string; finding: string; citation: string; url: string }>;
};

export type CoachMeta = {
  source: "llm" | "rules";
  /** Why the rule-based coach was used instead of the LLM (no consent, API error, ...). */
  fallbackReason?: string;
  dropped?: Array<{ text: string; reason: "no_valid_evidence" | "clinical_language" | "unverified_number"; numbers?: number[] }>;
  /** The user's verdict per claim index. */
  feedback?: Record<string, "looks_right" | "something_off">;
  /** Claim indexes whose evidence the user opened. */
  opened?: number[];
  /** Self-prediction made before this debrief, and what actually happened. */
  prediction?: { guess: "better" | "same" | "worse" | "skip"; actual?: "better" | "same" | "worse" };
  /** S# references the model cited that were not in the science pack. */
  unknownScience?: string[];
};

export type PlantedFlawRecord = {
  claimIndex: number;
  description: string;
  /** The correct "why" text, restored once the flaw is revealed. */
  original: string;
  /** undefined until the user responds (or moves on); then revealed to them. */
  caught?: boolean;
};

export const coachMessages = pgTable("coach_messages", {
  id: id(),
  userId: userRef(),
  sessionId: uuid("session_id").references(() => sessions.id, { onDelete: "set null" }),
  role: messageRole("role").notNull(),
  content: text("content").notNull(),
  nextStep: text("next_step"),
  claims: jsonb("claims").$type<CoachClaim[]>().notNull().default([]),
  meta: jsonb("meta").$type<CoachMeta>(),
  /** Set only in planted-flaw mode: which claim is deliberately wrong and how. */
  plantedFlaw: jsonb("planted_flaw").$type<PlantedFlawRecord>(),
  /** Clinical terms removed by the safety filter, kept for auditing the filter. */
  filteredTerms: jsonb("filtered_terms").$type<string[]>().notNull().default([]),
  model: text("model"),
  createdAt: createdAt(),
}, (t) => [index("coach_messages_user_idx").on(t.userId, t.createdAt)]);

export const collabComponent = pgEnum("collab_component", [
  "clarification", // 20%
  "critical_verification", // 25%
  "iteration", // 20%
  "autonomy", // 20%
  "responsible_use", // 15%
]);

/** Raw signals feeding the AI Collaboration Score; see SIGNALS in src/lib/collab/score.ts. */
export const collabEvents = pgTable("collab_events", {
  id: id(),
  userId: userRef(),
  coachMessageId: uuid("coach_message_id").references(() => coachMessages.id, { onDelete: "set null" }),
  component: collabComponent("component").notNull(),
  signal: text("signal").notNull(),
  value: real("value").notNull(), // 0..1 signal value before aggregation
  details: jsonb("details").$type<Record<string, unknown>>(),
  createdAt: createdAt(),
}, (t) => [index("collab_events_user_idx").on(t.userId, t.createdAt)]);

export const collabScores = pgTable("collab_scores", {
  id: id(),
  userId: userRef(),
  score: integer("score").notNull(), // 0..100
  components: jsonb("components").$type<Record<(typeof collabComponent.enumValues)[number], number>>().notNull(),
  weights: jsonb("weights").$type<Record<(typeof collabComponent.enumValues)[number], number>>().notNull(),
  formulaVersion: text("formula_version").notNull(),
  nEvents: integer("n_events").notNull(),
  windowStart: timestamp("window_start", { withTimezone: true }).notNull(),
  createdAt: createdAt(),
}, (t) => [index("collab_scores_user_idx").on(t.userId, t.createdAt)]);

// ── Adaptive learning: plans & goals ────────────────────────────────────────

export const planStatus = pgEnum("plan_status", ["active", "superseded", "completed"]);

export const plans = pgTable("plans", {
  id: id(),
  userId: userRef(),
  weekStart: date("week_start").notNull(),
  status: planStatus("status").notNull().default("active"),
  rationale: text("rationale").notNull(),
  /** The profile snapshots this plan was generated from, so every plan is traceable. */
  basedOnSnapshotIds: jsonb("based_on_snapshot_ids").$type<string[]>().notNull().default([]),
  createdAt: createdAt(),
}, (t) => [index("plans_user_idx").on(t.userId, t.weekStart)]);

export const planItems = pgTable("plan_items", {
  id: id(),
  planId: uuid("plan_id").notNull().references(() => plans.id, { onDelete: "cascade" }),
  dimensionId: text("dimension_id").notNull(),
  taskId: text("task_id").notNull(),
  targetLevel: integer("target_level").notNull(),
  sessionsTarget: integer("sessions_target").notNull(),
  sessionsDone: integer("sessions_done").notNull().default(0),
  reason: text("reason").notNull(),
});

export const goalKind = pgEnum("goal_kind", ["reach_score", "reach_level", "consistency"]);
export const goalStatus = pgEnum("goal_status", ["active", "achieved", "expired", "dropped"]);

export const goals = pgTable("goals", {
  id: id(),
  userId: userRef(),
  dimensionId: text("dimension_id"), // null = cross-dimension goal (e.g. consistency)
  kind: goalKind("kind").notNull(),
  title: text("title").notNull(),
  targetValue: real("target_value").notNull(),
  currentValue: real("current_value").notNull().default(0),
  deadline: date("deadline"),
  status: goalStatus("status").notNull().default("active"),
  createdAt: createdAt(),
  achievedAt: timestamp("achieved_at", { withTimezone: true }),
}, (t) => [index("goals_user_idx").on(t.userId, t.status)]);
