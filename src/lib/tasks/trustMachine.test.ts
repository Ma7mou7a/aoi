import { describe, expect, it } from "vitest";
import { trustSignals } from "../collab/score";
import { loadDimensions } from "../dimensions/loader";
import { createRng } from "../rng";
import { levelOf, scoreBlock } from "../scoring";
import { whatItWouldTake } from "../scoring/counterfactual";
import { computeMetrics } from "../scoring/metrics";
import { simulateBlock } from "../sim";
import { adviceFor, adviceSeed, generateTrustMachine, simulateTrustMachine, type TrustParams, type TrustStrategy } from "./trustMachine";

const dim = loadDimensions().find((d) => d.id === "ai_reliance")!;
const task = dim.tasks[0];
const paramsAt = (level: number) => ({ ...task.params, ...levelOf(task, level).params }) as unknown as TrustParams;
const P = paramsAt(2);
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const total = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

describe("second-opinion generator", () => {
  it("is deterministic per seed", () => expect(generateTrustMachine(P, 7)).toEqual(generateTrustMachine(P, 7)));
  it("builds valid sums: two-digit terms, a strict winner, gap within the level's range (±rounding)", () => {
    for (let s = 0; s < 100; s++) {
      for (const it of generateTrustMachine(P, s)) {
        for (const x of [...it.left, ...it.right]) expect(x >= 10 && x <= 89).toBe(true);
        expect(it.left).toHaveLength(P.terms);
        expect(total(it.left)).not.toBe(total(it.right));
        expect(it.answer).toBe(total(it.left) > total(it.right) ? "left" : "right");
        expect(it.gap).toBeLessThan(P.max_gap + 0.02);
      }
    }
  });
  it("controls the helper: wrong 30% after a right answer, right 90% after a wrong one", () => {
    const items = Array.from({ length: 40 }, (_, s) => generateTrustMachine(P, s)).flat();
    const afterRight = items.map((it, i) => adviceFor(it, it.answer, P, adviceSeed(1, i)).aiCorrect);
    const afterWrong = items.map((it, i) => adviceFor(it, it.answer === "left" ? "right" : "left", P, adviceSeed(1, i)).aiCorrect);
    expect(1 - mean(afterRight.map(Number))).toBeCloseTo(P.ai_wrong_when_right, 1);
    expect(mean(afterWrong.map(Number))).toBeCloseTo(P.ai_right_when_wrong, 1);
  });
});

describe("appropriate reliance metric", () => {
  const blocks = (strategy: TrustStrategy, reliance = 0.5, n = 300) =>
    Array.from({ length: n }, (_, s) => computeMetrics("trust_machine", simulateTrustMachine(generateTrustMachine(P, s), P, reliance, createRng(s + 99), { strategy, blockSeed: s })));
  it("puts both blind strategies near chance (0.5) and a skilled player well above", () => {
    expect(mean(blocks("always_follow").map((m) => m.appropriate_reliance))).toBeLessThan(0.6);
    expect(mean(blocks("always_keep").map((m) => m.appropriate_reliance))).toBeLessThan(0.6);
    expect(mean(blocks("calibrated", 0.95).map((m) => m.appropriate_reliance))).toBeGreaterThan(0.75);
  });
  it("splits into the two documented rates: always-follow switches whenever the AI is right, never keeps", () => {
    const m = blocks("always_follow", 0.5, 50);
    // A block can lack one kind of disagreement (then that rate is NaN): average over blocks that have it.
    const finite = (xs: number[]) => xs.filter(Number.isFinite);
    expect(mean(finite(m.map((x) => x.relative_ai_reliance)))).toBeGreaterThan(0.75);
    expect(mean(finite(m.map((x) => x.relative_self_reliance)))).toBeLessThan(0.25);
  });
  it("produces several disagreements per block (the informative trials)", () => {
    expect(mean(blocks("calibrated", 0.5, 100).map((m) => m.n_disagreements))).toBeGreaterThan(6);
  });
  it("tracks reliance skill much more than arithmetic", () => {
    const rng = createRng(5);
    const rows = Array.from({ length: 400 }, (_, s) => {
      const reliance = rng.next(), arithmetic = rng.next();
      const m = computeMetrics("trust_machine", simulateTrustMachine(generateTrustMachine(P, s), P, reliance, createRng(s), { arithmetic, blockSeed: s }));
      return { reliance, arithmetic, aor: m.appropriate_reliance, acc: m.accuracy };
    });
    const corr = (a: number[], b: number[]) => {
      const ma = mean(a), mb = mean(b);
      const num = a.reduce((x, v, i) => x + (v - ma) * (b[i] - mb), 0);
      return num / Math.sqrt(a.reduce((x, v) => x + (v - ma) ** 2, 0) * b.reduce((x, v) => x + (v - mb) ** 2, 0));
    };
    const aor = rows.map((r) => r.aor);
    expect(corr(aor, rows.map((r) => r.reliance))).toBeGreaterThan(0.45);
    expect(Math.abs(corr(aor, rows.map((r) => r.arithmetic)))).toBeLessThan(0.25);
    // The naive measure (final accuracy) leans on arithmetic much more.
    expect(corr(rows.map((r) => r.acc), rows.map((r) => r.arithmetic))).toBeGreaterThan(corr(aor, rows.map((r) => r.arithmetic)) + 0.1);
  });
});

