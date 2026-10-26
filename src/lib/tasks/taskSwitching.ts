import { createRng, type Rng } from "../rng";

export type TaskSwitchingParams = {
  digits: number[];
  rules: Array<"parity" | "magnitude">;
  trials_per_block: number;
  practice_trials: number;
  max_response_ms: number;
  switch_rate: number;
  cue_lead_ms: number;
};

export type Rule = "parity" | "magnitude";
export type SwitchStimulus = { digit: number; rule: Rule; switch: boolean; practice: boolean; expected: "left" | "right" };

/** Left = odd / smaller than 5, right = even / larger than 5. */
export function expectedSide(digit: number, rule: Rule): "left" | "right" {
  return rule === "parity" ? (digit % 2 ? "left" : "right") : digit < 5 ? "left" : "right";
}

/**
 * Practice trials, then the scored block with exactly round(switch_rate · trials) rule switches.
 * The first scored trial is never a switch (nothing to switch from).
 */
export function generateTaskSwitching(p: TaskSwitchingParams, seed: number): SwitchStimulus[] {
  const rng = createRng(seed);
  const n = p.trials_per_block;
  const nSwitch = Math.min(n - 1, Math.round(p.switch_rate * n));
  const switchAt = new Set(rng.shuffle([...Array(n - 1).keys()].map((i) => i + 1)).slice(0, nSwitch));

  const out: SwitchStimulus[] = [];
  let rule: Rule = rng.pick(p.rules);
  for (let i = 0; i < p.practice_trials; i++) {
    const r: Rule = i % 2 === 0 ? "parity" : "magnitude";
    const digit = rng.pick(p.digits);
    out.push({ digit, rule: r, switch: i > 0, practice: true, expected: expectedSide(digit, r) });
  }
  for (let i = 0; i < n; i++) {
    const sw = switchAt.has(i);
    if (sw) rule = rule === "parity" ? "magnitude" : "parity";
    const digit = rng.pick(p.digits);
    out.push({ digit, rule, switch: sw, practice: false, expected: expectedSide(digit, rule) });
  }
  return out;
}

/** Synthetic responder: switch costs (time and errors) shrink with ability. */
export function simulateTaskSwitching(seq: SwitchStimulus[], ability: number, rng: Rng) {
  return seq.map((s, i) => {
    const pErr = 0.03 + 0.12 * (1 - ability) + (s.switch ? 0.1 * (1 - ability) : 0);
    const correct = rng.next() >= pErr;
    const rt = Math.max(280, Math.round(1050 - 400 * ability + (s.switch ? 380 - 300 * ability : 0) + 110 * rng.normal()));
    const response = correct ? s.expected : s.expected === "left" ? "right" : "left";
    return { trialIndex: i, isPractice: s.practice, stimulus: { digit: s.digit, rule: s.rule, switch: s.switch }, expected: s.expected, response, outcome: "response" as const, correct, rtMs: rt };
  });
}
