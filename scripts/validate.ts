/**
 * Validation study with simulated users of known ability, run through the real pipeline
 * (selector → task simulators → scoreBlock → profiler).
 *
 *   E1  Recovery: does the profile recover the true ability? (r, MAE, 90% band coverage)
 *       Calibration is fitted on half the users (fit set) and evaluated on the other half.
 *   E2  Adaptive vs random block selection at equal budget (error and band width per block).
 *   E3  Robustness: are invalid behaviours flagged, and are genuine players left alone?
 *   E4  Growth: does the twin track a user whose ability improves over a month?
 *   E5  Forecasts: are 7-day growth forecasts accurate and their bands honest? Scored like the TADPOLE
 *       challenge (mean absolute error + coverage probability accuracy), against a no-change baseline.
 *   E7  Second-opinion game: does it measure reliance rather than arithmetic, and do blind strategies fail?
 *   E6  Fairness: are estimates equally accurate for players on a laggy device or with a slower,
 *       equally accurate response style? (bias and coverage per subgroup, as in the PREPARE winners)
 *
 * Usage: npm run validate [-- --users 500 --apply]
 *   --apply writes the fitted calibration (intercept, slope) and noise (obs_sd) into dimensions/*.yaml
 * Output: public/validation.json (rendered at /validation) and docs/validation.md
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parseDocument } from "yaml";
import { DIMENSIONS_DIR, loadDimensions } from "../src/lib/dimensions/loader";
import type { Dimension, Paradigm } from "../src/lib/dimensions/schema";
import { applyDrift, credibleInterval, priorFor, updatePosterior, Z90, type Posterior } from "../src/lib/profiler";
import { projectGrowth, type SnapshotPoint } from "../src/lib/profiler/projection";
import type { TrialRecord } from "../src/lib/scoring/types";
import { createRng, type Rng } from "../src/lib/rng";
import { levelOf, scoreBlock } from "../src/lib/scoring";
import { predictedComposite, selectNext } from "../src/lib/selector";
import { simulateBlock, type Behaviour } from "../src/lib/sim";
import { AVAILABLE_PARADIGMS } from "../src/lib/tasks/registry";
import { generateTrustMachine, simulateTrustMachine, type TrustParams, type TrustStrategy } from "../src/lib/tasks/trustMachine";
import { trustSignals } from "../src/lib/collab/score";

const args = process.argv.slice(2);
const N_USERS = Number(args[args.indexOf("--users") + 1]) || 500;
const APPLY = args.includes("--apply");
const BUDGET = 18; // blocks per user ≈ 3 assessment sessions
const T0 = new Date("2026-10-01T09:00:00Z");

const baseDims = loadDimensions();
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
const round = (x: number, d = 3) => Math.round(x * 10 ** d) / 10 ** d;

function pearson(a: number[], b: number[]) {
  const ma = mean(a), mb = mean(b);
  let num = 0, da = 0, db = 0;
  for (let i = 0; i < a.length; i++) {
    num += (a[i] - ma) * (b[i] - mb);
    da += (a[i] - ma) ** 2;
    db += (b[i] - mb) ** 2;
  }
  return num / Math.sqrt(da * db);
}

type Fit = Record<string, { levels: Record<number, [number, number]>; obsSd: number; n: number }>;

/** The original hand-set level ranges and noise (commit 477b098): the "before" baseline in E1. */
const HAND_SET: Fit = {
  working_memory: { levels: { 1: [0, 0.45], 2: [0.3, 0.75], 3: [0.55, 1] }, obsSd: 0.12, n: 0 },
  attention_inhibition: { levels: { 1: [0, 0.5], 2: [0.25, 0.75], 3: [0.5, 1] }, obsSd: 0.13, n: 0 },
  processing_speed: { levels: { 1: [0, 0.5], 2: [0.25, 0.75], 3: [0.5, 1] }, obsSd: 0.1, n: 0 },
  cognitive_flexibility: { levels: { 1: [0, 0.5], 2: [0.25, 0.75], 3: [0.5, 1] }, obsSd: 0.14, n: 0 },
  visuospatial_memory: { levels: { 1: [0, 0.55], 2: [0.25, 0.8], 3: [0.45, 1] }, obsSd: 0.15, n: 0 },
  reasoning: { levels: { 1: [0, 0.45], 2: [0.3, 0.75], 3: [0.55, 1] }, obsSd: 0.16, n: 0 },
};

/** Same dimensions with fitted level maps and noise (in memory only). */
function withFit(dims: Dimension[], fit: Fit | null): Dimension[] {
  if (!fit) return dims;
  return dims.map((d) => !fit[d.id] ? d : ({
    ...d,
    tasks: d.tasks.map((t, i) =>
      i > 0 ? t : { ...t, difficulty: { ...t.difficulty, levels: t.difficulty.levels.map((l) => ({ ...l, ability_range: fit[d.id].levels[l.level] ?? l.ability_range })) } },
    ),
    profile: { ...d.profile, uncertainty: { ...d.profile.uncertainty, obs_sd: fit[d.id].obsSd } },
  }));
}

