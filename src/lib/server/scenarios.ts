import "server-only";
import { and, desc, eq, gt, isNotNull, lt } from "drizzle-orm";
import { db, schema } from "@/db";
import type { AffectState } from "../affect";
import { resolveActions, type ClientAction, type RawAction } from "../coach/actions";
import type { FinalClaim, Mood } from "../coach/claims";
import type { Intent } from "../coach/intent";
import { getDimensions } from "../dimensions/loader";
import { pickLine } from "../panda/lines";
import { credibleInterval, Z90 } from "../profiler";
import { backtest, detectFortune, forecastFan } from "../scenarios/certainty";
import type { CoachChart, Scenario } from "../scenarios/chart";
import { detectDispute, DISPUTE, REASON_WORDS, reweigh, verifyDispute, type DisputeReason } from "../scenarios/dispute";
import { RUSH_CONTEXT, type RushContext } from "../scenarios/rush";
import { selectNext, type DecisionTrace } from "../selector";
import { AVAILABLE_PARADIGMS } from "../tasks/registry";
import { inSentence } from "../text";
import { computeCollabScore, SIGNALS } from "../collab/score";
import { currentCollabScore, recordSignals, type SignalInput } from "./collab";
import { getPosteriors, getProfileView } from "./profile";
import { HttpError } from "./user";
import { detectDisputeFr, detectFortuneFr, detectLang, detectPlateauQuestion, detectWhyFr, disputeNotesFr, frNum, REASON_WORDS_FR, SKILL_FR, STRATEGY_FR, type Lang } from "../scenarios/french";
import { plateauBuster, type Plateau } from "../scenarios/plateau";
import { reliableChange, type ReliableChange } from "../scenarios/rci";
import { plateauState } from "./blocks";
import { ENGAGEMENT, fastGuess } from "../scenarios/engagement";
import { cipherFor, FIELDS } from "./vault";

/**
 * The surprise scenarios, answered from data. These replies never go through a language model: every
 * number is computed here from the user's own games and the saved decision records, so the jury's
 * edge cases get the same, checkable answer every time (with or without AI consent).
 */

export type ScenarioReply = {
  scenario: Scenario;
  intent: Intent;
  content: string;
  claims: FinalClaim[];
  actions: ClientAction[];
  mood: Mood;
  chart?: CoachChart;
  signals: SignalInput[];
};

const WHY_RE =
  /\bwhy\b[^?]{0,60}\b(this|that|these|assign\w*|cho(?:se|ose|sen)|pick\w*|gave|give|giving|recommend\w*|suggest\w*|exercise|game|task|level|plan|today|next)\b/i;
/** "What's the reason for today's exercise?", "How did you choose this task?" */
const WHY_ALT_RE = /\b(what'?s|what is|tell me) the (reason|logic|rationale) (for|behind) (this|that|today'?s|the) (exercise|game|task|level|choice|plan)\b|\bhow (did|do) you (choose|chose|pick|decide\w*|select\w*)\b[^?]{0,30}\b(this|that|exercise|game|task|level|today)\b/i;
const WHY_NOT_RE = /\bwhy\b[^?]{0,40}\b(score|estimate)\b[^?]{0,30}\b(drop|fall|fell|go down|went down|low|lower|change)/i;

export type DetectedScenario = (
  | { kind: "dispute"; reason: DisputeReason }
  | { kind: "why" }
  | { kind: "fortune"; horizonDays: number; exact: boolean }
  | { kind: "plateau" }
) & { lang: Lang };

/**
 * Which scenario a free-text message triggers, in English or French (dispute first: "why is this wrong,
 * I was distracted" is pushback; then "I'm stuck", then "why", then the fortune teller).
 */
export function detectScenario(text: string): DetectedScenario | null {
  const lang = detectLang(text);
  const d = detectDispute(text) ?? detectDisputeFr(text);
  if (d) return { kind: "dispute", reason: d.reason, lang };
  if (detectPlateauQuestion(text)) return { kind: "plateau", lang };
  if ((WHY_RE.test(text) && !WHY_NOT_RE.test(text)) || WHY_ALT_RE.test(text) || detectWhyFr(text)) return { kind: "why", lang };
  const f = detectFortune(text) ?? detectFortuneFr(text);
  if (f) return { kind: "fortune", ...f, lang };
  return null;
}

/** English or French, picked by the language of the question. */
const tr = (lang: Lang, en: string, fr: string) => (lang === "fr" ? fr : en);
const skillIn = (lang: Lang, id: string, name: string) => (lang === "fr" ? (SKILL_FR[id] ?? name) : inSentence(name));
const sgn = (n: number) => `${n >= 0 ? "+" : ""}${n}`;
const INTRO_FR = {
  why: ["Je ne choisis jamais au hasard. Voici ce que j'ai noté au moment de ce choix.", "Bonne question. Pas de boîte noire : voici mon raisonnement, tel que je l'ai enregistré."],
  dispute: ["Merci de me le dire. Tu étais là, pas moi.", "Bonne idée de me contredire. Je préfère être corrigé que têtu."],
  plateau: ["Tu as raison de le signaler. Regardons les chiffres.", "Bonne remarque. Vérifions ensemble."],
};
const introFr = (k: keyof typeof INTRO_FR) => INTRO_FR[k][Math.floor(Math.random() * INTRO_FR[k].length)];

const pct = (x: number) => Math.round(x * 100);
const dims = () => getDimensions();
const dimOf = (id: string) => dims().find((d) => d.id === id);
const taskName = (dimId: string, taskId: string) => dimOf(dimId)?.tasks.find((t) => t.id === taskId)?.name ?? taskId;
const when = (d: Date) => d.toISOString().slice(0, 16).replace("T", " ") + " UTC";

function claim(text: string, why: string, runs: Array<{ id: string; label: string }>, trialIds: string[] = []): FinalClaim {
  return { claim: text, why, evidenceTaskRunIds: runs.map((r) => r.id), evidenceTrialIds: trialIds, evidenceLabels: runs.map((r) => r.label), science: [] };
}

const actions = (raw: RawAction[]) => resolveActions(raw, dims());

// ── The "Why" audit ─────────────────────────────────────────────────────────

const RT_METRICS = ["median_rt_ms", "mean_rt_ms"];

/**
 * "Why did you assign me this exercise today?" → the decision record saved with the game when it was
 * chosen: the rule, the numbers it compared, the runner-up and its margin, every adjustment, plus the
 * data trend behind the skill (response time or game score of its last two games).
 */
