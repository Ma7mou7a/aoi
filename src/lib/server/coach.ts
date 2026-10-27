import "server-only";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import { resolveActions } from "../coach/actions";
import { applyClinicalGuard, finaliseDraft, type CoachDraft } from "../coach/claims";
import { buildEvidencePack, packToPrompt } from "../coach/evidence";
import { fallbackDraft } from "../coach/fallback";
import { classifyIntent, type Intent, type Pace } from "../coach/intent";
import { EMPTY_MEMORY, memoryToPrompt, shouldOfferBet, updateMemory, type CoachMemory } from "../coach/memory";
import { pickLine } from "../panda/lines";
import { Z90 } from "../profiler";
import { forecastAtPace, type PaceForecast } from "../profiler/pace";
import { scienceToPrompt, selectScience } from "../coach/science";
import { draftWithLlm } from "../coach/llm";
import { filterClinical } from "../coach/safety";
import { plantFlaw, PLANT_PROBABILITY } from "../collab/plant";
import { actualDirection, isSpecificQuestion, type Prediction } from "../collab/score";
import { createRng, newSeed } from "../rng";
import type { CoachMeta, PlantedFlawRecord } from "@/db/schema";
import { recordSignals, resolveOpenFlaws, toClientMessage, type SignalInput } from "./collab";
import { getDimensions } from "../dimensions/loader";
import { selectNext } from "../selector";
import { AVAILABLE_PARADIGMS } from "../tasks/registry";
import { getPosteriors, getProfileView } from "./profile";
import { POLICY_VERSION } from "./user";
import { inSentence } from "../text";

/** How many recent blocks the coach can see and cite. */
const RECENT_RUNS = 6;
const HISTORY_MESSAGES = 12;

export async function hasConsent(userId: string, kind: "llm_coaching" | "planted_flaws" | "behavioural_signals") {
  const [latest] = await db
    .select({ granted: schema.consents.granted })
    .from(schema.consents)
    .where(and(eq(schema.consents.userId, userId), eq(schema.consents.kind, kind)))
    .orderBy(desc(schema.consents.createdAt))
    .limit(1);
  return latest?.granted ?? false;
}

export async function buildPackForUser(userId: string, pace: Array<PaceForecast & { skill: string }> = []) {
  const dimensions = getDimensions();
  const posteriors = await getPosteriors(userId);

  const runs = await db
    .select()
    .from(schema.taskRuns)
    .where(and(eq(schema.taskRuns.userId, userId), eq(schema.taskRuns.status, "completed")))
    .orderBy(desc(schema.taskRuns.startedAt))
    .limit(RECENT_RUNS);
  const trials = runs.length
    ? await db.select().from(schema.trials).where(inArray(schema.trials.taskRunId, runs.map((r) => r.id)))
    : [];

  // First measured estimate per skill, for "change since you started".
  const firsts = await db
    .selectDistinctOn([schema.profileSnapshots.dimensionId])
    .from(schema.profileSnapshots)
    .where(and(eq(schema.profileSnapshots.userId, userId), eq(schema.profileSnapshots.trigger, "task_run")))
    .orderBy(schema.profileSnapshots.dimensionId, asc(schema.profileSnapshots.createdAt));

  const pack = buildEvidencePack({
    dimensions,
    posteriors,
    firstMeans: Object.fromEntries(firsts.map((s) => [s.dimensionId, s.mean])),
    runs: runs.map((r) => ({ ...r, validity: r.validity ?? null })),
    trials,
    pace,
  });
  const next = selectNext({ dimensions, posteriors, mode: "assessment", available: AVAILABLE_PARADIGMS });
  return { pack, nextNote: next?.reason.note };
}

/** Pace forecasts (2, 4 and 7 games a week) for one skill, from its measured history in game order. */
async function paceFor(userId: string, skill: string | undefined) {
  if (!skill) return [];
  const dim = getDimensions().find((d) => d.id === skill);
  if (!dim) return [];
  const view = await getProfileView(userId);
  const d = view.dimensions.find((x) => x.id === skill)!;
  const history = d.history.filter((h) => h.measured).map((h) => ({ mean: h.mean, sd: (h.ciHigh - h.ciLow) / (2 * Z90) || 0.1 }));
  const drift = dim.profile.uncertainty.drift_sd_per_day;
  return ([2, 4, 7] as const).flatMap((g) => {
    const f = forecastAtPace(history, { mean: d.mean, sd: d.sd }, g, drift);
    return f ? [{ ...f, skill }] : [];
  });
}