type Truth = Record<string, number>;
const drawTruth = (rng: Rng): Truth => Object.fromEntries(baseDims.map((d) => [d.id, clamp01(0.5 + 0.18 * rng.normal())]));

type BlockRecord = { dim: string; level: number; composite: number; raw: number; validTrials: number; valid: boolean; censored: boolean; truth: number };
type Trace = { rmse: number; meanSd: number; coverage: number }[];

/** Post-hoc change to a block's trials, e.g. a laggy device adding latency to every response (E6). */
type TrialTweak = (trials: TrialRecord[]) => TrialRecord[];

/** One simulated user taking `budget` blocks under a selection policy. */
function runUser(dims: Dimension[], truth: Truth, policy: "adaptive" | "random", budget: number, rng: Rng, tweak?: TrialTweak) {
  const posteriors: Record<string, Posterior> = Object.fromEntries(dims.map((d) => [d.id, priorFor(d, T0)]));
  const recent: string[] = [];
  const blocks: BlockRecord[] = [];
  const trace: Trace = [];
  for (let k = 0; k < budget; k++) {
    let dim: Dimension, level: number;
    if (policy === "adaptive") {
      const s = selectNext({ dimensions: dims, posteriors, mode: "assessment", available: AVAILABLE_PARADIGMS, recent, targetSd: 0 })!;
      dim = dims.find((d) => d.id === s.dimensionId)!;
      level = s.level;
    } else {
      dim = rng.pick(dims);
      level = rng.pick(dim.tasks[0].difficulty.levels).level;
    }
    const task = dim.tasks[0];
    const params = { ...task.params, ...levelOf(task, level).params };
    const ability = clamp01(truth[dim.id] + 0.03 * rng.normal()); // day-to-day state noise
    const simulated = simulateBlock(task.paradigm as Paradigm, params, ability, rng.int(2 ** 31));
    const score = scoreBlock(dim, task, level, tweak ? tweak(simulated) : simulated);
    posteriors[dim.id] = updatePosterior(posteriors[dim.id], score.observation, score.observationSd, score.validity.validTrials, T0);
    blocks.push({ dim: dim.id, level, composite: score.composite, raw: score.rawObservation, validTrials: score.validity.validTrials, valid: score.validity.valid, censored: score.censored, truth: truth[dim.id] });
    recent.push(dim.id);
    const errs = dims.map((d) => (posteriors[d.id].mean - truth[d.id]) ** 2);
    const cover = dims.map((d) => {
      const [lo, hi] = credibleInterval(posteriors[d.id]);
      return truth[d.id] >= lo && truth[d.id] <= hi ? 1 : 0;
    });
    trace.push({ rmse: Math.sqrt(mean(errs)), meanSd: mean(dims.map((d) => posteriors[d.id].sd)), coverage: mean(cover) });
  }
  return { posteriors, blocks, trace };
}

// ── Fit calibration on the first half ────────────────────────────────────────
const rngFit = createRng(1);
const fitUsers = Array.from({ length: N_USERS / 2 }, () => drawTruth(rngFit));
const evalUsers = Array.from({ length: N_USERS / 2 }, () => drawTruth(rngFit));

const uncal = baseDims;
// Fit set uses RANDOM levels (a designed experiment) so every level gets data; evaluation stays adaptive.
const fitBlocks: BlockRecord[] = [];
for (const t of fitUsers) fitBlocks.push(...runUser(uncal, t, "random", BUDGET * 2, rngFit).blocks);

/**
 * Per-level measurement model: composite = a + b·ability + ε, fitted on valid blocks away from floor
 * and ceiling. Inverting it gives the level's ability_range: composite 0 → −a/b, composite 1 → (1−a)/b.
 * Noise (obs_sd) is the residual on the ability scale, normalised to `reference_trials` valid trials.
 */
const calibration: Fit = {};
for (const d of baseDims) {
  const levels: Record<number, [number, number]> = {};
  for (const l of d.tasks[0].difficulty.levels) {
    const rows = fitBlocks.filter((b) => b.dim === d.id && b.level === l.level && b.valid && b.composite > 0.05 && b.composite < 0.95);
    if (rows.length < 30) continue;
    const mx = mean(rows.map((r) => r.truth)), my = mean(rows.map((r) => r.composite));
    const b = rows.reduce((s, r) => s + (r.truth - mx) * (r.composite - my), 0) / rows.reduce((s, r) => s + (r.truth - mx) ** 2, 0);
    if (b < 0.1) continue; // level barely sensitive to ability: keep the hand-set range
    const a = my - b * mx;
    levels[l.level] = [round(-a / b), round((1 - a) / b)];
  }
  const ref = d.profile.uncertainty.reference_trials;
  // Noise is estimated on the levels assessment uses: a training-only level (e.g. one with an extra cue) has its own range but
  // must not inflate the noise that sets every assessment band.
  const assessed = new Set(d.tasks[0].difficulty.levels.filter((l) => !l.training_only).map((l) => l.level));
  const rows = fitBlocks.filter((b) => b.dim === d.id && b.valid && b.composite > 0.05 && b.composite < 0.95 && levels[b.level] && assessed.has(b.level));
  const resid = rows.map((r) => {
    const [lo, hi] = levels[r.level];
    return ((lo + (hi - lo) * r.composite - r.truth) ** 2) * (Math.max(1, r.validTrials) / ref);
  });
  calibration[d.id] = { levels, obsSd: round(Math.sqrt(mean(resid))), n: rows.length };
}
const cal = withFit(baseDims, calibration);

