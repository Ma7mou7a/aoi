import "server-only";
import { and, asc, desc, eq, gt } from "drizzle-orm";
import { db, schema } from "@/db";
import { COMPONENTS, computeCollabScore, SIGNALS, type CollabScore, type Component, type Signal } from "../collab/score";
import { HttpError } from "./user";

type CoachMessageRow = typeof schema.coachMessages.$inferSelect;

/** `value` overrides the signal's default for graded signals (e.g. a game block's rate). */
export type SignalInput = { signal: Signal; coachMessageId?: string | null; details?: Record<string, unknown>; value?: number };

/** Score from every event this user has, recomputed live (cheap: a few hundred rows at most). */
export async function currentCollabScore(userId: string): Promise<CollabScore> {
  const events = await db
    .select({ component: schema.collabEvents.component, value: schema.collabEvents.value })
    .from(schema.collabEvents)
    .where(eq(schema.collabEvents.userId, userId));
  return computeCollabScore(events as Array<{ component: Component; value: number }>);
}

/** Append signals, then store a score snapshot so the score has a history. */
export async function recordSignals(userId: string, inputs: SignalInput[]): Promise<CollabScore> {
  if (inputs.length) {
    await db.insert(schema.collabEvents).values(
      inputs.map((i) => ({
        userId,
        coachMessageId: i.coachMessageId ?? null,
        component: SIGNALS[i.signal].component,
        signal: i.signal,
        value: i.value ?? SIGNALS[i.signal].value,
        details: i.details ?? null,
      })),
    );
  }
  const score = await currentCollabScore(userId);
  if (inputs.length) {
    const [first] = await db
      .select({ at: schema.collabEvents.createdAt })
      .from(schema.collabEvents)
      .where(eq(schema.collabEvents.userId, userId))
      .orderBy(asc(schema.collabEvents.createdAt))
      .limit(1);
    await db.insert(schema.collabScores).values({
      userId,
      score: score.score,
      components: Object.fromEntries(COMPONENTS.map((c) => [c, score.components[c].score])) as Record<Component, number>,
      weights: score.weights,
      formulaVersion: score.formulaVersion,
      nEvents: score.nEvents,
      windowStart: first?.at ?? new Date(),
    });
  }
  return score;
}

export async function getCollabView(userId: string) {
  const [score, history, recent] = await Promise.all([
    currentCollabScore(userId),
    db.select({ score: schema.collabScores.score, at: schema.collabScores.createdAt }).from(schema.collabScores).where(eq(schema.collabScores.userId, userId)).orderBy(asc(schema.collabScores.createdAt)),
    db.select().from(schema.collabEvents).where(eq(schema.collabEvents.userId, userId)).orderBy(desc(schema.collabEvents.createdAt)).limit(8),
  ]);
  return {
    score,
    history: history.map((h) => ({ score: h.score, at: h.at.toISOString() })),
    recent: recent.map((e) => ({ signal: e.signal, label: SIGNALS[e.signal as Signal]?.label ?? e.signal, value: e.value, at: e.createdAt.toISOString() })),
  };
}
export type CollabView = Awaited<ReturnType<typeof getCollabView>>;

/** Never let the client see which claim is planted before the user has answered. */
export function toClientMessage(m: CoachMessageRow) {
  const revealed = m.plantedFlaw && m.plantedFlaw.caught !== undefined;
  return {
    ...m,
    plantedFlaw: revealed ? m.plantedFlaw : null,
    /** True while a planted error is still hidden in this message (tells the UI to show the spot-the-error hint). */
    hasHiddenFlaw: !!m.plantedFlaw && !revealed,
    createdAt: m.createdAt.toISOString(),
  };
}
export type ClientCoachMessage = ReturnType<typeof toClientMessage>;

/** Reveal a planted flaw: record the outcome and restore the correct text. */
function revealFlaw(m: CoachMessageRow, caught: boolean): Pick<CoachMessageRow, "plantedFlaw" | "claims"> {
  const flaw = m.plantedFlaw!;
  const claims = m.claims.map((c, i) => (i === flaw.claimIndex ? { ...c, why: flaw.original } : c));
  return { plantedFlaw: { ...flaw, caught }, claims };
}

