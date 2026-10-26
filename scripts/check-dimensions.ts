import { DimensionConfigError, loadDimensions } from "../src/lib/dimensions/loader";

try {
  const dims = loadDimensions();
  for (const d of dims) {
    console.log(`ok  ${d.id.padEnd(24)} ${d.tasks.map((t) => `${t.id}[${t.paradigm}, ${t.difficulty.levels.length} levels]`).join(", ")}`);
  }
  console.log(`\n${dims.length} dimensions valid.`);
} catch (e) {
  if (!(e instanceof DimensionConfigError)) throw e;
  console.error(e.message);
  process.exit(1);
}