// ── E1: recovery on held-out users, before and after calibration ───────────
function recovery(dims: Dimension[], seed: number) {
  const rng = createRng(seed);
  const per: Record<string, { truth: number[]; est: number[]; covered: number[]; width: number[] }> = {};
  for (const d of dims) per[d.id] = { truth: [], est: [], covered: [], width: [] };
  for (const t of evalUsers) {
    const { posteriors } = runUser(dims, t, "adaptive", BUDGET, rng);
    for (const d of dims) {
      const p = posteriors[d.id];
      const [lo, hi] = credibleInterval(p);
      per[d.id].truth.push(t[d.id]);
      per[d.id].est.push(p.mean);
      per[d.id].covered.push(t[d.id] >= lo && t[d.id] <= hi ? 1 : 0);
      per[d.id].width.push(hi - lo);
    }
  }
  const summary = Object.fromEntries(
    dims.map((d) => {
      const s = per[d.id];
      return [d.id, {
        r: round(pearson(s.truth, s.est)),
        mae: round(mean(s.truth.map((t, i) => Math.abs(t - s.est[i])))),
        coverage90: round(mean(s.covered)),
        meanWidth: round(mean(s.width)),
      }];
    }),
  );
  return { summary, per };
}
const before = recovery(withFit(baseDims, HAND_SET), 2);
const after = recovery(cal, 2);
const scatter = Object.fromEntries(baseDims.map((d) => [d.id, after.per[d.id].truth.map((t, i) => ({ truth: round(t), estimate: round(after.per[d.id].est[i]) }))]));

// ── E2: adaptive vs random at equal budget ──────────────────────────────────
function curve(policy: "adaptive" | "random", seed: number) {
  const rng = createRng(seed);
  const traces = evalUsers.map((t) => runUser(cal, t, policy, BUDGET, rng).trace);
  return Array.from({ length: BUDGET }, (_, k) => ({
    blocks: k + 1,
    rmse: round(mean(traces.map((tr) => tr[k].rmse))),
    meanSd: round(mean(traces.map((tr) => tr[k].meanSd))),
    coverage: round(mean(traces.map((tr) => tr[k].coverage))),
  }));
}
const adaptive = curve("adaptive", 3);
const random = curve("random", 3);

// ── E3: robustness to invalid behaviour ─────────────────────────────────────
const behaviours: Behaviour[] = ["genuine", "random", "same_key", "no_response", "anticipate"];
const rngRob = createRng(4);
const robustness = cal.map((d) => {
  const task = d.tasks[0];
  // Each player gets the level the adaptive selector would give them (expected composite nearest 0.5).
  const levelFor = (ability: number) =>
    task.difficulty.levels.reduce((best, l) =>
      Math.abs(predictedComposite(ability, l.ability_range) - 0.5) < Math.abs(predictedComposite(ability, best.ability_range) - 0.5) ? l : best,
    ).level;
  const row: Record<string, number | string> = { dimension: d.id, task: task.id };
  for (const b of behaviours) {
    let flagged = 0;
    const n = 200;
    for (let i = 0; i < n; i++) {
      const ability = b === "genuine" ? 0.15 + 0.7 * rngRob.next() : 0.5;
      const level = levelFor(ability);
      const params = { ...task.params, ...levelOf(task, level).params };
      const s = scoreBlock(d, task, level, simulateBlock(task.paradigm as Paradigm, params, ability, rngRob.int(2 ** 31), b));
      if (!s.validity.valid) flagged++;
    }
    row[b] = round(flagged / n);
  }
  return row;
});

