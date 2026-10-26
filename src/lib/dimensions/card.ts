import type { Dimension } from "./schema";

/** Plain-language rendering of a dimension's config: shared by the /skills page and docs/measurement-cards.md. */
export function describeScoring(dim: Dimension) {
  const task = dim.tasks[0];
  return task.scoring.components.map((c) => {
    const n = c.normalise;
    const dir = n.invert ? `lower is better: ${n.min} or less → 100%, ${n.max} or more → 0%` : `${n.min} or less → 0%, ${n.max} or more → 100%`;
    return { metric: c.metric.replaceAll("_", " "), weight: Math.round(c.weight * 100), rule: dir };
  });
}

export function describeUncertainty(dim: Dimension) {
  const u = dim.profile.uncertainty;
  const pct = (x: number) => `${Math.round(x * 100)}`;
  return [
    `Starts at ${pct(dim.profile.prior.mean)}% ± ${pct(1.645 * dim.profile.prior.sd)} points (90% band) before any data.`,
    `One full block (${u.reference_trials} valid trials) is a noisy reading with SD ${u.obs_sd} on the 0–1 scale; fewer valid trials → noisier (√n rule).`,
    `Unreliable blocks (near chance, response streaks, too fast, timeouts) count ${u.invalid_block_sd_multiplier}× noisier; blocks at the floor/ceiling of a level count 1.5× noisier.`,
    `Between sessions the band widens by ${u.drift_sd_per_day} per day, because ability can change.`,
    `Each block's score is mapped to ability through its level's fitted range (${dim.profile.calibration.source}).`,
  ];
}

export function describeValidity(dim: Dimension) {
  const v = dim.tasks[0].validity;
  return [
    `Responses faster than ${v.min_rt_ms} ms count as anticipations (errors); slower than ${v.max_rt_ms} ms as timeouts.`,
    `At least ${v.min_valid_trials} valid trials needed.`,
    v.chance_accuracy > 0 ? `Accuracy must beat chance (${Math.round(v.chance_accuracy * 100)}%) by ${v.chance_margin_z} binomial SDs.` : "No chance level (sequence recall).",
    `More than ${v.max_same_response_streak} identical answers in a row is flagged.`,
  ];
}

export function cardMarkdown(dim: Dimension): string {
  const task = dim.tasks[0];
  return [
    `## ${dim.name}`,
    "",
    `**Definition.** ${dim.card.definition.trim()}`,
    "",
    `**What it is not.** ${dim.card.what_it_is_not.trim()}`,
    dim.card.design_note ? `\n**Design note.** ${dim.card.design_note.trim()}` : "",
    "",
    `**Task: ${task.name}.** ${task.instructions.trim()}`,
    "",
    "| Level | Settings | Ability range (fitted) |",
    "|-|-|-|",
    ...task.difficulty.levels.map((l) => `| ${l.level} | ${Object.entries(l.params).map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join("/") : v}`).join(", ")} | ${l.ability_range.map((x) => x.toFixed(2)).join(" → ")} |`),
    "",
    "**Scoring** (block score = weighted sum, each metric scaled to 0–100%):",
    "",
    ...describeScoring(dim).map((s) => `- ${s.metric} × ${s.weight}%: ${s.rule}`),
    "",
    "**Uncertainty.**",
    "",
    ...describeUncertainty(dim).map((s) => `- ${s}`),
    "",
    "**Data quality checks.**",
    "",
    ...describeValidity(dim).map((s) => `- ${s}`),
    "",
    "**Known biases.**",
    "",
    ...dim.card.biases.map((b) => `- ${b}`),
    "",
    "**References.**",
    "",
    ...dim.card.citations.map((c) => `- ${c}`),
    "",
  ].join("\n");
}