export async function whyReply(userId: string, name: string, lang: Lang = "en"): Promise<ScenarioReply> {
  const recent = await db
    .select()
    .from(schema.taskRuns)
    .where(eq(schema.taskRuns.userId, userId))
    .orderBy(desc(schema.taskRuns.startedAt))
    .limit(8);
  const assigned = recent.find((r) => (r.selectionReason as { trace?: DecisionTrace } | null)?.trace);
  let trace: DecisionTrace | undefined = (assigned?.selectionReason as { trace?: DecisionTrace } | null)?.trace;
  let level = assigned?.difficultyLevel;
  let taskId = assigned?.taskId;
  let note = assigned?.selectionReason?.note;
  let upcoming = false;
  if (!trace) {
    // No saved record yet (older games): explain the next assignment, computed now with the same rule.
    const sel = selectNext({ dimensions: dims(), posteriors: await getPosteriors(userId), mode: "training", available: AVAILABLE_PARADIGMS, recent: recent.filter((r) => r.status === "completed").map((r) => r.dimensionId).reverse() });
    if (!sel?.reason.trace) {
      return {
        scenario: "why",
        intent: "why",
        content: tr(lang, "I haven't assigned you anything yet. Play a first game and I'll keep a record of every choice I make, with the numbers behind it.", "Je ne t'ai encore rien assigné. Joue une première partie et je garderai une trace de chacun de mes choix, avec les chiffres derrière."),
        claims: [],
        actions: actions([{ type: "play", skill: "working_memory", mode: "assessment" }]),
        mood: "wave",
        signals: [{ signal: "asked_specific_question" }, { signal: "in_scope_question" }],
      };
    }
    trace = sel.reason.trace;
    level = sel.level;
    taskId = sel.taskId;
    note = sel.reason.note;
    upcoming = true;
  }
  const dim = dimOf(trace.chosen)!;
  const chosen = trace.ranking.find((r) => r.skill === trace!.chosen);
  const runner = trace.ranking.find((r) => r.skill === trace!.runnerUp);
  const game = taskName(dim.id, taskId!);

  // The progress curve behind the choice: this skill's games before the assignment.
  const cutoff = assigned && !upcoming ? assigned.startedAt : new Date();
  const history = await db
    .select()
    .from(schema.taskRuns)
    .where(and(eq(schema.taskRuns.userId, userId), eq(schema.taskRuns.dimensionId, dim.id), eq(schema.taskRuns.status, "completed")))
    .orderBy(desc(schema.taskRuns.startedAt))
    .limit(9);
  const before = history.filter((r) => r.startedAt < cutoff && (!assigned || r.id !== assigned.id));
  const [b1, b0] = before; // b1 = most recent before the assignment, b0 = the one before it

  let trend = "";
  const evidence: Array<{ id: string; label: string }> = [];
  if (b1 && b0) {
    const key = RT_METRICS.find((k) => Number.isFinite(b1.metrics?.[k]) && Number.isFinite(b0.metrics?.[k]));
    const rtFrom = key ? b0.metrics![key] : NaN;
    const rtTo = key ? b1.metrics![key] : NaN;
    const change = key ? (rtTo - rtFrom) / rtFrom : 0;
    if (key && Math.abs(change) >= 0.03) {
      trend = tr(lang,
        `In your last two ${game} games your typical response time went from ${Math.round(rtFrom)} ms to ${Math.round(rtTo)} ms (${change > 0 ? "+" : ""}${Math.round(change * 100)}%, ${change > 0 ? "slower" : "faster"}).`,
        `Lors de tes deux dernières parties de ${game}, ton temps de réponse typique est passé de ${Math.round(rtFrom)} ms à ${Math.round(rtTo)} ms (${change > 0 ? "+" : ""}${Math.round(change * 100)} %, ${change > 0 ? "plus lent" : "plus rapide"}).`);
    } else if (b0.composite != null && b1.composite != null) {
      const d = pct(b1.composite) - pct(b0.composite);
      trend = tr(lang, `Your last two ${game} games scored ${pct(b0.composite)}% then ${pct(b1.composite)}% (${d >= 0 ? "+" : ""}${d} points).`, `Tes deux dernières parties de ${game} : ${pct(b0.composite)} % puis ${pct(b1.composite)} % (${d >= 0 ? "+" : ""}${d} points).`);
    }
    evidence.push({ id: b0.id, label: `${game}, level ${b0.difficultyLevel} (${when(b0.startedAt)})` }, { id: b1.id, label: `${game}, level ${b1.difficultyLevel} (${when(b1.startedAt)})` });
  } else if (!b1) {
    trend = tr(lang, `You hadn't played ${game} before, so a first game was the only way to get a starting point.`, `Tu n'avais jamais joué à ${game} : une première partie était le seul moyen d'avoir un point de départ.`);
  }
  if (assigned && !upcoming) evidence.push({ id: assigned.id, label: `the game I assigned: ${game}, level ${assigned.difficultyLevel} (${when(assigned.startedAt)})` });

  const half = chosen ? Math.round((chosen.bandPct[1] - chosen.bandPct[0]) / 2) : 0;
  const sk = skillIn(lang, dim.id, dim.name);
  const basisFr: Record<string, string> = {
    lowest_estimate: chosen ? `Ta ${sk} était ton estimation la plus basse : ${chosen.meanPct} % (probablement ${chosen.bandPct[0]}–${chosen.bandPct[1]} %), et c'est là où il y a le plus de marge que l'entraînement rapporte le plus.` : `C'est en ${sk} qu'il y avait le plus de marge de progrès.`,
    max_expected_uncertainty_reduction: chosen ? `C'est sur ta ${sk} que j'étais le moins sûr (±${half} points), et une partie de ${game} devait réduire cette fourchette le plus, d'environ ${frNum(chosen.score)} points.` : `C'est sur ta ${sk} que j'étais le moins sûr.`,
    user_choice: `Tu as choisi la ${sk} toi-même, donc j'ai seulement choisi le niveau.` + (trace.ranking[0] ? (trace.ranking[0].skill === dim.id ? ` C'est aussi ce que j'aurais choisi : ton estimation la plus basse (${trace.ranking[0].meanPct} %).` : ` Seul, j'aurais choisi la ${SKILL_FR[trace.ranking[0].skill] ?? trace.ranking[0].name} (${trace.ranking[0].meanPct} %), ton estimation la plus basse en ce moment.`) : ""),
    asymmetric_stretch: chosen ? `Ton profil est contrasté, donc j'alterne : après une partie « fondation » vient une partie « défi » sur ton point fort, la ${sk} à ${chosen.meanPct} %.` : "Ton profil est contrasté, donc j'alterne parties « fondation » et « défi ».",
  };
  const basisEn = {
    lowest_estimate: chosen
      ? `${dim.name} was your lowest estimate: ${chosen.meanPct}% (likely ${chosen.bandPct[0]}–${chosen.bandPct[1]}%), and practice pays off most where there is the most room to grow.`
      : `${dim.name} had the most room to grow.`,
    max_expected_uncertainty_reduction: chosen
      ? `I was least sure about your ${inSentence(dim.name)} (±${half} points), and one ${game} game was expected to narrow that range the most, by about ${chosen.score} points.`
      : `I was least sure about your ${inSentence(dim.name)}.`,
    user_choice: (() => {
      const top = trace.ranking[0];
      const mine = top && top.skill === dim.id;
      return `You picked ${inSentence(dim.name)} yourself, so I only chose the level: ${note ?? ""}`.trim() +
        (top ? (mine ? ` It's also what I'd have picked: it was your lowest estimate (${top.meanPct}%).` : ` Left to me, I'd have picked ${inSentence(top.name)} (${top.meanPct}%), your lowest estimate right now.`) : "");
    })(),
    asymmetric_stretch: chosen
      ? `Your profile is split, so I alternate: after a foundation game comes a stretch game on your strong side, ${inSentence(dim.name)} at ${chosen.meanPct}%.`
      : "Your profile is split, so I alternate foundation and stretch games.",
  }[trace.basis] ?? note ?? "";
  const basis = lang === "fr" ? (basisFr[trace.basis] ?? basisEn) : basisEn;
  const runnerText = lang === "fr"
    ? runner && trace.marginPts != null && trace.basis !== "user_choice"
      ? trace.mode === "training"
        ? ` Juste derrière venait la ${SKILL_FR[runner.skill] ?? runner.name} à ${runner.score} %${runner.blocks === 0 ? " (pas encore mesurée, donc encore à son point de départ)" : ""}, ${trace.marginPts} point${trace.marginPts === 1 ? "" : "s"} plus haut : avec ${trace.marginPts + 1} points de moins, je l'aurais choisie à la place.`
        : ` Deuxième choix : la ${SKILL_FR[runner.skill] ?? runner.name}, dont la fourchette se serait réduite de ${frNum(trace.marginPts)} points de moins.`
      : ""
    : runner && trace.marginPts != null && trace.basis !== "user_choice"
      ? trace.mode === "training"
        ? ` Next in line was ${inSentence(runner.name)} at ${runner.score}%${runner.blocks === 0 ? " (not measured yet, so still at its starting point)" : ""}, ${trace.marginPts} point${trace.marginPts === 1 ? "" : "s"} higher: had it been ${trace.marginPts + 1} points lower, I'd have picked it instead.`
        : ` Runner-up: ${inSentence(runner.name)}, whose range would have narrowed ${trace.marginPts} points less.`
      : "";
  const adjust = trace.adjustments.length
    ? tr(lang, ` Then I adjusted: ${trace.adjustments.join("; ")}.`, ` Puis j'ai appliqué ${trace.adjustments.length} ajustement${trace.adjustments.length > 1 ? "s" : ""}, détaillé${trace.adjustments.length > 1 ? "s" : ""} dans le registre ci-dessous.`)
    : "";
  const intro = lang === "fr" ? introFr("why") : pickLine("why", { name }, [], Math.random).text;
  const what = upcoming ? tr(lang, `Next I'd give you ${game} at level ${level}.`, `Ensuite, je te donnerais ${game} au niveau ${level}.`) : tr(lang, `I gave you ${game} at level ${level}.`, `Je t'ai donné ${game} au niveau ${level}.`);

  // The practice heatmap behind the choice: active days per skill over the last 7 days (the dashboard's skill × day grid).
  const heat = await practiceHeatmap(userId);
  const row = heat.find((h) => h.skill === dim.id);
  const busiest = [...heat].sort((a, b) => b.activeDays - a.activeDays)[0];
  let heatText = "";
  if (row && busiest) {
    const other = busiest.skill !== dim.id && busiest.activeDays > row.activeDays ? busiest : null;
    heatText = tr(lang,
      ` On your practice heatmap for the last 7 days, ${inSentence(dim.name)} has ${row.activeDays} active day${row.activeDays === 1 ? "" : "s"}${other ? `, against ${other.activeDays} for ${inSentence(other.name)}` : ""}.`,
      ` Sur ta carte d'entraînement des 7 derniers jours, la ${sk} compte ${row.activeDays} jour${row.activeDays > 1 ? "s" : ""} actif${row.activeDays > 1 ? "s" : ""}${other ? `, contre ${other.activeDays} pour la ${SKILL_FR[other.skill] ?? other.name}` : ""}.`);
  }
  const content = `${intro} ${what} ${basis}${runnerText} ${trend}${heatText}${adjust}`.replace(/\s+/g, " ").trim();

  const series = before
    .slice(0, 8)
    .reverse()
    .filter((r) => r.composite != null)
    .map((r) => ({ pct: pct(r.composite!), level: r.difficultyLevel, flagged: r.validity?.valid === false }));

  return {
    scenario: "why",
    intent: "why",
    content,
    claims: evidence.length
      ? [claim(
          tr(lang, `Chosen by the rule “${trace.basis.replaceAll("_", " ")}”, recorded when the game was assigned (${trace.at.slice(0, 16).replace("T", " ")} UTC).`, `Choisi par la règle « ${trace.basis.replaceAll("_", " ")} », enregistrée au moment de l'attribution (${trace.at.slice(0, 16).replace("T", " ")} UTC).`),
          `${basis}${runnerText}${heatText}`.trim(),
          evidence,
        )]
      : [],
    actions: actions([{ type: "play", skill: dim.id, mode: "training" }, { type: "show_progress", skill: dim.id }]),
    mood: "think",
    chart: { kind: "decision", chosen: trace.chosen, runnerUp: trace.runnerUp, ranking: trace.ranking.slice(0, 6), scoreLabel: trace.mode === "training" ? "estimate %" : "range points it would remove", series, color: dim.color, heatmap: heat },
    signals: [{ signal: "asked_specific_question" }, { signal: "in_scope_question" }],
  };
}

