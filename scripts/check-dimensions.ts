import { loadScience } from "../src/lib/coach/science";
import { DimensionConfigError, loadDimensions } from "../src/lib/dimensions/loader";

try {
  const dims = loadDimensions();
  for (const d of dims) {
    console.log(`ok  ${d.id.padEnd(24)} ${d.tasks.map((t) => `${t.id}[${t.paradigm}, ${t.difficulty.levels.length} levels]`).join(", ")}`);
  }
  console.log(`\n${dims.length} dimensions valid.`);
  const ids = new Set(dims.map((d) => d.id));
  const cards = loadScience();
  const bad = cards.flatMap((c) => c.applies_to.filter((s) => s !== "all" && !ids.has(s)).map((s) => `${c.id}: unknown skill "${s}"`));
  if (bad.length) throw new DimensionConfigError(`science/findings.yaml: ${bad.join("; ")}`);
  console.log(`${cards.length} science cards valid.`);
} catch (e) {
  if (!(e instanceof DimensionConfigError)) throw e;
  console.error(e.message);
  process.exit(1);
}
