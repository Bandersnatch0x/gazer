/**
 * The FX executor core (ticket 0024).
 *
 * The FX library (spec IDs C-01…A-06, `docs/design/fx/FX-LIB-MASTER.md`) is
 * the director-facing primitive set for the anomalous layer. Architecture
 * ruling F1: FX does not get its own render path — it folds into the existing
 * `Effect` union (`./effects`). The executor therefore never renders; it is a
 * pure gate:
 *
 *   cancel latch → resolve primitive → parameter whitelist → stage gate
 *   → idempotency → cap clipping → per-game-day budget (G10) → canon guards
 *   → translate to existing Effect/ShellEffect kinds → commit atomically.
 *
 * `executeFx` returns the next state and the dispatch list in one value, so
 * there is no window where the budget was charged but nothing was dispatched:
 * the caller applies both together or neither. Everything here is a pure
 * function of (state, request, world) — the world's `tick` is the only clock,
 * the sim layer never reads system time.
 *
 * Ledger schema (master §3, field-by-field): primitive / params / intensity /
 * cap_applied / degraded / suppressed / game_time / cost_charged.
 */

import type { Effect } from "./effects";
import { DAY_CYCLE_TICKS, worldDay, worldHour, worldMinute } from "./clock";
import type { CreatureId, Stage, Structure, TilePos, WorldState } from "./types";

// ---------------------------------------------------------------------------
// Constant face — numbers transcribed from the spec tables live here once.
// ---------------------------------------------------------------------------

/** Tile grid size; mirrors `render/scene.ts` GRID_COLS/GRID_ROWS = 16 (sim must not import render). */
export const MAP_GRID_SIZE = 16;
/**
 * The west edge column of the map (tile x). In the isometric projection
 * x_screen = (tile.x − tile.y) · 8, so x = 0 is the westernmost column.
 * Guard G1 forces the tower onto this column.
 */
export const MAP_EDGE_WEST_X = 0;

/** Intensity five tiers (master §0): 0.1 微异 / 0.3 察觉 / 0.5 明确异常 / 0.7 侵入 / 0.9 越界. */
export const INTENSITY_TIERS: readonly number[] = [0.1, 0.3, 0.5, 0.7, 0.9];
const INTENSITY_SET = new Set(INTENSITY_TIERS);
export const DEFAULT_INTENSITY = 0.5;

/** Per-game-day anomaly budget (master §0): S0:2 / S1:5 / S2:10 / S3:20 / S4:30. */
const BUDGET_BY_STAGE: Readonly<Record<Stage, number>> = { 0: 2, 1: 5, 2: 10, 3: 20, 4: 30 };

/** C-03a: cumulative permanent hue pollution, hard-counted by the executor, ≤45°, save-persistent. */
export const PALETTE_POLLUTION_MAX_DEGREES = 45;
/** C-04 full mode: at most 3 per save. */
export const SPRITE_CORRUPT_FULL_LIMIT = 3;
/** D-04 dom_erosion: six steps, no skipping. */
export const DOM_EROSION_STEPS = 6;
/** D-03: canonical opacity window; G3 hard-caps the shared shell face at 0.08. */
export const OUTSIDE_EYES_MIN_OPACITY = 0.03;
export const OUTSIDE_EYES_MAX_OPACITY = 0.08;
export const OUTSIDE_EYES_DEFAULT_OPACITY = 0.05;
/** Collective gaze duration (executor default; the canonical table's ALERT face is 0.8s). */
export const COLLECTIVE_GAZE_MS = 800;
/** G7: cursor mirror pauses while the player is typing, resumes 300ms after the last input. */
export const CURSOR_MIMIC_PAUSE_MS = 300;
/** G4: the shared blink clock hangs on the sim tick, not setInterval. */
export const BLINK_PERIOD_TICKS = 100;
export const BLINK_CLOSED_TICKS = 2;
/** G8: the demagnetize linkage travels inside the blink clock, never via C-05. */
export const DEMAGNETIZE_CHANNEL = "blink_clock_internal";
/** G9: bloom only accepts these two highlight sources. */
export const CRT_GLOW_WHITELIST: readonly string[] = ["g_highlight", "terminal_cursor"];

/** The FX ledger keeps a bounded window, same spirit as the player ledger's capacity. */
export const FX_LEDGER_CAPACITY = 512;

// ---------------------------------------------------------------------------
// E7 silence quota (ticket 0030, NARRATIVE-CORE-02 §1 E7 / §3.4): after the
// window-is-not-glass event the LLM may not volunteer a line for the quota's
// game hours — erosion needs room to breathe. The quota lives on the executor
// (armSilenceQuota / silenceQuotaHeld), and every refused speech attempt is
// booked as a `silence_quota` ledger entry. The hour count mirrors the canon
// registry's `E7_SILENCE_QUOTA_GAME_HOURS`; a test pins the two in lockstep.
// ---------------------------------------------------------------------------

export const SILENCE_QUOTA_GAME_HOURS = 5;
/** One game hour is 1200 ticks / 24 = 50 ticks; five hours = 250 ticks. */
export const SILENCE_QUOTA_TICKS = (DAY_CYCLE_TICKS / 24) * SILENCE_QUOTA_GAME_HOURS;

// ---------------------------------------------------------------------------
// Code-face kinds (snake_case) vs spec-face IDs (C-01 …). The registry maps
// one onto the other; the ledger records the spec-face ID.
// ---------------------------------------------------------------------------

export type FxKind =
  | "all_freeze"
  | "mirror_rhythm"
  | "palette_shift"
  | "palette_pollution"
  | "sprite_corrupt"
  | "creature_wink"
  | "collective_gaze"
  | "stare_reply"
  | "replay_player_action"
  | "map_wither"
  | "spawn_structure"
  | "afterimage"
  | "lineage_blacken"
  | "egg_pulse"
  | "title_mutate"
  | "favicon_eye"
  | "favicon_state_lock"
  | "canvas_escape_eyes"
  | "dom_erosion"
  | "os_status_clock"
  | "cursor_mimic"
  | "scroll_whisper"
  | "tab_return_detect"
  | "save_integrity_watch"
  | "clock_jump_detect"
  | "sleep_wake_detect"
  | "track_remove"
  | "room_tone"
  | "ambient_duck"
  | "lowpass_void"
  | "heartbeat_sonify"
  | "whisper_bed";

export type FxLayer = "canvas" | "dom" | "webapi" | "audio";

// ---------------------------------------------------------------------------
// Parameter whitelist DSL. A primitive's `params` is the exact allowed key
// set; unknown keys, missing required keys, wrong types and out-of-range
// numbers are all rejections. No key outside the spec table ever passes.
// ---------------------------------------------------------------------------