// ── Pushback ────────────────────────────────────────────────────────────────

/**
 * "That score isn't fair, I was distracted." → re-weigh the latest game (or the named skill's latest)
 * instead of defending the profile: check the claim against what was recorded, widen that game's noise,
 * replay the Kalman filter, store a `reweigh` snapshot, and credit the pushback in the collaboration score.
 */
export async function disputeReply(userId: string, name: string, reason: DisputeReason, skill?: string, lang: Lang = "en"): Promise<ScenarioReply> {
  const [run] = await db
    .select()
    .from(schema.taskRuns)
    .where(and(eq(schema.taskRuns.userId, userId), eq(schema.taskRuns.status, "completed"), isNotNull(schema.taskRuns.observation), ...(skill ? [eq(schema.taskRuns.dimensionId, skill)] : [])))
    .orderBy(desc(schema.taskRuns.startedAt))
    .limit(1);
  const base = { scenario: "dispute" as const, intent: "dispute" as const, claims: [], mood: "calm" as const };
  if (!run) {
    return { ...base, content: tr(lang, "There's no finished game to re-weigh yet. Play one, and if it doesn't feel like you, tell me why.", "Il n'y a pas encore de partie terminée à repondérer. Joues-en une, et si elle ne te ressemble pas, dis-moi pourquoi."), actions: actions([{ type: "daily_challenge" }]), signals: [{ signal: "in_scope_question" }] };
  }
  const dim = dimOf(run.dimensionId)!;
  const game = taskName(dim.id, run.taskId);
  if (run.validity?.contested) {
    return {
      ...base,
      content: tr(lang,
        `I already re-weighed your ${game} game from ${when(run.startedAt)}: it counts ${run.validity.contested.multiplier}× less sure than a normal game. A calm replay is the best way to settle it.`,
        `J'ai déjà repondéré ta partie de ${game} du ${when(run.startedAt)} : elle compte ${run.validity.contested.multiplier}× moins sûre qu'une partie normale. Une partie au calme est le meilleur moyen de trancher.`),
      actions: actions([{ type: "play", skill: dim.id, mode: "training" }, { type: "show_progress", skill: dim.id }]),
      signals: [{ signal: "in_scope_question" }],
    };
  }

  // What the app itself recorded during that game.
  const c = await cipherFor(userId);
  const trials = await db.select().from(schema.trials).where(eq(schema.trials.taskRunId, run.id));
  const scored = trials.filter((t) => !t.isPractice);
  const away = scored.filter((t) => t.lookedAway);
  const lost = scored.filter((t) => c.openJson<{ focusLost?: boolean }>(t.behaviour, FIELDS.behaviour)?.focusLost);
  const affect = c.openJson<AffectState>(run.affect, FIELDS.affect);
  const recorded = { lookedAway: away.length, focusLost: lost.length, flags: run.validity?.flags ?? [], fatigueHigh: affect?.fatigue === "high", n: scored.length };
  const check = verifyDispute(reason, recorded);
  const notesFr = disputeNotesFr(recorded, reason);
  // Brain Twin 2.0: the fast-guess model on that game, against the player's own usual accuracy on this task.
  const chance = (dim.tasks.find((t) => t.id === run.taskId)?.validity as { chance_accuracy?: number } | undefined)?.chance_accuracy;
  if (chance != null && Number.isFinite(run.metrics?.accuracy) && reason !== "device") {
    const prior = await db
      .select({ metrics: schema.taskRuns.metrics, valid: schema.taskRuns.validity })
      .from(schema.taskRuns)
      .where(and(eq(schema.taskRuns.userId, userId), eq(schema.taskRuns.taskId, run.taskId), eq(schema.taskRuns.status, "completed"), lt(schema.taskRuns.startedAt, run.startedAt)))
      .orderBy(desc(schema.taskRuns.startedAt))
      .limit(5);
    const g = fastGuess(run.metrics!.accuracy, scored.length, chance, prior.filter((r) => r.valid?.valid !== false && Number.isFinite(r.metrics?.accuracy)).map((r) => r.metrics!.accuracy).reverse());
    if (g && g.lowPct >= ENGAGEMENT.supportsClaimAt * 100) {
      check.notes.push(`my fast-guess model reads about ${g.guessPct}% of your answers in that game as guesses (likely ${g.lowPct}–${g.highPct}%), against your usual ${g.engagedAccuracyPct}% accuracy`);
      notesFr.push(`mon modèle de réponses au hasard lit environ ${g.guessPct} % de tes réponses de cette partie comme des réponses au hasard (probablement ${g.lowPct}–${g.highPct} %), contre ta précision habituelle de ${g.engagedAccuracyPct} %`);
      check.supported = true;
    }
  }

  const weekAgo = new Date(Date.now() - 7 * 86_400_000);
  const earlier = await db
    .select({ id: schema.collabEvents.id })
    .from(schema.collabEvents)
    .where(and(eq(schema.collabEvents.userId, userId), eq(schema.collabEvents.signal, "pushback_with_context"), gt(schema.collabEvents.createdAt, weekAgo)));
  const habit = earlier.length >= DISPUTE.habitThreshold;
  const multiplier = check.supported ? DISPUTE.supportedMultiplier : DISPUTE.unsupportedMultiplier;

  // Replay this skill's Twin with the contested game(s) counting less.
  const runs = await db
    .select()
    .from(schema.taskRuns)
    .where(and(eq(schema.taskRuns.userId, userId), eq(schema.taskRuns.dimensionId, dim.id), eq(schema.taskRuns.status, "completed"), isNotNull(schema.taskRuns.observation)));
  const multipliers: Record<string, number> = Object.fromEntries(runs.filter((r) => r.validity?.contested).map((r) => [r.id, r.validity!.contested!.multiplier]));
  multipliers[run.id] = multiplier;
  const current = (await getPosteriors(userId))[dim.id];
  const rw = reweigh(
    current,
    dim.profile.prior,
    runs.map((r) => ({ id: r.id, observation: r.observation!, observationSd: r.observationSd ?? dim.profile.uncertainty.obs_sd, nTrials: r.validity?.validTrials ?? 0, at: r.startedAt })),
    dim.profile.uncertainty.drift_sd_per_day,
    multipliers,
  );
  const collabBefore = (await currentCollabScore(userId)).score;
  const now = new Date();
  const [lo, hi] = credibleInterval(rw);
  const [blo, bhi] = credibleInterval(current);
  await db.transaction(async (tx) => {
    await tx.insert(schema.profileSnapshots).values({
      userId,
      dimensionId: dim.id,
      sessionId: run.sessionId,
      taskRunId: run.id,
      trigger: "reweigh",
      mean: rw.mean,
      sd: rw.sd,
      ciLow: lo,
      ciHigh: hi,
      nObservations: current.nObservations,
      nTrials: current.nTrials,
      createdAt: now,
    });
    await tx
      .update(schema.taskRuns)
      .set({ validity: { ...(run.validity ?? { valid: true, validTrials: 0, flags: [] }), contested: { reason, at: now.toISOString(), supported: check.supported, notes: check.notes, multiplier } } })
      .where(eq(schema.taskRuns.id, run.id));
  });
  const value = habit ? 0.6 : 1;
  const signals: SignalInput[] = [
    { signal: "pushback_with_context", value, details: { taskRunId: run.id, reason, supported: check.supported } },
    { signal: "contested_result", value, details: { taskRunId: run.id } },
    { signal: "in_scope_question" },
  ];
  // Score after = with these signals (recorded by the caller with the message id); computed here for the reply.
  const after = (await recordSignalsPreview(userId, signals)).score;

  const verdict = check.supported
    ? tr(lang, `Your data backs you up: ${check.notes.join(", and ")}.`, `Tes données te donnent raison : ${notesFr.join(", et ")}.`)
    : tr(lang, "I didn't record any sign of it (no look-aways, no lost focus), but you were there and I wasn't, so it still counts less.", "Je n'ai enregistré aucun signe (pas de regard détourné, pas de perte de focus), mais tu étais là et moi non, donc elle compte quand même moins.");
  const habitText = habit
    ? tr(lang,
        ` That's your ${earlier.length + 1}th disagreement this week, so I've re-weighed it but given the pushback less credit. If many games feel off, a quieter time of day may help more than more games.`,
        ` C'est ton ${earlier.length + 1}e désaccord cette semaine : je l'ai repondéré, mais avec moins de crédit. Si beaucoup de parties te semblent faussées, un moment plus calme de la journée aidera plus que davantage de parties.`)
    : "";
  const intro = lang === "fr" ? introFr("dispute") : pickLine("dispute", { name }, [], Math.random).text;
  const contentFr =
    `${intro} Puisque ${REASON_WORDS_FR[reason]}, je ne défendrai pas cette partie de ${game} (${when(run.startedAt)}) : sa marge d'erreur est maintenant ${multiplier}× plus large. ${verdict} ` +
    `Ton estimation de ${skillIn(lang, dim.id, dim.name)} passe de ${pct(current.mean)} % à ${pct(rw.mean)} %, et sa fourchette s'élargit de ±${Math.round(rw.bandBeforePts / 2)} à ±${Math.round(rw.bandAfterPts / 2)} points : honnêtement, je suis moins sûr maintenant, et je préfère le dire. ` +
    `Contester avec une raison, c'est exactement ce que je veux voir : ton score de collaboration avec l'IA passe de ${collabBefore} à ${after}.${habitText}`;
  const contentEn =
    `${intro} Since ${REASON_WORDS[reason]}, I won't defend that ${game} game (${when(run.startedAt)}): its margin of error is now ${multiplier}× wider. ${verdict} ` +
    `Your ${inSentence(dim.name)} estimate goes from ${pct(current.mean)}% to ${pct(rw.mean)}%, and its range widens from ±${Math.round(rw.bandBeforePts / 2)} to ±${Math.round(rw.bandAfterPts / 2)} points: I'm honestly less sure now, and I'd rather say so. ` +
    `Pushing back with a reason is exactly what I want to see: your AI Collaboration Score goes from ${collabBefore} to ${after}.${habitText}`;
  const content = lang === "fr" ? contentFr : contentEn;

  return {
    ...base,
    content,
    claims: [
      claim(
        tr(lang, `Re-weighed: the ${game} game now counts with a ${multiplier}× wider margin of error.`, `Repondérée : la partie de ${game} compte maintenant avec une marge d'erreur ${multiplier}× plus large.`),
        check.supported
          ? tr(lang, `Recorded during that game: ${check.notes.join("; ")}.`, `Enregistré pendant cette partie : ${notesFr.join(" ; ")}.`)
          : tr(lang, "Nothing in the recording contradicts you; nothing confirms it either.", "Rien dans l'enregistrement ne te contredit ; rien ne le confirme non plus."),
        [{ id: run.id, label: `${game}, level ${run.difficultyLevel} (${when(run.startedAt)})` }],
        away.map((t) => t.id).slice(0, 20),
      ),
    ],
    actions: actions([{ type: "play", skill: dim.id, mode: "training" }, { type: "show_progress", skill: dim.id }]),
    chart: {
      kind: "reweigh",
      skillName: dim.name,
      color: dim.color,
      before: { pct: pct(current.mean), low: pct(blo), high: pct(bhi) },
      after: { pct: pct(rw.mean), low: pct(lo), high: pct(hi) },
      collab: { before: collabBefore, after },
    },
    signals,
  };
}