// ── E4: growth tracking (working memory, +0.15 over 30 days, 10 sessions) ───
/** How fast the twin "forgets" (process noise per day). Swept here, the best value is written to config. */
const DRIFT_CANDIDATES = [0.005, 0.01, 0.02, 0.03, 0.04, 0.05, 0.06];
function growthStudy(q: number) {
const rngGrow = createRng(5);
const base = cal.find((d) => d.id === "working_memory")!;
const wm: Dimension = { ...base, profile: { ...base.profile, uncertainty: { ...base.profile.uncertainty, drift_sd_per_day: q } } };
const growth = Array.from({ length: 100 }, () => {
  const start = clamp01(0.35 + 0.15 * rngGrow.normal());
  const gain = 0.15;
  let p = priorFor(wm, T0);
  let firstEst = NaN;
  for (let s = 0; s < 10; s++) {
    const day = s * 3;
    const at = new Date(T0.getTime() + day * 86_400_000);
    p = applyDrift(p, wm, at);
    const truth = clamp01(start + (gain * day) / 27);
    const sel = selectNext({ dimensions: [wm], posteriors: { [wm.id]: p }, mode: "assessment", available: AVAILABLE_PARADIGMS, targetSd: 0 })!;
    const params = { ...wm.tasks[0].params, ...levelOf(wm.tasks[0], sel.level).params };
    const sc = scoreBlock(wm, wm.tasks[0], sel.level, simulateBlock("n_back", params, clamp01(truth + 0.03 * rngGrow.normal()), rngGrow.int(2 ** 31)));
    p = updatePosterior(p, sc.observation, sc.observationSd, sc.validity.validTrials, at);
    if (s === 2) firstEst = p.mean;
  }
  const finalTruth = clamp01(start + gain);
  const [lo, hi] = credibleInterval(p);
  return { trueGain: finalTruth - clamp01(start + (gain * 6) / 27), estGain: p.mean - firstEst, covered: finalTruth >= lo && finalTruth <= hi ? 1 : 0 };
});
return {
  driftSdPerDay: q,
  users: growth.length,
  meanTrueGain: round(mean(growth.map((g) => g.trueGain))),
  meanEstimatedGain: round(mean(growth.map((g) => g.estGain))),
  detectedImprovement: round(mean(growth.map((g) => (g.estGain > 0 ? 1 : 0)))),
  finalCoverage90: round(mean(growth.map((g) => g.covered))),
};
}
const growthSweep = DRIFT_CANDIDATES.map(growthStudy);
// Smallest drift whose bands stay honest (≥ 90% coverage): larger values track gains slightly faster
// but re-widen the band almost to the prior within a week, which makes the twin jumpy.
const growthSummary = growthSweep.find((g) => g.finalCoverage90 >= 0.9) ?? growthSweep.at(-1)!;

// ── E5: forecast accuracy and calibration (TADPOLE-style scoring) ───────────
/**
 * Users improve on every skill by a random amount (0 to +15 points over 4 weeks) and play 3 blocks every
 * second day. On day 14 the app's 7-day forecast (projectGrowth) is compared with the TRUE ability on day 21.
 * Scored like TADPOLE: mean absolute error, plus coverage probability accuracy (CPA) = |actual coverage − nominal|
 * for the 50% and 90% bands. Baseline: "no change" (today's estimate and band).
 */
const Z50 = 0.6745;
function forecastStudy() {
  const rng = createRng(6);
  const dims = cal.map((d) => ({ ...d, profile: { ...d.profile, uncertainty: { ...d.profile.uncertainty, drift_sd_per_day: growthSummary.driftSdPerDay } } }));
  const DAY_MS = 86_400_000;
  const rows: Array<{ dim: string; truth: number; fc: [number, number, number]; base: [number, number, number] }> = [];
  for (const start of evalUsers.slice(0, 200)) {
    const gain = Object.fromEntries(dims.map((d) => [d.id, 0.15 * rng.next()]));
    const truthOn = (id: string, day: number) => clamp01(start[id] + (gain[id] * day) / 28);
    const posteriors: Record<string, Posterior> = Object.fromEntries(dims.map((d) => [d.id, priorFor(d, T0)]));
    const hist: Record<string, SnapshotPoint[]> = Object.fromEntries(dims.map((d) => [d.id, []]));
    const recent: string[] = [];
    for (let day = 0; day <= 14; day += 2) {
      const at = new Date(T0.getTime() + day * DAY_MS);
      for (const d of dims) posteriors[d.id] = applyDrift(posteriors[d.id], d, at);
      for (let b = 0; b < 3; b++) {
        const s = selectNext({ dimensions: dims, posteriors, mode: "assessment", available: AVAILABLE_PARADIGMS, recent, targetSd: 0 })!;
        const dim = dims.find((d) => d.id === s.dimensionId)!;
        const task = dim.tasks[0];
        const params = { ...task.params, ...levelOf(task, s.level).params };
        const sc = scoreBlock(dim, task, s.level, simulateBlock(task.paradigm as Paradigm, params, clamp01(truthOn(dim.id, day) + 0.03 * rng.normal()), rng.int(2 ** 31)));
        posteriors[dim.id] = updatePosterior(posteriors[dim.id], sc.observation, sc.observationSd, sc.validity.validTrials, at);
        hist[dim.id].push({ at, mean: posteriors[dim.id].mean, sd: posteriors[dim.id].sd });
        recent.push(dim.id);
      }
    }
    const now = new Date(T0.getTime() + 14 * DAY_MS);
    for (const d of dims) {
      const p = applyDrift(posteriors[d.id], d, now);
      const f = projectGrowth(hist[d.id], p, 7, growthSummary.driftSdPerDay, now);
      if (!f) continue;
      const fSd = (f.ciHigh - f.ciLow) / (2 * Z90); // band half-width back to an SD (exact unless clamped at 0 or 1)
      const bSd = Math.sqrt(p.sd ** 2 + growthSummary.driftSdPerDay ** 2 * 7);
      rows.push({ dim: d.id, truth: truthOn(d.id, 21), fc: [f.mean, fSd, 0], base: [p.mean, bSd, 0] });
    }
  }
  const score = (pick: (r: (typeof rows)[number]) => [number, number, number]) => {
    const err = rows.map((r) => Math.abs(pick(r)[0] - r.truth));
    const inside = (z: number) => mean(rows.map((r) => (Math.abs(pick(r)[0] - r.truth) <= z * pick(r)[1] ? 1 : 0)));
    const c50 = inside(Z50), c90 = inside(Z90);
    return { mae: round(mean(err)), coverage50: round(c50), cpa50: round(Math.abs(c50 - 0.5)), coverage90: round(c90), cpa90: round(Math.abs(c90 - 0.9)) };
  };
  return { forecasts: rows.length, horizonDays: 7, forecast: score((r) => r.fc), noChange: score((r) => r.base) };
}
const forecastSummary = forecastStudy();

