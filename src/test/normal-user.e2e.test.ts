/**
 * The six scenarios for an ORDINARY user: a brand-new account, no jury persona, no seeded history,
 * every game chosen by the server exactly as the app does (tap "Play <skill>", then "Next game"),
 * every game played now. This is what a person recording the app by hand will go through, and it
 * tells them how many games each scenario needs.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { db, schema } from "@/db";
import { EMPTY_MEMORY } from "@/lib/coach/memory";
import { getDimensions } from "@/lib/dimensions/loader";
import { detectAsymmetry } from "@/lib/scenarios/asymmetry";
import type { Behaviour } from "@/lib/sim";
import { simulateBlock } from "@/lib/sim";
import { createAccount } from "@/lib/server/accounts";
import { nextBlock, recordRun, type RunResult } from "@/lib/server/blocks";
import { generateCoachMessage } from "@/lib/server/coach";
import { getPosteriors } from "@/lib/server/profile";
import type { BlockSpec } from "@/lib/tasks/registry";
import { migrateTestDb } from "./db";

beforeAll(migrateTestDb);

async function signUp(name: string) {
  const { user } = await createAccount({
    displayName: name,
    retentionDays: 365,
    coachMemory: { ...EMPTY_MEMORY },
    consents: { data_processing: true, behavioural_signals: true, age_18_plus: true, llm_coaching: false },
  });
  return user.id;
}

let seed = 77_000;
/** One visit to /play: a new session, then "Next game" as many times as asked. The focus rides along, as the client sends it. */
async function visit(userId: string, mode: "training" | "assessment", focus: string | undefined, games: number, ability: number | ((s: BlockSpec) => number), behaviour: Behaviour = "genuine") {
  const [session] = await db.insert(schema.sessions).values({ userId, mode }).returning();
  const out: Array<{ spec: BlockSpec; result: RunResult }> = [];
  let spec = await nextBlock(userId, session.id, mode, focus);
  for (let i = 0; i < games && spec; i++) {
    const a = typeof ability === "function" ? ability(spec) : ability;
    const trials = simulateBlock(spec.task.paradigm, spec.params, a, ++seed, behaviour);
    const result = await recordRun({ userId, sessionId: session.id, dimensionId: spec.dimension.id, taskId: spec.task.id, level: spec.level, params: { ...spec.params, seed: spec.seed }, reason: spec.reason, startedAt: new Date(), status: "completed", trials, behaviourOk: true });
    out.push({ spec, result });
    spec = await nextBlock(userId, session.id, mode, focus);
  }
  return { played: out, next: spec };
}