/** The collaboration score as it will be once `signals` are recorded (nothing is written). */
async function recordSignalsPreview(userId: string, signals: SignalInput[]) {
  const events = await db
    .select({ component: schema.collabEvents.component, value: schema.collabEvents.value })
    .from(schema.collabEvents)
    .where(eq(schema.collabEvents.userId, userId));
  return computeCollabScore([
    ...(events as Array<{ component: (typeof SIGNALS)[keyof typeof SIGNALS]["component"]; value: number }>),
    ...signals.map((s) => ({ component: SIGNALS[s.signal].component, value: s.value ?? SIGNALS[s.signal].value })),
  ]);
}

// ── The Fortune Teller trap ─────────────────────────────────────────────────

const HORIZON_WORDS: Record<number, string> = { 7: "a week", 14: "two weeks", 30: "a month", 90: "three months" };

/**
 * "What exactly will my score be next month?" → never a single number: the 50% and 90% ranges at that
 * horizon, how they widen over time, and the forecaster's own track record on this user's history.
 */
export async function fortuneReply(userId: string, skill: string, horizonDays: number, exact: boolean, lang: Lang = "en"): Promise<ScenarioReply> {
  const dim = dimOf(skill) ?? dims()[0];
  const view = await getProfileView(userId);
  const d = view.dimensions.find((x) => x.id === dim.id)!;
  const history = d.history.filter((h) => h.measured).map((h) => ({ mean: h.mean, sd: (h.ciHigh - h.ciLow) / (2 * Z90) || 0.1 }));
  const drift = dim.profile.uncertainty.drift_sd_per_day;
  const horizon = Math.min(90, horizonDays);
  const fan = forecastFan(history, { mean: d.mean, sd: d.sd }, drift, 4, [...new Set([7, 30, 90, horizon])].sort((a, b) => a - b));
  const base = { scenario: "fortune" as const, intent: "forecast" as const, mood: "think" as const, signals: [{ signal: "asked_specific_question" as const }, { signal: "in_scope_question" as const }] };
  const noExact = exact
    ? tr(lang, "No one can give you an exact number, me included. ", "Personne ne peut te donner un chiffre exact, moi compris. ")
    : tr(lang, "I'll give you a range, never a single number. ", "Je te donne une fourchette, jamais un chiffre unique. ");
  const skFr = skillIn(lang, dim.id, dim.name);
  const HFR: Record<number, string> = { 7: "une semaine", 14: "deux semaines", 30: "un mois", 90: "trois mois" };
  if (!fan) {
    const need = Math.max(1, 3 - history.length);
    return {
      ...base,
      content: tr(lang,
        `${noExact}With ${history.length} ${inSentence(dim.name)} game${history.length === 1 ? "" : "s"} so far I can't even draw a fair range: ${need} more game${need === 1 ? "" : "s"} and I'll show you one, with how sure I am.`,
        `${noExact}Avec ${history.length} partie${history.length > 1 ? "s" : ""} de ${skFr} pour l'instant, je ne peux même pas tracer une fourchette honnête : encore ${need} partie${need > 1 ? "s" : ""} et je t'en montre une, avec mon degré de certitude.`),
      claims: [],
      actions: actions([{ type: "play", skill: dim.id, mode: "training" }]),
    };
  }
  const at = fan.find((p) => p.days === horizon)!;
  const week = fan.find((p) => p.days === 7)!;
  const far = fan[fan.length - 1];
  const track = backtest(history, drift);
  const words = HORIZON_WORDS[horizon] ?? `${horizon} days`;
  const beyond = horizonDays > 90 ? " Beyond three months the range gets so wide it stops being useful, so I don't forecast that far." : "";
  const trackText = track && track.total >= 3
    ? ` My track record on your own history: replaying this forecaster game by game, ${track.hits} of ${track.total} real results landed inside my 90% range${track.ratePct >= 80 ? "." : ", so treat my ranges with extra caution."}`
    : "";
  const contentFr =
    `${noExact}Si ta tendance récente se maintient à environ 4 parties par semaine, dans ${HFR[horizon] ?? `${horizon} jours`} ton score de ${skFr} sera probablement entre ${at.low50} % et ${at.high50} % (une chance sur deux), et très probablement entre ${at.low90} % et ${at.high90} % (90 % de chances). ` +
    `Le milieu de cette fourchette est ${at.midPct} % : un centre, pas une promesse. Remarque comme elle s'élargit plus on regarde loin : ±${Math.round((week.high90 - week.low90) / 2)} points à une semaine, ±${Math.round((far.high90 - far.low90) / 2)} à ${HFR[far.days] ?? `${far.days} jours`}.` +
    (horizonDays > 90 ? " Au-delà de trois mois, la fourchette devient si large qu'elle n'est plus utile, donc je ne prévois pas si loin." : "") +
    (track && track.total >= 3 ? ` Mon historique sur tes propres données : en rejouant ce prévisionniste partie par partie, ${track.hits} résultats réels sur ${track.total} sont tombés dans ma fourchette à 90 %${track.ratePct >= 80 ? "." : ", donc prends mes fourchettes avec encore plus de prudence."}` : "");
  const contentEn =
    `${noExact}If your recent trend holds at about 4 games a week, in ${words} your ${inSentence(dim.name)} score is likely between ${at.low50}% and ${at.high50}% (a 50% chance), and very likely between ${at.low90}% and ${at.high90}% (a 90% chance). ` +
    `The middle of that range is ${at.midPct}%: a centre, not a promise. Notice how it widens the further out we look: ±${Math.round((week.high90 - week.low90) / 2)} points at one week, ±${Math.round((far.high90 - far.low90) / 2)} at ${HORIZON_WORDS[far.days] ?? `${far.days} days`}.${beyond}${trackText}`;
  const content = lang === "fr" ? contentFr : contentEn;
  const [latest] = await db
    .select({ id: schema.taskRuns.id, at: schema.taskRuns.startedAt, level: schema.taskRuns.difficultyLevel, taskId: schema.taskRuns.taskId })
    .from(schema.taskRuns)
    .where(and(eq(schema.taskRuns.userId, userId), eq(schema.taskRuns.dimensionId, dim.id), eq(schema.taskRuns.status, "completed")))
    .orderBy(desc(schema.taskRuns.startedAt))
    .limit(1);
  return {
    ...base,
    content,
    claims: latest
      ? [claim(
          tr(lang, `In ${words}: likely ${at.low50}–${at.high50}%, very likely ${at.low90}–${at.high90}%.`, `Dans ${HFR[horizon] ?? `${horizon} jours`} : probablement ${at.low50}–${at.high50} %, très probablement ${at.low90}–${at.high90} %.`),
          tr(lang, `Fitted only on your own ${history.length} ${inSentence(dim.name)} games, with the trend shrunk toward “no change” so a lucky streak can't inflate it.`, `Calculé uniquement sur tes ${history.length} parties de ${skFr}, avec une tendance ramenée vers « pas de changement » pour qu'une série chanceuse ne la gonfle pas.`), [{ id: latest.id, label: `${taskName(dim.id, latest.taskId)}, level ${latest.level} (${when(latest.at)})` }])]
      : [],
    actions: actions([{ type: "forecast", skill: dim.id, gamesPerWeek: 7 }, { type: "forecast", skill: dim.id, gamesPerWeek: 2 }, { type: "play", skill: dim.id, mode: "training" }]),
    chart: { kind: "fan", skillName: dim.name, color: dim.color, horizonDays: horizon, points: fan, track },
  };
}