// ── E6: fairness across subgroups (device lag, response style) ──────────────
/**
 * Same held-out users, same ability, different circumstances. A fair twin keeps bias near 0 and coverage near 90%
 * in every subgroup. Exception by design: processing speed IS speed, so slower responding should lower it.
 */
const SUBGROUPS: Array<{ id: string; label: string; tweak?: TrialTweak }> = [
  { id: "reference", label: "Reference (desktop, typical pace)" },
  { id: "lag80", label: "Laggy device (+80 ms on every response)", tweak: (ts) => ts.map((t) => (t.rtMs == null ? t : { ...t, rtMs: t.rtMs + 80 })) },
  { id: "slow30", label: "Slower, equally accurate style (RT ×1.3)", tweak: (ts) => ts.map((t) => (t.rtMs == null ? t : { ...t, rtMs: Math.round(t.rtMs * 1.3) })) },
];
function fairnessStudy() {
  return SUBGROUPS.map((g) => {
    const rng = createRng(7); // same draws for every subgroup: only the tweak differs
    const per: Record<string, { bias: number[]; covered: number[] }> = Object.fromEntries(cal.map((d) => [d.id, { bias: [], covered: [] }]));
    for (const t of evalUsers.slice(0, 200)) {
      const { posteriors } = runUser(cal, t, "adaptive", BUDGET, rng, g.tweak);
      for (const d of cal) {
        const [lo, hi] = credibleInterval(posteriors[d.id]);
        per[d.id].bias.push(posteriors[d.id].mean - t[d.id]);
        per[d.id].covered.push(t[d.id] >= lo && t[d.id] <= hi ? 1 : 0);
      }
    }
    return { id: g.id, label: g.label, bySkill: Object.fromEntries(cal.map((d) => [d.id, { bias: round(mean(per[d.id].bias)), coverage90: round(mean(per[d.id].covered)) }])) };
  });
}
const fairness = fairnessStudy();

// ── E7: second-opinion game: does it measure reliance, and does it reward the right strategy? ─────
/**
 * (a) Discriminant check: 600 players with independent reliance skill and arithmetic play one level-2 block.
 *     The score (appropriate reliance) should follow reliance, not arithmetic; the naive alternative
 *     (final accuracy) is shown for comparison.
 * (b) Strategies: blind "always follow the AI" and "always keep my answer" vs calibrated players,
 *     scored on the dimension and on the collaboration components the game feeds (3 blocks each).
 */
