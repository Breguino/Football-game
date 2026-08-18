/**
 * Seeded RNG. Every world is reproducible from one string, so a seed can be
 * shared and two people get the same league.
 *
 * mulberry32 over an xmur3-hashed seed: small, fast, and good enough for
 * content generation.
 */

function xmur3(str: string): () => number {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i += 1) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return h >>> 0;
  };
}

export interface Rng {
  /** Float in [0, 1). */
  next(): number;
  /** Integer in [min, max]. */
  int(min: number, max: number): number;
  /** Float in [min, max). */
  range(min: number, max: number): number;
  /** Uniform pick. Throws on an empty list rather than returning undefined. */
  pick<T>(items: readonly T[]): T;
  /** Weighted pick; weights need not sum to 1. */
  weighted<T>(items: readonly (readonly [T, number])[]): T;
  /** True with probability p. */
  chance(p: number): boolean;
  /** Fisher-Yates, returning a new array. */
  shuffle<T>(items: readonly T[]): T[];
  /** Roughly normal via the sum of three uniforms, clamped to ±3 sigma. */
  gaussian(mean: number, sigma: number): number;
  /** A child generator, so one subsystem's draws cannot shift another's. */
  fork(label: string): Rng;
}

export function createRng(seed: string): Rng {
  const seedFn = xmur3(seed);
  let a = seedFn();

  const next = () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const rng: Rng = {
    next,
    int: (min, max) => Math.floor(next() * (max - min + 1)) + min,
    range: (min, max) => next() * (max - min) + min,
    pick: <T,>(items: readonly T[]): T => {
      if (items.length === 0) throw new Error('rng.pick called with an empty list');
      return items[Math.floor(next() * items.length)] as T;
    },
    weighted: <T,>(items: readonly (readonly [T, number])[]): T => {
      if (items.length === 0) throw new Error('rng.weighted called with an empty list');
      const total = items.reduce((sum, [, w]) => sum + w, 0);
      let roll = next() * total;
      for (const [value, weight] of items) {
        roll -= weight;
        if (roll <= 0) return value;
      }
      return items[items.length - 1]![0];
    },
    chance: (p) => next() < p,
    shuffle: <T,>(items: readonly T[]): T[] => {
      const out = [...items];
      for (let i = out.length - 1; i > 0; i -= 1) {
        const j = Math.floor(next() * (i + 1));
        [out[i], out[j]] = [out[j] as T, out[i] as T];
      }
      return out;
    },
    gaussian: (mean, sigma) => {
      const sum = next() + next() + next();
      // Three uniforms have mean 1.5 and variance 0.25, so sd = 0.5.
      return mean + ((sum - 1.5) / 0.5) * sigma;
    },
    fork: (label) => createRng(`${seed}::${label}`),
  };

  return rng;
}