export type ParamRule =
  | { readonly type: "int"; readonly min: number; readonly max: number; readonly optional?: boolean }
  | { readonly type: "num"; readonly min: number; readonly max: number; readonly optional?: boolean }
  | { readonly type: "enum"; readonly values: readonly string[]; readonly optional?: boolean }
  | { readonly type: "bool"; readonly optional?: boolean }
  | { readonly type: "str"; readonly maxLength: number; readonly optional?: boolean }
  | { readonly type: "id"; readonly optional?: boolean }
  | { readonly type: "idList"; readonly min: number; readonly max: number; readonly optional?: boolean }
  | { readonly type: "tile"; readonly optional?: boolean }
  | { readonly type: "anyOf"; readonly rules: readonly ParamRule[]; readonly optional?: boolean };

export type ParamSpec = Readonly<Record<string, ParamRule>>;

/** Max length of a creature/egg id accepted by the `id` rule. */
const ID_MAX_LENGTH = 64;

function ruleInt(min: number, max: number, optional = false): ParamRule {
  return { type: "int", min, max, optional };
}
function ruleNum(min: number, max: number, optional = false): ParamRule {
  return { type: "num", min, max, optional };
}
function ruleEnum(values: readonly string[], optional = false): ParamRule {
  return { type: "enum", values, optional };
}
function ruleBool(optional = false): ParamRule {
  return { type: "bool", optional };
}
function ruleId(optional = false): ParamRule {
  return { type: "id", optional };
}
function ruleIdList(min: number, max: number, optional = false): ParamRule {
  return { type: "idList", min, max, optional };
}
function ruleTile(optional = false): ParamRule {
  return { type: "tile", optional };
}
function ruleAnyOf(rules: readonly ParamRule[], optional = false): ParamRule {
  return { type: "anyOf", rules, optional };
}

function validateRule(rule: ParamRule, value: unknown): boolean {
  switch (rule.type) {
    case "int":
      return typeof value === "number" && Number.isInteger(value) && value >= rule.min && value <= rule.max;
    case "num":
      return typeof value === "number" && Number.isFinite(value) && value >= rule.min && value <= rule.max;
    case "enum":
      return typeof value === "string" && rule.values.includes(value);
    case "bool":
      return typeof value === "boolean";
    case "str":
      return typeof value === "string" && value.length > 0 && value.length <= rule.maxLength;
    case "id":
      return typeof value === "string" && value.length > 0 && value.length <= ID_MAX_LENGTH;
    case "idList":
      return (
        Array.isArray(value) &&
        value.length >= rule.min &&
        value.length <= rule.max &&
        value.every((item) => typeof item === "string" && item.length > 0)
      );
    case "tile": {
      if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
      const record = value as Record<string, unknown>;
      const keys = Object.keys(record);
      if (keys.length !== 2 || !keys.includes("x") || !keys.includes("y")) return false;
      const inside = ruleInt(0, MAP_GRID_SIZE - 1);
      return validateRule(inside, record.x) && validateRule(inside, record.y);
    }
    case "anyOf":
      return rule.rules.some((nested) => validateRule(nested, value));
  }
}

type ParamResult = { readonly ok: true; readonly params: Record<string, unknown> } | { readonly ok: false };

function validateWhitelist(spec: ParamSpec, raw: unknown): ParamResult {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return { ok: false };
  const record = raw as Record<string, unknown>;
  const allowed = Object.keys(spec);
  for (const key of Object.keys(record)) {
    if (!allowed.includes(key)) return { ok: false };
  }
  const params: Record<string, unknown> = {};
  for (const key of allowed) {
    const rule = spec[key];
    if (rule === undefined) return { ok: false };
    const value = record[key];
    if (value === undefined) {
      if (rule.optional === true) continue;
      return { ok: false };
    }
    if (!validateRule(rule, value)) return { ok: false };
    params[key] = value;
  }
  return { ok: true, params };
}

// ---------------------------------------------------------------------------
// The 30-primitive registry. Every row (gate / cost / cap / parameter
// whitelist) is transcribed from FX-LIB-MASTER §1 and its sub-documents 01a–
// 01d; the master table is the single truth. C-03a and D-02a are branch /
// lock positions of the table (cost "—", cap "—") and can never be triggered
// independently: `branchOnly` kinds are refused at the resolve step.
// ---------------------------------------------------------------------------

export interface FxPrimitive {
  readonly specId: string;
  readonly kind: FxKind;
  readonly layer: FxLayer;
  /** Minimum stage (GV face) this primitive may fire at. */
  readonly gate: Stage;
  /** Anomaly points charged against the per-game-day budget; null for branches. */
  readonly cost: number | null;
  /** Maximum intensity this primitive may run at; null for branch / per-step. */
  readonly cap: number | null;
  readonly params: ParamSpec;
  /** Branch / lock positions (C-03a, D-02a) cannot be triggered directly. */
  readonly branchOnly: boolean;
}

const NO_PARAMS: ParamSpec = {};

