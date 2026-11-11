import type { CreatureId } from "./types";

export interface GenomeTraits {
  readonly curiosity: number;
  readonly loyalty: number;
  readonly deceit: number;
  readonly clinging: number;
  readonly watchfulness: number;
}

export interface PromptGenome {
  readonly id: CreatureId;
  readonly generation: number;
  readonly lineage: readonly string[];
  readonly base: string;
  readonly traits: GenomeTraits;
  readonly drift: readonly string[];
  readonly secrets: readonly string[];
  readonly manualPool: readonly string[];
  readonly temperatureBias: number;
  readonly distortionBias: number;
}

export const MAX_DRIFT = 8;

export function topTraits(traits: GenomeTraits, count = 2): readonly (readonly [string, number])[] {
  return (Object.entries(traits) as (readonly [string, number])[])
    .sort((a, b) => b[1] - a[1])
    .slice(0, count);
}
