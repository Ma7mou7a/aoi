import { describe, expect, it } from "vitest";
import { ALERT_AFTER_MS, AWAY_FLAG_SHARE, AWAY_MIN_MS, createAlertGate, createAwayTracker, eyeAwayScore, isLookingAway, markLookedAway, poseFromMatrix } from "./gaze";
import { assessValidity } from "../scoring/validity";
import type { TrialRecord } from "../scoring/types";

/** Column-major 4×4 head rotation: pitch (nod) first, then yaw (turn), R = Ry(yaw) · Rx(pitch). */
function matrix(yawDeg: number, pitchDeg: number): number[] {
  const y = (yawDeg * Math.PI) / 180;
  const p = (pitchDeg * Math.PI) / 180;
  const r = [
    [Math.cos(y), Math.sin(y) * Math.sin(p), Math.sin(y) * Math.cos(p)],
    [0, Math.cos(p), -Math.sin(p)],
    [-Math.sin(y), Math.cos(y) * Math.sin(p), Math.cos(y) * Math.cos(p)],
  ];
  const m = new Array(16).fill(0);
  for (let row = 0; row < 3; row++) for (let col = 0; col < 3; col++) m[col * 4 + row] = r[row][col];
  m[15] = 1;
  return m;
}

describe("Focus Guard: reading one frame", () => {
  it("recovers head yaw and pitch from the face model's matrix", () => {
    const p = poseFromMatrix(matrix(30, -10));
    expect(p.yawDeg).toBeCloseTo(30, 5);
    expect(p.pitchDeg).toBeCloseTo(-10, 5);
  });

  it("calls a frame away when the head turns, the eyes look aside, or no face is seen", () => {
    expect(isLookingAway({ pose: { yawDeg: 5, pitchDeg: -8 }, eyeAway: 0.2 })).toBe(false);
    expect(isLookingAway({ pose: { yawDeg: 40, pitchDeg: 0 }, eyeAway: 0 })).toBe(true);
    expect(isLookingAway({ pose: { yawDeg: 0, pitchDeg: 30 }, eyeAway: 0 })).toBe(true);
    expect(isLookingAway({ pose: { yawDeg: 0, pitchDeg: 0 }, eyeAway: 0.9 })).toBe(true);
    expect(isLookingAway({ pose: null, eyeAway: 0 })).toBe(true);
  });

  it("weighs looking down to the keyboard at half, other directions in full", () => {
    expect(eyeAwayScore([{ categoryName: "eyeLookDownLeft", score: 0.9 }])).toBeCloseTo(0.45);
    expect(eyeAwayScore([{ categoryName: "eyeLookOutRight", score: 0.8 }, { categoryName: "jawOpen", score: 1 }])).toBeCloseTo(0.8);
  });
});

describe("Focus Guard: from frames to trials", () => {
  it("keeps only looking-away spells long enough to matter", () => {
    const t = createAwayTracker();
    t.push(0, true);
    t.push(AWAY_MIN_MS - 100, false); // a blink-length glance: ignored
    t.push(1000, true);
    t.push(1000 + AWAY_MIN_MS + 50, false);
    t.push(3000, true);
    expect(t.close(3600)).toEqual([{ start: 1000, end: 1000 + AWAY_MIN_MS + 50 }, { start: 3000, end: 3600 }]);
  });

  it("marks only the trials whose live window overlaps a spell", () => {
    const at = (ms: number) => new Date(10_000 + ms).toISOString();
    const trials = [
      { shownAt: at(0), rtMs: 500 },
      { shownAt: at(1000), rtMs: 600 },
      { shownAt: at(2000), rtMs: null }, // missed: 2 s window
      { rtMs: 400 },
    ];
    const marked = markLookedAway(trials, [{ start: 10_000 + 1400, end: 10_000 + 1500 }, { start: 10_000 + 3900, end: 10_000 + 4200 }]);
    expect(marked.map((t) => (t as { lookedAway?: boolean }).lookedAway ?? false)).toEqual([false, true, true, false]);
    expect(markLookedAway(trials, [])).toBe(trials);
  });
});

describe("Focus Guard alert", () => {
  it("comes on only after a sustained look away, and goes off the moment you look back", () => {
    const gate = createAlertGate(1500);
    expect(gate(0, true)).toBe(false);
    expect(gate(1000, true)).toBe(false);
    expect(gate(1500, true)).toBe(true);
    expect(gate(1600, false)).toBe(false);
    expect(gate(1700, true)).toBe(false); // a new look away starts the clock again
    expect(gate(3300, true)).toBe(true);
  });

  it("ignores a quick glance", () => {
    const gate = createAlertGate();
    expect([gate(0, true), gate(800, true), gate(900, false)].some(Boolean)).toBe(false);
    expect(ALERT_AFTER_MS).toBeGreaterThan(AWAY_MIN_MS);
  });
});

describe("Focus Guard in scoring", () => {
  const rules = { min_rt_ms: 150, max_rt_ms: 3000, min_valid_trials: 5, chance_accuracy: 0, chance_margin_z: 1.64, max_same_response_streak: 50 };
  const trial = (i: number, lookedAway = false): TrialRecord => ({ trialIndex: i, stimulus: {}, response: i % 3, outcome: "response", correct: true, rtMs: 600, lookedAway });

  it("excludes looked-away trials from the valid count without flagging a few", () => {
    const v = assessValidity([...Array.from({ length: 18 }, (_, i) => trial(i)), trial(18, true), trial(19, true)], { accuracy: 1 }, rules);
    expect(v.validTrials).toBe(18);
    expect(v.flags).not.toContain("looked_away");
  });

  it("flags a game when too many trials were played looking away", () => {
    const n = 20;
    const awayCount = Math.floor(n * AWAY_FLAG_SHARE) + 1;
    const v = assessValidity(Array.from({ length: n }, (_, i) => trial(i, i < awayCount)), { accuracy: 1 }, rules);
    expect(v.flags).toContain("looked_away");
    expect(v.valid).toBe(false);
  });
});