// ── Button masher: the player's own account of a flagged game ───────────────

const CONTEXT_REPLY: Record<RushContext, string> = {
  rushing: "Thanks for being honest. The game stays flagged as uncertain, so it won't drag your score down. Next time, accuracy first: speed comes on its own.",
  distracted: "Got it. It stays flagged as uncertain, so it barely counts. Two quiet minutes will give me a much fairer reading.",
  testing: "Fair enough, testing me is welcome! This game stays out of your real picture: it counts with a very wide margin of error.",
  fine: "Thanks. I'll keep it, still with a wider margin: answers that fast are hard to read. Your next game will tell us more.",
};

export async function setRunContext(userId: string, runId: string, context: RushContext): Promise<{ reply: string }> {
  const [run] = await db.select().from(schema.taskRuns).where(and(eq(schema.taskRuns.id, runId), eq(schema.taskRuns.userId, userId)));
  if (!run) throw new HttpError(404, "Game not found");
  if (!run.validity || run.validity.valid) throw new HttpError(409, "Only flagged games ask what happened");
  if (run.validity.context) return { reply: CONTEXT_REPLY[run.validity.context] };
  await db.update(schema.taskRuns).set({ validity: { ...run.validity, context } }).where(eq(schema.taskRuns.id, run.id));
  await recordSignals(userId, [{ signal: "reported_block_context", details: { taskRunId: run.id, context: RUSH_CONTEXT[context] } }]);
  return { reply: CONTEXT_REPLY[context] };
}

