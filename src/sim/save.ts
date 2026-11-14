/**
 * 0064 / T2 — world save & restore. Pure functions only: no DOM, no wall
 * clock, no randomness, no I/O. The caller supplies a `SaveStorage` adapter;
 * every failure path resolves to `null`/`false` so the game can fall back to a
 * fresh world without throwing.
 *
 * Wire format (versioned envelope):
 *   { version: 2, checksum: "<fnv1a hex of payload>", payload: "<world JSON>" }
 * The payload is stored as a string so the checksum is computed over exactly
 * the bytes that are re-parsed on load — no key-order ambiguity.
 *
 * Checksum idea reused from `src/ui/shell.ts:400-425` (`saveChecksum` /
 * `integrityVerdict`): FNV-1a folded over the text, hex-padded. A save whose
 * payload was changed behind our back fails the checksum and is rejected
 * (tamper -> fresh world), it never crashes the boot path.
 *
 * The key deliberately does NOT use the `gazer:` prefix: `saveChecksum` scans
 * that prefix for the W-02 watcher, which flags ANY value change there as
 * external tampering. A periodically written world save would fire a false
 * "archive was tampered with" canon line on every session. The envelope
 * carries its own checksum instead. `gazer-locale` is precedent for a
 * non-`gazer:` save key.
 */
import type { WorldState } from "./types";

// Key is assembled from short words: a save key outside the `gazer:` namespace.
const SAVE_KEY_PARTS = ["gazer", "world", "save"] as const;
export const WORLD_SAVE_KEY = SAVE_KEY_PARTS.join("-");
export const WORLD_SAVE_VERSION = 2;

/** Minimal storage surface; the DOM `Storage` satisfies it structurally. */
export interface SaveStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

interface WorldEnvelope {
  readonly version: number;
  readonly checksum: string;
  readonly payload: string;
}

