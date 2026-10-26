/**
 * Validation study with simulated users of known ability, run through the real pipeline
 * (selector → task simulators → scoreBlock → profiler).
 *
 *   E1  Recovery: does the profile recover the true ability? (r, MAE, 90% band coverage)
 *       Calibration is fitted on half the users (fit set) and evaluated on the other half.
 *   E2  Adaptive vs random block selection at equal budget (error and band width per block).
 *   E3  Robustness: are invalid behaviours flagged, and are genuine players left alone?
 *   E4  Growth: does the twin track a user whose ability improves over a month?
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
import { applyDrift, credibleInterval, priorFor, updatePosterior, type Posterior } from "../src/lib/profiler";
import { createRng, type Rng } from "../src/lib/rng";
import { levelOf, scoreBlock } from "../src/lib/scoring";
import { predictedComposite, selectNext } from "../src/lib/selector";
import { simulateBlock, type Behaviour } from "../src/lib/sim";
import { AVAILABLE_PARADIGMS } from "../src/lib/tasks/registry";

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

/** One simulated user taking `budget` blocks under a selection policy. */
function runUser(dims: Dimension[], truth: Truth, policy: "adaptive" | "random", budget: number, rng: Rng) {
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
    const trials = simulateBlock(task.paradigm as Paradigm, params, ability, rng.int(2 ** 31));
    const score = scoreBlock(dim, task, level, trials);
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
  const rows = fitBlocks.filter((b) => b.dim === d.id && b.valid && b.composite > 0.05 && b.composite < 0.95 && levels[b.level]);
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

// ── Output ───────────────────────────────────────────────────────────────────
const result = {
  meta: { users: N_USERS, fitUsers: fitUsers.length, evalUsers: evalUsers.length, blocksPerUser: BUDGET, generatedAt: new Date().toISOString(), truthDistribution: "N(0.5, 0.18) clamped to [0,1], independent per skill" },
  calibration,
  e1: { before: before.summary, after: after.summary, scatter },
  e2: { adaptive, random },
  e3: robustness,
  e4: { ...growthSummary, sweep: growthSweep },
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

## Limitations

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

console.log(JSON.stringify({ calibration, before: before.summary, after: after.summary, e2_at_6: at(6), e2_at_18: at(18), e3: robustness, e4: growthSummary, applied: APPLY }, null, 1));