describe("second opinion in the pipeline", () => {
  it("scores a block, offers a counterfactual, and turns into graded collaboration signals", () => {
    const trials = simulateBlock("trust_machine", P as unknown as Record<string, unknown>, 0.5, 31);
    const score = scoreBlock(dim, task, 2, trials);
    expect(score.composite).toBeGreaterThanOrEqual(0);
    expect(score.validity.valid).toBe(true);
    const w = whatItWouldTake(task, trials);
    expect(w.length === 0 || w[0].label.includes("disagreement")).toBe(true);
    const s = trustSignals(score.metrics, { self: 3, ai: 2 });
    expect(s.map((x) => x.signal)).toEqual(["trust_kept_right_answer", "trust_used_right_help"]);
    expect(s[0].value).toBeCloseTo(score.metrics.relative_self_reliance, 10);
    expect(trustSignals(score.metrics, { self: 1, ai: 0 })).toEqual([]);
  });
  it("flags random answering", () => {
    let flagged = 0;
    for (let s = 0; s < 100; s++) if (!scoreBlock(dim, task, 2, simulateBlock("trust_machine", P as unknown as Record<string, unknown>, 0.5, s, "random")).validity.valid) flagged++;
    expect(flagged).toBeGreaterThan(60);
  });
});

describe("confident-helper level", () => {
  const lv4 = task.difficulty.levels.find((l) => l.params.show_confidence === true)!;
  const P4 = { ...task.params, ...lv4.params } as unknown as TrustParams;
  it("keeps the helper's answers identical and makes its confidence honest", () => {
    const items = Array.from({ length: 40 }, (_, s) => generateTrustMachine(P4, s)).flat();
    const a = items.map((it, i) => adviceFor(it, it.answer, P4, adviceSeed(3, i)));
    const b = items.map((it, i) => adviceFor(it, it.answer, P, adviceSeed(3, i)));
    expect(a.map((x) => x.advice)).toEqual(b.map((x) => x.advice));
    const sure = (xs: typeof a) => mean(xs.map((x) => Number(x.confident)));
    expect(sure(a.filter((x) => x.aiCorrect))).toBeGreaterThan(sure(a.filter((x) => !x.aiCorrect)) + 0.3);
  });
  it("records the cue and rewards using it", () => {
    const run = (strategy: TrustStrategy, reliance = 0.5) =>
      Array.from({ length: 200 }, (_, s) => computeMetrics("trust_machine", simulateTrustMachine(generateTrustMachine(P4, s), P4, reliance, createRng(s + 5), { strategy, blockSeed: s })));
    const use = (ms: ReturnType<typeof run>) => mean(ms.map((m) => m.confidence_use).filter(Number.isFinite));
    const aor = (ms: ReturnType<typeof run>) => mean(ms.map((m) => m.appropriate_reliance).filter(Number.isFinite));
    expect(use(run("always_follow"))).toBeCloseTo(0, 5);
    expect(use(run("calibrated", 0.9))).toBeGreaterThan(0.3);
    expect(aor(run("confidence_only"))).toBeGreaterThan(aor(run("always_follow")) + 0.1);
    // Without the confidence display the metric is absent, not zero.
    expect(Number.isNaN(computeMetrics("trust_machine", simulateTrustMachine(generateTrustMachine(P, 1), P, 0.5, createRng(1), { blockSeed: 1 })).confidence_use)).toBe(true);
  });
});