async function loadUser(userId: string) {
  const [user] = await db.select().from(schema.users).where(eq(schema.users.id, userId));
  const memory: CoachMemory = { ...EMPTY_MEMORY, ...user.coachMemory };
  return { user, memory, researchMode: !!user.preferences.researchMode };
}

const saveMemory = (userId: string, memory: CoachMemory) => db.update(schema.users).set({ coachMemory: memory }).where(eq(schema.users.id, userId));

/** What the coach page needs besides the messages: whether Bao should ask for AI consent or offer a bet. */
export async function getCoachState(userId: string) {
  const { memory, researchMode } = await loadUser(userId);
  const ai = await hasConsent(userId, "llm_coaching");
  return { needsAiAsk: !ai && !memory.aiAsked, offerBet: shouldOfferBet(memory, researchMode), researchMode };
}

/** Called after every completed block, so the coach knows what the user plays most. */
export async function rememberPlayed(userId: string, skill: string) {
  const { memory } = await loadUser(userId);
  await saveMemory(userId, updateMemory(memory, { type: "played", skill }));
}

type CoachOptions = {
  question?: string;
  prediction?: Prediction | "skip";
  /** A forecast button: answer "what if I play N games a week?" for this skill. */
  forecast?: { skill: string; gamesPerWeek: Pace };
  /** The answer to Bao's in-chat AI consent question. */
  consent?: boolean;
};

/** Bao's reply to the in-chat AI consent question: records the consent and remembers that he asked. */
async function answerConsent(userId: string, granted: boolean) {
  const { user, memory } = await loadUser(userId);
  await db.insert(schema.consents).values({ userId, kind: "llm_coaching", granted, policyVersion: POLICY_VERSION });
  const l = pickLine(granted ? "consent_yes" : "consent_no", { name: user.displayName }, memory.recentLineIds, Math.random);
  await saveMemory(userId, updateMemory(updateMemory(memory, { type: "ai_asked" }), { type: "line", id: l.id }));
  const actions = resolveActions([{ type: "show_progress" }, { type: "daily_challenge" }], getDimensions());
  const [msg] = await db
    .insert(schema.coachMessages)
    .values({ userId, role: "coach", content: l.text, nextStep: actions[0]?.label ?? null, actions, mood: granted ? "cheer" : "calm", model: "rules-v1", meta: { source: "rules", intent: "chat" } })
    .returning();
  return msg;
}

/**
 * Produce one coach message: a debrief (no question), an answer to `question`, a forecast at a pace, or
 * the reply to the AI consent question. Uses the LLM only with the user's llm_coaching consent;
 * otherwise, or if the call fails, the template coach answers the same intent. Either way the draft
 * goes through the same evidence check, number check and clinical filter before storage.
 */
