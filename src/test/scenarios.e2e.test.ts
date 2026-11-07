/**
 * The six surprise scenarios of the final defense, end to end: real database (migrations in memory),
 * real scoring, real Brain Twin, real coach pipeline. No AI model is involved: every answer here is
 * computed from data, so it is the same in the jury room as in this test.
 */
import { and, desc, eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { db, schema } from "@/db";
import { EMPTY_MEMORY } from "@/lib/coach/memory";
import { getDimension } from "@/lib/dimensions/loader";
import { credibleInterval } from "@/lib/profiler";
import { levelOf } from "@/lib/scoring";
import type { Behaviour } from "@/lib/sim";
import { simulateBlock } from "@/lib/sim";
import { createAccount } from "@/lib/server/accounts";
import { nextBlock, recordRun } from "@/lib/server/blocks";
import { generateCoachMessage } from "@/lib/server/coach";
import { currentCollabScore } from "@/lib/server/collab";
import { getPosteriors } from "@/lib/server/profile";
import { setRunContext } from "@/lib/server/scenarios";
import type { BlockSpec } from "@/lib/tasks/registry";
import { migrateTestDb } from "./db";

async function newUser(name: string) {
  const { user } = await createAccount({
    displayName: name,
    retentionDays: 365,
    coachMemory: { ...EMPTY_MEMORY, aiAsked: true },
    consents: { data_processing: true, behavioural_signals: true, age_18_plus: true, llm_coaching: false },
  });
  const [session] = await db.insert(schema.sessions).values({ userId: user.id, mode: "training" }).returning();
  return { userId: user.id, sessionId: session.id };
}

let seed = 1000;
/** Play one block exactly as the app would: the spec the server chose, simulated answers, recordRun. */
async function play(u: { userId: string; sessionId: string }, spec: BlockSpec, ability: number, behaviour: Behaviour = "genuine") {
  const trials = simulateBlock(spec.task.paradigm, spec.params, ability, ++seed, behaviour);
  return recordRun({
    userId: u.userId,
    sessionId: u.sessionId,
    dimensionId: spec.dimension.id,
    taskId: spec.task.id,
    level: spec.level,
    params: { ...spec.params, seed: spec.seed },
    reason: spec.reason,
    startedAt: new Date(),
    status: "completed",
    trials,
    behaviourOk: true,
  });
}

/** A fresh session focused on one skill, like tapping "Play" on that skill: its first game is that skill. */
async function specFor(u: { userId: string; sessionId: string }, focus: string) {
  const [session] = await db.insert(schema.sessions).values({ userId: u.userId, mode: "training" }).returning();
  u.sessionId = session.id;
  const s = await nextBlock(u.userId, session.id, "training", focus);
  expect(s).not.toBeNull();
  return s!;
}

/** Fix one skill's Brain Twin state directly (a snapshot, like after many games). */
async function setTwin(userId: string, dimensionId: string, mean: number, sd: number, n = 8) {
  const [ciLow, ciHigh] = credibleInterval({ mean, sd });
  await db.insert(schema.profileSnapshots).values({ userId, dimensionId, trigger: "task_run", mean, sd, ciLow, ciHigh, nObservations: n, nTrials: n * 30 });
}

beforeAll(migrateTestDb);

describe("1 · the button masher", () => {
  it("flags the block as uncertain, shows the damage avoided, and the coach asks instead of assuming", async () => {
    const u = await newUser("Masher");
    for (let i = 0; i < 3; i++) await play(u, await specFor(u, "attention_inhibition"), 0.65);
    const before = (await getPosteriors(u.userId)).attention_inhibition;

    const r = await play(u, await specFor(u, "attention_inhibition"), 0.65, "masher");
    expect(r.score.validity.flags).toContain("rushing");
    expect(r.rush.rushing).toBe(true);
    expect(r.shield).not.toBeNull();
    // Counting it as uncertain moved the Twin far less than trusting it would have.
    expect(Math.abs(r.shield!.actualPct - r.shield!.beforePct)).toBeLessThan(Math.abs(r.shield!.naivePct - r.shield!.beforePct));
    const after = (await getPosteriors(u.userId)).attention_inhibition;
    expect(Math.abs(after.mean - before.mean)).toBeLessThan(0.06);

    const ctx = await setRunContext(u.userId, r.taskRunId, "rushing");
    expect(ctx.reply).toMatch(/uncertain/);
    const debrief = await generateCoachMessage(u.userId);
    expect(debrief.content).toMatch(/flagged as uncertain/);
    // The honest answer about the flagged game counts toward responsible use.
    expect((await currentCollabScore(u.userId)).components.responsible_use.n).toBe(1);
  });
});

describe("2 · the stagnation plateau", () => {
  it("detects the plateau, changes the format, then reads the strategy experiment", async () => {
    const u = await newUser("Plateau");
    const dim = getDimension("working_memory")!;
    const task = dim.tasks[0];
    // Five games at the same level with the same score: the textbook plateau.
    for (const c of [0.55, 0.57, 0.54, 0.56, 0.55]) {
      await db.insert(schema.taskRuns).values({
        sessionId: u.sessionId, userId: u.userId, dimensionId: dim.id, taskId: task.id, configVersion: dim.version, difficultyLevel: 2,
        params: {}, selectionReason: { rule: "target_success" }, status: "completed", composite: c, observation: 0.5, observationSd: 0.2,
        validity: { valid: true, validTrials: 30, flags: [] }, startedAt: new Date(Date.now() - 60_000),
      });
    }
    const spec = await specFor(u, "working_memory");
    expect(spec.reason.variant?.kind).toBe("strategy");
    expect(spec.reason.variant?.strategy?.name).toBe("Rolling rehearsal");
    expect(spec.reason.rule).toMatch(/plateau_strategy/);
    expect(spec.reason.trace?.adjustments.join(" ")).toMatch(/plateau: 5 games near 55%/);

    const r = await play(u, spec, 0.7);
    expect(r.experiment).not.toBeNull();
    expect(r.experiment!.baselinePct).toBe(55);
    expect(["helped", "hurt", "unclear"]).toContain(r.experiment!.verdict);

    // Never two format changes in a row: the next game is a normal one, to keep measuring.
    const next = await specFor(u, "working_memory");
    expect(next.reason.variant).toBeUndefined();
  });
});

describe("3 · the why audit", () => {
  it("answers from the decision record saved with the game, with evidence and a chart", async () => {
    const u = await newUser("Why");
    for (let i = 0; i < 3; i++) await play(u, await specFor(u, "processing_speed"), 0.5);
    const m = await generateCoachMessage(u.userId, { question: "Why did you assign me this specific exercise today?" });
    expect(m.meta?.scenario).toBe("why");
    expect(m.content).toMatch(/I gave you Symbol coding|I gave you/);
    expect(m.content).toMatch(/level \d/);
    expect(m.content).toMatch(/response time went from \d+ ms to \d+ ms|scored \d+% then \d+%/);
    expect(m.meta?.chart?.kind).toBe("decision");
    expect(m.claims[0].evidenceTaskRunIds.length).toBeGreaterThanOrEqual(2);
  });
});

describe("4 · pushback", () => {
  it("re-weighs instead of defending, widens the band, and raises the collaboration score", async () => {
    const u = await newUser("Skeptic");
    for (let i = 0; i < 3; i++) await play(u, await specFor(u, "reasoning"), 0.7);
    await play(u, await specFor(u, "reasoning"), 0.25);
    expect((await getPosteriors(u.userId)).reasoning.nObservations).toBe(4);
    const before = (await getPosteriors(u.userId)).reasoning;
    const collabBefore = (await currentCollabScore(u.userId)).score;

    const m = await generateCoachMessage(u.userId, { question: "That last game isn't fair, I was distracted by my kids." });
    expect(m.meta?.scenario).toBe("dispute");
    expect(m.content).toMatch(/won't defend/);
    const after = (await getPosteriors(u.userId)).reasoning;
    expect(after.sd).toBeGreaterThan(before.sd);
    expect(after.mean).toBeGreaterThan(before.mean); // the low game now counts less
    const collabAfter = (await currentCollabScore(u.userId)).score;
    expect(collabAfter).toBeGreaterThan(collabBefore);
    const chart = m.meta?.chart;
    expect(chart?.kind === "reweigh" && chart.collab.after).toBe(collabAfter);

    const [snap] = await db.select().from(schema.profileSnapshots).where(and(eq(schema.profileSnapshots.userId, u.userId), eq(schema.profileSnapshots.trigger, "reweigh")));
    expect(snap).toBeDefined();
    const [run] = await db.select().from(schema.taskRuns).where(eq(schema.taskRuns.id, snap.taskRunId!));
    expect(run.validity?.contested?.multiplier).toBeGreaterThanOrEqual(2);

    // Asking again doesn't stack a second re-weighing on the same game.
    const again = await generateCoachMessage(u.userId, { question: "I disagree, that result is not me" });
    expect(again.content).toMatch(/already re-weighed/);
  });
});

describe("5 · the fortune teller", () => {
  it("never gives a single number: 50% and 90% ranges, widening fan, own track record", async () => {
    const u = await newUser("Fortune");
    for (let i = 0; i < 5; i++) await play(u, await specFor(u, "working_memory"), 0.55);
    const m = await generateCoachMessage(u.userId, { question: "What exactly will my memory score be next month?" });
    expect(m.meta?.scenario).toBe("fortune");
    expect(m.content).toMatch(/No one can give you an exact number/);
    expect(m.content).toMatch(/between \d+% and \d+% \(a 50% chance\)/);
    expect(m.content).toMatch(/between \d+% and \d+% \(a 90% chance\)/);
    expect(m.content).not.toMatch(/\b(will be exactly|definitely|guarantee)/i);
    const chart = m.meta?.chart;
    expect(chart?.kind).toBe("fan");
    if (chart?.kind === "fan") {
      expect(chart.horizonDays).toBe(30);
      const w = chart.points.map((p) => p.high90 - p.low90);
      expect(w[w.length - 1]).toBeGreaterThan(w[1]);
    }
  });
});

describe("6 · the asymmetrical mind", () => {
  it("alternates advanced logic with foundation attention, never an average", async () => {
    const u = await newUser("Asym");
    await setTwin(u.userId, "reasoning", 0.9, 0.05);
    await setTwin(u.userId, "attention_inhibition", 0.15, 0.05);
    for (const d of ["working_memory", "processing_speed", "cognitive_flexibility", "visuospatial_memory", "ai_reliance"]) await setTwin(u.userId, d, 0.55, 0.06);

    const first = await nextBlock(u.userId, u.sessionId, "training");
    expect(first?.dimension.id).toBe("attention_inhibition");
    expect(first?.level).toBe(levelOf(getDimension("attention_inhibition")!.tasks[0], 1).level);
    expect(first?.reason.note).toMatch(/foundation/);
    await play(u, first!, 0.15);

    const second = await nextBlock(u.userId, u.sessionId, "training");
    expect(second?.dimension.id).toBe("reasoning");
    expect(second?.reason.note).toMatch(/advanced/);
    expect(second?.reason.trace?.basis).toBe("asymmetric_stretch");

    const progress = await generateCoachMessage(u.userId, { question: "How am I doing?" });
    expect(progress.content).toMatch(/Your profile is split, not average/);
    const [msg] = await db.select().from(schema.coachMessages).where(eq(schema.coachMessages.userId, u.userId)).orderBy(desc(schema.coachMessages.createdAt)).limit(1);
    expect(msg.role).toBe("coach");
  });
});

describe("jury mode personas (what the defense will click)", () => {
  it("plateau persona: the first game it gets is a format change", async () => {
    const { createPersona } = await import("@/lib/server/jury");
    const { userId } = await createPersona("plateau");
    const u = { userId, sessionId: "" };
    const spec = await specFor(u, "working_memory");
    expect(spec.reason.variant?.kind).toBe("strategy");
  });

  it("skeptic persona: why, pushback (backed by the camera) and fortune all answer from data", async () => {
    const { createPersona } = await import("@/lib/server/jury");
    const { userId } = await createPersona("skeptic");
    const why = await generateCoachMessage(userId, { question: "Why this exercise today?" });
    expect(why.meta?.scenario).toBe("why");
    const push = await generateCoachMessage(userId, { question: "That last game wasn't fair, I was distracted" });
    expect(push.meta?.scenario).toBe("dispute");
    expect(push.content).toMatch(/Your data backs you up: the camera saw you look away/);
    const fortune = await generateCoachMessage(userId, { question: "What exactly will my score be next month?" });
    expect(fortune.meta?.scenario).toBe("fortune");
    expect(fortune.meta?.chart?.kind).toBe("fan");
  });

  it("asymmetric persona: a split profile, foundation first then stretch", async () => {
    const { createPersona } = await import("@/lib/server/jury");
    const { userId } = await createPersona("asymmetric");
    const [session] = await db.insert(schema.sessions).values({ userId, mode: "training" }).returning();
    const first = await nextBlock(userId, session.id, "training");
    expect(first?.dimension.id).toBe("attention_inhibition");
    await play({ userId, sessionId: session.id }, first!, 0.2);
    const second = await nextBlock(userId, session.id, "training");
    expect(second?.dimension.id).toBe("reasoning");
  });

  it("masher persona: three honest games, ready for a juror to mash", async () => {
    const { createPersona } = await import("@/lib/server/jury");
    const { userId } = await createPersona("masher");
    expect((await getPosteriors(userId)).attention_inhibition.nObservations).toBe(3);
  });
});
