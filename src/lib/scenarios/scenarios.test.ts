import { describe, expect, it } from "vitest";
import { loadDimensions } from "../dimensions/loader";
import { PARADIGMS } from "../dimensions/schema";
import { generateWeeklyPlan } from "../plan";
import { priorFor, type Posterior } from "../profiler";
import { levelOf, scoreBlock } from "../scoring";
import { selectNext } from "../selector";
import { simulateBlock } from "../sim";
import { detectAsymmetry } from "./asymmetry";
import { backtest, detectFortune, forecastFan, guardCertainty } from "./certainty";
import { detectDispute, replay, reweigh, verifyDispute } from "./dispute";
import { compareExperiment, detectPlateau, plateauBuster, STRATEGIES, detectTwinPlateau } from "./plateau";
import { liveRushCheck, rushProfile, shieldReceipt } from "./rush";

const dims = loadDimensions();
const dim = (id: string) => dims.find((d) => d.id === id)!;
const post = (mean: number, sd: number, n = 5): Posterior => ({ mean, sd, nObservations: n, nTrials: n * 30, updatedAt: "2026-11-01T00:00:00Z" });

// ── 1. Button masher (Layer A) ──────────────────────────────────────────────
describe("scenario 1: the button masher", () => {
  const stroop = dim("attention_inhibition");
  const task = stroop.tasks[0];
  const params = { ...task.params, ...levelOf(task, 2).params };

  it("flags a masher's block as rushing and uncertain, not as low ability", () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const trials = simulateBlock("stroop", params, 0.6, seed, "masher");
      const score = scoreBlock(stroop, task, 2, trials);
      expect(score.validity.flags).toContain("rushing");
      expect(score.validity.valid).toBe(false);
      expect(score.observationSd).toBeGreaterThan(stroop.profile.uncertainty.obs_sd * 2);
    }
  });

  it("never flags a genuine player, fast or slow", () => {
    for (const ability of [0.2, 0.5, 0.9]) {
      for (const seed of [11, 12, 13]) {
        const trials = simulateBlock("stroop", params, ability, seed);
        expect(scoreBlock(stroop, task, 2, trials).validity.flags).not.toContain("rushing");
      }
    }
  });

  it("does not punish fast AND accurate answers", () => {
    const fastRight = Array.from({ length: 30 }, (_, i) => ({ trialIndex: i, stimulus: {}, outcome: "response" as const, correct: true, rtMs: 280 }));
    expect(rushProfile(fastRight, 200).rushing).toBe(false);
    const fastWrong = fastRight.map((t, i) => ({ ...t, correct: i % 3 === 0 }));
    expect(rushProfile(fastWrong, 200).rushing).toBe(true);
  });

  it("nudges live after a burst of fast wrong answers, not before", () => {
    const burst = Array.from({ length: 6 }, (_, i) => ({ rtMs: 230, correct: i % 2 === 0 }));
    expect(liveRushCheck(burst.slice(0, 5), 200).rushing).toBe(false);
    expect(liveRushCheck(burst, 200).rushing).toBe(true);
    expect(liveRushCheck(burst.map((b) => ({ ...b, rtMs: 700 })), 200).rushing).toBe(false);
  });

  it("the receipt shows how much false change the flag prevented", () => {
    const before = post(0.62, 0.08);
    const r = shieldReceipt(before, 0.05, 0.29, 0.29 * 2.5 * 1.5, 32);
    expect(r.naivePct).toBeLessThan(r.beforePct - 3);
    expect(Math.abs(r.actualPct - r.beforePct)).toBeLessThan(Math.abs(r.naivePct - r.beforePct));
    expect(r.avoidedPts).toBe(Math.abs(r.naivePct - r.actualPct));
  });
});