describe("an ordinary new user reaches every scenario through the normal app", () => {
  it("1 · masher: mashing the very first Stroop game is flagged, with the receipt and Bao's question", async () => {
    const u = await signUp("Lina");
    const { played } = await visit(u, "training", "attention_inhibition", 1, 0.6, "masher");
    const r = played[0].result;
    expect(r.score.validity.flags).toContain("rushing");
    expect(r.shield).not.toBeNull();
  });

  it("2 · plateau: steady play on one skill triggers the format change within a few games, in one session", async () => {
    const u = await signUp("Lina");
    const { played } = await visit(u, "training", "working_memory", 12, 0.55);
    const firstBuster = played.findIndex((p) => p.spec.reason.variant);
    console.log(`plateau: format change offered at game ${firstBuster + 1}; levels ${played.map((p) => p.spec.level).join(",")}; scores ${played.map((p) => Math.round((p.result.score.composite ?? 0) * 100)).join(",")}`);
    expect(firstBuster).toBeGreaterThanOrEqual(4);
    expect(played.every((p) => p.spec.dimension.id === "working_memory")).toBe(true);
    const busted = played[firstBuster];
    if (busted.spec.reason.variant?.kind === "strategy") expect(busted.result.experiment).not.toBeNull();
  });

  it("3–5 · why, pushback and fortune teller work after a handful of ordinary games", async () => {
    const u = await signUp("Lina");
    await visit(u, "training", "working_memory", 4, 0.55);
    await visit(u, "assessment", undefined, 1, 0.5);
    const why = await generateCoachMessage(u, { question: "Why this exercise today?" });
    expect(why.meta?.scenario).toBe("why");
    const push = await generateCoachMessage(u, { question: "That last game wasn't fair, I was distracted" });
    expect(push.meta?.scenario).toBe("dispute");
    const fortune = await generateCoachMessage(u, { question: "What exactly will my score be next month?" });
    expect(fortune.meta?.scenario).toBe("fortune");
    expect(fortune.content).toMatch(/\(a 90% chance\)/);
  });

  it("2b · plateau in the coach's voice: \"I'm stuck\" is checked against the data, in English and French", async () => {
    const u = await signUp("Lina");
    const early = await generateCoachMessage(u, { question: "I'm stuck, my score never moves" });
    expect(early.meta?.scenario).toBe("plateau");
    await visit(u, "training", "working_memory", 2, 0.55);
    const notYet = await generateCoachMessage(u, { question: "I'm stuck, my score never moves" });
    expect(notYet.content).toMatch(/Not a plateau yet/);
    const { played } = await visit(u, "training", "working_memory", 12, 0.55);
    const at = played.findIndex((p) => p.spec.reason.variant);
    expect(at).toBeGreaterThanOrEqual(0);
    // Ask right before the format-change game: replay to that point is not possible, so ask now and check the answer is grounded.
    const now = await generateCoachMessage(u, { question: "I'm stuck, my score never moves" });
    expect(now.meta?.scenario).toBe("plateau");
    expect(now.content).toMatch(/Reliable Change Index/);
    expect(now.meta?.chart?.kind).toBe("plateau");
    const fr = await generateCoachMessage(u, { question: "Je stagne, mon score ne bouge plus" });
    expect(fr.content).toMatch(/plateau|parties/);
    expect(fr.content).not.toMatch(/\bgames\b/);
  });

  it("3–5 in French: why (with the heatmap), pushback and fortune teller answer in French", async () => {
    const u = await signUp("Lina");
    await visit(u, "training", "working_memory", 4, 0.55);
    await visit(u, "assessment", undefined, 1, 0.5);
    const why = await generateCoachMessage(u, { question: "Pourquoi m'as-tu donné cet exercice aujourd'hui ?" });
    expect(why.meta?.scenario).toBe("why");
    expect(why.content).toMatch(/Je t'ai donné/);
    expect(why.content).toMatch(/carte d'entraînement des 7 derniers jours/);
    expect(why.meta?.chart?.kind === "decision" && why.meta.chart.heatmap?.length).toBeTruthy();
    const push = await generateCoachMessage(u, { question: "Ce n'était pas juste, j'étais distrait" });
    expect(push.meta?.scenario).toBe("dispute");
    expect(push.content).toMatch(/je ne défendrai pas/);
    const fortune = await generateCoachMessage(u, { question: "Quel sera exactement mon score le mois prochain ?" });
    expect(fortune.meta?.scenario).toBe("fortune");
    expect(fortune.content).toMatch(/Personne ne peut te donner un chiffre exact/);
    expect(fortune.content).toMatch(/90 % de chances/);
  });

  it("the English why answer cites the practice heatmap", async () => {
    const u = await signUp("Lina");
    await visit(u, "training", "working_memory", 3, 0.55);
    const why = await generateCoachMessage(u, { question: "Why this exercise today?" });
    expect(why.content).toMatch(/practice heatmap for the last 7 days/);
  });

  it("6 · asymmetrical mind: a genuinely split player is detected from real games only", async () => {
    const u = await signUp("Lina");
    const dims = getDimensions();
    const split = async () => {
      const post = await getPosteriors(u);
      return detectAsymmetry(dims.map((d) => ({ id: d.id, name: d.name, mean: post[d.id].mean, sd: post[d.id].sd, measured: post[d.id].nObservations > 0 })));
    };
    let games = 0;
    for (let round = 0; round < 4 && !(await split()).asymmetric; round++) {
      await visit(u, "training", "reasoning", 1, 0.92);
      await visit(u, "training", "processing_speed", 1, 0.1);
      games += 2;
    }
    const a = await split();
    console.log(`asymmetry after ${games} games: ${a.strongest?.name} ${a.strongest?.pct}% [${a.strongest?.band}] vs ${a.weakest?.name} ${a.weakest?.pct}% [${a.weakest?.band}]`);
    expect(a.asymmetric).toBe(true);
    const { played } = await visit(u, "training", undefined, 2, (s) => (s.dimension.id === "reasoning" ? 0.92 : 0.1));
    expect(played.map((p) => p.spec.reason.trace?.basis ?? p.spec.reason.rule).join(" ")).toMatch(/asymmetric/);
  });
});
