import type { Paradigm } from "../dimensions/schema";
import { Z90 } from "../profiler";

/**
 * Stagnation plateau (Layer C). A plateau is not "low scores": it is the same score again and again.
 * Detected on the last blocks of one skill: flat trend (|slope| small), small spread, and the level
 * not moving. When found, the engine changes the FORMAT, never just repeats the task.
 */
export const PLATEAU = {
  /** Blocks needed before we call anything a plateau. */
  minBlocks: 4,
  /** Look back at most this many blocks. */
  window: 6,
  /** Flat: the block score changes by less than this per block (0..1 scale). */
  maxAbsSlope: 0.02,
  /** Stable: highest minus lowest block score below this. */
  maxRange: 0.18,
} as const;

export type BlockPoint = { composite: number; level: number; valid?: boolean };

export type Plateau = {
  plateau: boolean;
  n: number;
  meanPct: number;
  slopePtsPerBlock: number;
  rangePts: number;
  level: number | null;
  sameLevel: boolean;
  /** "scores": the game scores themselves are flat. "twin": the games vary, but the Brain Twin estimate has stopped moving. */
  basis?: "scores" | "twin";
  /** Twin basis: the estimate (0..100) and how far it moved over those games, in points. */
  twinPct?: number;
  twinMovePts?: number;
};

/** Ordinary least squares slope of y against 0..n-1. */
export function slope(ys: number[]): number {
  const n = ys.length;
  if (n < 2) return 0;
  const mx = (n - 1) / 2;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let sxy = 0;
  let sxx = 0;
  ys.forEach((y, i) => {
    sxy += (i - mx) * (y - my);
    sxx += (i - mx) ** 2;
  });
  return sxx ? sxy / sxx : 0;
}

/** `blocks` oldest first. Unreliable blocks are left out: they say nothing about a plateau. */
export function detectPlateau(blocks: BlockPoint[]): Plateau {
  const recent = blocks.filter((b) => b.valid !== false && Number.isFinite(b.composite)).slice(-PLATEAU.window);
  const ys = recent.map((b) => b.composite);
  const n = ys.length;
  const s = slope(ys);
  const range = n ? Math.max(...ys) - Math.min(...ys) : 0;
  const levels = new Set(recent.map((b) => b.level));
  const sameLevel = levels.size === 1;
  return {
    plateau: n >= PLATEAU.minBlocks && Math.abs(s) <= PLATEAU.maxAbsSlope && range <= PLATEAU.maxRange && sameLevel,
    n,
    meanPct: n ? Math.round((ys.reduce((a, b) => a + b, 0) / n) * 100) : 0,
    slopePtsPerBlock: Math.round(s * 1000) / 10,
    rangePts: Math.round(range * 100),
    level: sameLevel && n ? recent[0].level : null,
    sameLevel,
  };
}

/**
 * The same plateau, read on the Brain Twin. Single games are noisy (about ±16 points from game to game on
 * N-back), so "every score within 18 points" almost never happens even for someone truly stuck. The Twin
 * averages that noise away. A plateau is 4 ordinary games in a row that leave the estimate where it was
 * (within 4 points) with no reliable change in the games themselves: no progress visible beyond the noise. Unreliable games are left out, as above.
 */
// Levels are not required to match: in assessments the level changes on purpose. Instead the engine refuses to call a
// plateau when the games show a reliable change (RCI guard, server/blocks.ts). Simulated (20 players per cell, 10 games):
// a steady player gets the format change in 90% of practice runs and 60% of assessment runs. Players improving by
// 3–6 points per game are caught too in 50–80% of runs: in 10 noisy games no rule can tell slow progress from none,
// so the claim is "no progress visible beyond the noise", and a format change costs an improving player nothing.
export const TWIN_PLATEAU: { games: number; maxMove: number; requireSameLevel: boolean } = { games: 4, maxMove: 0.04, requireSameLevel: false };