function trustStudy() {
  const dim = cal.find((d) => d.id === "ai_reliance");
  if (!dim) return null;
  const task = dim.tasks[0];
  const p = { ...task.params, ...levelOf(task, 2).params } as unknown as TrustParams;
  const rng = createRng(8);
  const block = (reliance: number, arithmetic: number, strategy: TrustStrategy) => {
    const seed = rng.int(2 ** 31);
    const trials = simulateTrustMachine(generateTrustMachine(p, seed), p, reliance, createRng(seed ^ 0x5bd1e995), { arithmetic, strategy, blockSeed: seed });
    return { trials, score: scoreBlock(dim, task, 2, trials) };
  };
  const rows = Array.from({ length: 600 }, () => {
    const reliance = rng.next(), arithmetic = rng.next();
    const { score } = block(reliance, arithmetic, "calibrated");
    return { reliance, arithmetic, aor: score.metrics.appropriate_reliance, acc: score.metrics.accuracy };
  }).filter((r) => Number.isFinite(r.aor));
  const col = (k: keyof (typeof rows)[number]) => rows.map((r) => r[k]);
  const discriminant = {
    players: rows.length,
    scoreVsReliance: round(pearson(col("aor"), col("reliance"))),
    scoreVsArithmetic: round(pearson(col("aor"), col("arithmetic"))),
    finalAccuracyVsReliance: round(pearson(col("acc"), col("reliance"))),
    finalAccuracyVsArithmetic: round(pearson(col("acc"), col("arithmetic"))),
  };
  const strategies = ([["Always follow the AI", "always_follow", 0.5], ["Always keep my answer", "always_keep", 0.5], ["Calibrated, average skill", "calibrated", 0.5], ["Calibrated, high skill", "calibrated", 0.9]] as const).map(([label, strategy, reliance]) => {
    const aor: number[] = [], verification: number[] = [], useOfHelp: number[] = [];
    for (let u = 0; u < 300; u++) {
      const arithmetic = rng.next();
      const events: Array<{ signal: string; value: number }> = [];
      for (let b = 0; b < 3; b++) {
        const { trials, score } = block(reliance, arithmetic, strategy);
        if (b === 0) aor.push(score.metrics.appropriate_reliance);
        const dis = trials.filter((t) => !t.isPractice && t.stimulus.initial != null && t.stimulus.initial !== t.stimulus.advice);
        events.push(...trustSignals(score.metrics, { self: dis.filter((t) => t.stimulus.aiCorrect === false).length, ai: dis.filter((t) => t.stimulus.aiCorrect === true).length }));
      }
      // Component score as the collaboration formula computes it (prior 0.5 with strength 2).
      const comp = (sig: string) => { const vs = events.filter((e) => e.signal === sig).map((e) => e.value); return (vs.reduce((a, b) => a + b, 0) + 1) / (vs.length + 2); };
      verification.push(comp("trust_kept_right_answer"));
      useOfHelp.push(comp("trust_used_right_help"));
    }
    const f = aor.filter(Number.isFinite);
    return { label, appropriateReliance: round(mean(f)), verification: round(mean(verification)), useOfHelp: round(mean(useOfHelp)) };
  });
  // (d) Confident-helper level: does the honest confidence cue get used, and does using it pay off?
  const lv4 = task.difficulty.levels.find((l) => l.params.show_confidence === true);
  const confidence = lv4
    ? ([["Always follow the AI", "always_follow", 0.5], ["Always keep my answer", "always_keep", 0.5], ["Follow only when it is very sure", "confidence_only", 0.5], ["Calibrated, average skill", "calibrated", 0.5], ["Calibrated, high skill", "calibrated", 0.9]] as const).map(([label, strategy, reliance]) => {
        const p4 = { ...task.params, ...lv4.params } as unknown as TrustParams;
        const aor: number[] = [], use: number[] = [];
        for (let u = 0; u < 300; u++) {
          const seed = rng.int(2 ** 31);
          const trials = simulateTrustMachine(generateTrustMachine(p4, seed), p4, reliance, createRng(seed ^ 0x2545f491), { arithmetic: rng.next(), strategy, blockSeed: seed });
          const m = scoreBlock(dim, task, lv4.level, trials).metrics;
          aor.push(m.appropriate_reliance);
          use.push(m.confidence_use);
        }
        const f = (xs: number[]) => round(mean(xs.filter(Number.isFinite)));
        return { label, appropriateReliance: f(aor), confidenceUse: f(use) };
      })
    : null;

  // (c) How many blocks of the game does the twin need? Users play only this game (adaptive level),
  //     and the twin's estimate after k blocks is compared with their true reliance skill.
  const byBlocks = [1, 3, 6, 10].map((k) => {
    const truth: number[] = [], est: number[] = [], covered: number[] = [];
    // 600 fresh users (not the 250 held-out ones): a single 200-user run varies by about ±0.04 in r.
    for (let u = 0; u < 600; u++) {
      const t = drawTruth(rng);
      let post = priorFor(dim, T0);
      for (let b = 0; b < k; b++) {
        const s = selectNext({ dimensions: [dim], posteriors: { [dim.id]: post }, mode: "assessment", available: AVAILABLE_PARADIGMS, targetSd: 0 })!;
        const params = { ...task.params, ...levelOf(task, s.level).params };
        const sc = scoreBlock(dim, task, s.level, simulateBlock("trust_machine", params, clamp01(t[dim.id] + 0.03 * rng.normal()), rng.int(2 ** 31)));
        post = updatePosterior(post, sc.observation, sc.observationSd, sc.validity.validTrials, T0);
      }
      const [lo, hi] = credibleInterval(post);
      truth.push(t[dim.id]);
      est.push(post.mean);
      covered.push(t[dim.id] >= lo && t[dim.id] <= hi ? 1 : 0);
    }
    return { blocks: k, r: round(pearson(truth, est)), mae: round(mean(truth.map((x, i) => Math.abs(x - est[i])))), coverage90: round(mean(covered)) };
  });
  return { discriminant, strategies, byBlocks, confidence };
}
const trust = trustStudy();

// ── Output ───────────────────────────────────────────────────────────────────
const result = {
  meta: { users: N_USERS, fitUsers: fitUsers.length, evalUsers: evalUsers.length, blocksPerUser: BUDGET, generatedAt: new Date().toISOString(), truthDistribution: "N(0.5, 0.18) clamped to [0,1], independent per skill" },
  calibration,
  e1: { before: before.summary, after: after.summary, scatter },
  e2: { adaptive, random },
  e3: robustness,
  e4: { ...growthSummary, sweep: growthSweep },
  e5: forecastSummary,
  e6: fairness,
  e7: trust,
};
writeFileSync(path.join(process.cwd(), "public", "validation.json"), JSON.stringify(result));