export async function generateCoachMessage(userId: string, opts: CoachOptions = {}) {
  if (opts.consent !== undefined) return answerConsent(userId, opts.consent);
  const { question, prediction, forecast } = opts;
  const { user, memory: startMemory, researchMode } = await loadUser(userId);
  let memory = startMemory;
  const dims = getDimensions();

  const classified: { intent: Intent; skill?: string; alsoSkill?: string; pace?: Pace } = forecast
    ? { intent: "forecast", skill: forecast.skill, pace: forecast.gamesPerWeek }
    : question
      ? classifyIntent(question)
      : { intent: "debrief" };
  const [lastRun] = await db
    .select({ dimensionId: schema.taskRuns.dimensionId })
    .from(schema.taskRuns)
    .where(and(eq(schema.taskRuns.userId, userId), eq(schema.taskRuns.status, "completed")))
    .orderBy(desc(schema.taskRuns.startedAt))
    .limit(1);
  const latestSkill = lastRun?.dimensionId;
  const goalSkill = memory.goal && memory.goal !== "curious" ? memory.goal : undefined;
  const target = classified.skill ?? memory.favouriteSkill ?? goalSkill ?? latestSkill;
  const { pack, nextNote } = await buildPackForUser(userId, await paceFor(userId, target));
  const science = selectScience(pack, question);
  const signals: SignalInput[] = [];
  const prefix: string[] = [];
  const isDebrief = !question && !forecast;

  if (question) {
    // Follow-up = a question right after a coach answer (within 30 minutes).
    const [last] = await db
      .select({ role: schema.coachMessages.role, at: schema.coachMessages.createdAt })
      .from(schema.coachMessages)
      .where(eq(schema.coachMessages.userId, userId))
      .orderBy(desc(schema.coachMessages.createdAt))
      .limit(1);
    const clinical = filterClinical(question).blocked;
    signals.push({ signal: isSpecificQuestion(question) ? "asked_specific_question" : "asked_question" });
    signals.push({ signal: clinical ? "clinical_question" : "in_scope_question" });
    if (last?.role === "coach" && Date.now() - last.at.getTime() < 30 * 60_000) signals.push({ signal: "follow_up_question" });
  } else if (isDebrief) {
    // A new debrief: unanswered planted errors from earlier messages count as missed.
    signals.push(...(await resolveOpenFlaws(userId)));
  }

  let predictionMeta: CoachMeta["prediction"];
  if (prediction && isDebrief) {
    const outcome = await latestChange(userId);
    if (prediction === "skip") {
      signals.push({ signal: "prediction_skipped" });
      predictionMeta = { guess: "skip" };
    } else if (outcome) {
      const right = prediction === outcome.actual;
      signals.push({ signal: right ? "prediction_correct" : "prediction_wrong", details: { guess: prediction, actual: outcome.actual } });
      predictionMeta = { guess: prediction, actual: outcome.actual };
      const word = { better: "better", same: "about the same", worse: "a bit lower" }[outcome.actual];
      prefix.push(
        `You guessed “${prediction}”. Your ${inSentence(outcome.skill)} score went from ${outcome.from}% to ${outcome.to}%, so it came out ${word}${right ? ": well read!" : "."}`,
      );
    }
  }

  let source: "llm" | "rules" = "rules";
  let fallbackReason: string | undefined;
  let draft: CoachDraft | null = null;
  let modelUsed = "rules-v1";

  if (!pack.runs.length && !question) {
    fallbackReason = "no_data_yet";
  } else if (!(await hasConsent(userId, "llm_coaching"))) {
    fallbackReason = "no_llm_consent";
  } else {
    const history = await db
      .select({ role: schema.coachMessages.role, content: schema.coachMessages.content })
      .from(schema.coachMessages)
      .where(eq(schema.coachMessages.userId, userId))
      .orderBy(desc(schema.coachMessages.createdAt))
      .limit(HISTORY_MESSAGES);
    const skillName = (id: string) => dims.find((d) => d.id === id)?.name ?? id;
    const ask = forecast
      ? `USER QUESTION\nWhat if I play ${forecast.gamesPerWeek} games a week of ${skillName(forecast.skill)}?`
      : question
        ? `USER QUESTION\n${question}`
        : "TASK\nGive the user feedback on their most recent session.";
    const prompt =
      `EVIDENCE PACK\n${packToPrompt(pack)}\n\n` +
      `${scienceToPrompt(science)}\n\n` +
      `ABOUT THE USER (name: ${user.displayName})\n${memoryToPrompt(memory, dims)}\n\n` +
      `USER INTENT (keyword guess, may be wrong): ${classified.intent}${classified.skill ? `, skill id ${classified.skill}` : ""}\n\n` +
      (nextNote ? `SUGGESTED NEXT BLOCK (from the adaptive selector)\n${nextNote}\n\n` : "") +
      (history.length ? `RECENT CONVERSATION (oldest first)\n${history.reverse().map((m) => `${m.role}: ${m.content}`).join("\n")}\n\n` : "") +
      ask;
    const res = await draftWithLlm(prompt);
    if (res.ok) {
      draft = res.draft;
      modelUsed = res.model;
      source = "llm";
    } else fallbackReason = res.reason;
  }

  let context = `${nextNote ?? ""}\n${question ?? ""}`;
  const lineIds: string[] = [];
  if (!draft) {
    const fb = fallbackDraft({ ...classified, question, name: user.displayName }, pack, memory, nextNote, Math.random, dims);
    draft = fb.draft;
    lineIds.push(...fb.lineIds);
    context += `\n${fb.context}`;
  }

  const final = finaliseDraft(draft, pack, science, context, dims);
  // A forecast answer shouldn't offer the pace that was just asked about.
  if (classified.pace) final.actions = final.actions.filter((a) => a.forecast?.gamesPerWeek !== classified.pace);
  final.content = applyClinicalGuard(question, final.content);
  if (prefix.length) final.content = `${prefix.join(" ")} ${final.content}`;

  // Spot-the-error mode (research mode + opt-in): sometimes change one number so it no longer matches the evidence.
  let plantedFlaw: PlantedFlawRecord | null = null;
  let claims = final.claims;
  if (isDebrief && researchMode && claims.length >= 2 && (await hasConsent(userId, "planted_flaws"))) {
    const rng = createRng(newSeed());
    if (rng.next() < PLANT_PROBABILITY) {
      const planted = plantFlaw(claims, rng);
      if (planted) {
        claims = planted.claims;
        plantedFlaw = planted.flaw;
      }
    }
  }

  // Store the question only now, so it isn't also part of the history sent above.
  if (question) await db.insert(schema.coachMessages).values({ userId, role: "user", content: question });
  const intent: Intent = draft.intent ?? classified.intent;
  const [msg] = await db
    .insert(schema.coachMessages)
    .values({
      userId,
      role: "coach",
      content: final.content,
      nextStep: final.nextStep || null,
      claims,
      actions: final.actions,
      mood: final.mood,
      plantedFlaw,
      filteredTerms: final.filteredTerms,
      model: modelUsed,
      meta: {
        source,
        fallbackReason,
        dropped: final.dropped,
        unknownScience: final.unknownScience,
        prediction: predictionMeta,
        intent,
        ...(isDebrief ? { bet: prediction !== undefined } : {}),
      },
    })
    .returning();

  if (question || forecast) memory = updateMemory(memory, { type: "question", intent: classified.intent, skill: classified.skill });
  for (const id of lineIds) memory = updateMemory(memory, { type: "line", id });
  if (isDebrief) memory = updateMemory(memory, { type: "debrief", bet: prediction !== undefined });
  await saveMemory(userId, memory);
  await recordSignals(userId, signals.map((s) => ({ ...s, coachMessageId: s.coachMessageId ?? msg.id })));
  return msg;
}

