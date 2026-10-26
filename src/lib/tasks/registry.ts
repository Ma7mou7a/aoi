import type { Paradigm } from "../dimensions/schema";

/** Paradigms with a working renderer. The selector only schedules these. */
export const AVAILABLE_PARADIGMS: readonly Paradigm[] = ["n_back"];

/** What the client needs to run one block (sent by the API, no server-only config). */
export type BlockSpec = {
  dimension: { id: string; name: string; color: string };
  task: { id: string; name: string; paradigm: Paradigm; instructions: string; params: Record<string, unknown>; validity: { min_rt_ms: number } };
  level: number;
  /** task.params merged with the level's params. */
  params: Record<string, unknown>;
  seed: number;
  reason: { rule: string; expectedSdReduction: number; note: string };
};
