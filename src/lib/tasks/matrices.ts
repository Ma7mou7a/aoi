import { createRng, type Rng } from "../rng";

export type MatricesParams = {
  options: number;
  items_per_block: number;
  max_response_ms: number;
  rules_per_item: number;
  attributes: Array<"shape" | "size" | "count">;
};

export const SHAPES = ["circle", "square", "triangle", "diamond", "hexagon", "star"] as const;
export type Shape = (typeof SHAPES)[number];
export type Cell = { shape: Shape; size: 0 | 1 | 2; count: 1 | 2 | 3 };
export type MatrixRule = "distribution_of_three" | "progression" | "constant";
export type MatrixItem = { grid: Cell[]; options: Cell[]; answer: number; rules: Record<string, MatrixRule> };

const sameCell = (a: Cell, b: Cell) => a.shape === b.shape && a.size === b.size && a.count === b.count;

/**
 * Raven-style 3×3 item. Each varying attribute follows a row rule:
 *  - distribution_of_three: each row is a permutation of three values (Latin square),
 *  - progression: values step left→right, the same in every row,
 * and non-varying attributes are constant within a row. The bottom-right cell is the answer;
 * distractors each break exactly one attribute, so every wrong option is "nearly right".
 */
export function generateMatrixItem(p: MatricesParams, rng: Rng): MatrixItem {
  const varying = p.attributes.slice(0, p.rules_per_item);
  const rules: Record<string, MatrixRule> = {};
  for (const a of ["shape", "size", "count"] as const) {
    rules[a] = !varying.includes(a) ? "constant" : a === "shape" ? "distribution_of_three" : rng.next() < 0.5 ? "progression" : "distribution_of_three";
  }
  const shapes = rng.shuffle(SHAPES).slice(0, 3) as Shape[];
  const sizes = rng.shuffle([0, 1, 2] as const);
  const counts = rng.shuffle([1, 2, 3] as const);
  const constShape = rng.pick(SHAPES);
  const constSize = rng.pick([0, 1, 2] as const);
  const constCount = rng.pick([1, 2] as const);

  const value = <T,>(rule: MatrixRule, vals: readonly T[], ordered: readonly T[], constant: T, r: number, c: number): T =>
    rule === "constant" ? constant : rule === "progression" ? ordered[c] : vals[(r + c) % 3];

  const grid: Cell[] = [];
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      grid.push({
        shape: value(rules.shape, shapes, shapes, constShape, r, c),
        size: value(rules.size, sizes, [0, 1, 2] as const, constSize, r, c),
        count: value(rules.count, counts, [1, 2, 3] as const, constCount, r, c),
      });
    }
  }
  const answer = grid[8];

  const distractors: Cell[] = [];
  const tweaks: Array<(c: Cell) => Cell> = [
    (c) => ({ ...c, shape: rng.pick(SHAPES.filter((s) => s !== c.shape)) }),
    (c) => ({ ...c, size: ((c.size + 1 + rng.int(2)) % 3) as Cell["size"] }),
    (c) => ({ ...c, count: (((c.count + rng.int(2)) % 3) + 1) as Cell["count"] }),
  ];
  let guard = 0;
  while (distractors.length < p.options - 1 && guard++ < 200) {
    const d = rng.pick(tweaks)(answer);
    if (!sameCell(d, answer) && !distractors.some((x) => sameCell(x, d))) distractors.push(d);
  }
  const options = rng.shuffle([answer, ...distractors]);
  return { grid: grid.slice(0, 8).concat([answer]), options, answer: options.findIndex((o) => sameCell(o, answer)), rules };
}

export function generateMatrices(p: MatricesParams, seed: number): MatrixItem[] {
  const rng = createRng(seed);
  return Array.from({ length: p.items_per_block }, () => generateMatrixItem(p, rng));
}

/** Synthetic responder: chance (1/options) plus a skill term that falls with the number of rules. */
export function simulateMatrices(items: MatrixItem[], p: MatricesParams, ability: number, rng: Rng) {
  const chance = 1 / p.options;
  const hardness = 0.15 + 0.22 * (p.rules_per_item - 1);
  return items.map((it, i) => {
    const pCorrect = chance + (1 - chance) / (1 + Math.exp(-9 * (ability - hardness)));
    const correct = rng.next() < pCorrect;
    const response = correct ? it.answer : (it.answer + 1 + rng.int(p.options - 1)) % p.options;
    return { trialIndex: i, stimulus: { rules: it.rules }, expected: it.answer, response, outcome: "response" as const, correct, rtMs: Math.max(2000, Math.round(26000 - 14000 * ability + 4000 * rng.normal())) };
  });
}
