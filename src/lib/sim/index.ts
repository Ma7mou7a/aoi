import type { Paradigm } from "../dimensions/schema";
import { createRng, type Rng } from "../rng";
import type { TrialRecord } from "../scoring/types";
import { CorsiStaircase, simulateCorsiBlock, type CorsiParams } from "../tasks/corsi";
import { generateMatrices, simulateMatrices, type MatricesParams } from "../tasks/matrices";
import { generateNBack, simulateNBackResponses, type NBackParams } from "../tasks/nback";
import { generateStroop, simulateStroopResponses, type StroopParams } from "../tasks/stroop";
import { simulateSymbolDigit, type SymbolDigitParams } from "../tasks/symbolDigit";
import { generateTaskSwitching, simulateTaskSwitching, type TaskSwitchingParams } from "../tasks/taskSwitching";
import { generateTrustMachine, simulateTrustMachine, type TrustParams } from "../tasks/trustMachine";

/** Synthetic player types: a genuine player with a latent ability, or one of four invalid behaviours. */
export type Behaviour = "genuine" | "random" | "same_key" | "no_response" | "anticipate";

/** One simulated block of a task at given (merged) params by a player with latent ability θ ∈ [0, 1]. */
export function simulateBlock(paradigm: Paradigm, params: Record<string, unknown>, ability: number, seed: number, behaviour: Behaviour = "genuine"): TrialRecord[] {
  const r = createRng(seed);
  const genuine = ((): TrialRecord[] => {
    switch (paradigm) {
      case "n_back": {
        const p = params as unknown as NBackParams;
        return simulateNBackResponses(generateNBack(p, seed), p.n, ability, r);
      }
      case "stroop": {
        const p = params as unknown as StroopParams;
        return simulateStroopResponses(generateStroop(p, seed), p.colours, ability, r);
      }
      case "corsi":
        return simulateCorsiBlock(params as unknown as CorsiParams, ability, r);
      case "symbol_digit":
        return simulateSymbolDigit(params as unknown as SymbolDigitParams, ability, seed, r);
      case "task_switching":
        return simulateTaskSwitching(generateTaskSwitching(params as unknown as TaskSwitchingParams, seed), ability, r);
      case "matrices": {
        const p = params as unknown as MatricesParams;
        return simulateMatrices(generateMatrices(p, seed), p, ability, r);
      }
      case "trust_machine": {
        const p = params as unknown as TrustParams;
        return simulateTrustMachine(generateTrustMachine(p, seed), p, ability, r, { blockSeed: seed });
      }
    }
  })();
  return behaviour === "genuine" ? genuine : corrupt(paradigm, params, genuine, behaviour, createRng(seed ^ 0x9e3779b9));
}

/** The response alphabet of each paradigm, for the invalid behaviours. */
function responses(paradigm: Paradigm, params: Record<string, unknown>, t: TrialRecord, rng: Rng): unknown[] {
  switch (paradigm) {
    case "n_back": return ["match", null];
    case "stroop": return params.colours as string[];
    case "symbol_digit": return Array.from({ length: Number(params.symbols) }, (_, i) => i + 1);
    case "task_switching": return ["left", "right"];
    case "matrices": return Array.from({ length: Number(params.options) }, (_, i) => i);
    case "trust_machine": return ["left", "right"];
    case "corsi": {
      const span = (t.expected as number[]).length;
      return [rng.shuffle([...Array(Number(params.blocks)).keys()]).slice(0, span)];
    }
  }
}

const isCorrect = (paradigm: Paradigm, t: TrialRecord, response: unknown) =>
  paradigm === "n_back" ? (response != null) === (t.stimulus.isTarget === true) : JSON.stringify(response) === JSON.stringify(t.expected);

function corrupt(paradigm: Paradigm, params: Record<string, unknown>, trials: TrialRecord[], behaviour: Exclude<Behaviour, "genuine">, rng: Rng): TrialRecord[] {
  const fixed = rng.pick(responses(paradigm, params, trials[0], rng).filter((x) => x != null));
  const out = trials.map((t): TrialRecord => {
    if (behaviour === "no_response") {
      return { ...t, response: null, outcome: paradigm === "n_back" ? "no_response" : "timeout", correct: paradigm === "n_back" ? t.stimulus.isTarget !== true : false, rtMs: null };
    }
    const response = behaviour === "same_key" && paradigm !== "corsi" ? fixed : rng.pick(responses(paradigm, params, t, rng));
    const rtMs = behaviour === "anticipate" ? 40 + rng.int(80) : 300 + rng.int(600);
    return { ...t, response, outcome: response == null ? "no_response" : "response", correct: isCorrect(paradigm, t, response), rtMs: response == null ? null : rtMs };
  });
  if (paradigm !== "corsi") return out;
  // Corsi is adaptive inside the block: replay the staircase so the block ends where it really would.
  const stairs = new CorsiStaircase(params as unknown as CorsiParams);
  const kept: TrialRecord[] = [];
  for (const t of out) {
    if (stairs.done) break;
    kept.push(t);
    stairs.record(!!t.correct);
  }
  return kept;
}