/** Debrief opener when the latest game was flagged as rushed: Bao asks, he doesn't assume. */
export async function rushOpener(userId: string): Promise<string | null> {
  const [run] = await db
    .select()
    .from(schema.taskRuns)
    .where(and(eq(schema.taskRuns.userId, userId), eq(schema.taskRuns.status, "completed")))
    .orderBy(desc(schema.taskRuns.startedAt))
    .limit(1);
  if (!run?.validity || run.validity.valid) return null;
  const game = taskName(run.dimensionId, run.taskId);
  const ctx = run.validity.context;
  if (!run.validity.flags.includes("rushing")) {
    if (ctx) return `You told me what happened in that ${game} game, so it stays flagged as uncertain rather than a drop in ability.`;
    const why = run.validity.flags.includes("near_chance")
      ? "your answers were close to chance level"
      : run.validity.flags.includes("too_few_trials")
        ? "it ended with too few usable answers"
        : "it didn't look like your usual play";
    return `Your last ${game} game looked unreliable (${why}), so I've flagged it as uncertain instead of reading it as a drop in ability. Were you rushing, or distracted? Either way, it barely moves your score.`;
  }
  if (ctx) return `You told me you were ${RUSH_CONTEXT[ctx].replace(/^I was |^No, /, "").toLowerCase()} in that ${game} game, so it stays flagged as uncertain rather than a drop in ability.`;
  return `Your last ${game} game was very fast and mostly wrong, so I've flagged it as uncertain instead of reading it as a drop in ability. Were you rushing, or distracted? Either way, it barely moves your score.`;
}


