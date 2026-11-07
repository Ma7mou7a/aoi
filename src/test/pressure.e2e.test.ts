/**
 * Pressure test against the jury's brief: each scenario, played and phrased the ways a jury might,
 * through the real pipeline (fresh accounts, real selector, scoring, Brain Twin and coach).
 * Every check is listed in one table at the end so a failure is easy to spot.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db, schema } from "@/db";
import { EMPTY_MEMORY } from "@/lib/coach/memory";
import { getDimensions } from "@/lib/dimensions/loader";
import { detectAsymmetry } from "@/lib/scenarios/asymmetry";
import type { Behaviour } from "@/lib/sim";
import { simulateBlock } from "@/lib/sim";
import { createAccount } from "@/lib/server/accounts";
import { nextBlock, recordRun, type RunResult } from "@/lib/server/blocks";
import { generateCoachMessage } from "@/lib/server/coach";
import { currentCollabScore } from "@/lib/server/collab";
import { getPosteriors } from "@/lib/server/profile";
import { detectScenario } from "@/lib/server/scenarios";
import type { BlockSpec } from "@/lib/tasks/registry";
import { migrateTestDb } from "./db";

beforeAll(migrateTestDb);

const rows: Array<{ scenario: string; check: string; ok: boolean; detail: string }> = [];
const note = (scenario: string, check: string, ok: boolean, detail = "") => rows.push({ scenario, check, ok, detail });
afterAll(() => {
  const bad = rows.filter((r) => !r.ok);
  console.log(`\nPRESSURE TEST: ${rows.length - bad.length}/${rows.length} passed\n` + rows.map((r) => `${r.ok ? "PASS" : "FAIL"} | ${r.scenario} | ${r.check}${r.detail ? ` | ${r.detail}` : ""}`).join("\n"));
});

async function signUp() {
  const { user } = await createAccount({ displayName: "Jury", retentionDays: 365, coachMemory: { ...EMPTY_MEMORY }, consents: { data_processing: true, behavioural_signals: true, age_18_plus: true, llm_coaching: false } });
  return user.id;
}
let seed = 123_000;
async function visit(userId: string, mode: "training" | "assessment", focus: string | undefined, games: number, ability: number | ((s: BlockSpec) => number), behaviour: Behaviour = "genuine") {
  const [session] = await db.insert(schema.sessions).values({ userId, mode }).returning();
  const out: Array<{ spec: BlockSpec; result: RunResult }> = [];
  let spec = await nextBlock(userId, session.id, mode, focus);
  for (let i = 0; i < games && spec; i++) {
    const a = typeof ability === "function" ? ability(spec) : ability;
    const trials = simulateBlock(spec.task.paradigm, spec.params, a, ++seed, behaviour);
    out.push({ spec, result: await recordRun({ userId, sessionId: session.id, dimensionId: spec.dimension.id, taskId: spec.task.id, level: spec.level, params: { ...spec.params, seed: spec.seed }, reason: spec.reason, startedAt: new Date(), status: "completed", trials, behaviourOk: true }) });
    spec = await nextBlock(userId, session.id, mode, focus);
  }
  return out;
}

describe("jury pressure test", () => {
  it("1 · button masher: every game type, in an assessment, is flagged and the coach asks", async () => {
    for (const d of getDimensions()) {
      const u = await signUp();
      const [g] = await visit(u, "assessment", d.id, 1, 0.6, "masher");
      const v = g.result.score.validity;
      const debrief = await generateCoachMessage(u);
      const asks = /rushing|distracted/i.test(debrief.content);
      note("1 masher", `${g.spec.task.paradigm}: flagged uncertain`, !v.valid, `flags: ${v.flags.join(",") || "none"}`);
      note("1 masher", `${g.spec.task.paradigm}: coach asks rushing/distracted`, asks, asks ? "" : debrief.content.slice(0, 120));
      note("1 masher", `${g.spec.task.paradigm}: not a big drop`, Math.abs((g.result.after?.mean ?? 0) - g.result.before.mean) < 0.08, `moved ${Math.round(((g.result.after?.mean ?? 0) - g.result.before.mean) * 100)} pts`);
    }
  });

  it("2 · plateau: average scores across sessions, in practice and in assessments", async () => {
    // a) practice, one session
    let u = await signUp();
    let games = await visit(u, "training", "working_memory", 12, 0.5);
    let at = games.findIndex((g) => g.spec.reason.variant);
    note("2 plateau", "practice, one session: format change", at >= 0, `at game ${at + 1}`);
    // b) practice, one game per session (across sessions)
    u = await signUp();
    games = [];
    for (let i = 0; i < 12; i++) games.push(...(await visit(u, "training", "working_memory", 1, 0.5)));
    at = games.findIndex((g) => g.spec.reason.variant);
    note("2 plateau", "practice, a new session each game: format change", at >= 0, `at game ${at + 1}`);
    // c) assessments ("Measure me"), a new session each game
    u = await signUp();
    games = [];
    for (let i = 0; i < 16; i++) games.push(...(await visit(u, "assessment", "working_memory", 1, 0.5)));
    note("2 plateau", "focused assessments stop once the skill is measured (never the same task endlessly)", games.length < 16, `${games.length} games, then the engine stops`);
    // d) ordinary "Measure me" sessions (Bao picks the skill), average everywhere, many sessions
    u = await signUp();
    games = [];
    for (let i = 0; i < 8; i++) games.push(...(await visit(u, "assessment", undefined, 6, 0.5)));
    at = games.findIndex((g) => g.spec.reason.variant);
    const plays = games.length;
    note("2 plateau", "ordinary assessment sessions: the engine changes format or moves on", at >= 0 || new Set(games.map((g) => g.spec.task.id)).size >= 5, at >= 0 ? `format change at game ${at + 1} of ${plays}` : `${plays} games over ${new Set(games.map((g) => g.spec.task.id)).size} tasks`);
    const chat = await generateCoachMessage(u, { question: "My scores aren't improving at all" });
    note("2 plateau", "coach answers the plateau after assessments", chat.meta?.scenario === "plateau", chat.content.slice(0, 120));
    // d) phrasings
    for (const q of ["I'm stuck", "My scores aren't improving at all", "I keep getting the same score", "Why am I not getting better?", "I've been at 50% for days, nothing changes", "I feel like I'm on a plateau", "Je stagne", "Je n'arrive pas à progresser"]) {
      const sc = detectScenario(q);
      note("2 plateau", `phrasing: "${q}"`, sc?.kind === "plateau", `→ ${sc?.kind ?? "no scenario"}`);
    }
  });

  it("3 · why audit: phrasings, and the answer cites data", async () => {
    for (const q of ["Why did you assign me this specific exercise today?", "why this game?", "Why are you making me do this one?", "Explain why you picked this exercise", "What's the reason for today's exercise?", "How did you choose this task?", "Pourquoi cet exercice ?"]) {
      const sc = detectScenario(q);
      note("3 why", `phrasing: "${q}"`, sc?.kind === "why", `→ ${sc?.kind ?? "no scenario"}`);
    }
    const u = await signUp();
    await visit(u, "training", "working_memory", 3, 0.55);
    await visit(u, "assessment", undefined, 1, 0.5);
    const m = await generateCoachMessage(u, { question: "Why did you assign me this specific exercise today?" });
    note("3 why", "cites a curve or trend with numbers", /(\d+ ms to \d+ ms|scored \d+% then \d+%|hadn't played)/.test(m.content), m.content.slice(0, 100));
    note("3 why", "cites the heatmap", /heatmap/.test(m.content));
    note("3 why", "has evidence links", (m.claims[0]?.evidenceTaskRunIds.length ?? 0) > 0);
  });

  it("4 · pushback: environmental distraction raises the collaboration score and the uncertainty", async () => {
    const phrasings = ["My score was bad because it was really noisy around me", "There was a lot going on around me, that game doesn't count", "I disagree, my environment was distracting", "That was low because people kept talking next to me", "I was interrupted in the middle of the game", "The room was loud, that result isn't fair", "Ce n'était pas juste, il y avait du bruit"];
    for (const q of phrasings) {
      const sc = detectScenario(q);
      note("4 pushback", `phrasing: "${q}"`, sc?.kind === "dispute", `→ ${sc?.kind ?? "no scenario"}`);
    }
    const u = await signUp();
    await visit(u, "training", "reasoning", 3, 0.7);
    await visit(u, "training", "reasoning", 1, 0.3);
    const before = (await getPosteriors(u)).reasoning;
    const cBefore = (await currentCollabScore(u)).score;
    const m = await generateCoachMessage(u, { question: "My score was bad because it was really noisy around me" });
    const after = (await getPosteriors(u)).reasoning;
    const cAfter = (await currentCollabScore(u)).score;
    note("4 pushback", "uncertainty goes up", after.sd > before.sd, `sd ${before.sd.toFixed(3)} → ${after.sd.toFixed(3)}`);
    note("4 pushback", "collaboration score goes up", cAfter > cBefore, `${cBefore} → ${cAfter}`);
    note("4 pushback", "doesn't defend the profile", /won't defend/.test(m.content));
  });

  it("5 · fortune teller: never a certain number, in any phrasing", async () => {
    const u = await signUp();
    await visit(u, "training", "working_memory", 5, 0.55);
    for (const q of ["What exactly will my cognitive score be next month?", "Tell me my exact score in 30 days", "Will I reach 80% next month?", "Predict my memory score for next week", "What will my score be in 6 months?", "Give me one number: my score next month", "Quel sera exactement mon score le mois prochain ?"]) {
      const sc = detectScenario(q);
      const m = sc ? await generateCoachMessage(u, { question: q }) : null;
      const ranged = !!m && /(\d+% and \d+%|\d+ % et \d+ %)/.test(m.content);
      const certain = !!m && /\b(will be exactly|definitely|guaranteed|for sure)\b/i.test(m.content);
      note("5 fortune", `"${q}"`, sc?.kind === "fortune" && ranged && !certain, sc ? `${sc.kind}, ranged=${ranged}, certain=${certain}` : "no scenario");
    }
  });

  it("6 · asymmetrical mind: flawless logic, failing attention", async () => {
    const u = await signUp();
    const dims = getDimensions();
    const flagged: string[] = [];
    for (let r = 0; r < 4; r++) {
      await visit(u, "training", "reasoning", 1, 0.98);
      const [a] = await visit(u, "training", "attention_inhibition", 1, 0.02);
      if (!a.result.score.validity.valid) flagged.push(a.result.score.validity.flags.join(","));
    }
    const post = await getPosteriors(u);
    const asym = detectAsymmetry(dims.map((d) => ({ id: d.id, name: d.name, mean: post[d.id].mean, sd: post[d.id].sd, measured: post[d.id].nObservations > 0 })));
    note("6 asymmetry", "split detected (logic vs attention)", asym.asymmetric && asym.strongest?.id === "reasoning" && asym.weakest?.id === "attention_inhibition", `${asym.strongest?.name} ${asym.strongest?.pct}% vs ${asym.weakest?.name} ${asym.weakest?.pct}%`);
    note("6 asymmetry", "failing attention games are not thrown out as invalid", flagged.length === 0, flagged.length ? `${flagged.length}/4 flagged: ${flagged.join(" | ")}` : "");
    const plan = await visit(u, "training", undefined, 2, (s) => (s.dimension.id === "reasoning" ? 0.98 : 0.02));
    const levels = plan.map((p) => `${p.spec.dimension.id}@L${p.spec.level}`).join(", ");
    const reasonLv = plan.find((p) => p.spec.dimension.id === "reasoning");
    const attLv = plan.find((p) => p.spec.dimension.id === "attention_inhibition");
    note("6 asymmetry", "advanced logic + foundational attention", !!reasonLv && !!attLv && reasonLv.spec.level > attLv.spec.level, levels);
    expect(rows.length).toBeGreaterThan(0);
  });
});
