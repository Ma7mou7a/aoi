/**
 * Reliable Change Index (Jacobson & Truax 1991): is a change bigger than what the test's own noise explains?
 * RCI = (x2 − x1) / S_diff, with S_diff = SEM·√(1/k1 + 1/k2) for the means of k1 and k2 games, where the
 * standard error of one game (SEM) is the skill's fitted observation noise (obs_sd, on the 0–1 ability scale).
 * |RCI| ≥ 1.645 is a reliable change at 90% (the level used everywhere else in the app).
 */
export const RCI_THRESHOLD = 1.645;

export type ReliableChange = { changePts: number; rci: number; reliable: boolean; direction: "up" | "down" | "none"; k1: number; k2: number };

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

/** `games` oldest first, on the ability scale (0..1). Compares the first and last halves (at most 3 games each). */
export function reliableChange(games: number[], sem: number): ReliableChange | null {
  const xs = games.filter(Number.isFinite);
  if (xs.length < 2 || !(sem > 0)) return null;
  const k = Math.min(3, Math.floor(xs.length / 2));
  const first = xs.slice(0, k);
  const last = xs.slice(-k);
  const diff = mean(last) - mean(first);
  const rci = diff / (sem * Math.sqrt(1 / first.length + 1 / last.length));
  const reliable = Math.abs(rci) >= RCI_THRESHOLD;
  return { changePts: Math.round(diff * 100), rci: Math.round(rci * 10) / 10, reliable, direction: reliable ? (diff > 0 ? "up" : "down") : "none", k1: first.length, k2: last.length };
}
