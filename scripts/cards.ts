/** Regenerate docs/measurement-cards.md from dimensions/*.yaml (npm run cards). */
import { writeFileSync } from "node:fs";
import path from "node:path";
import { cardMarkdown } from "../src/lib/dimensions/card";
import { loadDimensions } from "../src/lib/dimensions/loader";

const dims = loadDimensions();
const md = [
  "# Measurement cards",
  "",
  "Generated from `dimensions/*.yaml` by `npm run cards`. The app shows the same cards at `/skills`. AI4Brain is a non-clinical learning tool: every score describes task performance compared with the user's own history, never a diagnosis or a norm.",
  "",
  ...dims.map(cardMarkdown),
].join("\n");
writeFileSync(path.join(process.cwd(), "docs", "measurement-cards.md"), md);
console.log(`Wrote ${dims.length} cards to docs/measurement-cards.md`);