/** How the most recently played skill's estimate moved with its latest block. */
async function latestChange(userId: string) {
  const [run] = await db
    .select({ dimensionId: schema.taskRuns.dimensionId })
    .from(schema.taskRuns)
    .where(and(eq(schema.taskRuns.userId, userId), eq(schema.taskRuns.status, "completed")))
    .orderBy(desc(schema.taskRuns.startedAt))
    .limit(1);
  if (!run) return null;
  const snaps = await db
    .select({ mean: schema.profileSnapshots.mean })
    .from(schema.profileSnapshots)
    .where(and(eq(schema.profileSnapshots.userId, userId), eq(schema.profileSnapshots.dimensionId, run.dimensionId)))
    .orderBy(desc(schema.profileSnapshots.createdAt))
    .limit(2);
  if (snaps.length < 2) return null;
  const skill = getDimensions().find((d) => d.id === run.dimensionId)?.name ?? run.dimensionId;
  return { skill, from: Math.round(snaps[1].mean * 100), to: Math.round(snaps[0].mean * 100), actual: actualDirection(snaps[1].mean, snaps[0].mean) };
}

export async function listCoachMessages(userId: string) {
  const rows = await db.select().from(schema.coachMessages).where(eq(schema.coachMessages.userId, userId)).orderBy(asc(schema.coachMessages.createdAt));
  return rows.map(toClientMessage);
}

/** The exact blocks and trials behind a claim, scoped to the user. */
export async function getEvidence(userId: string, runIds: string[], trialIds: string[]) {
  const runs = runIds.length
    ? await db.select().from(schema.taskRuns).where(and(eq(schema.taskRuns.userId, userId), inArray(schema.taskRuns.id, runIds)))
    : [];
  const trials = trialIds.length
    ? await db
        .select()
        .from(schema.trials)
        .where(and(eq(schema.trials.userId, userId), inArray(schema.trials.id, trialIds)))
        .orderBy(asc(schema.trials.trialIndex))
    : [];
  const dims = getDimensions();
  return {
    runs: runs.map((r) => {
      const dim = dims.find((d) => d.id === r.dimensionId);
      return {
        id: r.id,
        skill: dim?.name ?? r.dimensionId,
        task: dim?.tasks.find((t) => t.id === r.taskId)?.name ?? r.taskId,
        paradigm: dim?.tasks.find((t) => t.id === r.taskId)?.paradigm ?? null,
        level: r.difficultyLevel,
        startedAt: r.startedAt.toISOString(),
        composite: r.composite,
        metrics: r.metrics,
        validity: r.validity,
      };
    }),
    trials: trials.map((t) => ({
      id: t.id,
      taskRunId: t.taskRunId,
      trialIndex: t.trialIndex,
      stimulus: t.stimulus,
      expected: t.expected,
      response: t.response,
      outcome: t.outcome,
      correct: t.correct,
      rtMs: t.rtMs,
    })),
  };
}
