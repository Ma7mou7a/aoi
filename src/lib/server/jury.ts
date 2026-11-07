import "server-only";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { EMPTY_MEMORY } from "../coach/memory";
import { getDimension } from "../dimensions/loader";
import { credibleInterval } from "../profiler";
import { simulateBlock, type Behaviour } from "../sim";
import { createAccount } from "./accounts";
import { nextBlock, recordRun } from "./blocks";
import { getPosteriors } from "./profile";

/**
 * Jury mode: ready-made players for the six surprise scenarios, built through the real pipeline
 * (simulated answers → scoring → Brain Twin → saved decision records), so each edge case can be shown
 * live in seconds instead of hoping a live game goes the right way. Development builds only.
 */

export type Persona = "masher" | "plateau" | "skeptic" | "asymmetric";

export const PERSONAS: Record<Persona, { name: string; title: string; scenarios: string[]; landing: string; script: string[] }> = {
  masher: {
    name: "Mo",
    title: "The Button Masher",
    scenarios: ["1 · Button Masher (Layer A)"],
    landing: "/play?mode=training&focus=attention_inhibition",
    script: [
      "Mo has 3 honest Stroop games. Hand the keyboard to a juror: mash the keys as fast as possible.",
      "Within 6 answers Bao says “Whoa, slow down”, during the game.",
      "After the game: “Flagged as uncertain” with the receipt: before / if I'd trusted it / what I recorded.",
      "Bao asks “Were you rushing?”. Answer, then open Bao: the debrief starts from that flag.",
    ],
  },
  plateau: {
    name: "Pat",
    title: "The Stagnation Plateau",
    scenarios: ["2 · Stagnation plateau (Layer C)"],
    landing: "/play?mode=training&focus=working_memory",
    script: [
      "Pat played 5 N-back games at level 2, all around 55%: flat trend, same level.",
      "Start the game: a violet “Format change” card appears with a concrete strategy (Rolling rehearsal).",
      "Finish it: the result shows “Your experiment”, strategy vs plateau, with a 90% range.",
      "Play again: a normal game (to keep measuring); the round after alternates to a stretch round 2 levels up.",
    ],
  },
  skeptic: {
    name: "Sam",
    title: "The Skeptic",
    scenarios: ["3 · “Why this exercise?”", "4 · Pushback", "5 · The Fortune Teller"],
    landing: "/coach",
    script: [
      "Tap “Why this exercise today?”: the saved decision record, ranking chart, runner-up and its margin, the response-time trend.",
      "Tap “That last game wasn't fair, I was distracted”: the camera log backs Sam up; the band widens, the collaboration score rises.",
      "Tap “What exactly will my score be next month?”: no number, a 50%/90% fan that widens, and Bao's own track record.",
    ],
  },
  asymmetric: {
    name: "Ada",
    title: "The Asymmetrical Mind",
    scenarios: ["6 · Asymmetrical mind (generalisation)"],
    landing: "/dashboard",
    script: [
      "Ada (seeded Brain Twin after several weeks): logic about 90%, attention about 18%, with non-overlapping ranges.",
      "Dashboard: the radar marks ▲ stretch and ▼ foundation, with a “Split profile, not an average” note; the weekly plan pairs advanced reasoning with level 1 attention.",
      "Play: an attention foundation game, then the engine alternates to an advanced reasoning game.",
    ],
  },
};

type Who = { userId: string; sessionId: string };
let seed = 7000;

async function session(userId: string): Promise<Who> {
  const [s] = await db.insert(schema.sessions).values({ userId, mode: "training" }).returning();
  return { userId, sessionId: s.id };
}

/** One real game on `skill`: the spec the engine picks for a fresh focused session, answered by the simulator. */
/** `skill` null: the engine chooses (no focus), so the game carries a full decision record. */
async function play(userId: string, skill: string | null, ability: number, behaviour: Behaviour = "genuine", lookAway = 0) {
  const who = await session(userId);
  const spec = (await nextBlock(userId, who.sessionId, "training", skill ?? undefined))!;
  const trials = simulateBlock(spec.task.paradigm, spec.params, ability, ++seed, behaviour).map((t, i) => (i >= 6 && i < 6 + lookAway ? { ...t, lookedAway: true } : t));
  const startedAt = new Date(Date.now() - 90_000);
  const r = await recordRun({ ...who, dimensionId: spec.dimension.id, taskId: spec.task.id, level: spec.level, params: { ...spec.params, seed: spec.seed }, reason: spec.reason, startedAt, status: "completed", trials, behaviourOk: true });
  await db.update(schema.sessions).set({ status: "completed", endedAt: new Date() }).where(eq(schema.sessions.id, who.sessionId));
  return r;
}

