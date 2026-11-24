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
import { LEDGER_CAPACITY } from "./ledger";

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

/** 0076: enums a loaded world is allowed to carry; anything else is a malformed archive. */
const WITNESSED: ReadonlySet<string> = new Set(["witnessed", "heard", "inferred", "fabricated"]);
const MOODS: ReadonlySet<string> = new Set(["curious", "sad", "loving", "wrong", "hungry"]);
const ENDING_KINDS: ReadonlySet<string> = new Set([
  "fusion",
  "judgment",
  "forgetting",
  "gaze",
]);

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isFinitePair(value: unknown): boolean {
  return isRecord(value) && isFiniteNumber(value["x"]) && isFiniteNumber(value["y"]);
}

function isMemoryEntry(value: unknown): boolean {
  if (!isRecord(value)) return false;
  if (typeof value["id"] !== "string") return false;
  if (!isFiniteNumber(value["atTick"])) return false;
  if (typeof value["wallClock"] !== "string") return false;
  if (typeof value["fact"] !== "string") return false;
  if (typeof value["witnessed"] !== "string" || !WITNESSED.has(value["witnessed"])) return false;
  const source = value["source"];
  if (source !== null && typeof source !== "string") return false;
  const distortion = value["distortion"];
  if (distortion !== null && typeof distortion !== "string") return false;
  if (!isFiniteNumber(value["salience"])) return false;
  if (!isFiniteNumber(value["valence"])) return false;
  return true;
}

function isConsolidatedEntry(value: unknown): boolean {
  if (!isRecord(value)) return false;
  if (typeof value["id"] !== "string") return false;
  if (typeof value["content"] !== "string") return false;
  if (!Array.isArray(value["derivedFrom"])) return false;
  if (!value["derivedFrom"].every((item) => typeof item === "string")) return false;
  if (typeof value["consolidatedAt"] !== "string") return false;
  const note = value["perspectiveNote"];
  if (note !== null && typeof note !== "string") return false;
  return true;
}

/** 0076: a slice is only safe to consume when every entry has its required shape. */
function isMemorySlice(value: unknown): boolean {
  if (!isRecord(value)) return false;
  if (!Array.isArray(value["working"]) || !value["working"].every(isMemoryEntry)) return false;
  if (!Array.isArray(value["consolidated"]) || !value["consolidated"].every(isConsolidatedEntry)) {
    return false;
  }
  return true;
}

function isMoodState(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value["mood"] === "string" &&
    MOODS.has(value["mood"]) &&
    isFiniteNumber(value["intensity"])
  );
}

function isTileStain(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value["kind"] === "string" &&
    isFiniteNumber(value["intensity"]) &&
    isFiniteNumber(value["createdAtTick"]) &&
    isFiniteNumber(value["lastTouchTick"])
  );
}

function isMourningCircle(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value["corpseId"] === "string" &&
    isFinitePair(value["at"]) &&
    Array.isArray(value["participants"]) &&
    value["participants"].every((p) => typeof p === "string") &&
    isFiniteNumber(value["startedTick"]) &&
    isFiniteNumber(value["duration"])
  );
}

function isSocialState(value: unknown): boolean {
  if (!isRecord(value)) return false;
  const sexes = value["sexes"];
  if (!isRecord(sexes) || !Object.values(sexes).every((s) => s === "female" || s === "male")) {
    return false;
  }
  const moods = value["moods"];
  if (!isRecord(moods) || !Object.values(moods).every(isMoodState)) return false;
  const stains = value["stains"];
  if (!isRecord(stains) || !Object.values(stains).every(isTileStain)) return false;
  const mourning = value["mourning"];
  if (!Array.isArray(mourning) || !mourning.every(isMourningCircle)) return false;
  return true;
}

function isPredictionClaim(value: unknown): boolean {
  if (!isRecord(value)) return false;
  if (typeof value["id"] !== "string") return false;
  if (typeof value["topic"] !== "string") return false;
  if (!isFiniteNumber(value["resolvesOnDay"])) return false;
  const resolved = value["resolvedTo"];
  if (resolved !== null && resolved !== "hit" && resolved !== "miss") return false;
  if (!isFiniteNumber(value["confidence"])) return false;
  return true;
}

