/**
 * Seeded PRNG. The simulation never touches Math.random: a run replays exactly
 * from the stored seed, so every random decision here must be reproducible from
 * (seed, salt) alone.
 */

export interface Rng {
  next(): number;
  int(min: number, max: number): number;
  pick<T>(items: readonly T[]): T;
}

/** FNV-1a over UTF-16 code units, returned as an unsigned 32-bit integer. */
export function hashString(text: string): number {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function mixSeed(seed: number, salt: string): number {
  const salted = hashString(salt);
  const mixed = (seed >>> 0) ^ Math.imul(salted ^ (salted >>> 15), 0x9e3779b1);
  return mixed >>> 0;
}

/**
 * mulberry32. Deterministic for the same (seed, salt); different salts on the
 * same seed give independent streams.
 */
export function createRng(seed: number, salt: string): Rng {
  let state = mixSeed(seed, salt);

  const next = (): number => {
    state = (state + 0x6d2b79f5) | 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  return {
    next,
    int(min: number, max: number): number {
      return min + Math.floor(next() * (max - min + 1));
    },
    pick<T>(items: readonly T[]): T {
      const item = items[Math.floor(next() * items.length)];
      if (item === undefined) {
        throw new RangeError("createRng().pick called with an empty array");
      }
      return item;
    },
  };
}
