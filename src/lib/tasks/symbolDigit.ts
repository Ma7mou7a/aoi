import { createRng, type Rng } from "../rng";

export type SymbolDigitParams = {
  symbols: number;
  block_duration_s: number;
  key_visible: boolean;
  key_preview_s?: number;
};

/** Distinct, language-free glyphs (no letters or digits). */
export const GLYPHS = ["◆", "▲", "●", "■", "★", "✚", "⬟", "⬢", "✦"] as const;

export type SymbolDigitKey = Array<{ glyph: string; digit: number }>;

/** A fresh key every block (reshuffled so the pairing can't be memorised across sessions). */
export function makeKey(p: SymbolDigitParams, seed: number): SymbolDigitKey {
  const rng = createRng(seed);
  const glyphs = rng.shuffle(GLYPHS).slice(0, p.symbols);
  return glyphs.map((glyph, i) => ({ glyph, digit: i + 1 }));
}

/** Endless symbol stream with no immediate repeats; the block ends on time, not on count. */
export function symbolStream(key: SymbolDigitKey, seed: number, length = 200): string[] {
  const rng = createRng(seed ^ 0x5bd1e995);
  const out: string[] = [];
  for (let i = 0; i < length; i++) {
    const options = key.map((k) => k.glyph).filter((g) => g !== out[i - 1]);
    out.push(rng.pick(options));
  }
  return out;
}

/** Synthetic responder: faster and more accurate with ability; fills block_duration_s. */
export function simulateSymbolDigit(p: SymbolDigitParams, ability: number, seed: number, rng: Rng) {
  const key = makeKey(p, seed);
  const stream = symbolStream(key, seed);
  const hidden = !p.key_visible;
  const trials = [];
  let elapsed = 0;
  for (let i = 0; elapsed < p.block_duration_s * 1000 && i < stream.length; i++) {
    const glyph = stream[i];
    const digit = key.find((k) => k.glyph === glyph)!.digit;
    const rt = Math.max(350, Math.round(2300 - 1500 * ability + (hidden ? 250 : 0) + 220 * rng.normal()));
    const correct = rng.next() < 0.86 + 0.12 * ability - (hidden ? 0.06 : 0);
    const response = correct ? digit : ((digit + rng.int(p.symbols - 1)) % p.symbols) + 1;
    trials.push({ trialIndex: i, stimulus: { glyph }, expected: digit, response, outcome: "response" as const, correct: response === digit, rtMs: rt });
    elapsed += rt;
  }
  return trials;
}