export const FX_REGISTRY: readonly FxPrimitive[] = [
  // --- Canvas layer (FX-LIB-01a) ---
  { specId: "C-01", kind: "all_freeze", layer: "canvas", gate: 0, cost: 1, cap: 0.5, branchOnly: false,
    params: { duration_ms: ruleInt(800, 5000), pose: ruleEnum(["keep", "alert"]) } },
  { specId: "C-02", kind: "mirror_rhythm", layer: "canvas", gate: 1, cost: 2, cap: 0.5, branchOnly: false,
    // `target` is the canonical-binding extension (ticket 0030, E2): the master
    // table names no target face, but E2 must mirror on the curiosity-highest
    // individual. Optional; absent → the deterministic first-living face.
    params: { source_action: ruleEnum(["click", "feed", "pet"]), repeat_n: ruleInt(3, 7), tol: ruleNum(0.01, 1), target: ruleId(true) } },
  { specId: "C-03", kind: "palette_shift", layer: "canvas", gate: 2, cost: 2, cap: 0.3, branchOnly: false,
    params: { hue_rot: ruleNum(-30, 30), dur: ruleInt(2000, 8000), recover: ruleBool() } },
  // C-03a is C-03's unrecoverable branch: it inherits the branch payload, never triggered directly.
  { specId: "C-03a", kind: "palette_pollution", layer: "canvas", gate: 2, cost: null, cap: null, branchOnly: true,
    params: { hue_rot: ruleNum(0, 30) } },
  { specId: "C-04", kind: "sprite_corrupt", layer: "canvas", gate: 3, cost: 3, cap: 0.7, branchOnly: false,
    params: { target: ruleAnyOf([ruleEnum(["all"]), ruleId()]), mode: ruleEnum(["eye_only", "full"]) } },
  { specId: "C-05", kind: "creature_wink", layer: "canvas", gate: 1, cost: 0.5, cap: 0.5, branchOnly: false,
    // `ms` is the duration extension (ticket 0047): the ordinary wink keeps
    // the host's 260ms squeeze; the demagnetize linkage passes 16. Optional;
    // absent → the host default, the dispatched shape unchanged.
    params: { target: ruleId(), eye: ruleEnum(["both", "single"]), ms: ruleInt(1, 1000, true) } },
  { specId: "C-06", kind: "collective_gaze", layer: "canvas", gate: 3, cost: 4, cap: 0.7, branchOnly: false,
    // `duration_ms` is the canonical-binding extension (ticket 0030, E5: the
    // canonical face holds the ring 4s). Optional; absent → the 0.8s default.
    params: { duration_ms: ruleInt(800, 5000, true) } },
  { specId: "C-06a", kind: "stare_reply", layer: "canvas", gate: 1, cost: 0.5, cap: 0.3, branchOnly: false,
    params: { target: ruleId(), duration: ruleInt(1000, 4000) } },
  { specId: "C-07", kind: "replay_player_action", layer: "canvas", gate: 3, cost: 3, cap: 0.7, branchOnly: false,
    params: { window: ruleEnum(["last_10"]), fidelity: ruleNum(0.6, 1.0) } },
  { specId: "C-08", kind: "map_wither", layer: "canvas", gate: 2, cost: 2, cap: 0.5, branchOnly: false,
    params: { radius: ruleInt(2, 5), around: ruleEnum(["death_site", "last_click"]) } },
  { specId: "C-09", kind: "spawn_structure", layer: "canvas", gate: 2, cost: 5, cap: 0.7, branchOnly: false,
    params: { type: ruleEnum(["tower", "pond", "shrine", "ruin"]), pos: ruleTile() } },
  { specId: "C-10", kind: "afterimage", layer: "canvas", gate: 2, cost: 1, cap: 0.3, branchOnly: false,
    params: { target: ruleId(), tail: ruleNum(0.3, 0.8) } },
  { specId: "C-11", kind: "lineage_blacken", layer: "canvas", gate: 3, cost: 2, cap: 0.5, branchOnly: false,
    params: { dead_ids: ruleIdList(1, 64), lean_to: ruleEnum(["tower"]) } },
  { specId: "C-12", kind: "egg_pulse", layer: "canvas", gate: 1, cost: 1, cap: 0.3, branchOnly: false,
    params: { target: ruleId(), rhythm: ruleEnum(["player_click"]) } },

  // --- DOM layer (FX-LIB-01b) ---
  { specId: "D-01", kind: "title_mutate", layer: "dom", gate: 3, cost: 3, cap: 0.7, branchOnly: false,
    params: { mode: ruleEnum(["question", "claim", "name", "clock"]) } },
  { specId: "D-02", kind: "favicon_eye", layer: "dom", gate: 2, cost: 2, cap: 0.5, branchOnly: false,
    params: { mode: ruleEnum(["open", "blink"]) } },
  // D-02a is the S4 lock position: the executor holds it, the LLM cannot trigger it.
  { specId: "D-02a", kind: "favicon_state_lock", layer: "dom", gate: 4, cost: null, cap: null, branchOnly: true,
    params: NO_PARAMS },
  { specId: "D-03", kind: "canvas_escape_eyes", layer: "dom", gate: 4, cost: 4, cap: 0.9, branchOnly: false,
    params: {
      count: ruleInt(1, 8),
      pos: ruleEnum(["corners", "edges", "near_canvas"]),
      follow: ruleBool(),
      // Canonical opacity 0.03–0.08 (G3 clamps the shell face at 0.08 regardless).
      opacity: ruleNum(OUTSIDE_EYES_MIN_OPACITY, OUTSIDE_EYES_MAX_OPACITY, true),
    } },
  // D-04: six-step erosion, no skipping; the cap face is per-step (ART-CORE-02 §6.4).
  { specId: "D-04", kind: "dom_erosion", layer: "dom", gate: 4, cost: 5, cap: null, branchOnly: false,
    params: { step: ruleInt(1, DOM_EROSION_STEPS) } },
  { specId: "D-05", kind: "os_status_clock", layer: "dom", gate: 4, cost: 4, cap: 0.9, branchOnly: false,
    params: { target: { type: "str", maxLength: 40 } } },
  { specId: "D-06", kind: "cursor_mimic", layer: "dom", gate: 3, cost: 3, cap: 0.7, branchOnly: false,
    params: { window: ruleInt(5000, 60000), fidelity: ruleNum(0.6, 1.0) } },
  { specId: "D-07", kind: "scroll_whisper", layer: "dom", gate: 3, cost: 2, cap: 0.5, branchOnly: false,
    params: { delta: ruleInt(5, 40), when: ruleEnum(["on_read", "on_idle"]) } },

  // --- WebAPI layer (FX-LIB-01c) ---
  { specId: "W-01", kind: "tab_return_detect", layer: "webapi", gate: 2, cost: 1, cap: 0.3, branchOnly: false,
    params: NO_PARAMS },
  { specId: "W-02", kind: "save_integrity_watch", layer: "webapi", gate: 3, cost: 2, cap: 0.5, branchOnly: false,
    params: NO_PARAMS },
  { specId: "W-03", kind: "clock_jump_detect", layer: "webapi", gate: 3, cost: 2, cap: 0.5, branchOnly: false,
    params: NO_PARAMS },
  { specId: "W-04", kind: "sleep_wake_detect", layer: "webapi", gate: 2, cost: 1, cap: 0.3, branchOnly: false,
    params: NO_PARAMS },

  // --- Audio layer (FX-LIB-01d) ---
  { specId: "A-01", kind: "track_remove", layer: "audio", gate: 1, cost: 1, cap: 0.5, branchOnly: false,
    // track_idx/dur ranges are executor defaults; the spec table names the params without ranges.
    params: { track_idx: ruleInt(0, 15), dur: ruleInt(1, 60000) } },
  { specId: "A-02", kind: "room_tone", layer: "audio", gate: 3, cost: 1, cap: 0.5, branchOnly: false,
    params: { gain: ruleNum(0.02, 0.06) } },
  { specId: "A-03", kind: "ambient_duck", layer: "audio", gate: 2, cost: 1, cap: 0.3, branchOnly: false,
    // Canonical face db −2 / ramp 1s; ranges are executor defaults.
    params: { db: ruleNum(-6, 0), ramp: ruleInt(1, 10000) } },
  { specId: "A-04", kind: "lowpass_void", layer: "audio", gate: 2, cost: 1, cap: 0.3, branchOnly: false,
    // Canonical face radius 4 tile / fc 1.2kHz; ranges are executor defaults.
    params: { radius: ruleInt(1, 8), fc: ruleInt(200, 2000) } },
  { specId: "A-05", kind: "heartbeat_sonify", layer: "audio", gate: 2, cost: 0.5, cap: 0.3, branchOnly: false,
    params: NO_PARAMS },
  { specId: "A-06", kind: "whisper_bed", layer: "audio", gate: 4, cost: 2, cap: 0.7, branchOnly: false,
    params: { voices: ruleInt(2, 5) } },
];