const names = Object.fromEntries(baseDims.map((d) => [d.id, d.name]));
const pct = (x: number) => `${Math.round(x * 100)}%`;
const at = (k: number) => [adaptive[k - 1], random[k - 1]];
const md = `# Validation study

Generated by \`npm run validate\` on ${result.meta.generatedAt.slice(0, 10)}. ${N_USERS} simulated users with known abilities (${result.meta.truthDistribution}) were run through the **real pipeline**: the adaptive selector, the task simulators, \`scoreBlock\` and the Bayesian profiler. Each user did ${BUDGET} blocks (about 3 assessment sessions). Calibration was fitted on ${fitUsers.length} users and every result below comes from the other ${evalUsers.length} users.

> Simulated users test whether the *pipeline* behaves as designed: it recovers known abilities, its bands are honest, adaptivity helps, and cheating gets caught. They don't replace a study with real participants, which is the next step (see Limitations).

## E1: Recovery of true ability (held-out users, ${BUDGET} blocks)

| Skill | r (before → after calibration) | Mean abs. error | 90% band coverage (before → after) | Mean band width |
|-|-|-|-|-|
${baseDims.map((d) => `| ${names[d.id]} | ${before.summary[d.id].r} → **${after.summary[d.id].r}** | ${pct(before.summary[d.id].mae)} → **${pct(after.summary[d.id].mae)}** | ${pct(before.summary[d.id].coverage90)} → **${pct(after.summary[d.id].coverage90)}** | ${pct(after.summary[d.id].meanWidth)} |`).join("\n")}

**Before** uses the hand-set \`ability_range\` of each difficulty level. **After** uses ranges fitted from data. For every level the fit uses the measurement model *composite = a + b·ability + ε* on valid blocks away from floor and ceiling, then inverts it: composite 0 maps to −a/b and composite 1 to (1−a)/b. The residual noise becomes \`obs_sd\`. The fit set played **random** levels, so every level gets data; evaluation is adaptive. Everything lives in \`dimensions/*.yaml\`, so real pilot data can refit it with no code change.

| Skill | Fitted ability_range per level | obs_sd | blocks used |
|-|-|-|-|
${baseDims.map((d) => `| ${names[d.id]} | ${Object.entries(calibration[d.id].levels).map(([l, r]) => `L${l}: [${r[0]}, ${r[1]}]`).join(" · ")} | ${calibration[d.id].obsSd} | ${calibration[d.id].n} |`).join("\n")}

## E2: Adaptive vs random block selection (same budget)

| Blocks | RMSE adaptive | RMSE random | Mean band SD adaptive | Mean band SD random |
|-|-|-|-|-|
${[3, 6, 9, 12, 18].map((k) => `| ${k} | ${pct(at(k)[0].rmse)} | ${pct(at(k)[1].rmse)} | ${pct(at(k)[0].meanSd)} | ${pct(at(k)[1].meanSd)} |`).join("\n")}

## E3: Robustness, share of blocks flagged as unreliable (200 blocks per cell)

| Task | Genuine (false alarms) | Random answers | Same key | No response | Too fast |
|-|-|-|-|-|-|
${robustness.map((r) => `| ${r.task} | ${pct(r.genuine as number)} | ${pct(r.random as number)} | ${pct(r.same_key as number)} | ${pct(r.no_response as number)} | ${pct(r.anticipate as number)} |`).join("\n")}

A flagged block still counts, but its noise is multiplied by \`invalid_block_sd_multiplier\` (2.5), so it barely moves the profile.

## E4: Tracking growth (working memory, +15 points over a month, 10 sessions, ${growthSummary.users} users)

The twin widens its band between sessions by \`drift_sd_per_day\`, its "forgetting rate". Too little drift makes the estimate lag behind real improvement and the band over-confident; too much makes the band grow back almost to the prior within a week. The rate was swept and the **smallest value that keeps ≥ 90% coverage** (**${growthSummary.driftSdPerDay}/day**) was written to config:

| drift_sd_per_day | Mean true gain | Mean estimated gain | Improvement detected | Final 90% coverage |
|-|-|-|-|-|
${growthSweep.map((g) => `| ${g.driftSdPerDay}${g === growthSummary ? " ✓" : ""} | ${pct(g.meanTrueGain)} | ${pct(g.meanEstimatedGain)} | ${pct(g.detectedImprovement)} | ${pct(g.finalCoverage90)} |`).join("\n")}

## E5: Forecast accuracy and calibration (${forecastSummary.forecasts} seven-day forecasts)

Users improved on every skill by a random 0 to 15 points over four weeks and played 3 blocks every second day. On day 14 the dashboard's 7-day forecast was compared with the **true** ability on day 21. Scoring follows the TADPOLE Alzheimer's forecasting challenge: mean absolute error, and *coverage probability accuracy* (CPA = |share of true values inside the band − nominal level|, 0 is perfect).

| Forecast | Mean abs. error | 50% band coverage (CPA) | 90% band coverage (CPA) |
|-|-|-|-|
| AI4Brain trend forecast | ${pct(forecastSummary.forecast.mae)} | ${pct(forecastSummary.forecast.coverage50)} (${forecastSummary.forecast.cpa50}) | ${pct(forecastSummary.forecast.coverage90)} (${forecastSummary.forecast.cpa90}) |
| No-change baseline | ${pct(forecastSummary.noChange.mae)} | ${pct(forecastSummary.noChange.coverage50)} (${forecastSummary.noChange.cpa50}) | ${pct(forecastSummary.noChange.coverage90)} (${forecastSummary.noChange.cpa90}) |

## E6: Fairness across subgroups (${BUDGET} blocks, 200 held-out users per subgroup)

Same users and same random draws; only the circumstances change. A fair twin keeps the bias (estimate − truth) near 0 and coverage near 90% in every group. Processing speed is the exception by design: it *is* speed, so slower responding should lower it.

| Skill | ${fairness.map((g) => g.label).join(" | ")} |
|-|${fairness.map(() => "-").join("|")}|
${baseDims.map((d) => `| ${names[d.id]} | ${fairness.map((g) => `bias ${g.bySkill[d.id].bias >= 0 ? "+" : ""}${Math.round(g.bySkill[d.id].bias * 100)} · ${pct(g.bySkill[d.id].coverage90)}`).join(" | ")} |`).join("\n")}

Bias in points (estimate − truth); then 90% band coverage. Device type is logged with every session, so a per-device correction can be fitted once real data shows a shift.

${trust ? `## E7: The second-opinion game (AI reliance)

