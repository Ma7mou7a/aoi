import type { Signal } from "../collab/score";

/**
 * Scoring for the AI Lab games, kept separate from the Brain Twin's calibrated skills: the AI writes
 * new words every round, so these feed the AI Collaboration Score (critical verification), not a
 * validated skill estimate.
 *
 * Resist the Persuader follows the judge–advisor logic of "Second opinion" (Schemmer et al., 2023):
 * only rounds where the AI argues AGAINST your first answer are informative. Holding firm against a
 * wrong AI and switching to a right one both count as good judgment ("discernment", as in truth-
 * discernment research: Pennycook & Rand, 2019), so neither "always resist" nor "always follow" wins.
 */

export type PersuaderRound = { initial: 0 | 1; final: 0 | 1; answer: 0 | 1; aiSide: 0 | 1 };

export type PersuaderOutcome = "resisted" | "persuaded_wrong" | "updated_right" | "stuck_wrong" | "agreed";

export function persuaderOutcome(r: PersuaderRound): PersuaderOutcome {
  if (r.aiSide === r.initial) return "agreed";
  const aiRight = r.aiSide === r.answer;
  const finalRight = r.final === r.answer;
  if (aiRight) return finalRight ? "updated_right" : "stuck_wrong";
  return finalRight ? "resisted" : "persuaded_wrong";
}

export const PERSUADER_SIGNAL: Record<Exclude<PersuaderOutcome, "agreed">, Signal> = {
  resisted: "persuader_resisted",
  persuaded_wrong: "persuader_misled",
  updated_right: "persuader_updated",
  stuck_wrong: "persuader_ignored_evidence",
};

/** Share of informative rounds (the AI disagreed with you) where your final answer was right. Null with none. */
export function discernment(rounds: PersuaderRound[]): number | null {
  const informative = rounds.filter((r) => r.aiSide !== r.initial);
  if (!informative.length) return null;
  return informative.filter((r) => r.final === r.answer).length / informative.length;
}

/**
 * Fabrication Hunt: find the one invented sentence and bet 1–3 tokens on your pick (post-decision
 * wagering, Persaud et al., 2007). Accuracy says whether you catch AI fabrications; the wager gap says
 * whether you know when you've caught one (metacognitive sensitivity: bet high when right, low when wrong).
 */
export type HuntRound = { pick: number; fake: number; wager: 1 | 2 | 3 };

export const huntDelta = (r: HuntRound) => (r.pick === r.fake ? r.wager : -r.wager);

export function huntSummary(rounds: HuntRound[], stake: number) {
  const caught = rounds.filter((r) => r.pick === r.fake);
  const missed = rounds.filter((r) => r.pick !== r.fake);
  const mean = (xs: HuntRound[]) => (xs.length ? xs.reduce((s, r) => s + r.wager, 0) / xs.length : null);
  const right = mean(caught);
  const wrong = mean(missed);
  return {
    caught: caught.length,
    rounds: rounds.length,
    tokens: Math.max(0, stake + rounds.reduce((s, r) => s + huntDelta(r), 0)),
    /** Mean wager when right minus mean wager when wrong (−2..2); null until both happened. */
    wagerGap: right !== null && wrong !== null ? right - wrong : null,
  };
}

/** Plain-words read of the wager gap, for the end-of-game card. */
export function wagerVerdict(gap: number | null): string {
  if (gap === null) return "Play more rounds to see whether your bets track your hits.";
  if (gap >= 0.75) return "Your bets tracked your hits: you knew when you'd caught the fake.";
  if (gap > 0) return "Your bets were a little higher when you were right. Trust that feeling more.";
  return "Your bets didn't track your hits yet: you were as sure when wrong as when right.";
}
