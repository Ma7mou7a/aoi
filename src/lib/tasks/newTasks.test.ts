import { describe, expect, it } from "vitest";
import { loadDimensions } from "../dimensions/loader";
import { createRng } from "../rng";
import { levelOf, scoreBlock } from "../scoring";
import { computeMetrics } from "../scoring/metrics";
import { generateMatrices, generateMatrixItem, simulateMatrices, type MatricesParams } from "./matrices";
import { makeKey, simulateSymbolDigit, symbolStream, type SymbolDigitParams } from "./symbolDigit";
import { expectedSide, generateTaskSwitching, simulateTaskSwitching, type TaskSwitchingParams } from "./taskSwitching";

const dims = loadDimensions();
const dimOf = (id: string) => dims.find((d) => d.id === id)!;
const paramsOf = <T,>(dimId: string, level: number) => {
  const task = dimOf(dimId).tasks[0];
  return { ...task.params, ...levelOf(task, level).params } as unknown as T;
};
const meanObs = (dimId: string, level: number, run: (ability: number, k: number) => Parameters<typeof scoreBlock>[3]) => (ability: number) => {
  const dim = dimOf(dimId);
  let s = 0;
  for (let k = 0; k < 30; k++) s += scoreBlock(dim, dim.tasks[0], level, run(ability, k)).observation;
  return s / 30;
};

describe("symbol-digit", () => {
  const p = paramsOf<SymbolDigitParams>("processing_speed", 2);
  it("key maps distinct glyphs to 1..n, stream never repeats immediately", () => {
    const key = makeKey(p, 3);
    expect(new Set(key.map((k) => k.glyph)).size).toBe(p.symbols);
    expect(key.map((k) => k.digit)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    const s = symbolStream(key, 3);
    for (let i = 1; i < s.length; i++) expect(s[i]).not.toBe(s[i - 1]);
  });
  it("simulated block fills the time and yields correct-per-minute", () => {
    const t = simulateSymbolDigit(p, 0.5, 1, createRng(1));
    const total = t.reduce((a, x) => a + x.rtMs, 0);
    expect(total).toBeGreaterThanOrEqual(p.block_duration_s * 1000);
    expect(computeMetrics("symbol_digit", t).correct_per_minute).toBeGreaterThan(20);
  });
  it("observation rises with ability", () => {
    const f = meanObs("processing_speed", 2, (a, k) => simulateSymbolDigit(p, a, k, createRng(k)));
    expect(f(0.2)).toBeLessThan(f(0.5));
    expect(f(0.5)).toBeLessThan(f(0.8));
  });
});

describe("task switching", () => {
  const p = paramsOf<TaskSwitchingParams>("cognitive_flexibility", 2);
  it("has exact switch count, practice first, and correct expected sides", () => {
    const seq = generateTaskSwitching(p, 4);
    const scored = seq.filter((s) => !s.practice);
    expect(seq.filter((s) => s.practice)).toHaveLength(p.practice_trials);
    expect(scored).toHaveLength(p.trials_per_block);
    expect(scored.filter((s) => s.switch)).toHaveLength(Math.round(p.switch_rate * p.trials_per_block));
    expect(scored[0].switch).toBe(false);
    for (const s of seq) expect(s.expected).toBe(expectedSide(s.digit, s.rule));
    expect(expectedSide(3, "parity")).toBe("left");
    expect(expectedSide(8, "magnitude")).toBe("right");
  });
  it("simulated users show a positive switch cost and ability raises the score", () => {
    const t = simulateTaskSwitching(generateTaskSwitching(p, 1), 0.3, createRng(2));
    expect(computeMetrics("task_switching", t).switch_cost_ms).toBeGreaterThan(0);
    const f = meanObs("cognitive_flexibility", 2, (a, k) => simulateTaskSwitching(generateTaskSwitching(p, k), a, createRng(k)));
    expect(f(0.2)).toBeLessThan(f(0.8));
  });
});

describe("matrices", () => {
  const p3 = paramsOf<MatricesParams>("reasoning", 3);
  it("every item has one correct, unique option and a rule-consistent grid", () => {
    const rng = createRng(9);
    for (let k = 0; k < 50; k++) {
      const it = generateMatrixItem(p3, rng);
      expect(it.options).toHaveLength(p3.options);
      const keys = it.options.map((o) => `${o.shape}${o.size}${o.count}`);
      expect(new Set(keys).size).toBe(p3.options);
      expect(it.options[it.answer]).toEqual(it.grid[8]);
      // Rows under distribution_of_three use three different values.
      if (it.rules.shape === "distribution_of_three") {
        for (let r = 0; r < 3; r++) expect(new Set(it.grid.slice(r * 3, r * 3 + 3).map((c) => c.shape)).size).toBe(3);
      }
    }
  });
  it("level 1 varies one attribute only", () => {
    const p1 = paramsOf<MatricesParams>("reasoning", 1);
    const it = generateMatrixItem(p1, createRng(1));
    expect(Object.values(it.rules).filter((r) => r !== "constant")).toHaveLength(1);
  });
  it("observation rises with ability", () => {
    const p2 = paramsOf<MatricesParams>("reasoning", 2);
    const f = meanObs("reasoning", 2, (a, k) => simulateMatrices(generateMatrices(p2, k), p2, a, createRng(k)));
    expect(f(0.2)).toBeLessThan(f(0.8));
  });
});