/** `points` oldest first: each ordinary game of the skill with the Twin estimate right after it. */
export function detectTwinPlateau(points: Array<BlockPoint & { twin: number }>): Plateau {
  const recent = points.filter((b) => b.valid !== false && Number.isFinite(b.composite) && Number.isFinite(b.twin)).slice(-TWIN_PLATEAU.games);
  const n = recent.length;
  const twins = recent.map((b) => b.twin);
  const move = n ? Math.abs(twins[n - 1] - twins[0]) : 1;
  const ys = recent.map((b) => b.composite);
  const levels = new Set(recent.map((b) => b.level));
  return {
    plateau: n >= TWIN_PLATEAU.games && (!TWIN_PLATEAU.requireSameLevel || levels.size === 1) && move <= TWIN_PLATEAU.maxMove,
    n,
    meanPct: n ? Math.round((ys.reduce((a, b) => a + b, 0) / n) * 100) : 0,
    slopePtsPerBlock: Math.round(slope(twins) * 1000) / 10,
    rangePts: n ? Math.round((Math.max(...ys) - Math.min(...ys)) * 100) : 0,
    level: n ? recent[n - 1].level : null,
    sameLevel: levels.size === 1,
    basis: "twin",
    twinPct: n ? Math.round(twins[n - 1] * 100) : undefined,
    twinMovePts: Math.round(move * 100),
  };
}

/** One concrete strategy per game, to try for a few blocks (an experiment on yourself, not a promise). */
export const STRATEGIES: Record<Paradigm, { name: string; how: string }> = {
  n_back: { name: "Rolling rehearsal", how: "Silently repeat the last letters as a little chant (“K-T… T-R…”) and drop the oldest each time." },
  stroop: { name: "Soft focus", how: "Look at the bottom edge of the letters, not the word: the ink colour pops out before the meaning does." },
  corsi: { name: "Draw the shape", how: "Don't memorise squares: trace the path as a shape (an L, a zigzag) and replay the shape." },
  symbol_digit: { name: "Three anchors", how: "Learn three symbol–number pairs by heart before you start, then only look up the rest." },
  task_switching: { name: "Say the rule", how: "Before each answer, say the current rule in your head (“shape!”) and only then press." },
  matrices: { name: "Rows, then columns", how: "Check what changes along each row, then each column, then the diagonal, before you look at the options." },
  trust_machine: { name: "Commit first", how: "Decide your own answer and how sure you are before you read what the AI says." },
};

/** A second strategy per game type: when the first one didn't clearly help, the next plateau tries this one. */
export const ALT_STRATEGIES: Record<Paradigm, { name: string; how: string }> = {
  n_back: { name: "Chunk in pairs", how: "Group the letters two by two (“KT”, “RB”) and compare each new pair with the pair before." },
  stroop: { name: "Name the ink first", how: "Before reading anything, say the ink colour in your head (“red!”), then press: the word comes second." },
  corsi: { name: "Count the jumps", how: "Count the squares as you watch (1-2-3…) and tie each count to a corner of the board." },
  symbol_digit: { name: "Scan by rows", how: "Read the key row by row once, left to right, and keep your eyes on the row you need." },
  task_switching: { name: "Pause on a switch", how: "When the rule changes, take a half-second breath before answering; on repeats, go fast." },
  matrices: { name: "Name the change", how: "Say in words what changes (“one more dot”, “turns right”) before looking at the options." },
  trust_machine: { name: "Spot the disagreement", how: "Only rethink when the AI disagrees with you; when it agrees, move on." },
};

/** One strategy already tried on a plateau: strategy games vs the plateau games they were compared with. */
export type StrategyTrial = { name: string; diffPts: number; lowPts: number; highPts: number; verdict: "helped" | "hurt" | "unclear"; n: number };

/**
 * Strategy memory: which strategy to offer at the next plateau, learned from this player's own experiments.
 * A strategy that clearly helped (its whole 90% range above zero) is offered again; otherwise an untried one;
 * otherwise the best so far. Returns the strategy and one sentence saying why, from the numbers.
 */
export function chooseStrategy(paradigm: Paradigm, tried: StrategyTrial[]): { strategy: { name: string; how: string }; memory?: string } {
  const options = [STRATEGIES[paradigm], ALT_STRATEGIES[paradigm]];
  const fmt = (t: StrategyTrial) => `${t.diffPts >= 0 ? "+" : ""}${t.diffPts} points, likely ${t.lowPts >= 0 ? "+" : ""}${t.lowPts} to ${t.highPts >= 0 ? "+" : ""}${t.highPts}`;
  const helped = tried.filter((t) => t.verdict === "helped").sort((a, b) => b.diffPts - a.diffPts)[0];
  if (helped) {
    const strategy = options.find((o) => o.name === helped.name) ?? options[0];
    return { strategy, memory: `Last time “${helped.name}” lifted you ${fmt(helped)}; it's worth using again.` };
  }
  const untried = options.find((o) => !tried.some((t) => t.name === o.name));
  const last = tried[tried.length - 1];
  if (untried) return { strategy: untried, memory: last ? `“${last.name}” didn't clearly help (${fmt(last)}); this time we try a different one.` : undefined };
  const best = [...tried].sort((a, b) => b.diffPts - a.diffPts)[0];
  return { strategy: options.find((o) => o.name === best.name) ?? options[0], memory: `Neither strategy clearly helped yet; “${best.name}” came closest (${fmt(best)}): one more round to be sure.` };
}