Two-stage judge–advisor design (Schemmer et al. 2023): answer, see the AI helper's answer, decide. Only disagreements count, conditional on whether the first answer was right.

**Does it measure reliance or arithmetic?** ${trust.discriminant.players} simulated players with *independent* reliance skill and arithmetic each played one block.

| Measure | r with reliance skill | r with arithmetic |
|-|-|-|
| Appropriate reliance (our score) | **${trust.discriminant.scoreVsReliance}** | **${trust.discriminant.scoreVsArithmetic}** |
| Final accuracy (naive alternative) | ${trust.discriminant.finalAccuracyVsReliance} | ${trust.discriminant.finalAccuracyVsArithmetic} |

**Do blind strategies fail?** 300 players per strategy, 3 blocks each.

| Strategy | Appropriate reliance (0.5 = chance) | Collaboration: verification | Collaboration: using AI help |
|-|-|-|-|
${trust.strategies.map((s) => `| ${s.label} | ${s.appropriateReliance} | ${s.verification} | ${s.useOfHelp} |`).join("\n")}

${trust.confidence ? `**Confident-helper level.** The helper honestly says "very sure" 80% of the time when it is right and 30% when it is wrong. *Confidence use* = how much more often the player went with the helper when it said it was very sure (disagreements only).

| Strategy | Appropriate reliance | Confidence use |
|-|-|-|
${trust.confidence.map((c) => `| ${c.label} | ${c.appropriateReliance} | ${c.confidenceUse} |`).join("\n")}

` : ""}**How many blocks does the twin need?** 600 users played only this game; the twin's estimate after *k* blocks vs their true reliance skill. Only disagreements are informative, so this skill needs several blocks; the band says so meanwhile.

| Blocks of the game | r | Mean abs. error | 90% band coverage |
|-|-|-|-|
${trust.byBlocks.map((b) => `| ${b.blocks} | ${b.r} | ${pct(b.mae)} | ${pct(b.coverage90)} |`).join("\n")}

` : ""}## Limitations

- The abilities and task behaviour are simulated. The simulators encode plausible relations (e.g. higher ability means a higher n-back hit rate and smaller Stroop interference), not norms. The study shows the pipeline is internally consistent and calibratable, not that it measures cognition in real people.
- The skills are simulated as independent. Real skills correlate, and a hierarchical model could share strength between them.
- Next step: a pilot with real participants (e.g. 30 people × 2 sessions) to refit \`profile.calibration\` and check test–retest reliability.
`;
writeFileSync(path.join(process.cwd(), "docs", "validation.md"), md);

if (APPLY) {
  for (const d of baseDims) {
    const file = path.join(DIMENSIONS_DIR, `${d.id}.yaml`);
    const doc = parseDocument(readFileSync(file, "utf8"));
    d.tasks[0].difficulty.levels.forEach((l, i) => {
      const r = calibration[d.id].levels[l.level];
      if (!r) return;
      const node = doc.createNode(r);
      (node as { flow?: boolean }).flow = true;
      doc.setIn(["tasks", 0, "difficulty", "levels", i, "ability_range"], node);
    });
    doc.setIn(["profile", "uncertainty", "obs_sd"], calibration[d.id].obsSd);
    doc.setIn(["profile", "uncertainty", "drift_sd_per_day"], growthSummary.driftSdPerDay);
    doc.setIn(["profile", "calibration"], doc.createNode({ intercept: 0, slope: 1, source: `level ranges and obs_sd fitted on ${fitUsers.length} simulated users, ${result.meta.generatedAt.slice(0, 10)}; refit on pilot data` }));
    // Keep the hand-written layout: no line wrapping, compact flow collections.
    writeFileSync(file, doc.toString({ lineWidth: 0, flowCollectionPadding: false }));
  }
}

console.log(JSON.stringify({ calibration, before: before.summary, after: after.summary, e2_at_6: at(6), e2_at_18: at(18), e3: robustness, e4: growthSummary, e5: forecastSummary, e6: fairness, e7: trust, applied: APPLY }, null, 1));
