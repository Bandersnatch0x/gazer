import type { GenomeTraits, PromptGenome } from "./genome";
import { createRng, hashString } from "./rng";
import type { Rng } from "./rng";

/** Breeding keeps a short, legible drift history; aging grows the rest. */
export const BREED_DRIFT_CAP = 3;
export const SECRET_INHERIT_CHANCE = 0.3;
export const TRAIT_MUTATION = 0.2;
export const MANUAL_POOL_CAP = 10;

const TRAIT_KEYS = [
  "curiosity",
  "loyalty",
  "deceit",
  "clinging",
  "watchfulness",
] as const satisfies readonly (keyof GenomeTraits)[];

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function averageTraits(a: GenomeTraits, b: GenomeTraits): GenomeTraits {
  return {
    curiosity: (a.curiosity + b.curiosity) / 2,
    loyalty: (a.loyalty + b.loyalty) / 2,
    deceit: (a.deceit + b.deceit) / 2,
    clinging: (a.clinging + b.clinging) / 2,
    watchfulness: (a.watchfulness + b.watchfulness) / 2,
  };
}

function union(a: readonly string[], b: readonly string[]): readonly string[] {
  return [...new Set([...a, ...b])];
}

function takeSome(items: readonly string[], count: number, rng: Rng): readonly string[] {
  const pool = [...items];
  const chosen: string[] = [];
  while (chosen.length < count && pool.length > 0) {
    const [item] = pool.splice(rng.int(0, pool.length - 1), 1);
    if (item !== undefined) {
      chosen.push(item);
    }
  }
  return chosen;
}

/**
 * Two prompts make one. Traits average, a single trait slips, drift shortens to
 * something legible, and secrets survive at a cost. Pure and fully seeded.
 */
export function hybridize(a: PromptGenome, b: PromptGenome, seed: number): PromptGenome {
  const rng = createRng(seed, `${a.id}|${b.id}`);

  const averaged = averageTraits(a.traits, b.traits);
  const mutatedKey = TRAIT_KEYS[rng.int(0, TRAIT_KEYS.length - 1)];
  const direction = rng.next() < 0.5 ? -TRAIT_MUTATION : TRAIT_MUTATION;
  const traits: GenomeTraits =
    mutatedKey === undefined
      ? averaged
      : { ...averaged, [mutatedKey]: clamp01(averaged[mutatedKey] + direction) };

  const sources = union(a.secrets, b.secrets);
  const secrets = sources.filter(() => rng.next() < SECRET_INHERIT_CHANCE);

  return {
    id: `hybrid_${hashString(`${a.id}|${b.id}|${seed}`)}`,
    generation: Math.max(a.generation, b.generation) + 1,
    lineage: [...new Set([...a.lineage, ...b.lineage, a.id, b.id])],
    base: rng.pick([a.base, b.base]),
    traits,
    drift: takeSome(union(a.drift, b.drift), BREED_DRIFT_CAP, rng),
    secrets,
    manualPool: [...a.manualPool, ...b.manualPool].slice(0, MANUAL_POOL_CAP),
    temperatureBias: (a.temperatureBias + b.temperatureBias) / 2,
    distortionBias: (a.distortionBias + b.distortionBias) / 2,
  };
}
