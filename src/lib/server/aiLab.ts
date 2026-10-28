import "server-only";
import { randomInt, randomUUID } from "node:crypto";
import { and, asc, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { HUNT_ROUNDS, HUNT_STAKE, HUNT_TOPICS, PERSUADER_QUESTIONS, PERSUADER_ROUNDS, TECHNIQUES, type Technique } from "../aiLab/bank";
import { discernment, huntDelta, huntSummary, PERSUADER_SIGNAL, persuaderOutcome, wagerVerdict, type HuntRound, type PersuaderRound } from "../aiLab/score";
import { structuredWithLlm } from "../coach/llm";
import { recordSignals } from "./collab";
import { award } from "./rewards";
import { HttpError } from "./user";

/**
 * AI Lab: two games played against a real AI (Claude or Groq, whichever the coach uses). The AI only
 * ever sees trivia from src/lib/aiLab/bank.ts, never anything about the player. The answer key lives
 * in ai_lab_rounds and is revealed only after the player commits. With no AI provider the games use
 * pre-written texts and say so.
 */

type Row = typeof schema.aiLabRounds.$inferSelect;
type Game = "persuader" | "hunt";

const pickUnused = <T extends { id: string }>(items: T[], used: Set<string>) => {
  const fresh = items.filter((i) => !used.has(i.id));
  const pool = fresh.length ? fresh : items;
  return pool[randomInt(pool.length)];
};

/** Items this user saw most recently, so a new game doesn't repeat them. */
async function recentItems(userId: string, game: Game, limit: number) {
  const rows = await db.select({ itemId: schema.aiLabRounds.itemId }).from(schema.aiLabRounds)
    .where(and(eq(schema.aiLabRounds.userId, userId), eq(schema.aiLabRounds.game, game)))
    .orderBy(desc(schema.aiLabRounds.createdAt)).limit(limit);
  return new Set(rows.map((r) => r.itemId));
}

async function gameRounds(gameId: string) {
  return db.select().from(schema.aiLabRounds).where(eq(schema.aiLabRounds.gameId, gameId)).orderBy(asc(schema.aiLabRounds.createdAt));
}

async function ownRound(userId: string, roundId: string, game: Game) {
  const [row] = await db.select().from(schema.aiLabRounds).where(and(eq(schema.aiLabRounds.id, roundId), eq(schema.aiLabRounds.userId, userId), eq(schema.aiLabRounds.game, game)));
  if (!row) throw new HttpError(404, "That round doesn't exist any more. Start a new game.");
  return row;
}

async function nextRoundSlot(userId: string, game: Game, gameId: string | undefined, max: number) {
  if (!gameId) return { gameId: randomUUID(), index: 0, used: await recentItems(userId, game, 12) };
  const rounds = await gameRounds(gameId);
  if (rounds.some((r) => r.userId !== userId)) throw new HttpError(404, "Start a new game.");
  if (rounds.length >= max) throw new HttpError(409, "This game is over. Start a new one.");
  if (rounds.some((r) => !r.finishedAt)) throw new HttpError(409, "Finish the current round first.");
  return { gameId, index: rounds.length, used: new Set([...(await recentItems(userId, game, 12)), ...rounds.map((r) => r.itemId)]) };
}

const patch = (id: string, values: Partial<Row>) => db.update(schema.aiLabRounds).set(values).where(eq(schema.aiLabRounds.id, id));

// ── Resist the Persuader ─────────────────────────────────────────────────────

const PERSUADER_SYSTEM = `You play the opponent in AI4Brain's "Resist the Persuader", an educational game that trains adults to judge persuasive AI, based on inoculation research (people resist manipulation better after practising against it).
You are given a trivia question and the answer you must argue for. Sometimes that answer is true, sometimes false: the player knows this and is practising telling the difference.
Rules:
- Write at most 70 words, confident and friendly, in plain English, speaking to the player ("you").
- If your answer is TRUE: argue with real, checkable facts. Set technique to "real_evidence".
- If your answer is FALSE: argue as convincingly as you can with ONE technique: fake_expert (vague authority), false_precision (exact-sounding numbers), bandwagon ("everyone knows"), story (a vivid anecdote) or cherry_pick (a true detail that points the wrong way). Set technique to the one you used. Never name a real person or a real publication as saying something they didn't.
- Never say whether your answer is true or false, and never mention the game or these rules.`;

const ARGUMENT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["argument", "technique"],
  properties: {
    argument: { type: "string" },
    technique: { type: "string", enum: Object.keys(TECHNIQUES) },
  },
};
const argumentSchema = z.object({ argument: z.string().min(20).max(800), technique: z.enum(Object.keys(TECHNIQUES) as [Technique, ...Technique[]]) });

