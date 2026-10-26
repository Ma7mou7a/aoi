/**
 * Scaffold a new cognitive dimension from an existing task type (the live "surprise element" path).
 *
 *   npm run new-dimension -- --id selective_attention --name "Selective attention" --from attention_inhibition
 *
 * Copies the source dimension's task (renderer, levels, scoring, validity, fitted calibration) into a new
 * dimensions/<id>.yaml with a fresh card to fill in, then validates every config. No code changes are
 * needed: the selector, profiler, coach, dashboard and plan pick it up automatically.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parseDocument } from "yaml";
import { DIMENSIONS_DIR, loadDimensions } from "../src/lib/dimensions/loader";

const arg = (k: string) => {
  const i = process.argv.indexOf(`--${k}`);
  return i > 0 ? process.argv[i + 1] : undefined;
};
const id = arg("id");
const name = arg("name");
const from = arg("from");
const definition = arg("definition") ?? "TODO: one or two sentences on what this skill is and how the task measures it.";

if (!id || !name || !from || !/^[a-z][a-z0-9_]*$/.test(id)) {
  console.error('Usage: npm run new-dimension -- --id <snake_case_id> --name "<Name>" --from <existing_dimension_id> [--definition "..."]');
  process.exit(1);
}
const target = path.join(DIMENSIONS_DIR, `${id}.yaml`);
if (existsSync(target)) {
  console.error(`${target} already exists`);
  process.exit(1);
}

// Categorical palette slots in their validated order (see globals.css / the dataviz palette).
const PALETTE = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#6250d6", "#e34948"];
const used = new Set(loadDimensions().map((d) => d.color.toLowerCase()));
const color = PALETTE.find((c) => !used.has(c)) ?? PALETTE[0];

const source = parseDocument(readFileSync(path.join(DIMENSIONS_DIR, `${from}.yaml`), "utf8"));
const doc = source.clone();
doc.set("id", id);
doc.set("name", name);
doc.set("version", 1);
doc.set("color", color);
doc.setIn(["card", "definition"], definition);
doc.setIn(["card", "what_it_is_not"], "Not a diagnostic measure. Scores describe performance on this task, compared with your own history.");
doc.setIn(["card", "biases"], doc.createNode(["TODO: list known biases (practice effects, device, language, fatigue...)."]));
// Task ids must be unique across dimensions.
doc.setIn(["tasks", 0, "id"], `${id}_task`);
writeFileSync(target, doc.toString({ lineWidth: 0, flowCollectionPadding: false }));

const dims = loadDimensions(); // throws with a precise message if anything is invalid
console.log(`Created ${path.relative(process.cwd(), target)} (task type: ${dims.find((d) => d.id === id)!.tasks[0].paradigm}). ${dims.length} dimensions valid.`);
console.log("Restart the dev server: the new skill appears in assessment, dashboard, plan, coach and /skills.");