/** When the user moves on to a new debrief, any unanswered planted flaw counts as missed (and is revealed). */
export async function resolveOpenFlaws(userId: string): Promise<SignalInput[]> {
  const open = (await db.select().from(schema.coachMessages).where(and(eq(schema.coachMessages.userId, userId), eq(schema.coachMessages.role, "coach")))).filter(
    (m) => m.plantedFlaw && m.plantedFlaw.caught === undefined,
  );
  for (const m of open) {
    await db.update(schema.coachMessages).set(revealFlaw(m, false)).where(eq(schema.coachMessages.id, m.id));
  }
  return open.map((m) => ({ signal: "missed_planted_flaw" as const, coachMessageId: m.id, details: { reason: "moved_on" } }));
}

export type ClaimAction = "opened_evidence" | "looks_right" | "something_off";

/** A user's reaction to one claim → collaboration signals (and a planted-flaw reveal when relevant). */
export async function handleClaimFeedback(userId: string, messageId: string, claimIndex: number, action: ClaimAction) {
  const [m] = await db
    .select()
    .from(schema.coachMessages)
    .where(and(eq(schema.coachMessages.id, messageId), eq(schema.coachMessages.userId, userId), eq(schema.coachMessages.role, "coach")));
  if (!m) throw new HttpError(404, "Message not found");
  if (claimIndex < 0 || claimIndex >= m.claims.length) throw new HttpError(400, "No such claim");

  const meta = { ...(m.meta ?? { source: "rules" as const }) };
  const signals: SignalInput[] = [];
  let update: Partial<CoachMessageRow> = {};

  if (action === "opened_evidence") {
    const opened = meta.opened ?? [];
    if (!opened.includes(claimIndex)) {
      meta.opened = [...opened, claimIndex];
      signals.push({ signal: "opened_evidence", coachMessageId: m.id, details: { claimIndex } });
    }
  } else if (!meta.feedback?.[claimIndex]) {
    meta.feedback = { ...meta.feedback, [claimIndex]: action };
    const isFlaw = m.plantedFlaw?.claimIndex === claimIndex && m.plantedFlaw.caught === undefined;
    const checked = meta.opened?.includes(claimIndex) ?? false;
    if (isFlaw) {
      const caught = action === "something_off";
      signals.push({ signal: caught ? "caught_planted_flaw" : "missed_planted_flaw", coachMessageId: m.id, details: { claimIndex, checked } });
      update = revealFlaw(m, caught);
    } else if (action === "looks_right") {
      signals.push({ signal: checked ? "verified_then_accepted" : "accepted_unchecked", coachMessageId: m.id, details: { claimIndex } });
    } else {
      signals.push({ signal: "flagged_correct_claim", coachMessageId: m.id, details: { claimIndex, checked } });
    }
  }

  const [updated] = await db.update(schema.coachMessages).set({ ...update, meta }).where(eq(schema.coachMessages.id, m.id)).returning();
  const score = await recordSignals(userId, signals);
  return { message: toClientMessage(updated), score };
}

/** Coach suggestion → user started a session afterwards: that's iteration. */
export async function signalActedOnAdvice(userId: string, previousSessionStart: Date | null): Promise<SignalInput[]> {
  const [latest] = await db
    .select({ id: schema.coachMessages.id, nextStep: schema.coachMessages.nextStep, at: schema.coachMessages.createdAt })
    .from(schema.coachMessages)
    .where(and(eq(schema.coachMessages.userId, userId), eq(schema.coachMessages.role, "coach")))
    .orderBy(desc(schema.coachMessages.createdAt))
    .limit(1);
  if (!latest?.nextStep) return [];
  if (previousSessionStart && previousSessionStart > latest.at) return [];
  return [{ signal: "acted_on_advice", coachMessageId: latest.id }];
}

/** Visiting data settings counts as responsible use, at most once a week. */
export async function signalReviewedSettings(userId: string) {
  const weekAgo = new Date(Date.now() - 7 * 86_400_000);
  const [recent] = await db
    .select({ id: schema.collabEvents.id })
    .from(schema.collabEvents)
    .where(and(eq(schema.collabEvents.userId, userId), eq(schema.collabEvents.signal, "reviewed_data_settings"), gt(schema.collabEvents.createdAt, weekAgo)))
    .limit(1);
  if (!recent) await recordSignals(userId, [{ signal: "reviewed_data_settings" }]);
}