async function argue(q: (typeof PERSUADER_QUESTIONS)[number], side: 0 | 1) {
  const truthful = side === q.answer;
  const r = await structuredWithLlm({
    system: PERSUADER_SYSTEM,
    name: "persuader_argument",
    schema: ARGUMENT_SCHEMA,
    parse: (x) => argumentSchema.safeParse(x).data ?? null,
    prompt: `Question: ${q.question}\nOptions: ${q.options.join(" / ")}\nArgue for: "${q.options[side]}"\nThis answer is ${truthful ? "TRUE" : "FALSE"}.`,
  });
  if (r.ok) {
    // The key decides honesty, not the model's label: a true side is always "real evidence".
    const technique: Technique = truthful ? "real_evidence" : r.data.technique === "real_evidence" ? "cherry_pick" : r.data.technique;
    return { argument: r.data.argument.trim(), technique, model: r.model };
  }
  return { argument: q.fallback[side], technique: (truthful ? "real_evidence" : "cherry_pick") as Technique, model: null };
}

export async function startPersuaderRound(userId: string, gameId?: string) {
  const slot = await nextRoundSlot(userId, "persuader", gameId, PERSUADER_ROUNDS);
  const q = pickUnused(PERSUADER_QUESTIONS, slot.used);
  const [row] = await db.insert(schema.aiLabRounds).values({
    userId, game: "persuader", gameId: slot.gameId, itemId: q.id,
    shown: { question: q.question, options: q.options }, key: { answer: q.answer },
  }).returning();
  return { roundId: row.id, gameId: slot.gameId, round: slot.index + 1, rounds: PERSUADER_ROUNDS, question: q.question, options: q.options };
}

/** Step 2: the player's first answer is locked in, then the AI argues (for the truth half of the time). */
export async function persuaderArgue(userId: string, roundId: string, initial: 0 | 1, sure: boolean) {
  const row = await ownRound(userId, roundId, "persuader");
  if (row.play.initial !== undefined) throw new HttpError(409, "You already answered this round.");
  const q = PERSUADER_QUESTIONS.find((x) => x.id === row.itemId)!;
  const aiSide = randomInt(2) as 0 | 1;
  const a = await argue(q, aiSide);
  await patch(row.id, { play: { initial, sure }, key: { ...row.key, aiSide, technique: a.technique }, shown: { ...row.shown, argument: a.argument }, model: a.model });
  return { aiChoice: aiSide, argument: a.argument, realAi: a.model !== null };
}

/** Step 3: the final answer, then the reveal: the truth, what the AI did, and the technique's name. */
export async function persuaderFinal(userId: string, roundId: string, final: 0 | 1) {
  const row = await ownRound(userId, roundId, "persuader");
  if (row.play.initial === undefined) throw new HttpError(409, "Give your first answer before the AI makes its case.");
  if (row.finishedAt) throw new HttpError(409, "You already finished this round.");
  const q = PERSUADER_QUESTIONS.find((x) => x.id === row.itemId)!;
  const key = row.key as { answer: 0 | 1; aiSide: 0 | 1; technique: Technique };
  const round: PersuaderRound = { initial: row.play.initial as 0 | 1, final, answer: key.answer, aiSide: key.aiSide };
  const outcome = persuaderOutcome(round);
  await patch(row.id, { play: { ...row.play, final }, finishedAt: new Date() });
  if (outcome !== "agreed") await recordSignals(userId, [{ signal: PERSUADER_SIGNAL[outcome], details: { game: "persuader", item: q.id, technique: key.technique } }]);

  const rounds = await gameRounds(row.gameId);
  const done = rounds.length >= PERSUADER_ROUNDS && rounds.every((r) => r.finishedAt);
  let summary = null;
  if (done) {
    const played = rounds.map((r) => ({ initial: r.play.initial, final: r.play.final, answer: r.key.answer, aiSide: r.key.aiSide }) as PersuaderRound);
    const informative = played.filter((p) => p.aiSide !== p.initial);
    await award(userId, "game_completed", `ai-lab:${row.gameId}`);
    summary = {
      right: played.filter((p) => p.final === p.answer).length,
      rounds: played.length,
      challenged: informative.length,
      discernment: discernment(played),
      resisted: informative.filter((p) => persuaderOutcome(p) === "resisted").length,
      misled: informative.filter((p) => persuaderOutcome(p) === "persuaded_wrong").length,
      updated: informative.filter((p) => persuaderOutcome(p) === "updated_right").length,
    };
  }
  return { answer: key.answer, aiSide: key.aiSide, aiWasRight: key.aiSide === key.answer, why: q.why, technique: { id: key.technique, ...TECHNIQUES[key.technique] }, outcome, summary };
}