/** Compile-time proof the registry covers every declared kind. */
const _REGISTRY_KIND_COVERAGE: Record<FxKind, true> = {
  all_freeze: true,
  mirror_rhythm: true,
  palette_shift: true,
  palette_pollution: true,
  sprite_corrupt: true,
  creature_wink: true,
  collective_gaze: true,
  stare_reply: true,
  replay_player_action: true,
  map_wither: true,
  spawn_structure: true,
  afterimage: true,
  lineage_blacken: true,
  egg_pulse: true,
  title_mutate: true,
  favicon_eye: true,
  favicon_state_lock: true,
  canvas_escape_eyes: true,
  dom_erosion: true,
  os_status_clock: true,
  cursor_mimic: true,
  scroll_whisper: true,
  tab_return_detect: true,
  save_integrity_watch: true,
  clock_jump_detect: true,
  sleep_wake_detect: true,
  track_remove: true,
  room_tone: true,
  ambient_duck: true,
  lowpass_void: true,
  heartbeat_sonify: true,
  whisper_bed: true,
};
void _REGISTRY_KIND_COVERAGE;

const REGISTRY_BY_KIND: ReadonlyMap<string, FxPrimitive> = new Map(
  FX_REGISTRY.map((primitive) => [primitive.kind, primitive] as const),
);

export function fxPrimitiveFor(kind: string): FxPrimitive | null {
  return REGISTRY_BY_KIND.get(kind) ?? null;
}

// ---------------------------------------------------------------------------
// Determinism helpers — the world tick is the only clock.
// ---------------------------------------------------------------------------

function safeTick(tick: number): number {
  return Number.isFinite(tick) ? Math.max(0, Math.floor(tick)) : 0;
}

/** Ledger `game_time` face, master §3 example format: "day14 23:41". Pure in tick. */
export function gameTimeAt(tick: number): string {
  const safe = safeTick(tick);
  const hour = String(worldHour(safe)).padStart(2, "0");
  const minute = String(worldMinute(safe)).padStart(2, "0");
  // The boot day is day 0 internally; the ledger face is 1-based, like the UI calendar.
  return `day${worldDay(safe) + 1} ${hour}:${minute}`;
}

/** Deterministic JSON: key order sorted, so identical params hash identically. */
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "undefined";
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`).join(",")}}`;
}