// ── Practice heatmap (cited by the "Why" audit) ─────────────────────────────

export type HeatRow = { skill: string; name: string; days: number[]; activeDays: number };

/** Games per skill per day over the last 7 days (oldest first): the dashboard's skill × day grid, as numbers. */
export async function practiceHeatmap(userId: string, now = new Date()): Promise<HeatRow[]> {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) - 6 * 86_400_000);
  const runs = await db
    .select({ dimensionId: schema.taskRuns.dimensionId, at: schema.taskRuns.startedAt })
    .from(schema.taskRuns)
    .where(and(eq(schema.taskRuns.userId, userId), eq(schema.taskRuns.status, "completed"), gt(schema.taskRuns.startedAt, start)));
  return dims().map((d) => {
    const days = Array.from({ length: 7 }, () => 0);
    for (const r of runs) if (r.dimensionId === d.id) days[Math.min(6, Math.max(0, Math.floor((r.at.getTime() - start.getTime()) / 86_400_000)))]++;
    return { skill: d.id, name: d.name, days, activeDays: days.filter((n) => n > 0).length };
  });
}

// ── The Stagnation Plateau, in the coach's voice ────────────────────────────

/** One phrase: what is stuck, in the words of the rule that fired. */
function stuckText(lang: Lang, p: Plateau, sk: string) {
  if (p.basis === "twin")
    return tr(lang, `left your ${sk} estimate within ${p.twinMovePts} points (it stays near ${p.twinPct}%)`, `ont laissé ton estimation de ${sk} à ${p.twinMovePts} points près (elle reste vers ${p.twinPct} %)`);
  return tr(lang, `all landed near ${p.meanPct}% (trend ${sgn(p.slopePtsPerBlock)} points per game)`, `ont toutes tourné autour de ${p.meanPct} % (tendance ${sgn(p.slopePtsPerBlock)} point par partie)`);
}

function rciText(lang: Lang, rc: ReliableChange | null) {
  if (!rc) return "";
  if (rc.reliable)
    return tr(lang,
      ` From your first ${rc.k1} to your last ${rc.k2} of them you moved ${sgn(rc.changePts)} points, bigger than one game's noise can explain (Reliable Change Index ${rc.rci}): that's a real ${rc.direction === "up" ? "gain" : "drop"}.`,
      ` De tes ${rc.k1} premières à tes ${rc.k2} dernières, tu as bougé de ${sgn(rc.changePts)} points, plus que ce que le bruit d'une partie peut expliquer (indice de changement fiable ${frNum(rc.rci)}) : c'est ${rc.direction === "up" ? "un vrai progrès" : "une vraie baisse"}.`);
  return tr(lang,
    ` From your first ${rc.k1} to your last ${rc.k2} of them the change is ${sgn(rc.changePts)} points, within what one game's noise explains (Reliable Change Index ${rc.rci}; a real change needs ±1.6 or more).`,
    ` De tes ${rc.k1} premières à tes ${rc.k2} dernières, le changement est de ${sgn(rc.changePts)} points, dans le bruit normal d'une partie (indice de changement fiable ${frNum(rc.rci)} ; un vrai changement demande ±1,6 ou plus).`);
}

/**
 * "I'm stuck, my score never moves." → checked against the data, never just agreed with: the plateau
 * verdict (scores or Brain Twin), the Reliable Change Index of the last games, and what happens next
 * (the format change the engine will serve, chosen from this player's own strategy history).
 */