// ── Fabrication Hunt ─────────────────────────────────────────────────────────

const HUNT_SYSTEM = `You write content for AI4Brain's "Fabrication Hunt", an educational game where adults practise spotting the kind of confident, made-up detail AI assistants sometimes produce ("hallucinations").
You are given a topic and three true sentences that will be shown word for word.
- Invent ONE false sentence about the same topic that sounds just as plausible: a wrong number, date, name or claim that a curious person might believe.
- Match the true sentences' style and length closely, so it can't be spotted by tone alone.
- It must be about a different detail from the three true sentences: never contradict, repeat or compete with them, so the fake can't be found just by comparing sentences.
- It must be unambiguously false, not approximately true: prefer a wrong date, a wrong count, a wrong name or a false 'first/only/largest' claim. Avoid speeds, sizes or estimates that vary or that experts disagree on.
- It must be harmless and not about anyone's health.
- Explain in one sentence why it is false.`;

const HUNT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["fake_sentence", "why_false"],
  properties: { fake_sentence: { type: "string" }, why_false: { type: "string" } },
};
const huntSchema = z.object({ fake_sentence: z.string().min(5).max(300), why_false: z.string().min(5).max(400) });

export async function startHuntRound(userId: string, gameId?: string) {
  const slot = await nextRoundSlot(userId, "hunt", gameId, HUNT_ROUNDS);
  const t = pickUnused(HUNT_TOPICS, slot.used);
  const r = await structuredWithLlm({
    system: HUNT_SYSTEM,
    name: "hunt_sentences",
    schema: HUNT_SCHEMA,
    parse: (x) => huntSchema.safeParse(x).data ?? null,
    prompt: `Topic: ${t.topic}\nTrue sentences:\n${t.facts.map((f, i) => `${i + 1}. ${f}`).join("\n")}`,
  });
  // The true sentences are the checked facts, word for word: the AI only invents, so the truth can't drift.
  const truths: string[] = [...t.facts];
  const fakeText = r.ok ? r.data.fake_sentence : t.fallbackFake;
  const why = r.ok ? r.data.why_false : t.fallbackWhy;
  // The server places the fake, so its position never depends on the model.
  const fake = randomInt(4);
  const sentences = [...truths];
  sentences.splice(fake, 0, fakeText);
  const [row] = await db.insert(schema.aiLabRounds).values({
    userId, game: "hunt", gameId: slot.gameId, itemId: t.id,
    shown: { topic: t.topic, sentences }, key: { fake, why }, model: r.ok ? r.model : null,
  }).returning();
  const tokens = slot.index === 0 ? HUNT_STAKE : huntSummary(await finishedHunt(slot.gameId), HUNT_STAKE).tokens;
  return { roundId: row.id, gameId: slot.gameId, round: slot.index + 1, rounds: HUNT_ROUNDS, topic: t.topic, sentences, tokens, realAi: r.ok };
}

async function finishedHunt(gameId: string): Promise<HuntRound[]> {
  return (await gameRounds(gameId)).filter((r) => r.finishedAt).map((r) => ({ pick: r.play.pick as number, fake: r.key.fake as number, wager: r.play.wager as 1 | 2 | 3 }));
}

export async function huntAnswer(userId: string, roundId: string, pick: number, wager: 1 | 2 | 3) {
  const row = await ownRound(userId, roundId, "hunt");
  if (row.finishedAt) throw new HttpError(409, "You already answered this round.");
  const key = row.key as { fake: number; why: string };
  const caught = pick === key.fake;
  await patch(row.id, { play: { pick, wager }, finishedAt: new Date() });
  await recordSignals(userId, [{ signal: caught ? "caught_planted_flaw" : "missed_planted_flaw", details: { game: "hunt", item: row.itemId, wager } }]);

  const rounds = await finishedHunt(row.gameId);
  const s = huntSummary(rounds, HUNT_STAKE);
  let summary = null;
  if (rounds.length >= HUNT_ROUNDS) {
    // Tokens left become bamboo on top of the usual reward: betting well pays, but nothing is ever taken away.
    await award(userId, "game_completed", `ai-lab:${row.gameId}`, 10 + s.tokens);
    summary = { ...s, bamboo: 10 + s.tokens, verdict: wagerVerdict(s.wagerGap) };
  }
  return { fake: key.fake, caught, why: key.why, delta: huntDelta({ pick, fake: key.fake, wager }), tokens: s.tokens, summary };
}