async function account(name: string, camera = false) {
  const { user } = await createAccount({
    displayName: name,
    retentionDays: 365,
    coachMemory: { ...EMPTY_MEMORY, aiAsked: true },
    consents: { data_processing: true, behavioural_signals: true, age_18_plus: true, llm_coaching: false, camera },
  });
  return user.id;
}

export async function createPersona(kind: Persona): Promise<{ userId: string; landing: string }> {
  const p = PERSONAS[kind];
  const userId = await account(p.name, kind === "skeptic");

  if (kind === "masher") {
    for (let i = 0; i < 3; i++) await play(userId, "attention_inhibition", 0.65);
  }

  if (kind === "plateau") {
    // The textbook plateau: five games at the same level, same score, no trend.
    const dim = getDimension("working_memory")!;
    const task = dim.tasks[0];
    const who = await session(userId);
    const composites = [0.55, 0.57, 0.54, 0.56, 0.55];
    const t0 = Date.now() - 5 * 86_400_000;
    let p = { mean: dim.profile.prior.mean, sd: dim.profile.prior.sd };
    for (const [i, c] of composites.entries()) {
      const at = new Date(t0 + i * 86_400_000);
      const obs = 0.52 + (c - 0.55) * 0.5;
      const prec = 1 / p.sd ** 2 + 1 / 0.2 ** 2;
      p = { mean: (p.mean / p.sd ** 2 + obs / 0.2 ** 2) / prec, sd: Math.sqrt(1 / prec) };
      const [run] = await db
        .insert(schema.taskRuns)
        .values({
          sessionId: who.sessionId, userId, dimensionId: dim.id, taskId: task.id, configVersion: dim.version, difficultyLevel: 2,
          params: {}, selectionReason: { rule: "target_success", note: "Growth zone." }, status: "completed", metrics: { accuracy: 0.76, median_rt_ms: 640 + i * 3 },
          composite: c, observation: obs, observationSd: 0.2, validity: { valid: true, validTrials: 30, flags: [] }, startedAt: at, endedAt: at,
        })
        .returning();
      const [lo, hi] = credibleInterval(p);
      await db.insert(schema.profileSnapshots).values({ userId, dimensionId: dim.id, taskRunId: run.id, trigger: "task_run", mean: p.mean, sd: p.sd, ciLow: lo, ciHigh: hi, nObservations: i + 1, nTrials: (i + 1) * 30, createdAt: at });
    }
  }

  if (kind === "skeptic") {
    // A learner whose memory is their weakest skill, so the engine itself assigns it (with a runner-up);
    // the last game went badly while the camera saw them look away.
    for (const d of ["processing_speed", "reasoning", "attention_inhibition", "cognitive_flexibility", "visuospatial_memory", "ai_reliance"]) await play(userId, d, 0.7);
    for (const a of [0.42, 0.45, 0.48, 0.5, 0.52]) await play(userId, "working_memory", a);
    await play(userId, null, 0.02, "genuine", 7);
  }

  if (kind === "asymmetric") {
    // Real games on every skill (the evidence the coach cites), then Ada's Brain Twin as it stands after
    // several weeks: a seeded state, so the split is certain enough to show live whatever the simulator's noise.
    for (const d of ["reasoning", "reasoning", "attention_inhibition", "attention_inhibition", "working_memory", "processing_speed", "cognitive_flexibility", "visuospatial_memory", "ai_reliance"]) {
      await play(userId, d, d === "reasoning" ? 0.95 : d === "attention_inhibition" ? 0.15 : 0.55);
    }
    const target: Record<string, [number, number]> = {
      reasoning: [0.9, 0.05],
      attention_inhibition: [0.18, 0.05],
      working_memory: [0.58, 0.07],
      processing_speed: [0.55, 0.07],
      cognitive_flexibility: [0.52, 0.07],
      visuospatial_memory: [0.6, 0.07],
      ai_reliance: [0.56, 0.08],
    };
    const posts = await getPosteriors(userId);
    const at = new Date(Date.now() + 1000);
    await db.insert(schema.profileSnapshots).values(
      Object.entries(target).map(([dimensionId, [mean, sd]]) => {
        const [ciLow, ciHigh] = credibleInterval({ mean, sd });
        return { userId, dimensionId, trigger: "task_run" as const, mean, sd, ciLow, ciHigh, nObservations: Math.max(posts[dimensionId].nObservations, 12), nTrials: 360, createdAt: at };
      }),
    );
  }

  return { userId, landing: p.landing };
}
