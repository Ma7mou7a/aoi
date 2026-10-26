import type { Rng } from "../rng";

export type PlantableClaim = { claim: string; why: string };
export type PlantedFlaw = { claimIndex: number; description: string; original: string };

/** Chance that an eligible debrief carries a deliberate error (opt-in mode only). */
export const PLANT_PROBABILITY = 0.35;

/**
 * Spot-the-error mode: change one number in one claim's "why" so it no longer matches the evidence.
 * The evidence itself is untouched, so the error can always be caught by checking it.
 * Returns null when no claim has a number to change.
 */
export function plantFlaw<T extends PlantableClaim>(claims: T[], rng: Rng): { claims: T[]; flaw: PlantedFlaw } | null {
  const candidates = claims
    .map((c, i) => ({ i, m: c.why.match(/(\d+)(%?)/) }))
    .filter((x): x is { i: number; m: RegExpMatchArray } => !!x.m);
  if (!candidates.length) return null;

  const { i, m } = candidates[rng.int(candidates.length)];
  const n = Number(m[1]);
  const isPct = m[2] === "%";
  const delta = Math.max(2, Math.round(n * 0.4));
  let wrong = rng.next() < 0.5 && n - delta >= 0 ? n - delta : n + delta;
  if (isPct && wrong > 100) wrong = Math.max(0, n - delta);
  if (wrong === n) wrong = n + 3;

  const original = claims[i].why;
  const why = original.replace(m[0], `${wrong}${m[2]}`);
  const out = claims.map((c, j) => (j === i ? { ...c, why } : c));
  return { claims: out, flaw: { claimIndex: i, description: `We changed ${m[0]} to ${wrong}${m[2]}. The evidence shows ${m[0]}.`, original } };
}