export type PlateauBuster = {
  kind: "strategy" | "stretch";
  title: string;
  detail: string;
  /** Level to play (stretch jumps up; strategy keeps the plateau level). */
  level: number;
  strategy?: { name: string; how: string };
};

/**
 * Format change after a plateau, alternating two evidence-based levers:
 * - a strategy block (same level, one new way of doing the task), then
 * - a stretch block (two levels up for one game: desirable difficulty), then back to a strategy.
 * `bustersSoFar` counts plateau-buster blocks already played for this skill.
 */
/** One sentence on what is stuck, in the words of the rule that fired. */
function stuck(p: Plateau): string {
  if (p.basis === "twin") return `Your last ${p.n} games moved your estimate by only ${p.twinMovePts} points (it stays near ${p.twinPct}%).`;
  return `Your last ${p.n} games all landed near ${p.meanPct}% (trend ${p.slopePtsPerBlock >= 0 ? "+" : ""}${p.slopePtsPerBlock} pts per game).`;
}

export function plateauBuster(p: Plateau, paradigm: Paradigm, levels: number[], currentLevel: number, bustersSoFar: number, tried: StrategyTrial[] = []): PlateauBuster {
  const top = levels[levels.length - 1];
  const canStretch = currentLevel < top;
  if (bustersSoFar % 2 === 1 && canStretch) {
    const level = levels[Math.min(levels.length - 1, levels.indexOf(currentLevel) + 2)] ?? top;
    return {
      kind: "stretch",
      title: "Format change: stretch round",
      detail: `${stuck(p)} One round at level ${level} breaks the routine: harder practice now tends to stick better later.`,
      level,
    };
  }
  const { strategy, memory } = chooseStrategy(paradigm, tried);
  return {
    kind: "strategy",
    title: `Format change: try “${strategy.name}”`,
    detail: `${stuck(p)}${memory ? ` ${memory}` : ""} Repeating the same game won't change that, so this round tests one concrete strategy. I'll compare it with your plateau.`,
    level: currentLevel,
    strategy,
  };
}

export type ExperimentResult = {
  baselinePct: number;
  strategyPct: number;
  diffPts: number;
  lowPts: number;
  highPts: number;
  nBaseline: number;
  nStrategy: number;
  verdict: "helped" | "hurt" | "unclear";
};

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const variance = (xs: number[]) => {
  if (xs.length < 2) return NaN;
  const m = mean(xs);
  return xs.reduce((s, x) => s + (x - m) ** 2, 0) / (xs.length - 1);
};

/**
 * The self-experiment readout: strategy blocks vs plateau blocks, difference with a 90% interval
 * (Welch standard error; a floor of 0.08 per-block SD so two lucky blocks can't look conclusive).
 */
export function compareExperiment(baseline: number[], strategy: number[]): ExperimentResult | null {
  if (baseline.length < 2 || strategy.length < 1) return null;
  const floor = 0.08 ** 2;
  const vb = Math.max(floor, variance(baseline) || floor);
  const vs = Math.max(floor, Number.isFinite(variance(strategy)) ? variance(strategy) : vb);
  const se = Math.sqrt(vb / baseline.length + vs / strategy.length);
  const d = mean(strategy) - mean(baseline);
  const lo = d - Z90 * se;
  const hi = d + Z90 * se;
  const pts = (x: number) => Math.round(x * 100);
  return {
    baselinePct: pts(mean(baseline)),
    strategyPct: pts(mean(strategy)),
    diffPts: pts(d),
    lowPts: pts(lo),
    highPts: pts(hi),
    nBaseline: baseline.length,
    nStrategy: strategy.length,
    verdict: lo > 0 ? "helped" : hi < 0 ? "hurt" : "unclear",
  };
}
