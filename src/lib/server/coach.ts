import "server-only";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import { finaliseDraft, ruleBasedDraft } from "../coach/claims";
import { buildEvidencePack, packToPrompt } from "../coach/evidence";
import { scienceToPrompt, selectScience } from "../coach/science";
import { draftWithLlm } from "../coach/llm";
import { filterClinical, NON_CLINICAL_NOTE } from "../coach/safety";
import { plantFlaw, PLANT_PROBABILITY } from "../collab/plant";
import { actualDirection, isSpecificQuestion, type Prediction } from "../collab/score";
import { createRng, newSeed } from "../rng";
import type { CoachMeta, PlantedFlawRecord } from "@/db/schema";
import { recordSignals, resolveOpenFlaws, toClientMessage, type SignalInput } from "./collab";
import { getDimensions } from "../dimensions/loader";
import { selectNext } from "../selector";
import { AVAILABLE_PARADIGMS } from "../tasks/registry";
import { getPosteriors } from "./profile";

/** How many recent blocks the coach can see and cite. */
const RECENT_RUNS = 6;
const HISTORY_MESSAGES = 6;

export async function hasConsent(userId: string, kind: "llm_coaching" | "planted_flaws" | "behavioural_signals") {
  const [latest] = await db
    .select({ granted: schema.consents.granted })
    .from(schema.consents)
    .where(and(eq(schema.consents.userId, userId), eq(schema.consents.kind, kind)))
    .orderBy(desc(schema.consents.createdAt))
    .limit(1);
  return latest?.granted ?? false;
}

export async function buildPackForUser(userId: string) {
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
  });
  const next = selectNext({ dimensions, posteriors, mode: "assessment", available: AVAILABLE_PARADIGMS });
  return { pack, nextNote: next?.reason.note };
}

/**
 * Produce one coach message (a session debrief, or an answer to `question`). Uses the LLM only with
 * the user's llm_coaching consent; otherwise, or if the call fails, the rule-based coach answers.
 * Either way the draft goes through the same evidence check and clinical filter before storage.
 */
export async function generateCoachMessage(userId: string, opts: { question?: string; prediction?: Prediction | "skip" } = {}) {
  const { question, prediction } = opts;
  const { pack, nextNote } = await buildPackForUser(userId);
  const science = selectScience(pack, question);
  const signals: SignalInput[] = [];
  const prefix: string[] = [];

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
  } else {
    // A new debrief: unanswered planted errors from earlier messages count as missed.
    signals.push(...(await resolveOpenFlaws(userId)));
  }

  let predictionMeta: CoachMeta["prediction"];
  if (prediction && !question) {
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
        `You guessed “${prediction}”. Your ${outcome.skill.toLowerCase()} estimate went from ${outcome.from}% to ${outcome.to}%, so it came out ${word}${right ? ": well read!" : "."}`,
      );
    }
  }

  let source: "llm" | "rules" = "rules";
  let fallbackReason: string | undefined;
  let draft = null;
  let modelUsed = "rules-v1";

  if (!pack.runs.length) {
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
    const prompt =
      `EVIDENCE PACK\n${packToPrompt(pack)}\n\n` +
      `${scienceToPrompt(science)}\n\n` +
      (nextNote ? `SUGGESTED NEXT BLOCK (from the adaptive selector)\n${nextNote}\n\n` : "") +
      (history.length ? `RECENT CONVERSATION (oldest first)\n${history.reverse().map((m) => `${m.role}: ${m.content}`).join("\n")}\n\n` : "") +
      (question ? `USER QUESTION\n${question}` : "TASK\nGive the user feedback on their most recent session.");
    const res = await draftWithLlm(prompt);
    if (res.ok) {
      draft = res.draft;
      modelUsed = res.model;
      source = "llm";
    } else fallbackReason = res.reason;
  }

  const final = finaliseDraft(draft ?? ruleBasedDraft(pack, nextNote, science), pack, science, `${nextNote ?? ""}\n${question ?? ""}`);
  if (question && source === "rules" && pack.runs.length) {
    final.content = `I can only answer free-form questions when AI coaching is on, but here's what your results show. ${final.content}`;
  }
  // A question about a health condition always gets the non-clinical answer first, whatever the source.
  if (question && filterClinical(question).blocked && !final.content.startsWith(NON_CLINICAL_NOTE)) {
    final.content = `${NON_CLINICAL_NOTE} ${final.content}`;
  }
  if (prefix.length) final.content = `${prefix.join(" ")} ${final.content}`;

  // Spot-the-error mode (opt-in): sometimes change one number so it no longer matches the evidence.
  let plantedFlaw: PlantedFlawRecord | null = null;
  let claims = final.claims;
  if (!question && claims.length >= 2 && (await hasConsent(userId, "planted_flaws"))) {
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
  const [msg] = await db
    .insert(schema.coachMessages)
    .values({
      userId,
      role: "coach",
      content: final.content,
      nextStep: final.nextStep || null,
      claims,
      plantedFlaw,
      filteredTerms: final.filteredTerms,
      model: modelUsed,
      meta: { source, fallbackReason, dropped: final.dropped, unknownScience: final.unknownScience, prediction: predictionMeta },
    })
    .returning();
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
