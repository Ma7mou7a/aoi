import "server-only";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import { finaliseDraft, ruleBasedDraft } from "../coach/claims";
import { buildEvidencePack, packToPrompt } from "../coach/evidence";
import { COACH_MODEL, draftWithLlm } from "../coach/llm";
import { filterClinical, NON_CLINICAL_NOTE } from "../coach/safety";
import { getDimensions } from "../dimensions/loader";
import { selectNext } from "../selector";
import { AVAILABLE_PARADIGMS } from "../tasks/registry";
import { getPosteriors } from "./profile";

/** How many recent blocks the coach can see and cite. */
const RECENT_RUNS = 6;
const HISTORY_MESSAGES = 6;

async function hasConsent(userId: string, kind: "llm_coaching") {
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
export async function generateCoachMessage(userId: string, question?: string) {
  const { pack, nextNote } = await buildPackForUser(userId);

  let source: "llm" | "rules" = "rules";
  let fallbackReason: string | undefined;
  let draft = null;

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
      (nextNote ? `SUGGESTED NEXT BLOCK (from the adaptive selector)\n${nextNote}\n\n` : "") +
      (history.length ? `RECENT CONVERSATION (oldest first)\n${history.reverse().map((m) => `${m.role}: ${m.content}`).join("\n")}\n\n` : "") +
      (question ? `USER QUESTION\n${question}` : "TASK\nGive the user feedback on their most recent session.");
    const res = await draftWithLlm(prompt);
    if (res.ok) {
      draft = res.draft;
      source = "llm";
    } else fallbackReason = res.reason;
  }

  const final = finaliseDraft(draft ?? ruleBasedDraft(pack, nextNote), pack);
  if (question && source === "rules" && pack.runs.length) {
    final.content = `I can only answer free-form questions when AI coaching is on, but here's what your results show. ${final.content}`;
  }
  // A question about a health condition always gets the non-clinical answer first, whatever the source.
  if (question && filterClinical(question).blocked && !final.content.startsWith(NON_CLINICAL_NOTE)) {
    final.content = `${NON_CLINICAL_NOTE} ${final.content}`;
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
      claims: final.claims,
      filteredTerms: final.filteredTerms,
      model: source === "llm" ? COACH_MODEL : "rules-v1",
      meta: { source, fallbackReason, dropped: final.dropped },
    })
    .returning();
  return msg;
}

export async function listCoachMessages(userId: string) {
  return db.select().from(schema.coachMessages).where(eq(schema.coachMessages.userId, userId)).orderBy(asc(schema.coachMessages.createdAt));
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
