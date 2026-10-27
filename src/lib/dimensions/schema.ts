import { z } from "zod";

/** Task renderers implemented in the front end. A new dimension can reuse any of these with no code change. */
export const PARADIGMS = [
  "n_back",
  "stroop",
  "symbol_digit",
  "task_switching",
  "corsi",
  "matrices",
  "trust_machine",
] as const;

const id = z.string().regex(/^[a-z][a-z0-9_]*$/, "lower_snake_case id");
const params = z.record(z.string(), z.unknown());

const normalise = z.object({
  method: z.literal("linear"),
  min: z.number(),
  max: z.number(),
  invert: z.boolean().default(false),
}).refine((n) => n.max > n.min, "normalise.max must be > normalise.min");

const scoringComponent = z.object({
  metric: id,
  weight: z.number().positive().max(1),
  normalise,
});

const difficultyLevel = z.object({
  level: z.number().int().positive(),
  params,
  /**
   * Where a composite score of 0 and 1 at this level land on the 0..1 ability scale (a linear map,
   * fitted by scripts/validate.ts). Ends may lie outside 0..1: the observation is clamped afterwards.
   */
  ability_range: z.tuple([z.number().min(-2).max(3), z.number().min(-2).max(3)])
    .refine(([lo, hi]) => hi > lo, "ability_range must be [lo, hi] with hi > lo"),
  /** Offered in training only, never in assessment (e.g. a level whose extra cue makes it a weaker measure). */
  training_only: z.boolean().default(false),
});

const task = z.object({
  id,
  name: z.string().min(1),
  paradigm: z.enum(PARADIGMS),
  instructions: z.string().min(1),
  params,
  difficulty: z.object({
    target_success: z.number().gt(0).lt(1),
    levels: z.array(difficultyLevel).min(1)
      .refine((ls) => ls.every((l, i) => i === 0 || l.level > ls[i - 1].level), "levels must be strictly ascending"),
  }),
  scoring: z.object({
    components: z.array(scoringComponent).min(1)
      .refine((cs) => Math.abs(cs.reduce((s, c) => s + c.weight, 0) - 1) < 1e-6, "scoring weights must sum to 1"),
  }),
  validity: z.object({
    min_rt_ms: z.number().nonnegative(),
    max_rt_ms: z.number().positive(),
    min_valid_trials: z.number().int().positive(),
    chance_accuracy: z.number().min(0).max(1),
    /** How far above chance (in binomial SDs) accuracy must be. Lower for short blocks (low power). */
    chance_margin_z: z.number().nonnegative().default(1.645),
    max_same_response_streak: z.number().int().positive(),
  }),
});

export const dimensionSchema = z.object({
  id,
  name: z.string().min(1),
  version: z.number().int().positive(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  card: z.object({
    definition: z.string().min(1),
    what_it_is_not: z.string().min(1),
    design_note: z.string().optional(),
    citations: z.array(z.string()).min(1),
    biases: z.array(z.string()).min(1),
  }),
  tasks: z.array(task).min(1),
  profile: z.object({
    prior: z.object({ mean: z.number().min(0).max(1), sd: z.number().positive() }),
    uncertainty: z.object({
      model: z.literal("normal"),
      /** Observation noise for a block of `reference_trials` valid trials; scales with 1/sqrt(n). */
      obs_sd: z.number().positive(),
      reference_trials: z.number().int().positive(),
      invalid_block_sd_multiplier: z.number().min(1),
      /** Process noise: how much the true ability may drift per day (lets the twin track growth). */
      drift_sd_per_day: z.number().nonnegative().default(0.01),
    }),
    /**
     * Linear map from raw observation to the ability scale, fitted by scripts/validate.ts on
     * simulated users (to be refitted on real pilot data). Identity when absent.
     */
    calibration: z
      .object({ intercept: z.number(), slope: z.number().positive(), source: z.string() })
      .default({ intercept: 0, slope: 1, source: "uncalibrated" }),
  }),
});

export type Dimension = z.infer<typeof dimensionSchema>;
export type DimensionTask = Dimension["tasks"][number];
export type Paradigm = (typeof PARADIGMS)[number];