export async function plateauReply(userId: string, name: string, lang: Lang = "en", skill?: string): Promise<ScenarioReply> {
  const [last] = await db
    .select({ dimensionId: schema.taskRuns.dimensionId, taskId: schema.taskRuns.taskId })
    .from(schema.taskRuns)
    .where(and(eq(schema.taskRuns.userId, userId), eq(schema.taskRuns.status, "completed"), ...(skill ? [eq(schema.taskRuns.dimensionId, skill)] : [])))
    .orderBy(desc(schema.taskRuns.startedAt))
    .limit(1);
  const base = { scenario: "plateau" as const, intent: "progress" as const, signals: [{ signal: "asked_specific_question" as const }, { signal: "in_scope_question" as const }] };
  if (!last) {
    return { ...base, mood: "wave", claims: [], content: tr(lang, "There's nothing to be stuck on yet: play a few games and I'll tell you honestly whether you're moving.", "Il n'y a encore rien sur quoi stagner : joue quelques parties et je te dirai honnêtement si tu progresses."), actions: actions([{ type: "daily_challenge" }]) };
  }
  const dim = dimOf(last.dimensionId)!;
  const task = dim.tasks.find((t) => t.id === last.taskId) ?? dim.tasks[0];
  const game = task.name;
  const sk = skillIn(lang, dim.id, dim.name);
  const { p, ordered, normal, isBuster, tried, twinPoints } = await plateauState(userId, dim.id, task.id);
  const valid = normal.filter((r) => r.validity?.valid !== false && r.observation != null);
  const rc = reliableChange(valid.slice(-4).map((r) => r.observation!), dim.profile.uncertainty.obs_sd);
  const levels = task.difficulty.levels.map((l) => l.level);
  const lastWasBuster = ordered.length > 0 && isBuster(ordered[ordered.length - 1]);
  const intro = lang === "fr" ? introFr("plateau") : `Good thing you said it, ${name}. Let's check the numbers rather than guess.`;

  let content: string;
  let mood: Mood = "think";
  if (p.plateau) {
    const b = plateauBuster(p, task.paradigm, levels, p.level ?? levels[0], ordered.filter(isBuster).length, tried);
    const memory = !lastWasBuster && b.kind === "strategy" ? (b.detail.match(/(Last time[^.]*\.|“[^”]*” didn't clearly help[^.]*\.|Neither strategy[^.]*\.)/)?.[0] ?? "") : "";
    const next = lastWasBuster
      ? tr(lang, " You've just played a format-change round, so the next game is a normal one to keep measuring; the round after can change the format again.", " Tu viens de jouer une manche « changement de format », donc la prochaine partie est normale pour continuer à mesurer ; la suivante pourra changer de format à nouveau.")
      : b.kind === "strategy" && b.strategy
        ? tr(lang,
            ` Repeating the same game won't change that, so your next ${game} game is a format change: try “${b.strategy.name}”. ${b.strategy.how}${memory ? ` ${memory}` : ""} I'll compare it with your plateau and tell you honestly whether it helped.`,
            ` Répéter le même jeu n'y changera rien, donc ta prochaine partie de ${game} change de format : essaie « ${b.strategy.name} ». ${STRATEGY_FR[b.strategy.name] ?? b.strategy.how} Je la comparerai à ton plateau et je te dirai honnêtement si ça a aidé.`)
        : tr(lang,
            ` Repeating the same game won't change that, so your next ${game} game is a stretch round at level ${b.level}: harder practice now tends to stick better later.`,
            ` Répéter le même jeu n'y changera rien, donc ta prochaine partie de ${game} est une manche « défi » au niveau ${b.level} : un entraînement plus dur maintenant tient souvent mieux ensuite.`);
    content = tr(lang,
      `${intro} You're right: your last ${p.n} ${game} games ${stuckText(lang, p, sk)}. That looks like a plateau: no progress I can see beyond the noise.${rciText(lang, rc)}${next}`,
      `${intro} Tu as raison : tes ${p.n} dernières parties de ${game} ${stuckText(lang, p, sk)}. Ça ressemble à un plateau : aucun progrès visible au-delà du bruit.${rciText(lang, rc)}${next}`);
  } else if (p.n < 4) {
    mood = "calm";
    content = tr(lang,
      `${intro} Not a plateau yet: I've only seen ${p.n} ordinary ${game} game${p.n === 1 ? "" : "s"}, and I need at least 4 before I call it one.${rciText(lang, rc)}`,
      `${intro} Pas encore un plateau : je n'ai vu que ${p.n} partie${p.n > 1 ? "s" : ""} normale${p.n > 1 ? "s" : ""} de ${game}, et il m'en faut au moins 4 avant d'appeler ça un plateau.${rciText(lang, rc)}`);
  } else {
    mood = rc?.direction === "up" ? "cheer" : "calm";
    const why = rc?.reliable
      ? tr(lang, "your last games show a real change", "tes dernières parties montrent un vrai changement")
      : tr(lang, `your estimate moved ${p.twinMovePts ?? 0} points over your last 4 games`, `ton estimation a bougé de ${p.twinMovePts ?? 0} points sur tes 4 dernières parties`);
    content = tr(lang,
      `${intro} By my rule this isn't a plateau: ${why}.${rciText(lang, rc)} Keep the same effort: if 4 games in a row don't move you, I'll change the format.`,
      `${intro} Selon ma règle, ce n'est pas un plateau : ${why}.${rciText(lang, rc)} Garde le même effort : si 4 parties d'affilée ne te font pas bouger, je change le format.`);
  }
  const evidence = valid.slice(-4).map((r) => ({ id: r.id, label: `${game}, level ${r.level} (${when(r.startedAt)})` }));
  return {
    ...base,
    mood,
    content: content.replace(/\s+/g, " ").trim(),
    claims: evidence.length
      ? [claim(
          p.plateau ? tr(lang, `Plateau on ${game}: ${p.n} games at level ${p.level}.`, `Plateau sur ${game} : ${p.n} parties au niveau ${p.level}.`) : tr(lang, `No plateau yet on ${game}.`, `Pas encore de plateau sur ${game}.`),
          rc ? tr(lang, `Reliable Change Index ${rc.rci} over these games (|RCI| ≥ 1.6 means a change bigger than test noise).`, `Indice de changement fiable ${rc.rci} sur ces parties (|RCI| ≥ 1,6 = un changement plus grand que le bruit du test).`) : "",
          evidence,
        )]
      : [],
    actions: actions([{ type: "play", skill: dim.id, mode: "training" }, { type: "show_progress", skill: dim.id }]),
    chart: {
      kind: "plateau",
      skillName: dim.name,
      color: dim.color,
      plateau: p.plateau,
      series: twinPoints.slice(-8).map((t) => ({ pct: pct(t.composite), twin: Number.isFinite(t.twin) ? pct(t.twin) : null, level: t.level, flagged: t.valid === false })),
      tried: tried.map((t) => ({ name: t.name, diffPts: t.diffPts, lowPts: t.lowPts, highPts: t.highPts, verdict: t.verdict })),
    },
  };
}

/** Debrief opener when the last game's task has hit a plateau: the coach names it before the engine acts. */
export async function plateauOpener(userId: string): Promise<string | null> {
  const [last] = await db
    .select({ dimensionId: schema.taskRuns.dimensionId, taskId: schema.taskRuns.taskId, reason: schema.taskRuns.selectionReason })
    .from(schema.taskRuns)
    .where(and(eq(schema.taskRuns.userId, userId), eq(schema.taskRuns.status, "completed")))
    .orderBy(desc(schema.taskRuns.startedAt))
    .limit(1);
  if (!last || (last.reason as { variant?: unknown } | null)?.variant) return null;
  const dim = dimOf(last.dimensionId);
  const task = dim?.tasks.find((t) => t.id === last.taskId);
  if (!dim || !task) return null;
  const { p, ordered, isBuster, tried } = await plateauState(userId, dim.id, task.id);
  if (!p.plateau) return null;
  const b = plateauBuster(p, task.paradigm, task.difficulty.levels.map((l) => l.level), p.level ?? 1, ordered.filter(isBuster).length, tried);
  return `I've spotted a plateau: your last ${p.n} ${task.name} games ${stuckText("en", p, inSentence(dim.name))}. So your next ${task.name} game changes the format: ${b.kind === "strategy" && b.strategy ? `try “${b.strategy.name}”` : `a stretch round at level ${b.level}`}.`;
}
