import { describe, expect, it } from "vitest";
import { loadDimensions } from "../dimensions/loader";
import { simulateBlock } from "../sim";
import { levelOf, scoreBlock } from ".";
import { whatItWouldTake } from "./counterfactual";

const dims = loadDimensions();

describe("what it would take", () => {
  for (const d of dims) {
    const task = d.tasks[0];
    it(`${task.paradigm}: each counterfactual is a real, higher re-score of the same block`, () => {
      const trials = simulateBlock(task.paradigm, { ...task.params, ...levelOf(task, 2).params }, 0.45, 21);
      const base = scoreBlock(d, task, 2, trials).composite;
      const out = whatItWouldTake(task, trials);
      if (task.paradigm === "corsi") return expect(out).toEqual([]);
      expect(out.length).toBeGreaterThan(0);
      for (const w of out) {
        expect(w.from).toBeCloseTo(base, 10);
        expect(w.to).toBeGreaterThan(w.from);
      }
    });
  }
});
