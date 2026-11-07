import { credibleInterval } from "../profiler";

/**
 * The asymmetrical mind (generalisation). An average hides a split profile: 90% logic and 20% attention
 * "average" to 55%, which fits neither. A profile is called asymmetric only when the gap is large AND
 * the two 90% bands don't overlap (so it is not just noise). The plan then tags each skill:
 * - stretch:     the strong skill(s), trained above the comfort zone (advanced levels);
 * - foundation:  the weak skill(s), trained at the levels that build the basics;
 * - maintain:    everything in between.
 */
export const ASYMMETRY = {
  /** Gap between the strongest and weakest estimate, on the 0..1 scale. */
  minGap: 0.25,
  /** A skill counts as "strong"/"weak" when within this distance of the extremes. */
  groupWithin: 0.1,
} as const;

export type SkillState = { id: string; name: string; mean: number; sd: number; measured: boolean };
export type Role = "stretch" | "foundation" | "maintain";

export type Asymmetry = {
  asymmetric: boolean;
  gapPts: number;
  strongest: { id: string; name: string; pct: number; band: [number, number] } | null;
  weakest: { id: string; name: string; pct: number; band: [number, number] } | null;
  roles: Record<string, Role>;
  /** True when the 90% bands of the strongest and weakest don't overlap. */
  separated: boolean;
};

const pct = (x: number) => Math.round(x * 100);

export function detectAsymmetry(skills: SkillState[]): Asymmetry {
  const measured = skills.filter((s) => s.measured);
  const roles: Record<string, Role> = Object.fromEntries(skills.map((s) => [s.id, "maintain" as Role]));
  if (measured.length < 2) return { asymmetric: false, gapPts: 0, strongest: null, weakest: null, roles, separated: false };
  const sorted = [...measured].sort((a, b) => b.mean - a.mean);
  const hi = sorted[0];
  const lo = sorted[sorted.length - 1];
  const [hiLow] = credibleInterval(hi);
  const [, loHigh] = credibleInterval(lo);
  const separated = hiLow > loHigh;
  const gap = hi.mean - lo.mean;
  const asymmetric = separated && gap >= ASYMMETRY.minGap;
  if (asymmetric) {
    for (const s of measured) {
      if (hi.mean - s.mean <= ASYMMETRY.groupWithin) roles[s.id] = "stretch";
      else if (s.mean - lo.mean <= ASYMMETRY.groupWithin) roles[s.id] = "foundation";
    }
  }
  const view = (s: SkillState) => {
    const [a, b] = credibleInterval(s);
    return { id: s.id, name: s.name, pct: pct(s.mean), band: [pct(a), pct(b)] as [number, number] };
  };
  return { asymmetric, gapPts: pct(gap), strongest: view(hi), weakest: view(lo), roles, separated };
}

/** The level to train a skill at, given its role: stretch one level above the growth zone, foundation at the first level. */
export function levelForRole(role: Role, growthLevel: number, levels: number[]): number {
  const i = levels.indexOf(growthLevel);
  if (role === "stretch") return levels[Math.min(levels.length - 1, i + 1)];
  if (role === "foundation") return levels[0];
  return growthLevel;
}