function isProjectionState(value: unknown): boolean {
  if (!isRecord(value)) return false;
  const predictions = value["predictions"];
  if (!Array.isArray(predictions) || !predictions.every(isPredictionClaim)) return false;
  const lastReflection = value["lastReflection"];
  if (lastReflection !== null && !isRecord(lastReflection)) return false;
  const hits = value["hits"];
  if (!isRecord(hits)) return false;
  for (const slot of Object.values(hits)) {
    if (!isRecord(slot) || !isFiniteNumber(slot["hit"]) || !isFiniteNumber(slot["miss"])) {
      return false;
    }
  }
  return true;
}

/** Ledger event kinds accepted from a save; an unknown kind is a malformed archive. */
const LEDGER_KINDS: ReadonlySet<string> = new Set([
  "feed",
  "clean",
  "stare",
  "rapid_click",
  "drag_to_hazard",
  "death",
  "idle",
  "session_start",
  "reset",
  "player_answer",
  "carry",
  "name",
  "hatch",
  "glyph_read",
  "terminal_line",
]);

function isLedgerEvent(value: unknown): boolean {
  if (!isRecord(value) || typeof value["kind"] !== "string" || !LEDGER_KINDS.has(value["kind"])) {
    return false;
  }
  // Only the fields the lifetime summary reads are validated; the rest are
  // opaque narrative payloads the runtime already wrote.
  switch (value["kind"]) {
    case "feed":
      return typeof value["creatureId"] === "string" && isFiniteNumber(value["hesitationMs"]);
    case "session_start":
      return isFiniteNumber(value["localHour"]);
    default:
      return true;
  }
}

function isLedgerEntry(value: unknown): boolean {
  return (
    isRecord(value) &&
    isFiniteNumber(value["at"]) &&
    typeof value["wallClock"] === "string" &&
    isLedgerEvent(value["event"])
  );
}

function isGhostProfile(value: unknown): boolean {
  if (!isRecord(value)) return false;
  if (typeof value["id"] !== "string") return false;
  const traits = value["traits"];
  if (!isRecord(traits)) return false;
  for (const key of ["curiosity", "loyalty", "deceit", "clinging", "watchfulness"]) {
    if (!isFiniteNumber(traits[key])) return false;
  }
  if (typeof value["signatureMomentId"] !== "string") return false;
  if (typeof value["signatureMoment"] !== "string") return false;
  if (!Array.isArray(value["keptMemoryIds"])) return false;
  if (!value["keptMemoryIds"].every((item) => typeof item === "string")) return false;
  return true;
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
  const social = value["social"];
  if (social !== undefined) {
    if (!isSocialState(social)) return null;
    normalized["social"] = social;
  }
  const projection = value["projection"];
  if (projection !== undefined) {
    if (!isProjectionState(projection)) return null;
    normalized["projection"] = projection;
  }
  const glyphsRead = value["glyphsRead"];
  if (glyphsRead !== undefined) {
    if (!Array.isArray(glyphsRead) || !glyphsRead.every((item) => typeof item === "string")) {
      return null;
    }
    normalized["glyphsRead"] = glyphsRead;
  }
  const ghosts = value["ghosts"];
  if (ghosts !== undefined) {
    if (!Array.isArray(ghosts) || !ghosts.every(isGhostProfile)) return null;
    normalized["ghosts"] = ghosts;
  }
  const ledger = value["ledger"];
  if (ledger !== undefined) {
    if (!Array.isArray(ledger) || !ledger.every(isLedgerEntry)) return null;
    // A forged archive cannot widen the rolling window.
    normalized["ledger"] = ledger.slice(-LEDGER_CAPACITY);
  }
  const ending = value["ending"];
  if (ending !== undefined) {
    if (!isRecord(ending)) return null;
    if (typeof ending["kind"] !== "string" || !ENDING_KINDS.has(ending["kind"])) return null;
    if (!isFiniteNumber(ending["atTick"])) return null;
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