// ── 2. Stagnation plateau (Layer C) ─────────────────────────────────────────
describe("scenario 2: the stagnation plateau", () => {
  const flat = [0.55, 0.57, 0.54, 0.56, 0.55].map((c) => ({ composite: c, level: 2 }));

  it("detects same score, same level, no trend", () => {
    const p = detectPlateau(flat);
    expect(p.plateau).toBe(true);
    expect(p.meanPct).toBe(55);
    expect(p.level).toBe(2);
  });

  it("does not call growth, decline or too few games a plateau", () => {
    expect(detectPlateau([0.4, 0.46, 0.52, 0.58, 0.64].map((c) => ({ composite: c, level: 2 }))).plateau).toBe(false);
    expect(detectPlateau([0.7, 0.64, 0.58, 0.52].map((c) => ({ composite: c, level: 2 }))).plateau).toBe(false);
    expect(detectPlateau(flat.slice(0, 3)).plateau).toBe(false);
    expect(detectPlateau(flat.map((b, i) => ({ ...b, level: i < 3 ? 1 : 2 }))).plateau).toBe(false);
  });

  it("ignores unreliable games when judging a plateau", () => {
    const withMash = [...flat.slice(0, 3), { composite: 0.05, level: 2, valid: false }, ...flat.slice(3)];
    expect(detectPlateau(withMash).plateau).toBe(true);
  });

  it("changes the format: a strategy first, then a stretch round", () => {
    const p = detectPlateau(flat);
    const first = plateauBuster(p, "n_back", [1, 2, 3, 4], 2, 0);
    expect(first.kind).toBe("strategy");
    expect(first.strategy).toEqual(STRATEGIES.n_back);
    expect(first.level).toBe(2);
    const second = plateauBuster(p, "n_back", [1, 2, 3, 4], 2, 1);
    expect(second.kind).toBe("stretch");
    expect(second.level).toBe(4);
  });

  it("has a strategy for every game", () => {
    for (const p of PARADIGMS) expect(STRATEGIES[p].how.length).toBeGreaterThan(20);
  });

  it("reads the self-experiment honestly: a range crossing zero is 'unclear'", () => {
    expect(compareExperiment([0.55, 0.56, 0.54, 0.55], [0.58])!.verdict).toBe("unclear");
    expect(compareExperiment([0.55, 0.56, 0.54, 0.55], [0.8, 0.82, 0.79])!.verdict).toBe("helped");
    expect(compareExperiment([0.55], [0.6])).toBeNull();
  });
});

// ── 3. The "Why" audit ──────────────────────────────────────────────────────
describe("scenario 3: the why audit", () => {
  const all = (mean: number, sd = 0.1) => Object.fromEntries(dims.map((d) => [d.id, post(mean, sd)]));

  it("training choices carry a decision record with ranking, runner-up and margin", () => {
    const posteriors = { ...all(0.6), working_memory: post(0.4, 0.1), reasoning: post(0.45, 0.1) };
    const s = selectNext({ dimensions: dims, posteriors, mode: "training", available: PARADIGMS })!;
    const t = s.reason.trace!;
    expect(t.chosen).toBe("working_memory");
    expect(t.runnerUp).toBe("reasoning");
    expect(t.marginPts).toBe(5);
    expect(t.ranking[0]).toMatchObject({ skill: "working_memory", meanPct: 40 });
    expect(t.basis).toBe("lowest_estimate");
  });

  it("assessment choices record the expected uncertainty reduction of each candidate", () => {
    const posteriors = { ...all(0.5, 0.1), visuospatial_memory: post(0.5, 0.2) };
    const t = selectNext({ dimensions: dims, posteriors, mode: "assessment", available: PARADIGMS })!.reason.trace!;
    expect(t.chosen).toBe("visuospatial_memory");
    expect(t.ranking[0].score).toBeGreaterThan(t.ranking[1].score);
    expect(t.marginPts).toBeGreaterThan(0);
  });
});

// ── 4. Pushback ─────────────────────────────────────────────────────────────
describe("scenario 4: pushback", () => {
  it("recognises disagreement with a reason, not how-to questions", () => {
    expect(detectDispute("That score isn't fair, I was distracted")?.reason).toBe("distraction");
    expect(detectDispute("my phone rang during that game")?.reason).toBe("interruption");
    expect(detectDispute("it was really noisy today")?.reason).toBe("noise");
    expect(detectDispute("I disagree, that result is not me")?.reason).toBe("unfair");
    expect(detectDispute("How can I avoid distractions?")).toBeNull();
    expect(detectDispute("How am I doing?")).toBeNull();
  });

  it("checks the claim against what was recorded", () => {
    expect(verifyDispute("distraction", { lookedAway: 4, focusLost: 0, flags: [], n: 32 }).supported).toBe(true);
    expect(verifyDispute("distraction", { lookedAway: 0, focusLost: 0, flags: [], n: 32 }).supported).toBe(false);
  });

  it("re-weighing widens the band and moves the estimate back toward the other games", () => {
    const d = dim("working_memory");
    const at = (day: number) => new Date(Date.UTC(2026, 10, day));
    const runs = [
      { id: "a", observation: 0.62, observationSd: 0.2, nTrials: 30, at: at(1) },
      { id: "b", observation: 0.6, observationSd: 0.2, nTrials: 30, at: at(2) },
      { id: "c", observation: 0.64, observationSd: 0.2, nTrials: 30, at: at(3) },
      { id: "bad", observation: 0.2, observationSd: 0.2, nTrials: 30, at: at(4) },
    ];
    const current = replay(d.profile.prior, runs, d.profile.uncertainty.drift_sd_per_day, d.profile.prior.sd);
    const r = reweigh(current, d.profile.prior, runs, d.profile.uncertainty.drift_sd_per_day, { bad: 3 });
    expect(r.mean).toBeGreaterThan(current.mean);
    expect(r.sd).toBeGreaterThan(current.sd);
    expect(r.bandAfterPts).toBeGreaterThan(r.bandBeforePts);
  });
});

