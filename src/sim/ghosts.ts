/**
 * The ghost profile layer (ticket 0051, NARRATIVE-CORE-01 §5 / v3 §5.4, slot
 * ruling N8). The true ending's recording is not a tape — it is a
 * reconstruction the swarm assembles from collective memory and the ghost
 * profiles of the dead. This module is the pure data ground of that
 * performance:
 *
 *   - `GhostProfile` — the anonymized face a dead creature leaves behind:
 *     a traits snapshot, one signature-moment reference, and the ids of the
 *     memories it kept. No raw logs, no player-authored PII beyond the single
 *     sanctioned moment face.
 *   - `buildGhostProfile` / `buildGhostArchive` — deterministic extraction.
 *   - `ghostBlendRatio` — the divergence d% (how much the ghosts differ).
 *   - `keptMemoryCount` — the recording header's {n} face with its ≥3 gate.
 *   - `fillGhostTemplate` / `fillNgpOpening` — byte-exact canon skeletons
 *     (`special.ghost_template`, `special.ngp_opening`) with only their
 *     runtime slots swapped; the skeleton never deforms (N8: slot contents
 *     never participate in the hash diff).
 *   - `resolveDramaticId` — the save's most dramatic creature for the {id}
 *     slot: highest death-account weight, ties toward the smaller id.
 *
 * Everything is pure: same inputs, same outputs, byte for byte — no clock, no
 * rng, no LLM.
 */

import { canonLine } from "../canon";
import type { CreatureId, CreatureState, WorldState } from "./types";
import type { GenomeTraits } from "./genome";
import type { MemorySlice } from "./memory";

// ---------------------------------------------------------------------------
// The ghost profile — the anonymized archive face
// ---------------------------------------------------------------------------

/**
 * The traits snapshot falls back to all zeros for a genome-less creature, so
 * the builder stays total; a soul-less ghost simply has no character.
 */
const ZERO_TRAITS: GenomeTraits = {
  curiosity: 0,
  loyalty: 0,
  deceit: 0,
  clinging: 0,
  watchfulness: 0,
};

export interface GhostProfile {
  /** The dead creature this profile anonymizes. The archive face is the id. */
  readonly id: CreatureId;
  /** The only character face the ghost keeps: a snapshot, never a live ref. */
  readonly traits: GenomeTraits;
  /**
   * Reference into the memory layer — the id of the one memory the recording
   * replays ("你做过的那件事"). The raw log stays in the memory layer.
   */
  readonly signatureMomentId: string;
  /**
   * N8 slot face: the single sanctioned text of the referenced moment. The
   * one content face the anonymizer keeps; every other memory stays behind
   * its reference.
   */
  readonly signatureMoment: string;
  /** References only — the ids of the memories the ghost kept. No payloads. */
  readonly keptMemoryIds: readonly string[];
}

/** Canon slot tokens of the ghost template (v3 §5.4, frozen skeleton). */
export const GHOST_TEMPLATE_KEY = "special.ghost_template";
export const NGP_OPENING_KEY = "special.ngp_opening";
export const GHOST_NAME_SLOT = "{ghost_name}";
export const SIGNATURE_SLOT = "{ghost_signature_moment}";
export const DRAMATIC_ID_SLOT = "{id}";

/**
 * The recording header's {n} gate (NARRATIVE-CORE-01 §5.1): the
 * reconstruction needs at least this many kept memories.
 */
export const MIN_KEPT_MEMORIES = 3;

/**
 * The keeper-mention face for signature-moment preference: the recording
 * replays "你做过的那件事", so memories about the keeper win. Mirrors the
 * social layer's own predicate shape (cross-layer no-reuse rule).
 */
function mentionsKeeper(fact: string): boolean {
  return /\bplayer\b|\bkeeper\b/i.test(fact);
}

/**
 * The signature moment: the keeper-mentioning memory with the highest
 * salience, then the newest, then the smallest id. Falls back to the whole
 * working set when none mentions the keeper, and to the consolidated
 * self-knowledge when the working set is empty. Deterministic.
 */
