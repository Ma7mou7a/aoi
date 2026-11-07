import { describe, expect, it } from "vitest";
import { loadDimensions } from "../dimensions/loader";
import { credibleInterval, priorFor, robustUpdate, updatePosterior, type Posterior } from "../profiler";
import { levelOf, scoreBlock } from "../scoring";
import { simulateBlock } from "../sim";
import { fastGuess } from "./engagement";
import { reliableChange } from "./rci";
import { chooseStrategy } from "./plateau";
import { detectDisputeFr, detectFortuneFr, detectLang, detectPlateauQuestion, detectWhyFr } from "./french";

const dims = loadDimensions();

describe("Brain Twin 2.0 · outlier-proof update", () => {
  it("leaves a typical game untouched", () => {
    const p: Posterior = { mean: 0.6, sd: 0.08, nObservations: 4, nTrials: 120, updatedAt: new Date().toISOString() };
    const r = robustUpdate(p, 0.65, 0.15, 30);
    expect(r.damped).toBe(false);
    expect(r.posterior.mean).toBeCloseTo(updatePosterior(p, 0.65, 0.15, 30).mean, 10);
  });

  it("one lapse game (a bad moment, not flagged) moves the Twin much less, at no cost in accuracy", () => {
    const dim = dims.find((d) => d.id === "working_memory")!;
    const task = dim.tasks[0];
    const params = { ...task.params, ...levelOf(task, 2).params };
    let plainErr = 0, robustErr = 0, plainShift = 0, robustShift = 0, plainCover = 0, robustCover = 0;
    const N = 80;
    for (let u = 0; u < N; u++) {
      const truth = 0.45 + (u % 5) * 0.06;
      let plain = priorFor(dim), robust = priorFor(dim);
      for (let g = 0; g < 10; g++) {
        const lapse = g === 7;
        const sc = scoreBlock(dim, task, 2, simulateBlock(task.paradigm, params, lapse ? 0.05 : truth, 9000 + u * 31 + g, "genuine"));
        const beforeP = plain.mean, beforeR = robust.mean;
        plain = updatePosterior(plain, sc.observation, sc.observationSd, sc.validity.validTrials);
        robust = robustUpdate(robust, sc.observation, sc.observationSd, sc.validity.validTrials).posterior;
        if (lapse) { plainShift += Math.abs(plain.mean - beforeP); robustShift += Math.abs(robust.mean - beforeR); }
      }
      plainErr += Math.abs(plain.mean - truth);
      robustErr += Math.abs(robust.mean - truth);
      const [pl, ph] = credibleInterval(plain); const [rl, rh] = credibleInterval(robust);
      plainCover += +(truth >= pl && truth <= ph); robustCover += +(truth >= rl && truth <= rh);
    }
    const pct = (x: number) => Math.round((100 * x) / N);
    console.log(`lapse game shift: plain ${pct(plainShift)} pts vs robust ${pct(robustShift)} pts · final error ${pct(plainErr)} vs ${pct(robustErr)} pts · 90% coverage ${pct(plainCover)}% vs ${pct(robustCover)}%`);
    expect(robustShift).toBeLessThan(plainShift);
    expect(robustErr).toBeLessThanOrEqual(plainErr * 1.02);
  });
});

describe("Brain Twin 2.0 · fast-guess model", () => {
  it("reads a masher's Stroop game as mostly guesses, with a range", () => {
    const e = fastGuess(0.28, 32, 0.25)!;
    expect(e.guessPct).toBeGreaterThan(85);
    expect(e.lowPct).toBeGreaterThan(60);
  });
  it("reads an engaged game as almost no guessing, using the player's own usual accuracy", () => {
    const e = fastGuess(0.86, 32, 0.25, [0.88, 0.9, 0.85])!;
    expect(e.guessPct).toBeLessThan(10);
    expect(e.lowPct).toBe(0);
  });
  it("needs a chance level and enough answers", () => {
    expect(fastGuess(0.5, 32, undefined)).toBeNull();
    expect(fastGuess(0.5, 4, 0.25)).toBeNull();
  });
});

describe("Reliable Change Index", () => {
  it("calls a big change reliable and a small one noise", () => {
    expect(reliableChange([0.4, 0.42, 0.7, 0.72], 0.1)!.reliable).toBe(true);
    const flat = reliableChange([0.5, 0.55, 0.52, 0.5], 0.2)!;
    expect(flat.reliable).toBe(false);
    expect(flat.direction).toBe("none");
  });
});

describe("strategy memory", () => {
  const helped = { name: "Rolling rehearsal", diffPts: 20, lowPts: 8, highPts: 32, verdict: "helped" as const, n: 1 };
  const unclear = { name: "Rolling rehearsal", diffPts: 3, lowPts: -10, highPts: 16, verdict: "unclear" as const, n: 1 };
  it("offers again a strategy that helped, and says why", () => {
    const c = chooseStrategy("n_back", [helped]);
    expect(c.strategy.name).toBe("Rolling rehearsal");
    expect(c.memory).toMatch(/Last time “Rolling rehearsal” lifted you \+20 points/);
  });
  it("tries the other strategy when the first didn't clearly help", () => {
    const c = chooseStrategy("n_back", [unclear]);
    expect(c.strategy.name).toBe("Chunk in pairs");
    expect(c.memory).toMatch(/didn't clearly help/);
  });
  it("starts with the first strategy when nothing was tried", () => {
    expect(chooseStrategy("n_back", []).strategy.name).toBe("Rolling rehearsal");
  });
});

describe("French questions", () => {
  it("detects the language without confusing English", () => {
    expect(detectLang("Pourquoi m'as-tu donné cet exercice aujourd'hui ?")).toBe("fr");
    expect(detectLang("Why did you assign me this specific exercise today?")).toBe("en");
    expect(detectLang("That last game wasn't fair, I was distracted")).toBe("en");
  });
  it("understands the four scenario questions in French", () => {
    expect(detectWhyFr("Pourquoi cet exercice aujourd'hui ?")).toBe(true);
    expect(detectDisputeFr("Ce n'était pas juste, j'étais distrait")?.reason).toBe("distraction");
    expect(detectFortuneFr("Quel sera exactement mon score le mois prochain ?")).toEqual({ horizonDays: 30, exact: true });
    expect(detectPlateauQuestion("Je stagne, mon score ne bouge plus")).toBe(true);
    expect(detectPlateauQuestion("I'm stuck, my score never moves")).toBe(true);
    expect(detectPlateauQuestion("How do I improve my memory?")).toBe(false);
  });
});