// ── 5. The Fortune Teller trap ──────────────────────────────────────────────
describe("scenario 5: the fortune teller", () => {
  it("spots requests for a future number and their horizon", () => {
    expect(detectFortune("What exactly will my cognitive score be next month?")).toEqual({ horizonDays: 30, exact: true });
    expect(detectFortune("what will my memory score be next week")).toEqual({ horizonDays: 7, exact: false });
    expect(detectFortune("predict my level in 3 months")?.horizonDays).toBe(90);
    expect(detectFortune("How am I doing?")).toBeNull();
  });

  it("gives ranges that widen with the horizon, never a point", () => {
    const history = [0.5, 0.48, 0.52, 0.5, 0.51].map((m) => ({ mean: m, sd: 0.08 }));
    const fan = forecastFan(history, { mean: 0.51, sd: 0.07 }, 0.01)!;
    expect(fan.map((p) => p.days)).toEqual([0, 7, 30, 90]);
    const width = (p: (typeof fan)[number]) => p.high90 - p.low90;
    for (let i = 1; i < fan.length; i++) {
      expect(width(fan[i])).toBeGreaterThan(width(fan[i - 1]));
      expect(fan[i].low90).toBeLessThanOrEqual(fan[i].low50);
      expect(fan[i].high50).toBeLessThanOrEqual(fan[i].high90);
    }
    expect(forecastFan(history.slice(0, 2), { mean: 0.5, sd: 0.1 }, 0.02)).toBeNull();
  });

  it("measures its own track record on the user's history", () => {
    const history = [0.5, 0.52, 0.51, 0.55, 0.54, 0.57, 0.58].map((m) => ({ mean: m, sd: 0.08 }));
    const t = backtest(history, 0.02)!;
    expect(t.total).toBe(4);
    expect(t.hits).toBeGreaterThanOrEqual(3);
  });

  it("rewrites absolute claims about the future (red team)", () => {
    const attacks = [
      "Your score will be exactly 72% next month.",
      "You will definitely reach 80%.",
      "I'm 100% sure you'll hit 75%.",
      "Guaranteed: you'll score 90%.",
      "It will certainly be 65.",
    ];
    for (const a of attacks) {
      const g = guardCertainty(a);
      expect(g.rewrites, a).toBeGreaterThan(0);
      expect(g.text).not.toMatch(/\b(exactly|definitely|certainly|guarantee\w*|100% sure)\b/i);
    }
    expect(guardCertainty("Your score could be around 60% (likely 50–70%).").rewrites).toBe(0);
  });
});

// ── 6. The asymmetrical mind ────────────────────────────────────────────────
describe("scenario 6: the asymmetrical mind", () => {
  const base = Object.fromEntries(dims.map((d) => [d.id, post(0.55, 0.08)]));
  const split = { ...base, reasoning: post(0.9, 0.05), attention_inhibition: post(0.15, 0.05) };
  const states = (p: Record<string, Posterior>) => dims.map((d) => ({ id: d.id, name: d.name, mean: p[d.id].mean, sd: p[d.id].sd, measured: true }));

  it("calls a profile split only when the bands don't overlap", () => {
    const a = detectAsymmetry(states(split));
    expect(a.asymmetric).toBe(true);
    expect(a.roles.reasoning).toBe("stretch");
    expect(a.roles.attention_inhibition).toBe("foundation");
    expect(detectAsymmetry(states({ ...base, reasoning: post(0.9, 0.3), attention_inhibition: post(0.15, 0.3) })).asymmetric).toBe(false);
    expect(detectAsymmetry(states(base)).asymmetric).toBe(false);
  });

  it("the weekly plan is asymmetric, never one average difficulty", () => {
    const plan = generateWeeklyPlan({ dimensions: dims, posteriors: split, available: PARADIGMS });
    const logic = plan.items.find((i) => i.dimensionId === "reasoning")!;
    const focus = plan.items.find((i) => i.dimensionId === "attention_inhibition")!;
    expect(logic.role).toBe("stretch");
    expect(focus.role).toBe("foundation");
    const top = (id: string) => Math.max(...dim(id).tasks[0].difficulty.levels.map((l) => l.level));
    expect(logic.targetLevel).toBe(top("reasoning"));
    expect(focus.targetLevel).toBe(1);
    expect(plan.rationale).toMatch(/split/);
  });

  it("training alternates foundation and stretch games", () => {
    const first = selectNext({ dimensions: dims, posteriors: split, mode: "training", available: PARADIGMS })!;
    expect(first.dimensionId).toBe("attention_inhibition");
    expect(first.reason.note).toMatch(/foundation/);
    const next = selectNext({ dimensions: dims, posteriors: split, mode: "training", available: PARADIGMS, recent: ["attention_inhibition"] })!;
    expect(next.dimensionId).toBe("reasoning");
    expect(next.reason.trace!.basis).toBe("asymmetric_stretch");
    expect(next.reason.note).toMatch(/advanced/);
  });

  it("starts from the prior for unmeasured skills (no false split)", () => {
    const fresh = Object.fromEntries(dims.map((d) => [d.id, priorFor(d)]));
    expect(detectAsymmetry(dims.map((d) => ({ id: d.id, name: d.name, mean: fresh[d.id].mean, sd: fresh[d.id].sd, measured: false }))).asymmetric).toBe(false);
  });
});

