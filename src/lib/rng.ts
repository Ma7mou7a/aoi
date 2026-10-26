/** Small seeded PRNG (mulberry32) so every block can be replayed from its stored seed. */
export function createRng(seed: number) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (maxExclusive: number) => Math.floor(next() * maxExclusive),
    pick: <T,>(xs: readonly T[]) => xs[Math.floor(next() * xs.length)],
    shuffle: <T,>(xs: readonly T[]) => {
      const out = [...xs];
      for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        [out[i], out[j]] = [out[j], out[i]];
      }
      return out;
    },
    /** Standard normal via Box–Muller. */
    normal: () => Math.sqrt(-2 * Math.log(1 - next())) * Math.cos(2 * Math.PI * next()),
  };
}

export type Rng = ReturnType<typeof createRng>;

export const newSeed = () => Math.floor(Math.random() * 2 ** 31);