function pickSignatureMoment(
  slice: MemorySlice | undefined,
): { readonly id: string; readonly text: string } | null {
  if (slice === undefined) {
    return null;
  }
  const candidates = slice.working.length > 0 ? slice.working : [];
  const keeperMentions = candidates.filter((entry) => mentionsKeeper(entry.fact));
  const pool = keeperMentions.length > 0 ? keeperMentions : candidates;
  if (pool.length === 0) {
    const consolidated = slice.consolidated
      .slice()
      .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    const picked = consolidated[0];
    return picked === undefined ? null : { id: picked.id, text: picked.content };
  }
  const ranked = pool
    .slice()
    .sort(
      (a, b) =>
        b.salience - a.salience ||
        b.atTick - a.atTick ||
        (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
    );
  const picked = ranked[0];
  return picked === undefined ? null : { id: picked.id, text: picked.fact };
}

/**
 * Build one ghost profile. Anonymize: only the traits snapshot and the one
 * signature moment are taken — never the raw logs (the other memories stay
 * behind their ids), no wall-clock stamps, no salience/valence payloads.
 * Returns null when the creature holds no memory at all: a ghost without a
 * moment has nothing to say in the reconstruction.
 */
export function buildGhostProfile(
  creature: CreatureState,
  slice: MemorySlice | undefined,
): GhostProfile | null {
  const signature = pickSignatureMoment(slice);
  if (signature === null) {
    return null;
  }
  const keptMemoryIds = [
    ...(slice?.working.map((entry) => entry.id) ?? []),
    ...(slice?.consolidated.map((entry) => entry.id) ?? []),
  ].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  return {
    id: creature.id,
    traits: creature.genome === undefined ? { ...ZERO_TRAITS } : { ...creature.genome.traits },
    signatureMomentId: signature.id,
    signatureMoment: signature.text,
    keptMemoryIds,
  };
}

/**
 * The save's ghost archive: one profile per dead creature, in id order — the
 * shape the save carries into NG+ (`WorldState.ghosts`).
 */
export function buildGhostArchive(world: WorldState): readonly GhostProfile[] {
  const dead = Object.values(world.creatures)
    .filter((creature) => creature.behavior === "dead")
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const profiles: GhostProfile[] = [];
  for (const creature of dead) {
    const profile = buildGhostProfile(creature, world.memories?.[creature.id]);
    if (profile !== null) {
      profiles.push(profile);
    }
  }
  return profiles;
}

// ---------------------------------------------------------------------------
// Divergence — the ghost blend ratio (NARRATIVE-CORE-01 §5.1 tail)
// ---------------------------------------------------------------------------

const TRAIT_DIMS: readonly (keyof GenomeTraits)[] = [
  "curiosity",
  "loyalty",
  "deceit",
  "clinging",
  "watchfulness",
];

function clamp01(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.min(1, Math.max(0, value));
}

/**
 * The divergence d% (the recording tail's `{d}`): how much the ghosts differ,
 * read as the mean trait spread across the five dimensions. Fewer than two
 * ghosts blend into nothing — 0%. The spec names no formula, so the mean
 * trait spread is the executor's default (ticket Log 待裁). Deterministic and
 * order-independent: the same archive always yields the same d%, and the
 * same d% double-runs byte for byte.
 */
export function ghostBlendRatio(profiles: readonly GhostProfile[]): number {
  if (profiles.length < 2) {
    return 0;
  }
  let totalSpread = 0;
  for (const dim of TRAIT_DIMS) {
    let min = Number.POSITIVE_INFINITY;
    let max = Number.NEGATIVE_INFINITY;
    for (const profile of profiles) {
      const value = profile.traits[dim];
      if (!Number.isFinite(value)) {
        continue;
      }
      min = Math.min(min, value);
      max = Math.max(max, value);
    }
    if (Number.isFinite(min) && Number.isFinite(max)) {
      totalSpread += max - min;
    }
  }
  const blend = clamp01(totalSpread / TRAIT_DIMS.length);
  return Math.round(blend * 100);
}

// ---------------------------------------------------------------------------
// The recording header's {n} face
// ---------------------------------------------------------------------------

/**
 * The kept-memory count the header speaks: the sum of the archive's kept
 * references. Ghost memory ids are per-creature prefixed, so no cross-ghost
 * collision exists and the sum is the honest count.
 */
export function keptMemoryCount(profiles: readonly GhostProfile[]): number {
  return profiles.reduce((sum, profile) => sum + profile.keptMemoryIds.length, 0);
}

/** The {n} ≥ 3 gate: below it the reconstruction refuses to assemble. */
export function keptMemoriesSufficient(profiles: readonly GhostProfile[]): boolean {
  return keptMemoryCount(profiles) >= MIN_KEPT_MEMORIES;
}

// ---------------------------------------------------------------------------
// Slot filling — byte-exact skeletons, runtime slots only (N8)
// ---------------------------------------------------------------------------

function fillSlots(skeleton: string, slots: readonly (readonly [string, string])[]): string {
  let filled = skeleton;
  for (const [token, value] of slots) {
    filled = filled.split(token).join(value);
  }
  return filled;
}

/**
 * The ghost template (v3 §5.4): the frozen skeleton with only its two slots
 * swapped. The skeleton never deforms — the filled line equals the canon
 * text with the placeholder tokens substituted, byte for byte (CI asserts
 * the reconstruction). {ghost_name} is the ghost's anonymized archive face
 * (its id — the same face N8 pins for the {id} slot); the keeper-given name
 * stays in the memory layer, never in the profile.
 */
export function fillGhostTemplate(profile: GhostProfile): string | null {
  const skeleton = canonLine(GHOST_TEMPLATE_KEY);
  if (skeleton === null) {
    return null;
  }
  return fillSlots(skeleton, [
    [GHOST_NAME_SLOT, profile.id],
    [SIGNATURE_SLOT, profile.signatureMoment],
  ]);
}

/**
 * The NG+ opening (v3 §5.6): the frozen skeleton with the {id} slot filled by
 * the save's most dramatic creature.
 */
export function fillNgpOpening(dramaticId: CreatureId): string | null {
  const skeleton = canonLine(NGP_OPENING_KEY);
  if (skeleton === null) {
    return null;
  }
  return fillSlots(skeleton, [[DRAMATIC_ID_SLOT, dramaticId]]);
}

// ---------------------------------------------------------------------------
// The {id} slot — the save's most dramatic creature
// ---------------------------------------------------------------------------

/** Death cause weights for the account (executor default; the spec gives none). */
export const DEATH_WEIGHT_STARVATION = 2;
export const DEATH_WEIGHT_NEGLECT = 1;
/** Each witness memory adds one unit to the death's account. */
export const DEATH_WEIGHT_PER_WITNESS = 1;

/**
 * One creature's death-account weight: the cause's base plus one unit per
 * witness memory any slice kept about the death (the wiring writes witness
 * facts as "{id} died of {cause} at tick {n}", so the id substring is the
 * stable reference). Living creatures hold no death account.
 */
export function deathAccountWeight(world: WorldState, creature: CreatureState): number {
  if (creature.behavior !== "dead") {
    return 0;
  }
  const base = creature.stats.hunger <= 0 ? DEATH_WEIGHT_STARVATION : DEATH_WEIGHT_NEGLECT;
  let witnesses = 0;
  for (const slice of Object.values(world.memories ?? {})) {
    for (const entry of slice.working) {
      if (entry.fact.includes(creature.id)) {
        witnesses += 1;
      }
    }
  }
  return base + witnesses * DEATH_WEIGHT_PER_WITNESS;
}

/**
 * The {id} slot resolution: the dead creature with the highest death-account
 * weight in the save; ties break toward the smaller id; an save with no
 * death (or no account at all) resolves to null. Deterministic.
 */
export function resolveDramaticId(world: WorldState): CreatureId | null {
  const ranked = Object.values(world.creatures)
    .filter((creature) => creature.behavior === "dead")
    .map((creature) => ({ id: creature.id, weight: deathAccountWeight(world, creature) }))
    .sort((a, b) => b.weight - a.weight || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const picked = ranked[0];
  return picked === undefined ? null : picked.id;
}