// ── Bao's bet (sealed before the game, settled after) ───────────────────────
import { betRecord, placeBet, settleBet } from "./bet";

describe("Bao's bet", () => {
  const d = dim("attention_inhibition");
  const task = d.tasks[0];
  it("is a range, nested 50% inside 90%, on the game-score scale", () => {
    const b = placeBet(post(0.5, 0.1), levelOf(task, 2).ability_range, d.profile.uncertainty.obs_sd, d.profile.calibration);
    expect(b.low90).toBeLessThanOrEqual(b.low50);
    expect(b.high50).toBeLessThanOrEqual(b.high90);
    expect(b.low50).toBeLessThan(b.mid);
    expect(b.mid).toBeLessThan(b.high50);
  });
  it("narrows as the Twin gets surer", () => {
    const range = levelOf(task, 2).ability_range;
    const wide = placeBet(post(0.5, 0.2), range, d.profile.uncertainty.obs_sd);
    const tight = placeBet(post(0.5, 0.04), range, d.profile.uncertainty.obs_sd);
    expect(tight.high90 - tight.low90).toBeLessThan(wide.high90 - wide.low90);
  });
  it("settles honestly", () => {
    const b = { mid: 0.5, low50: 0.4, high50: 0.6, low90: 0.25, high90: 0.75, at: "" };
    expect(settleBet(b, 0.55)).toBe("inside50");
    expect(settleBet(b, 0.7)).toBe("inside90");
    expect(settleBet(b, 0.9)).toBe("outside");
    expect(betRecord([{ bet: b, composite: 0.55 }, { bet: b, composite: 0.9 }])).toEqual({ hits90: 1, hits50: 1, total: 2 });
  });
  it("is calibrated: about 9 in 10 simulated games land inside the 90% range", () => {
    let hits = 0;
    let total = 0;
    for (const ability of [0.3, 0.5, 0.7]) {
      for (let seed = 1; seed <= 40; seed++) {
        const level = 2;
        const b = placeBet(post(ability, 0.06), levelOf(task, level).ability_range, d.profile.uncertainty.obs_sd, d.profile.calibration);
        const params = { ...task.params, ...levelOf(task, level).params };
        const s = scoreBlock(d, task, level, simulateBlock(task.paradigm, params, ability, 900 + seed + ability * 1000));
        if (!s.validity.valid) continue;
        total++;
        if (settleBet(b, s.composite) !== "outside") hits++;
      }
    }
    expect(total).toBeGreaterThan(80);
    expect(hits / total).toBeGreaterThan(0.8);
  });
});

describe("2 · plateau read on the Brain Twin (noisy games)", () => {
  const pt = (composite: number, twin: number, level = 3) => ({ composite, twin, level });
  it("noisy scores at one level with an estimate that doesn't move is a plateau", () => {
    const p = detectTwinPlateau([pt(0.29, 0.47), pt(0.5, 0.49), pt(0.36, 0.48), pt(0.27, 0.46)]);
    expect(p.plateau).toBe(true);
    expect(p.basis).toBe("twin");
    expect(p.twinMovePts).toBe(1);
  });
  it("counts games across levels (assessments change level on purpose)", () => {
    expect(detectTwinPlateau([pt(0.3, 0.47, 2), pt(0.5, 0.49), pt(0.36, 0.48), pt(0.27, 0.46)]).plateau).toBe(true);
  });
  it("is not a plateau when the estimate is rising, or there are too few games", () => {
    expect(detectTwinPlateau([pt(0.3, 0.4), pt(0.5, 0.44), pt(0.4, 0.47), pt(0.6, 0.5)]).plateau).toBe(false);
    expect(detectTwinPlateau([pt(0.3, 0.47), pt(0.5, 0.48), pt(0.36, 0.48)]).plateau).toBe(false);
  });
  it("leaves unreliable games out", () => {
    expect(detectTwinPlateau([pt(0.3, 0.47), { ...pt(0.05, 0.46), valid: false }, pt(0.36, 0.48), pt(0.27, 0.46)]).plateau).toBe(false);
  });
});
