import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { parse } from "yaml";
import { dimensionSchema, type Dimension } from "./schema";

export const DIMENSIONS_DIR = path.join(process.cwd(), "dimensions");

export class DimensionConfigError extends Error {}

/** Parse and validate every dimensions/*.yaml. Throws one error listing every problem found. */
export function loadDimensions(dir = DIMENSIONS_DIR): Dimension[] {
  const files = readdirSync(dir).filter((f) => /\.ya?ml$/.test(f)).sort();
  const problems: string[] = [];
  const dims: Dimension[] = [];

  for (const file of files) {
    let raw: unknown;
    try {
      raw = parse(readFileSync(path.join(dir, file), "utf8"));
    } catch (e) {
      problems.push(`${file}: YAML parse error: ${(e as Error).message}`);
      continue;
    }
    const result = dimensionSchema.safeParse(raw);
    if (!result.success) {
      for (const issue of result.error.issues) {
        problems.push(`${file}: ${issue.path.join(".") || "(root)"}: ${issue.message}`);
      }
      continue;
    }
    const dim = result.data;
    if (path.parse(file).name !== dim.id) problems.push(`${file}: file name must match id "${dim.id}"`);
    dims.push(dim);
  }

  const taskIds = dims.flatMap((d) => d.tasks.map((t) => t.id));
  const dupes = taskIds.filter((t, i) => taskIds.indexOf(t) !== i);
  if (dupes.length) problems.push(`duplicate task ids across dimensions: ${[...new Set(dupes)].join(", ")}`);
  if (!files.length) problems.push(`no dimension files found in ${dir}`);

  if (problems.length) throw new DimensionConfigError(problems.join("\n"));
  return dims;
}

let cache: Dimension[] | undefined;

/** Cached for the server process; dev restarts pick up YAML edits. */
export function getDimensions(): Dimension[] {
  return (cache ??= loadDimensions());
}

export function getDimension(id: string): Dimension | undefined {
  return getDimensions().find((d) => d.id === id);
}