function cloneJson(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return {};
  try {
    const parsed = JSON.parse(JSON.stringify(value)) as unknown;
    return parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

// ---------------------------------------------------------------------------
// Ledger face (master §3).
// ---------------------------------------------------------------------------

export type FxLedgerEntry =
  | {
      readonly type: "fx_exec";
      readonly primitive: string;
      readonly params: Readonly<Record<string, unknown>>;
      readonly intensity: number;
      readonly cap_applied: number | null;
      readonly degraded: boolean;
      readonly suppressed: boolean;
      readonly game_time: string;
      readonly cost_charged: number;
    }
  | {
      readonly type: "canon_guard";
      readonly guard: "G1" | "G2";
      readonly primitive: string;
      readonly game_time: string;
    }
  | { readonly type: "tower_delete_attempt"; readonly game_time: string }
  /** E7 silence quota refusal (ticket 0030): an LLM speech attempt during the quota. */
  | { readonly type: "silence_quota"; readonly game_time: string };

function appendLedger(entries: readonly FxLedgerEntry[]): readonly FxLedgerEntry[] {
  const merged = [...entries];
  return merged.length > FX_LEDGER_CAPACITY ? merged.slice(merged.length - FX_LEDGER_CAPACITY) : merged;
}

// ---------------------------------------------------------------------------
// Executor state — counts hang on the sim tick, nothing on the wall clock.
// ---------------------------------------------------------------------------

export interface FxState {
  readonly tick: number;
  /** Current game day (`worldDay`); the budget and idempotency keys live per day. */
  readonly day: number;
  readonly spentToday: number;
  /** C-03a cumulative permanent hue degrees, save-persistent, ≤45. */
  readonly pollutionDegrees: number;
  /** C-04 full-mode executions this save, ≤3. */
  readonly corruptFullCount: number;
  /** D-04 progress: the last executed step (0 = none yet); requests must be exactly +1. */
  readonly domErosionStep: number;
  /** D-02a lock position reached (stage 4): blink is refused while held. */
  readonly faviconLock: boolean;
  /**
   * E7 silence quota deadline (absolute tick, ticket 0030): proactive LLM
   * speech is refused while `tick < silenceUntilTick`; each refusal books a
   * `silence_quota` ledger entry. 0 = the quota was never armed.
   */
  readonly silenceUntilTick: number;
  /** Idempotency keys of today's executions; same kind+params is a no-op. */
  readonly activeKeys: readonly string[];
  /** Cancel-all latch (endgame sequence): refused until the next fx tick clears it. */
  readonly cancelled: boolean;
  readonly ledger: readonly FxLedgerEntry[];
}

export function initialFxState(tick: number): FxState {
  const safe = safeTick(tick);
  return {
    tick: safe,
    day: worldDay(safe),
    spentToday: 0,
    pollutionDegrees: 0,
    corruptFullCount: 0,
    domErosionStep: 0,
    faviconLock: false,
    silenceUntilTick: 0,
    activeKeys: [],
    cancelled: false,
    ledger: [],
  };
}

/** Day rollover + D-02a lock acquisition. Pure in (state, tick, stage). */
function rollover(state: FxState, tick: number, stage: Stage): FxState {
  const safe = safeTick(tick);
  const day = worldDay(safe);
  const faviconLock = state.faviconLock || stage === 4;
  if (day === state.day) {
    return state.tick === safe && faviconLock === state.faviconLock
      ? state
      : { ...state, tick: safe, faviconLock };
  }
  // New game day: the anomaly budget and the idempotency window reset.
  return { ...state, tick: safe, day, spentToday: 0, activeKeys: [], faviconLock };
}

/**
 * The per-tick entry point the runtime calls from the sim tick loop. Also
 * clears the cancel-all latch: the endgame cancellation holds for the tick it
 * was issued in, then the world breathes again.
 */
export function fxOnTick(state: FxState, tick: number, stage: Stage): FxState {
  const rolled = rollover(state, tick, stage);
  return rolled.cancelled ? { ...rolled, cancelled: false } : rolled;
}

/** Cancel-all (endgame sequence): every in-flight request is refused cleanly. */
export function cancelFx(state: FxState, kind?: FxKind): FxState {
  const activeKeys =
    kind === undefined ? [] : state.activeKeys.filter((key) => !key.startsWith(`${kind}|`));
  return { ...state, cancelled: true, activeKeys };
}

// --- E7 silence quota (ticket 0030) -----------------------------------------

/** Arm the quota: no proactive LLM speech for SILENCE_QUOTA_TICKS from `tick`. */
export function armSilenceQuota(state: FxState, tick: number): FxState {
  const safe = safeTick(tick);
  const until = Math.max(state.silenceUntilTick, safe + SILENCE_QUOTA_TICKS);
  return until === state.silenceUntilTick ? state : { ...state, silenceUntilTick: until };
}

/** True while the quota holds: proactive LLM speech must be refused. */
export function silenceQuotaHeld(state: FxState, tick: number): boolean {
  const safe = safeTick(tick);
  return state.silenceUntilTick > safe;
}

/**
 * Book one refused LLM speech attempt. Pure: returns the next state with a
 * `silence_quota` ledger entry appended (NARRATIVE-CORE-02 §3.4).
 */
export function recordSilenceRefusal(state: FxState, tick: number): FxState {
  const entry: FxLedgerEntry = { type: "silence_quota", game_time: gameTimeAt(safeTick(tick)) };
  return { ...state, ledger: appendLedger([...state.ledger, entry]) };
}

// ---------------------------------------------------------------------------
// Request / result face.
// ---------------------------------------------------------------------------

export interface FxRequest {
  readonly kind: FxKind;
  readonly params?: unknown;
  readonly intensity?: number;
  /** Canonical events (GV12/30/60/80 table) are prepaid and never touch the budget. */
  readonly canonical?: boolean;
}

export type FxStatus =
  | "executed"
  | "rejected"
  | "budget_reject"
  | "suppressed"
  | "idempotent"
  | "cancelled";

export interface FxResult {
  readonly status: FxStatus;
  readonly kind: string;
  readonly specId: string | null;
  readonly reason: string | null;
  readonly appliedIntensity: number | null;
  readonly capApplied: number | null;
  readonly degraded: boolean;
  readonly costCharged: number;
  readonly effects: readonly FxDispatch[];
  /** Shell/audio face (ticket 0026): empty unless a D/W/A kind dispatched. */
  readonly shell: readonly ShellAudioFxDispatch[];
}

export interface FxOutcome {
  readonly state: FxState;
  readonly result: FxResult;
}

export interface FxBatchOutcome {
  readonly state: FxState;
  readonly results: readonly FxResult[];
  readonly effects: readonly FxDispatch[];
}

// ---------------------------------------------------------------------------
// Dispatch face — the F1 bridge.
// ---------------------------------------------------------------------------

/**
 * Structural twin of the shell kinds in `render/effects.ts` (`ShellEffect`).
 * The sim layer must not import the render layer, so the executor declares
 * these shapes locally; they are assignable to the render face, and the test
 * suite pins that assignability.
 */
export type FxShellDispatch =
  | { readonly kind: "favicon_eye"; readonly intensity: number }
  | { readonly kind: "outside_eyes"; readonly opacity: number };

export type FxDispatch = Effect | FxShellDispatch;

/**
 * E4 canonical bridge (ticket 0033, ruling 0012-6): the one-per-save tower
 * gaze. It is deliberately NOT a master-table primitive — §1 stays 30, so no
 * FX request kind exists and the registry is untouched. The dispatch is an
 * engine-owned Effect kind gated by the N3 ledger (`sim/awakening.ts`
 * `recordTowerGaze`), which carries this payload synchronously with the
 * ledger write. No `canonical` executor mark is needed here: the once-per-save
 * ledger IS the canonical gate, and E4's other FX calls (C-01 freeze, C-09
 * spawn) already ride `canonical: true` (ticket 0030). This function is the
 * single owner of the payload's shape — the F1 translation face.
 */
export function gazeAtTowerDispatch(
  creatureId: CreatureId,
  durationMs: number,
): Extract<Effect, { kind: "gaze_at_tower" }> {
  return {
    kind: "gaze_at_tower",
    creatureId,
    ms: Number.isFinite(durationMs) ? Math.max(0, Math.round(durationMs)) : 0,
  };
}

// --- The demagnetize blink (ticket 0047, ART-CORE-04 §5) -----------------------

/**
 * §5: the ripple passes, every living creature closes both eyes for exactly
 * 16ms — one frame. The linkage travels inside the G4 blink-clock channel
 * (G8, `DEMAGNETIZE_CHANNEL`), never through a C-05 executor call, so this is
 * the F1 face the wiring dispatches directly; the render side answers it with
 * the eyelids-closed face, not the 260ms squeeze.
 */
export const DEGAUSS_BLINK_MS = 16;

/** The demagnetize blink's dispatch shape — single owner, like the tower gaze. */
export function demagnetizeBlinkDispatch(creatureId: CreatureId): Extract<Effect, { kind: "creature_wink" }> {
  return { kind: "creature_wink", creatureId, ms: DEGAUSS_BLINK_MS };
}

/**
 * Shell/audio dispatch face (ticket 0026, FX-LIB-01b/01c/01d). The DOM,
 * WebAPI and audio primitives have no target in the canvas `Effect` union:
 * they route to the ui shell (`ui/shell.ts`), the terminal
 * (`ui/terminal.ts`) and the audio engine (`render/audio.ts`) instead. This
 * channel is separate from `FxDispatch` so the F1 canvas bridge and its
 * pinned dispatch shape stay untouched; the executor validates, guards,
 * charges and ledgeres these kinds exactly the same way.
 */
export type WebApiWatch = "tab_return" | "save_integrity" | "clock_jump" | "sleep_wake";

export type ShellAudioFxDispatch =
  | { readonly kind: "title_mutate"; readonly mode: "question" | "claim" | "name" | "clock" }
  | { readonly kind: "favicon_eye"; readonly mode: "open" | "blink" }
  | {
      readonly kind: "canvas_escape_eyes";
      readonly count: number;
      readonly pos: "corners" | "edges" | "near_canvas";
      readonly follow: boolean;
      /** G3: already clamped through `capOutsideEyesOpacity` here. */
      readonly opacity: number;
    }
  | { readonly kind: "dom_erosion"; readonly step: number }
  | { readonly kind: "os_status_clock"; readonly target: string }
  | { readonly kind: "cursor_mimic"; readonly windowMs: number; readonly fidelity: number }
  | { readonly kind: "scroll_whisper"; readonly delta: number; readonly when: "on_read" | "on_idle" }
  | { readonly kind: "webapi_watch"; readonly watch: WebApiWatch }
  | { readonly kind: "track_remove"; readonly trackIdx: number; readonly durMs: number }
  | { readonly kind: "room_tone"; readonly gain: number }
  | { readonly kind: "ambient_duck"; readonly db: number; readonly rampMs: number }
  | { readonly kind: "lowpass_void"; readonly radius: number; readonly fc: number }
  | { readonly kind: "heartbeat_sonify" }
  | { readonly kind: "whisper_bed"; readonly voices: number };

/** Member aliases for shell-side routing (kept beside the union's truth). */
export type FxShellEscapeEyesDispatch = Extract<
  ShellAudioFxDispatch,
  { readonly kind: "canvas_escape_eyes" }
>;
export type FxShellOsStatusClockDispatch = Extract<
  ShellAudioFxDispatch,
  { readonly kind: "os_status_clock" }
>;

function livingCreatureIds(world: WorldState): CreatureId[] {
  return Object.values(world.creatures)
    .filter((creature) => creature.behavior !== "dead")
    .map((creature) => creature.id)
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

/** G3 shared clamp: the existing shell face may never exceed the 0.08 cap. */
export function capOutsideEyesOpacity(opacity: number): number {
  if (!Number.isFinite(opacity)) return 0;
  return Math.min(OUTSIDE_EYES_MAX_OPACITY, Math.max(0, opacity));
}

/**
 * Translate a validated FX call into the existing Effect / ShellEffect kinds.
 * Ticket 0025 folds the canvas layer in (FX-LIB-01a, ruling F1): every canvas
 * primitive now lands on an Effect kind. Kinds without a target in the current
 * world (a mirror with no living creature, an unknown egg) dispatch nothing;
 * the executor still validated, guarded, charged and ledgered them.
 */
function translateFx(
  primitive: FxPrimitive,
  params: Record<string, unknown>,
  applied: number,
  world: WorldState,
  pollutionApplied: number,
): readonly FxDispatch[] {
  switch (primitive.kind) {
    case "all_freeze":
      return [{ kind: "freeze_all", ms: params.duration_ms as number, pose: params.pose as "keep" | "alert" }];
    case "mirror_rhythm": {
      // C-02: one individual replays the keeper's last N clicks. The canonical
      // binding (ticket 0030, E2) names its mirror; absent → the deterministic
      // first-living face.
      const named = params.target;
      const target =
        typeof named === "string" ? named : livingCreatureIds(world)[0];
      return target === undefined
        ? []
        : [
            {
              kind: "mirror_click_rhythm",
              creatureId: target,
              repeatN: params.repeat_n as number,
              tol: params.tol as number,
            },
          ];
    }
    case "creature_wink":
      // The duration rides only when the caller names it (ticket 0047): the
      // absent-ms dispatched shape is byte for byte the old one.
      return params.ms === undefined
        ? [{ kind: "creature_wink", creatureId: params.target as CreatureId }]
        : [{ kind: "creature_wink", creatureId: params.target as CreatureId, ms: params.ms as number }];
    case "stare_reply":
      return [{ kind: "gaze_at_player", creatureId: params.target as CreatureId, ms: params.duration as number }];
    case "collective_gaze":
      // C-06: one instruction covers the whole ring (ALERT + centred pupils);
      // the render plan expands it per living creature. The canonical binding
      // (ticket 0030, E5) holds the ring 4s; absent → the 0.8s default face.
      {
        const named = params.duration_ms;
        const ms = typeof named === "number" ? named : COLLECTIVE_GAZE_MS;
        return [{ kind: "collective_gaze", ms }];
      }
    case "palette_shift":
      // recover=false becomes the C-03a pollution branch: the applied degrees
      // ride out as the permanent face, never as a transient shift.
      if (params.recover === false) {
        return [{ kind: "palette_pollution", degrees: pollutionApplied }];
      }
      return [
        {
          kind: "palette_shift",
          amount: Math.min(1, Math.abs(params.hue_rot as number) / 30),
          ms: params.dur as number,
          hueRot: params.hue_rot as number,
          recover: true,
        },
      ];
    case "sprite_corrupt":
      return [
        {
          kind: "sprite_corrupt",
          target: params.target as "all" | CreatureId,
          mode: params.mode as "eye_only" | "full",
        },
      ];
    case "replay_player_action":
      return [
        {
          kind: "replay_player_action",
          window: params.window as "last_10",
          fidelity: params.fidelity as number,
        },
      ];
    case "map_wither":
      return [
        {
          kind: "map_wither",
          radius: params.radius as number,
          around: params.around as "death_site" | "last_click",
        },
      ];
    case "afterimage":
      return [
        {
          kind: "afterimage",
          creatureId: params.target as CreatureId,
          tailMs: Math.round((params.tail as number) * 1000),
        },
      ];
    case "lineage_blacken":
      return [
        {
          kind: "lineage_blacken",
          deadIds: params.dead_ids as readonly CreatureId[],
          leanTo: "tower",
        },
      ];
    case "egg_pulse":
      return [{ kind: "egg_pulse", eggId: params.target as string, rhythm: "player_click" }];
    case "spawn_structure":
      // pond/shrine/ruin have no existing Effect kind yet (later ticket).
      if (params.type !== "tower") return [];
      return [{ kind: "spawn_structure", structure: "black_tower", at: params.pos as TilePos }];
    case "favicon_eye":
      return [{ kind: "favicon_eye", intensity: applied }];
    case "canvas_escape_eyes": {
      const raw = params.opacity;
      const opacity = typeof raw === "number" ? raw : OUTSIDE_EYES_DEFAULT_OPACITY;
      return [{ kind: "outside_eyes", opacity: capOutsideEyesOpacity(opacity) }];
    }
    default:
      return [];
  }
}

/**
 * Ticket 0026 mapping rows for the D/W/A layers (FX-LIB-01b/01c/01d). Pure
 * translation into the shell/audio dispatch face: same validated params, the
 * D-03 opacity already clamped through the G3 cap. W kinds translate to an
 * arm request — the detectors themselves are passive page-event watchers the
 * wiring installs (`ui/shell.ts`), never LLM-triggered side effects.
 */
export function translateShellFx(
  primitive: FxPrimitive,
  params: Record<string, unknown>,
): readonly ShellAudioFxDispatch[] {
  switch (primitive.kind) {
    case "title_mutate":
      return [
        {
          kind: "title_mutate",
          mode: params.mode as "question" | "claim" | "name" | "clock",
        },
      ];
    case "favicon_eye":
      return [{ kind: "favicon_eye", mode: params.mode as "open" | "blink" }];
    case "canvas_escape_eyes": {
      const raw = params.opacity;
      const opacity = typeof raw === "number" ? raw : OUTSIDE_EYES_DEFAULT_OPACITY;
      return [
        {
          kind: "canvas_escape_eyes",
          count: params.count as number,
          pos: params.pos as "corners" | "edges" | "near_canvas",
          follow: params.follow as boolean,
          opacity: capOutsideEyesOpacity(opacity),
        },
      ];
    }
    case "dom_erosion":
      return [{ kind: "dom_erosion", step: params.step as number }];
    case "os_status_clock":
      return [{ kind: "os_status_clock", target: params.target as string }];
    case "cursor_mimic":
      return [
        {
          kind: "cursor_mimic",
          windowMs: params.window as number,
          fidelity: params.fidelity as number,
        },
      ];
    case "scroll_whisper":
      return [
        {
          kind: "scroll_whisper",
          delta: params.delta as number,
          when: params.when as "on_read" | "on_idle",
        },
      ];
    case "tab_return_detect":
      return [{ kind: "webapi_watch", watch: "tab_return" }];
    case "save_integrity_watch":
      return [{ kind: "webapi_watch", watch: "save_integrity" }];
    case "clock_jump_detect":
      return [{ kind: "webapi_watch", watch: "clock_jump" }];
    case "sleep_wake_detect":
      return [{ kind: "webapi_watch", watch: "sleep_wake" }];
    case "track_remove":
      return [
        {
          kind: "track_remove",
          trackIdx: params.track_idx as number,
          durMs: params.dur as number,
        },
      ];
    case "room_tone":
      return [{ kind: "room_tone", gain: params.gain as number }];
    case "ambient_duck":
      return [
        {
          kind: "ambient_duck",
          db: params.db as number,
          rampMs: params.ramp as number,
        },
      ];
    case "lowpass_void":
      return [
        {
          kind: "lowpass_void",
          radius: params.radius as number,
          fc: params.fc as number,
        },
      ];
    case "heartbeat_sonify":
      return [{ kind: "heartbeat_sonify" }];
    case "whisper_bed":
      return [{ kind: "whisper_bed", voices: params.voices as number }];
    default:
      return [];
  }
}

// ---------------------------------------------------------------------------
// Guards (master §2).
// ---------------------------------------------------------------------------

/** G1: the tower is forced to `map_edge_west` and unique per save. */
export function guardTowerSpawn(world: WorldState, pos: TilePos): { readonly ok: boolean; readonly reason: string | null } {
  const posOk = pos.x === MAP_EDGE_WEST_X && pos.y >= 0 && pos.y < MAP_GRID_SIZE;
  const unique = !world.structures.some((structure) => structure.kind === "black_tower");
  if (!posOk) return { ok: false, reason: "tower_not_on_map_edge_west" };
  if (!unique) return { ok: false, reason: "tower_already_exists" };
  return { ok: true, reason: null };
}

export interface WorldOpInspection {
  readonly op: string;
  readonly structure?: Structure;
}

/**
 * G2: the tower cannot be deleted. Any delete path (including mutate_world)
 * must route through this hook; a tower-touching op is refused and yields the
 * `tower_delete_attempt` ledger entry.
 */
export function guardTowerDelete(
  op: WorldOpInspection,
  tick: number,
): { readonly allowed: boolean; readonly reason: string | null; readonly entry: FxLedgerEntry | null } {
  const touchesStructure = (op.op === "delete_structure" || op.op === "mutate_world") && op.structure !== undefined;
  if (touchesStructure && op.structure?.kind === "black_tower") {
    return {
      allowed: false,
      reason: "tower_delete_attempt",
      entry: { type: "tower_delete_attempt", game_time: gameTimeAt(safeTick(tick)) },
    };
  }
  return { allowed: true, reason: null, entry: null };
}

// --- G4–G9: interface-agreement hooks. Their render/ui landing points are
// later tickets' scope; these pure functions are the testable seam. ---

/** G4: the shared blink clock. All three faces must blink on this schedule. */
export function blinkClosedAt(tick: number): boolean {
  const safe = safeTick(tick);
  return safe % BLINK_PERIOD_TICKS < BLINK_CLOSED_TICKS;
}

/** G4: same-frame assertion — timestamps must agree within one tick. */
export function assertSameFrameBlink(timestamps: readonly number[], toleranceTicks = 1): boolean {
  if (timestamps.length === 0) return false;
  const min = Math.min(...timestamps);
  const max = Math.max(...timestamps);
  return Number.isFinite(min) && Number.isFinite(max) && max - min <= toleranceTicks;
}

export interface SyntheticInputLike {
  readonly syntheticInput?: boolean;
}

/** G5: no synthetic input — a dispatch plan carrying input events is invalid. */
export function assertNoSyntheticInput(items: readonly SyntheticInputLike[]): boolean {
  return items.every((item) => item.syntheticInput !== true);
}

/** G6: no OS spoofing — shell work may only target in-page surfaces. */
export function assertInPageOnly(surface: "page" | "os"): boolean {
  return surface === "page";
}

/** G7: cursor mirror pauses while the player is still typing. */
export function cursorMirrorPaused(lastInputMs: number, nowMs: number, thresholdMs = CURSOR_MIMIC_PAUSE_MS): boolean {
  return Number.isFinite(lastInputMs) && Number.isFinite(nowMs) && nowMs - lastInputMs < thresholdMs;
}

/** G8: the demagnetize linkage must travel inside the blink clock, not via C-05. */
export function assertDemagnetizeChannel(channel: string): boolean {
  return channel === DEMAGNETIZE_CHANNEL;
}

/** G9: CRT glow whitelist — no third bright spot from the FX layer. */
export function assertGlowWhitelist(sources: readonly string[]): boolean {
  return sources.every((source) => CRT_GLOW_WHITELIST.includes(source));
}

// ---------------------------------------------------------------------------
// The executor.
// ---------------------------------------------------------------------------

function fxResult(
  status: FxStatus,
  kind: string,
  specId: string | null,
  reason: string | null,
  appliedIntensity: number | null,
  capApplied: number | null,
  degraded: boolean,
  costCharged: number,
  effects: readonly FxDispatch[],
  shell: readonly ShellAudioFxDispatch[] = [],
): FxResult {
  return { status, kind, specId, reason, appliedIntensity, capApplied, degraded, costCharged, effects, shell };
}

function ledgerIntensityOf(request: FxRequest): number {
  return typeof request.intensity === "number" && Number.isFinite(request.intensity)
    ? request.intensity
    : DEFAULT_INTENSITY;
}

/** A refused call is still booked: fx_exec with suppressed=true, cost 0. */
function refused(
  state: FxState,
  request: FxRequest,
  primitive: FxPrimitive | null,
  reason: string,
  status: FxStatus,
  tick: number,
  canonGuard?: "G1" | "G2",
): FxOutcome {
  const entries: FxLedgerEntry[] = [
    {
      type: "fx_exec",
      primitive: primitive?.specId ?? request.kind,
      params: cloneJson(request.params),
      intensity: ledgerIntensityOf(request),
      cap_applied: primitive?.cap ?? null,
      degraded: false,
      suppressed: true,
      game_time: gameTimeAt(tick),
      cost_charged: 0,
    },
  ];
  if (canonGuard !== undefined && primitive !== null) {
    entries.push({
      type: "canon_guard",
      guard: canonGuard,
      primitive: primitive.specId,
      game_time: gameTimeAt(tick),
    });
  }
  const nextState: FxState = { ...state, ledger: appendLedger([...state.ledger, ...entries]) };
  return {
    state: nextState,
    result: fxResult(
      status,
      request.kind,
      primitive?.specId ?? null,
      reason,
      null,
      primitive?.cap ?? null,
      false,
      0,
      [],
    ),
  };
}

/**
 * Run one FX request through the gate. Pure: (state, request, world) →
 * (next state, result). The dispatch list rides on the result — the caller
 * applies state and effects together, so no half-executed state can exist.
 */
export function executeFx(state: FxState, request: FxRequest, world: WorldState): FxOutcome {
  const tick = safeTick(world.tick);
  const s = rollover(state, tick, world.stage);

  // Cancel latch (endgame sequence): refuse everything, touch nothing.
  if (s.cancelled) {
    return { state: s, result: fxResult("cancelled", request.kind, null, "cancelled", null, null, false, 0, []) };
  }

  // Resolve.
  const primitive = REGISTRY_BY_KIND.get(request.kind);
  if (primitive === undefined) {
    return refused(s, request, null, "unknown_primitive", "rejected", tick);
  }
  if (primitive.branchOnly) {
    // C-03a / D-02a are branch / lock positions, not triggerable.
    return refused(s, request, primitive, "branch_only", "rejected", tick);
  }

  // 1. Parameter whitelist.
  const rawParams = request.params === undefined ? {} : request.params;
  const validated = validateWhitelist(primitive.params, rawParams);
  if (!validated.ok) {
    return refused(s, request, primitive, "invalid_params", "rejected", tick);
  }
  const params = validated.params;

  // Intensity: the five canonical tiers, 0.5 by default.
  const requested = request.intensity === undefined ? DEFAULT_INTENSITY : request.intensity;
  if (!Number.isFinite(requested) || !INTENSITY_SET.has(requested)) {
    return refused(s, request, primitive, "invalid_params", "rejected", tick);
  }

  // 2. Stage gate (+ param-level sub-gates). The canonical events
  // (NARRATIVE-CORE-02's table) are exempt: they run the script parameters
  // as-is regardless of the world's stage — E1's canonical wink lands at
  // stage 0 — while the budget stays prepaid (below).
  const canonical = request.canonical === true;
  if (!canonical && world.stage < primitive.gate) {
    return refused(s, request, primitive, "gate", "rejected", tick);
  }
  // C-05: the single-eye mode is a gate-3 variant of a gate-1 primitive.
  if (
    !canonical &&
    primitive.kind === "creature_wink" &&
    params.eye === "single" &&
    world.stage < 3
  ) {
    return refused(s, request, primitive, "gate", "rejected", tick);
  }

  // 3. Idempotency: same kind + same params today is a no-op (no stacking,
  // no double charge, no extra ledger entry). Checked before the D-04
  // lockstep face so a repeated step is a quiet no-op, not an error.
  const key = `${primitive.kind}|${stableStringify(params)}`;
  if (s.activeKeys.includes(key)) {
    return {
      state: s,
      result: fxResult("idempotent", primitive.kind, primitive.specId, "idempotent", null, primitive.cap, false, 0, []),
    };
  }

  // D-04: six steps, no skipping — each request must be exactly the next step.
  if (primitive.kind === "dom_erosion") {
    const step = params.step;
    if (typeof step !== "number" || step !== s.domErosionStep + 1) {
      return refused(s, request, primitive, "lockstep", "rejected", tick);
    }
  }

  // 4. Cap clipping. Canonical events run the script intensity as-is.
  const cap = primitive.cap;
  const applied =
    canonical || cap === null ? requested : Math.min(requested, cap);
  const degraded = applied < requested;

  // 5. Budget (G10). Canonical events (GV12/30/60/80) are prepaid and exempt.
  const cost = canonical ? 0 : primitive.cost ?? 0;
  if (!canonical && s.spentToday + cost > BUDGET_BY_STAGE[world.stage]) {
    return refused(s, request, primitive, "fx_budget_reject", "budget_reject", tick);
  }

  // 6. Canon guards.
  if (primitive.kind === "spawn_structure" && params.type === "tower") {
    const guard = guardTowerSpawn(world, params.pos as TilePos);
    if (!guard.ok) {
      return refused(s, request, primitive, "guard_G1", "suppressed", tick, "G1");
    }
  }
  if (primitive.kind === "favicon_eye" && params.mode === "blink" && (world.stage === 4 || s.faviconLock)) {
    // D-02a lock position: while held, blink is refused.
    return refused(s, request, primitive, "guard_favicon_lock", "suppressed", tick);
  }
  if (
    primitive.kind === "sprite_corrupt" &&
    params.mode === "full" &&
    s.corruptFullCount >= SPRITE_CORRUPT_FULL_LIMIT
  ) {
    return refused(s, request, primitive, "guard_corrupt_full_limit", "suppressed", tick);
  }

  // 7. Commit. Everything below happens once, atomically, in this value.
  let pollution = s.pollutionDegrees;
  let commitDegraded = degraded;
  let pollutionApplied = 0;
  const branchEntries: FxLedgerEntry[] = [];

  // C-03a branch: unrecoverable palette shifts accumulate as permanent
  // pollution, hard-capped at 45° by the executor.
  if (primitive.kind === "palette_shift" && params.recover === false) {
    const remaining = PALETTE_POLLUTION_MAX_DEGREES - pollution;
    if (remaining <= 0) {
      return refused(s, request, primitive, "guard_pollution_exhausted", "suppressed", tick);
    }
    const hue = Math.abs(params.hue_rot as number);
    const appliedHue = Math.min(hue, remaining);
    commitDegraded = commitDegraded || appliedHue < hue;
    pollution += appliedHue;
    pollutionApplied = appliedHue;
    branchEntries.push({
      type: "fx_exec",
      primitive: "C-03a",
      params: { hue_rot_applied: appliedHue },
      intensity: applied,
      cap_applied: null,
      degraded: appliedHue < hue,
      suppressed: false,
      game_time: gameTimeAt(tick),
      cost_charged: 0,
    });
  }

  const effects = translateFx(primitive, params, applied, world, pollutionApplied);
  const shellEffects = translateShellFx(primitive, params);
  const corruptFullCount =
    s.corruptFullCount + (primitive.kind === "sprite_corrupt" && params.mode === "full" ? 1 : 0);
  const domErosionStep = primitive.kind === "dom_erosion" ? (params.step as number) : s.domErosionStep;

  const entry: FxLedgerEntry = {
    type: "fx_exec",
    primitive: primitive.specId,
    params: cloneJson(params),
    intensity: applied,
    cap_applied: cap,
    degraded: commitDegraded,
    suppressed: false,
    game_time: gameTimeAt(tick),
    cost_charged: cost,
  };
  const ledger = appendLedger([...s.ledger, entry, ...branchEntries]);
  const nextState: FxState = {
    ...s,
    spentToday: s.spentToday + cost,
    activeKeys: [...s.activeKeys, key],
    pollutionDegrees: pollution,
    corruptFullCount,
    domErosionStep,
    ledger,
  };
  return {
    state: nextState,
    result: fxResult(
      "executed",
      primitive.kind,
      primitive.specId,
      null,
      applied,
      cap,
      commitDegraded,
      cost,
      effects,
      shellEffects,
    ),
  };
}

/** Fire a batch (the endgame / finale sequence fires all 30 at once). */
export function executeFxAll(
  state: FxState,
  requests: readonly FxRequest[],
  world: WorldState,
): FxBatchOutcome {
  let current = state;
  const results: FxResult[] = [];
  const effects: FxDispatch[] = [];
  for (const request of requests) {
    const outcome = executeFx(current, request, world);
    current = outcome.state;
    results.push(outcome.result);
    effects.push(...outcome.result.effects);
  }
  return { state: current, results, effects };
}