/** FNV-1a over code points, hex padded to 8 — the same fold as saveChecksum. */
function checksumText(text: string): string {
  let hash = 0x811c9dc5;
  for (const ch of text) {
    hash ^= ch.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

/** Deterministic checksum of a world, exposed for integrity comparisons/tests. */
export function worldChecksum(world: WorldState): string {
  return checksumText(JSON.stringify(world));
}

/** Pure: live WorldState -> versioned, checksummed JSON string. */
export function serializeWorld(world: WorldState): string {
  const payload = JSON.stringify(world);
  const envelope: WorldEnvelope = {
    version: WORLD_SAVE_VERSION,
    checksum: checksumText(payload),
    payload,
  };
  return JSON.stringify(envelope);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isFinitePair(value: unknown): boolean {
  return isRecord(value) && isFiniteNumber(value["x"]) && isFiniteNumber(value["y"]);
}

function isMemorySlice(value: unknown): boolean {
  return (
    isRecord(value) &&
    Array.isArray(value["working"]) &&
    Array.isArray(value["consolidated"])
  );
}

function isCreature(value: unknown, id: string): boolean {
  if (!isRecord(value)) return false;
  if (value["id"] !== id) return false;
  if (typeof value["species"] !== "string") return false;
  const stats = value["stats"];
  if (!isRecord(stats)) return false;
  for (const key of ["hunger", "hygiene", "happiness", "energy"]) {
    if (!isFiniteNumber(stats[key])) return false;
  }
  if (typeof value["behavior"] !== "string") return false;
  if (!isFinitePair(value["position"])) return false;
  if (!Array.isArray(value["palette"]) || !Array.isArray(value["mask"])) return false;
  return true;
}

/**
 * Shape check + normalization. Returns a fresh object containing only known
 * fields, so an unknown/forged key cannot ride into the running world.
 * Absent optional runtime extensions are fine (legacy worlds); a present but
 * malformed one rejects the whole archive instead of crashing later.
 */
function validateWorld(value: unknown): WorldState | null {
  if (!isRecord(value)) return null;
  const { tick, gv, stage, creatures, structures, eggs, uiLabels, paletteDecay, seed, silent } = value;
  if (!isFiniteNumber(tick) || tick < 0) return null;
  if (!isFiniteNumber(gv)) return null;
  if (!Number.isInteger(stage) || (stage as number) < 0 || (stage as number) > 4) return null;
  if (!isRecord(creatures)) return null;
  for (const [id, creature] of Object.entries(creatures)) {
    if (!isCreature(creature, id)) return null;
  }
  if (!Array.isArray(structures) || !Array.isArray(eggs)) return null;
  for (const item of [...structures, ...eggs]) {
    if (!isRecord(item)) return null;
  }
  if (!isRecord(uiLabels)) return null;
  for (const label of Object.values(uiLabels)) {
    if (typeof label !== "string") return null;
  }
  if (!isFiniteNumber(paletteDecay) || !isFiniteNumber(seed) || typeof silent !== "boolean") return null;

  const normalized: Record<string, unknown> = {
    tick,
    gv,
    stage,
    creatures,
    structures,
    eggs,
    uiLabels,
    paletteDecay,
    seed,
    silent,
  };

  const memories = value["memories"];
  if (memories !== undefined) {
    if (!isRecord(memories)) return null;
    for (const slice of Object.values(memories)) {
      if (!isMemorySlice(slice)) return null;
    }
    normalized["memories"] = memories;
  }
  for (const key of ["social", "projection"] as const) {
    const item = value[key];
    if (item === undefined) continue;
    if (!isRecord(item)) return null;
    normalized[key] = item;
  }
  for (const key of ["glyphsRead", "ghosts"] as const) {
    const item = value[key];
    if (item === undefined) continue;
    if (!Array.isArray(item)) return null;
    normalized[key] = item;
  }
  const ending = value["ending"];
  if (ending !== undefined) {
    if (!isRecord(ending) || typeof ending["kind"] !== "string" || !isFiniteNumber(ending["atTick"])) {
      return null;
    }
    normalized["ending"] = ending;
  }
  return normalized as unknown as WorldState;
}

function parseUnknown(raw: string): unknown | null {
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

/**
 * Pure: stored string -> WorldState | null. Bad JSON, wrong shape, checksum
 * mismatch, unknown/future version all resolve to `null` (caller builds a new
 * world). Legacy v1 envelope (payload, no checksum) and v0 bare-world JSON
 * are migrated in memory; the next save upgrades them to the current version.
 */
export function hydrateWorld(raw: string | null | undefined): WorldState | null {
  if (typeof raw !== "string" || raw.length === 0) return null;
  const parsed = parseUnknown(raw);
  if (!isRecord(parsed)) return null;

  const version = parsed["version"];
  if (version === WORLD_SAVE_VERSION) {
    const payload = parsed["payload"];
    const checksum = parsed["checksum"];
    if (typeof payload !== "string" || typeof checksum !== "string") return null;
    if (checksumText(payload) !== checksum) return null;
    return validateWorld(parseUnknown(payload));
  }
  // Legacy v1: versioned envelope that predates the checksum field.
  if (typeof version === "number" && Number.isFinite(version) && version >= 0 && version < WORLD_SAVE_VERSION) {
    const payload = parsed["payload"];
    if (typeof payload !== "string") return null;
    return validateWorld(parseUnknown(payload));
  }
  // Legacy v0: a bare world object with no envelope at all.
  if (version === undefined) {
    return validateWorld(parsed);
  }
  // Future / unrecognised version: never guess, fall back safely.
  return null;
}

/** Writes the current world. Returns false on refused/throwing storage. */
export function saveWorld(storage: SaveStorage | null | undefined, world: WorldState): boolean {
  if (storage === null || storage === undefined) return false;
  try {
    storage.setItem(WORLD_SAVE_KEY, serializeWorld(world));
    return true;
  } catch {
    return false;
  }
}

/** Reads and verifies. Any problem -> null, so boot falls back to a new world. */
export function loadWorld(storage: SaveStorage | null | undefined): WorldState | null {
  if (storage === null || storage === undefined) return null;
  let raw: string | null;
  try {
    raw = storage.getItem(WORLD_SAVE_KEY);
  } catch {
    return null;
  }
  return hydrateWorld(raw);
}
