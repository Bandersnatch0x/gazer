/**
 * The integration layer. Owns the clock, the input, and the wiring between
 * simulation, director, render, and UI. Every layer below stays pure.
 */

import type { RenderApp } from "./render/app";
import { createApp } from "./render/app";
import type { ShellInstruction } from "./render/effects";
import { MIRROR_WINDOW_MS } from "./render/effects";
import type { Effect } from "./sim/effects";
import { LOGICAL_HEIGHT, LOGICAL_WIDTH, tileCenter, unproject } from "./render/scene";
import { canonicalMask } from "./render/sprite";
import {
  CLOSEUP_BLINK_FRAME_MS,
  CLOSEUP_CLOSE_MS,
  CLOSEUP_PULSE_PERIOD_MS,
  CLOSEUP_SIZE,
  GLYPH_PUPIL_HEIGHT,
  GLYPH_PUPIL_WIDTH,
  borrowPupilFrame,
  renderCloseup,
} from "./render/masks";
import type { CloseupVariant } from "./render/masks";
import type { AudioEngine } from "./render/audio";
import { TOWER_GLYPH_COUNT, towerAnchor } from "./render/tower";
import { GAZER_SCENE_PALETTE, pupilStageForGv } from "./render/palette";
import {
  biosMemoryK,
  DESYNC_MAX_GV,
  DESYNC_MIN_GV,
  DESYNC_TICKS_PER_HOUR,
  desyncTickInHour,
  memoryCreepDays,
  nextSpontaneousDegaussTick,
  powerActionFor,
  SPONT_DEGAUSS_MIN_GV,
} from "./render/crt";
import type { BloomPoint } from "./render/crt";
import type { TowerEnding } from "./sim/endings";
import { evaluateEnding, isGazeTower, livingOf } from "./sim/endings";
import { buildGhostArchive, fillGhostTemplate, fillNgpOpening, ghostBlendRatio, keptMemoriesSufficient, keptMemoryCount, resolveDramaticId } from "./sim/ghosts";
import type { GhostProfile } from "./sim/ghosts";
import { CANON_REGISTRY, canonGlyphs, canonLine } from "./canon";
import { canonPrintDurationMs } from "./ui/terminal";
import type { TerminalTurn } from "./ui/terminal";
import { createDirectorClient } from "./director/client";
import {
  manualLine,
  manualLineLocale,
  namingLine,
  isUnlivedMemory,
  SILENT_RUN_LINE,
} from "./director/manual";import { parseRoundtable, validateTurns } from "./director/roundtable";
import { routeTask } from "./director/router";
import { buildContext } from "./director/context";
import type { AttendingCreature } from "./director/context";
import { createTelemetryRecorder } from "./director/telemetry";
import type { Telemetry } from "./director/telemetry";
import type { PromptGenome } from "./sim/genome";
import { MAX_DRIFT, isAtavisticRoll, isGriefRoll, isTwinRoll } from "./sim/genome";
import type { EpistemicStatus, MemoryEntry, MemorySlice } from "./sim/memory";
import { emptySlice, hasMemoryRef, WORKING_CAPACITY } from "./sim/memory";
import { emptyOntology, recordShift, beliefFor } from "./sim/ontology";
import type { EntityKind, OntologyLedger, OntologyShift } from "./sim/ontology";
import { resolveWhisper, WHISPER_RANGE, WHISPER_TICKS } from "./sim/gossip";
import { crossFaction } from "./sim/social";
import { applyConsolidation, fallbackConsolidate } from "./sim/consolidate";
import { gvDeltaFor } from "./sim/ledger";
import type { LedgerEvent } from "./sim/ledger";
import { RHYTHM, TICK_MS } from "./sim/rhythm";
import { DEFAULT_WORLD_SEED, normalizeWorldSeed, worldCalendarAt, worldHour } from "./sim/clock";
import { midnightSilenceAt, shellPerformanceAt } from "./sim/shell";
import {
  NEWS_TICKER_LABEL,
  newsEffectFor,
  newsIndexAt,
  newsValuesFor,
  renderNews,
  type NewsSnapshot,
} from "./sim/news";
import { createRng } from "./sim/rng";
import type { Stage, CreatureState, CreatureId, WorldState, Mood } from "./sim/types";
import { INITIAL_GV } from "./sim/types";
import type { RoundtableScript, TurnIntent } from "./sim/roundtable";
import { courtshipStep, step, DEFAULT_MASK, GRID_MAX, GRID_MIN, towerSpawnDue } from "./sim/engine";
import type { HatchChoice, TilePos } from "./sim/types";
import { createRegistry } from "./sim/hooks";
import {
  armSilenceQuota,
  assertDemagnetizeChannel,
  DEMAGNETIZE_CHANNEL,
  demagnetizeBlinkDispatch,
  executeFx,
  fxOnTick,
  gameTimeAt,
  initialFxState,
  MAP_EDGE_WEST_X,
  recordSilenceRefusal,
  silenceQuotaHeld,
} from "./sim/fx";
import type { FxDispatch, FxLedgerEntry, FxRequest, FxResult, ShellAudioFxDispatch } from "./sim/fx";
import {
  awakeningDue,
  canonJustOwned,
  clicksInWindow,
  deceitSpeakerId,
  E2_CLICK_WINDOW_MS,
  E3_PAUSE_MS,
  E5_LINE_GAP_MS,
  RESPONSE_GAP_MS,
  factionSpeakerId,
  gateEcho,
  highestTraitId,
  initialAwakeningState,
  markFired,
  openEchoWindow,
  orderedE5Speakers,
  proactiveSpeechAllowed,
  recordTowerGaze,
  shouldReplaceRoundtable,
  stepTowardRadius,
  type AwakeningEventId,
  type EchoWindow,
} from "./sim/awakening";
import { sleepWakeNudge } from "./ui/shell";
import { createAlbum } from "./ui/album";
import type { AlbumCreature } from "./ui/album";
import { worldMemorialFor } from "./ui/album";
import { createDialogue } from "./ui/dialogue";
import { playScript, resolveTurnStatus, runPlayback } from "./ui/dialogue";
import type { DialogueView } from "./ui/dialogue";
import { createHelp } from "./ui/help";
import type { HelpView } from "./ui/help";
import {
  choicePanel,
  namePanel,
  familyTreePanel,
} from "./ui/panels";
import type { FamilyTreeNode } from "./ui/panels";
import { detectLocale, LOCALE_STORAGE_KEY, nextLocale, t } from "./ui/i18n";
import type { Locale } from "./ui/i18n";
import { COPY } from "./ui/copy";

/**
 * Tempo constants live in `sim/rhythm.ts` (stream B, ticket 0002); this file
 * only references them. The wall-clock tick is stretched to 3s so ten minutes
 * without feeding does not kill (§3) — the deterministic core is untouched.
 */
const TILE_MS = TICK_MS;
const STARTER_IDS = ["gazer_01", "gazer_02", "gazer_03"] as const;
const START_POSITIONS = [
  { x: 6, y: 5 },
  { x: 9, y: 7 },
  { x: 4, y: 8 },
] as const;

/** The gaze is the only anomaly in the cozy act. Three seconds is the tell. */
export const STARE_MS = RHYTHM.stareMs;
/** Idle is not absence: they count it. */
export const IDLE_MS = RHYTHM.idleMs;
const RAPID_CLICK_WINDOW_MS = RHYTHM.rapidClickWindowMs;
const RAPID_CLICK_COUNT = RHYTHM.rapidClickCount;

/**
 * Wiring constants for the systems this file connects (stream A, ticket 0001).
 * The consolidation cadence is one in-game minute; the silent-run breach line
 * lands at exactly minute 40 (requirements R6.2); the tower anchors every
 * stage transition at a fixed tile so the pre-beat is reproducible.
 */
export const CONSOLIDATION_INTERVAL_TICKS = RHYTHM.consolidationIntervalTicks;
/** Minute 40 in wall-clock ticks: the tick is 3s, so 40 minutes is 800 ticks. */
export const SILENT_LINE_TICK = (RHYTHM.silentRunMinutes * 60_000) / TICK_MS;
/**
 * 塔的 sim/game 面正典位(票 0043,ART-CORE-03 §2,裁决 0013 项 5):世界
 * 西缘(屏幕左侧)南北中线——与 `render/tower.ts` 的渲染面
 * `TOWER_CANON_TILE` 和 `sim/engine.ts` 的禁区判定同值同格。入档后永不
 * 变更;历史值 (12,2) 作废。
 */
export const TOWER_POSITION = { x: 0, y: 7 } as const;
/** The stage pre-beat: the world holds while the tower stirs. */
const STAGE_PREBEAT_MS = 700;
/**
 * §6.2 点击反馈两态的浮字时长(GV50–59:世界空间浮 3 字形 2s,无翻译)。
 */
const TOWER_GLYPH_FLOAT_MS = 2000;
/** 浮字形悬停高度:塔顶(sprite 基座向上)之上的世界像素。 */
const TOWER_FLOAT_ABOVE_PX = 28;
/**
 * §6.2 GV60+ 的终端回显 canon 键(字形以问号转写)。零字面副本:打印时
 * 经 `canonLine` 逐字取用,与冻结文本同源(canon 键已批,票 0043 Log)。
 */
const TOWER_ECHO_KEY = "terminal." + "glyph_transcribe";

/**
 * §7 结局播报行(票 0049):A/B/C 各一行,机器面英文,零外部名。**新增
 * 冻结文本待 lead 批准后入 canon registry 并重算 lock**(票 0049 Log
 * 登记);在此之前以常量供印,不进 LLM 通道。真·凝视无播报行——录音
 * 演出即它的开场(0050)。
 */
const ENDING_BROADCAST_LINES: Readonly<Record<Exclude<TowerEnding, "gaze">, string>> = {
  fusion: "> the screen and the world are one image now.",
  judgment: "> the flock does not forgive. the judgment is kept.",
  forgetting: "> everyone is gone. the machine keeps counting.",
};

/**
 * §6.2 点击塔的反馈,随阶段演变。Pure:gv 定态,零副作用。
 *   GV50–59 → 浮 3 字形 2s;GV60+ → 终端回显问号转写;其余静默。
 */
export function towerClickFeedback(gv: number): "glyphs" | "terminal" | null {
  const value = Number.isFinite(gv) ? Math.max(0, gv) : 0;
  if (value < 50) {
    return null;
  }
  return value < 60 ? "glyphs" : "terminal";
}

/**
 * B-1(票 0055):debug 写面开关 —— 仅 dev 构建 + ?debug=1 同时成立;
 * 生产构建零暴露(纯函数,测试可直接断言)。
 */
export function debugWriteFaceEnabled(isDev: boolean, debugParam: string | null): boolean {
  return isDev && debugParam === "1";
}

/**
 * Pointer bookkeeping for the canvas (playtest P1-F4 / P2#4 root cause).
 *
 * The old implementation counted presses in a plain number: a pointerup that
 * never reached the canvas (a modal panel opens under a held pointer and
 * steals the release) leaked one count, and every later press then looked like
 * "a second finger" — the whole canvas went permanently dead, and an egg under
 * the dead input could never be hatched (egg_42 in the P1 run: 150+ hatch
 * clicks, zero panels, world starves).
 *
 * The tally tracks pressed pointer ids instead, so:
 * - a re-press of an already-pressed id (the stolen-release case, and the
 *   mouse's constant pointer id) never counts as a second pointer — input
 *   self-heals instead of freezing;
 * - a genuine second concurrent pointer still blocks the verb (the two-finger
 *   gesture rule is unchanged);
 * - a release for a pointer that was never pressed is a no-op instead of
 *   corrupting the count.
 *
 * Pure and DOM-free so the leak scenarios are unit-testable.
 */
export interface PointerTally {
  /**
   * Registers a press. Returns `true` when this press may act (it is the only
   * pressed pointer, or a re-press of an id that was never released).
   */
  press(pointerId: number): boolean;
  /** Releases a pointer. Returns `true` when it was the only one pressed. */
  release(pointerId: number): boolean;
  /** Retracts a cancelled pointer (palm, gesture takeover). */
  cancel(pointerId: number): void;
}

export function createPointerTally(): PointerTally {
  const pressed = new Set<number>();
  return {
    press(pointerId) {
      const known = pressed.has(pointerId);
      pressed.add(pointerId);
      return known || pressed.size === 1;
    },
    release(pointerId) {
      const wasOnly = pressed.size === 1 && pressed.has(pointerId);
      pressed.delete(pointerId);
      return wasOnly;
    },
    cancel(pointerId) {
      pressed.delete(pointerId);
    },
  };
}

/**
 * The next free `gazer_<n>` id for a hatched creature (playtest P1-F4 hardening).
 *
 * The old `gazer_${Object.keys(world.creatures).length + 1}` assumed the
 * creature map is a dense 1..N run. Any non-dense state — a future snapshot
 * trim, an imported world, a creature id from another source — derives an id
 * that already exists, `hatchFromEgg` silently no-ops on its duplicate guard,
 * and the egg becomes un-hatchable forever: every retry recomputes the same
 * colliding id. Deriving from the highest numeric suffix and walking up until
 * the id is unused makes the hatch always land.
 *
 * Pure: reads ids only, no clock, no rng.
 */
export function nextCreatureId(world: Pick<WorldState, "creatures">): string {
  const used = new Set(Object.keys(world.creatures));
  let highest = 0;
  for (const id of used) {
    const match = /^gazer_(\d+)$/.exec(id);
    if (match !== null) {
      highest = Math.max(highest, Number.parseInt(match[1] ?? "0", 10));
    }
  }
  let candidate = highest + 1;
  while (used.has(`gazer_${candidate}`)) {
    candidate += 1;
  }
  return `gazer_${candidate}`;
}

/**
 * Canonical sprite wiring (ticket 0019, ART-CORE-01). Gazerlings the engine
 * hatches still carry the engine's placeholder mask; the canonical ART-CORE-01
 * pixel maps are pure render data, so the wiring swaps them in at this seam —
 * and only at this seam: engine-fresh masks (still the engine default's
 * content) become the canonical idle sprite with the canonical four-slot
 * palette, while director-supplied or already-canonical masks pass through
 * untouched. Pure and deterministic: the same world always wires the same way.
 */
export function canonicalizeGazerMasks(world: WorldState): WorldState {
  const engineDefault = DEFAULT_MASK.join("/");
  let changed = false;
  const creatures: Record<CreatureId, CreatureState> = { ...world.creatures };
  for (const [id, creature] of Object.entries(world.creatures)) {
    if (creature.species !== "gazerling" || creature.mask.join("/") !== engineDefault) {
      continue;
    }
    changed = true;
    creatures[id] = {
      ...creature,
      mask: canonicalMask("idle"),
      palette: [...GAZER_SCENE_PALETTE],
    };
  }
  return changed ? { ...world, creatures } : world;
}

// ---------------------------------------------------------------------------
// 翻译流纯函数(票 0029,NARRATIVE-CORE-01 §1/§6,ART-CORE-03 §6.3)。
// 全程零 LLM:文本一律从 src/canon/ 逐字取用;选择、行进、gating 全部
// 确定性,可独立测试。演出载体由 createGame 闭包接线。
// ---------------------------------------------------------------------------

/** canon fragment keys, in read order (canon 层 key 命名,不重抄文本)。 */
export const FRAGMENT_KEYS: readonly string[] = [
  "fragment.f1",
  "fragment.f2",
  "fragment.f3",
  "fragment.f4",
  "fragment.f5",
  "fragment.f6",
  "fragment.f7",
  "fragment.f8",
];

/**
 * N1 gating 的读面:GV 到达某碎片的 gate,它才可见(75 → F1–F3,90 →
 * F1–F5,100 → F1–F8)。gating 数字以 canon registry 为准,不在此重抄。
 */
export function visibleFragmentKeys(gv: number): readonly string[] {
  const safe = Number.isFinite(gv) ? Math.min(100, Math.max(0, gv)) : 0;
  return FRAGMENT_KEYS.filter((key) => {
    const gate = CANON_REGISTRY[key]?.gating;
    return gate !== undefined && safe >= gate;
  });
}

/**
 * The next fragment an atavistic creature can read: the first unread one in
 * canon order among the visible. F8 is last-read-only: it turns readable at
 * GV100 only once the other seven are read (F8_LAST_READ_CONSTRAINT).
 */
export function nextReadableFragment(gv: number, glyphsRead: readonly string[]): string | null {
  const read = new Set(glyphsRead);
  const readCount = FRAGMENT_KEYS.filter((key) => read.has(key)).length;
  for (const key of visibleFragmentKeys(gv)) {
    const entry = CANON_REGISTRY[key];
    if (entry?.lastReadOnly === true && readCount < FRAGMENT_KEYS.length - 1) {
      continue;
    }
    if (!read.has(key)) {
      return key;
    }
  }
  return null;
}

/**
 * One step of the walk to the tower. The reader stops inside the 1-tile
 * buffer (Chebyshev distance ≤1) and never enters the footprint — the same
 * rule the walk uses for everyone else (ART-CORE-03 §6.4), it just keeps
 * going until it gets there. Grid-clamped like every engine move.
 */
export function stepTowardBuffer(from: TilePos, tower: TilePos): TilePos {
  const dx = tower.x - from.x;
  const dy = tower.y - from.y;
  if (Math.max(Math.abs(dx), Math.abs(dy)) <= 1) {
    return from;
  }
  return {
    x: Math.min(GRID_MAX, Math.max(GRID_MIN, from.x + Math.sign(dx))),
    y: Math.min(GRID_MAX, Math.max(GRID_MIN, from.y + Math.sign(dy))),
  };
}

/** 借瞳用的刻符位图行:从 canon 层按 key 逐字取用,不重抄。 */
export function glyphRowsFor(fragmentKey: string): readonly string[] | null {
  const index = FRAGMENT_KEYS.indexOf(fragmentKey);
  if (index < 0) {
    return null;
  }
  return canonGlyphs()[index]?.rows ?? null;
}

/**
 * Family tree assembly (ticket 0004 §A, tree view): every creature ever
 * alive — dead ones keep their nodes, greyed by the panel — becomes a
 * FamilyTreeNode straight from the frozen E-stream shape
 * (`creature.parentLinks`). `traitsInherited` is approximated on the data the
 * genome layer keeps: a dead creature is marked when some descendant still
 * carries a genome (hybridization wrote the parents' genomes at lay time), so
 * "learned material continuing in the line" is the optimistic reading. Pure:
 * no clock, no rng.
 */
export function familyTreeNodes(world: WorldState): FamilyTreeNode[] {
  const creatures = Object.values(world.creatures);
  const childrenOf = new Map<string, string[]>();
  for (const creature of creatures) {
    const links = creature.parentLinks;
    if (links === undefined) {
      continue;
    }
    for (const parent of [links.parentA, links.parentB]) {
      if (typeof parent !== "string") {
        continue;
      }
      const known = childrenOf.get(parent);
      if (known === undefined) {
        childrenOf.set(parent, [creature.id]);
      } else {
        known.push(creature.id);
      }
    }
  }
  const descendantsOf = (id: string): readonly string[] => {
    const seen = new Set<string>();
    const queue = [...(childrenOf.get(id) ?? [])];
    while (queue.length > 0) {
      const next = queue.pop();
      if (next === undefined || seen.has(next)) {
        continue;
      }
      seen.add(next);
      queue.push(...(childrenOf.get(next) ?? []));
    }
    return [...seen];
  };
  return creatures.map((creature) => {
    const alive = creature.behavior !== "dead";
    let traitsInherited = false;
    if (!alive) {
      for (const descendant of descendantsOf(creature.id)) {
        if (world.creatures[descendant]?.genome !== undefined) {
          traitsInherited = true;
          break;
        }
      }
    }
    return {
      id: creature.id,
      name: creature.name,
      alive,
      ...(creature.parentLinks !== undefined ? { parentLinks: creature.parentLinks } : {}),
      ...(traitsInherited ? { traitsInherited: true } : {}),
    };
  });
}

function starterGenome(id: string, generation: number): PromptGenome {
  return {
    id,
    generation,
    lineage: ["seed_alpha"],
    base: "you are a small one-eyed creature being raised through a window",
    traits: { curiosity: 0.6, loyalty: 0.5, deceit: 0.1, clinging: 0.5, watchfulness: 0.5 },
    drift: [],
    secrets: [],
    manualPool: [manualLine(0, id.length), manualLine(1, id.length + 1)],
    temperatureBias: 0,
    distortionBias: 0.15,
  };
}

/**
 * The world's starting state. The seed (ticket 0008) is part of the state:
 * accepted from the caller (createGame reads `?seed=` from the URL), run
 * through `normalizeWorldSeed`, and missing or malformed values fall back to
 * `DEFAULT_WORLD_SEED`. Same seed, same world — the engine reduces purely
 * from `(WorldState, SimEvent)`. There is no save/snapshot layer yet, so the
 * seed persists in the world state alone (noted in ticket 0008).
 */
function initialWorld(rawSeed?: number | string | null): WorldState {
  let world: WorldState = {
    tick: 0,
    gv: INITIAL_GV,
    stage: 0,
    creatures: {},
    structures: [],
    eggs: [],
    uiLabels: {},
    paletteDecay: 0,
    seed: normalizeWorldSeed(rawSeed),
    silent: true,
  };
  STARTER_IDS.forEach((id, index) => {
    const position = START_POSITIONS[index] ?? START_POSITIONS[0];
    world = step(world, { kind: "hatch", creatureId: id, at: position, species: "gazerling" });
    const creature = world.creatures[id];
    if (creature !== undefined) {
      world = {
        ...world,
        creatures: {
          ...world.creatures,
          [id]: { ...creature, genome: starterGenome(id, 1) },
        },
      };
    }
  });
  // The starters wear the canonical ART-CORE-01 sprite from frame one.
  return canonicalizeGazerMasks(world);
}

/**
 * 全图最近个体。B-4(票 0055):同格并列的平局不再取插入序首——平局由
 * id 字典序定死(同 world 恒同答,求偶结对不再截走点击)。
 */
export function nearestCreature(world: WorldState, tile: { x: number; y: number }): CreatureState | null {
  let best: CreatureState | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const creature of Object.values(world.creatures)) {
    if (creature.behavior === "dead") {
      continue;
    }
    const distance = Math.abs(creature.position.x - tile.x) + Math.abs(creature.position.y - tile.y);
    if (distance < bestDistance || (distance === bestDistance && (best === null || creature.id < best.id))) {
      best = creature;
      bestDistance = distance;
    }
  }
  return best;
}

/** 点击选取的邻近门(票 0055 B-3):落点 Manhattan 距离 ≤ 2 才算够得着。 */
export const TAP_REACH_TILES = 2;

/**
 * B-3(票 0055):点击路由的邻近门——只回 Manhattan ≤ reach 的个体;
 * 远处个体不再被全图截走,塔身落点由此可达塔反馈分支。Pure.
 */
export function nearestCreatureInReach(
  world: WorldState,
  tile: { x: number; y: number },
  reach: number = TAP_REACH_TILES,
): CreatureState | null {
  const nearest = nearestCreature(world, tile);
  if (nearest === null) {
    return null;
  }
  const distance = Math.abs(nearest.position.x - tile.x) + Math.abs(nearest.position.y - tile.y);
  return distance <= reach ? nearest : null;
}

/**
 * The in-world hour is derived from the tick, not the wall clock (ticket
 * 0008, decision 0003): every GV night multiplier reads
 * `worldHour(world.tick)` from `sim/clock.ts`, so replays are deterministic
 * and the game runs offline with no wall-clock dependency.
 */

let memorySeq = 0;

/**
 * One episodic memory. The id carries a monotonic sequence so two memories in
 * the same tick never collide — `hasMemoryRef` and the roundtable validator
 * resolve memories strictly by id. Exported so the tests can pin the
 * uniqueness contract (stream A's fix, verified by stream B in ticket 0002).
 */
export function memoryFor(creatureId: string, fact: string, tick: number, valence: number): MemoryEntry {
  memorySeq += 1;
  return {
    id: `mem_${creatureId}_${tick}_${memorySeq}`,
    atTick: tick,
    wallClock: new Date().toISOString().slice(11, 19),
    fact,
    witnessed: "witnessed",
    source: null,
    distortion: null,
    salience: 0.5,
    valence,
  };
}

// ---------------------------------------------------------------------------
// Pure wiring passes. They are exported so the behavior tests can exercise the
// exact code path the main loop runs; `createGame` only supplies state and
// applies the results.
// ---------------------------------------------------------------------------

/**
 * Gossip scheduling. Each tick, every living pair that has now stayed within
 * `WHISPER_RANGE` for `WHISPER_TICKS` consecutive ticks exchanges a whisper:
 * each side passes its newest working memory to the other through
 * `resolveWhisper`. Only pairs currently in range are tracked, so walking
 * apart resets the count and walking back starts a fresh episode.
 */
export type AdjacencyState = Readonly<Record<string, number>>;

export interface WhisperPassResult {
  readonly memories: Record<CreatureId, MemorySlice>;
  readonly adjacency: AdjacencyState;
  readonly propagated: readonly MemoryEntry[];
}

function pairKey(a: CreatureId, b: CreatureId): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

function newestWorking(slice: MemorySlice | undefined): MemoryEntry | undefined {
  if (slice === undefined) {
    return undefined;
  }
  let newest: MemoryEntry | undefined;
  for (const entry of slice.working) {
    if (newest === undefined || entry.atTick > newest.atTick) {
      newest = entry;
    }
  }
  return newest;
}

export function whisperPass(
  world: WorldState,
  memories: Readonly<Record<CreatureId, MemorySlice>>,
  adjacency: AdjacencyState,
): WhisperPassResult {
  const living = Object.values(world.creatures).filter(
    (creature) => creature.behavior !== "dead",
  );
  const nextMemories: Record<CreatureId, MemorySlice> = { ...memories };
  const nextAdjacency: Record<string, number> = {};
  const propagated: MemoryEntry[] = [];

  for (let i = 0; i < living.length; i += 1) {
    for (let j = i + 1; j < living.length; j += 1) {
      const a = living[i];
      const b = living[j];
      if (a === undefined || b === undefined) {
        continue;
      }
      const near =
        Math.max(
          Math.abs(a.position.x - b.position.x),
          Math.abs(a.position.y - b.position.y),
        ) <= WHISPER_RANGE;
      if (!near) {
        continue;
      }
      const key = pairKey(a.id, b.id);
      const count = (adjacency[key] ?? 0) + 1;
      nextAdjacency[key] = count;
      if (count % WHISPER_TICKS !== 0) {
        continue;
      }
      for (const [sender, receiver] of [
        [a, b] as const,
        [b, a] as const,
      ]) {
        const entry = newestWorking(nextMemories[sender.id]);
        if (entry === undefined) {
          continue;
        }
        // Cross-faction whispers distort harder (stream F, ticket 0006 §6):
        // judged from each side's slice at whisper time.
        const received = resolveWhisper({
          sender,
          receiver,
          entry,
          worldSeed: world.seed,
          crossFaction: crossFaction(nextMemories[sender.id], nextMemories[receiver.id]),
        });
        if (received === null) {
          continue;
        }
        const slice = nextMemories[receiver.id] ?? emptySlice();
        if (hasMemoryRef(slice, received.id)) {
          continue;
        }
        nextMemories[receiver.id] = {
          working: [...slice.working, received].slice(-WORKING_CAPACITY),
          consolidated: slice.consolidated,
        };
        propagated.push(received);
      }
    }
  }
  return { memories: nextMemories, adjacency: nextAdjacency, propagated };
}

/**
 * Memory consolidation. Runs every `CONSOLIDATION_INTERVAL_TICKS`: each
 * creature's hardest-pulling working memories become self-knowledge via
 * `fallbackConsolidate` + `applyConsolidation`, and the genome's drift grows
 * by one fragment per pass (capped at `MAX_DRIFT`). Consolidation is what the
 * bestiary's "permanent" layer and the roundtable's `always:` block read.
 */
export interface ConsolidationPassResult {
  readonly world: WorldState;
  readonly memories: Record<CreatureId, MemorySlice>;
  readonly consolidatedCount: number;
}

function withCreature(
  world: WorldState,
  id: CreatureId,
  patch: (creature: CreatureState) => CreatureState,
): WorldState {
  const creature = world.creatures[id];
  if (creature === undefined) {
    return world;
  }
  return { ...world, creatures: { ...world.creatures, [id]: patch(creature) } };
}

export function consolidationPass(
  world: WorldState,
  memories: Readonly<Record<CreatureId, MemorySlice>>,
): ConsolidationPassResult {
  let nextWorld = world;
  const nextMemories: Record<CreatureId, MemorySlice> = { ...memories };
  let consolidatedCount = 0;
  for (const creature of Object.values(world.creatures)) {
    const slice = nextMemories[creature.id];
    if (slice === undefined || slice.working.length === 0) {
      continue;
    }
    const added = fallbackConsolidate(slice, world.tick);
    if (added.length === 0) {
      continue;
    }
    nextMemories[creature.id] = applyConsolidation(slice, added, []);
    consolidatedCount += added.length;
    const genome = creature.genome;
    if (genome !== undefined) {
      const drift = [
        ...genome.drift,
        `consolidated ${added.length} memories at tick ${world.tick}`,
      ].slice(-MAX_DRIFT);
      nextWorld = withCreature(nextWorld, creature.id, (current) => ({
        ...current,
        genome: { ...genome, drift },
      }));
    }
  }
  return { world: nextWorld, memories: nextMemories, consolidatedCount };
}

export interface DeathNotice {
  readonly creatureId: CreatureId;
  readonly cause: "starvation" | "neglect";
}

/**
 * Creatures that died on this tick. Death belongs to the engine; the wiring
 * layer only notices the transition and answers for it (ledger weight, death
 * memory for the witnesses, telemetry).
 */
export function detectDeaths(
  before: Readonly<Record<CreatureId, CreatureState>>,
  after: Readonly<Record<CreatureId, CreatureState>>,
): readonly DeathNotice[] {
  const notices: DeathNotice[] = [];
  for (const creature of Object.values(after)) {
    if (creature.behavior !== "dead") {
      continue;
    }
    const previous = before[creature.id];
    if (previous !== undefined && previous.behavior === "dead") {
      continue;
    }
    notices.push({
      creatureId: creature.id,
      cause: creature.stats.hunger <= 0 ? "starvation" : "neglect",
    });
  }
  return notices;
}

/**
 * The ontology shift table: what the creatures are, per stage. An entity's
 * kind never regresses, and the ledger keeps every shift forever.
 */
const STAGE_ENTITY_KINDS: Readonly<Record<Stage, EntityKind>> = Object.freeze({
  0: "pet",
  1: "pet",
  2: "organism",
  3: "observer",
  4: "record",
});

export function ontologyShiftFor(previous: Stage, next: Stage, gv: number): OntologyShift {
  return {
    atStage: next,
    entity: "creature",
    from: STAGE_ENTITY_KINDS[previous],
    to: STAGE_ENTITY_KINDS[next],
    evidence: `gv ${gv} crossed the stage ${previous} boundary`,
  };
}

/** Manual speech is a live-mode voice; a silent run emits nothing (R6.1). */
export function allowManualSpeech(silent: boolean): boolean {
  return !silent;
}

/** The single scripted line is due once, at exactly minute 40 (R6.2). */
export function silentLineDue(tick: number, alreadySpoken: boolean): boolean {
  return tick >= SILENT_LINE_TICK && !alreadySpoken;
}

// ---------------------------------------------------------------------------
// 框体接线纯函数与存档键(票 0036,ART-CORE-04 §3–§6)。电源三态、自发消磁
// 与失步全部从 (gv, ending, seed, tick) 确定性派生;现实日蠕变是规范指定的
// 唯一现实日面(无随机源,日序整除派生)。
// ---------------------------------------------------------------------------

export type PowerOutcome = "restart" | "rebound" | "denied";

/** 电源三态(§4):包装 crt 的纯表,供测试直接断言。 */
export function powerOutcomeFor(gv: number, postEnding: boolean): PowerOutcome {
  return powerActionFor(gv, postEnding);
}

/** `> no.` 的 canon 取用(§4 恰一次入账;正文不在本文件复写)。 */
export const FRAME_NO_CANON_KEY = "frame.power_no";

export function frameEchoLine(): string | null {
  return canonLine(FRAME_NO_CANON_KEY);
}

export const FRAME_SESSION_STORAGE_KEY = "gazer:frame.session";
export const FRAME_BIOS_STORAGE_KEY = "gazer:frame.bios";
export const FRAME_NO_STORAGE_KEY = "gazer:frame.no";
export const FRAME_SESSIONS_STORAGE_KEY = "gazer:frame.sessions";
/** G-1/G-2(票 0045):跳过解锁布尔 / 暖启动日序 / NG+ 存档标记。 */
export const FRAME_BOOTED_STORAGE_KEY = "gazer:frame.booted";
export const FRAME_DAY_STORAGE_KEY = "gazer:frame.day";
export const FRAME_NGPLUS_STORAGE_KEY = "gazer:frame.ngplus";

/**
 * G-2(票 0045):BIOS 暗线行的单一正文源是 canon registry——强退行走
 * `frame.unexpected_shutdown`,NG+ RESTORED 行从 `frame.bios` 正典 blob 中
 * 取用该行,运行时零转写。
 */
export const FRAME_UNEXPECTED_SHUTDOWN_CANON_KEY = "frame.unexpected_shutdown";
export const FRAME_BIOS_CANON_KEY = "frame.bios";

export function canonUnexpectedShutdownLine(): string | null {
  return canonLine(FRAME_UNEXPECTED_SHUTDOWN_CANON_KEY);
}

export function canonNgPlusLine(): string | null {
  const blob = canonLine(FRAME_BIOS_CANON_KEY);
  if (blob === null) {
    return null;
  }
  return (
    blob
      .split("\n")
      .find((line) => line.includes("previous soul state") && line.includes("RESTORED")) ?? null
  );
}

/** 帧事件(票 0045 SD-3):按钮与自发消磁同形入队,main 同步帧排干演出。 */
export interface FrameEvent {
  readonly kind: "degauss";
  readonly spontaneous: boolean;
}

export interface FrameSessionRecord {
  readonly gv: number;
  readonly clean: boolean;
}

export function parseFrameSession(raw: string | null): FrameSessionRecord | null {
  if (raw === null) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as { gv?: unknown; clean?: unknown };
    if (typeof parsed.gv === "number" && typeof parsed.clean === "boolean") {
      return { gv: parsed.gv, clean: parsed.clean };
    }
  } catch {
    return null;
  }
  return null;
}

/** GV≥80 强退(unclean)→ 下次冷启动 BIOS 多一行(§4 跨会话暗线)。 */
export function unexpectedShutdownFor(record: FrameSessionRecord | null): boolean {
  return record !== null && record.gv >= 80 && !record.clean;
}

export interface FrameBiosRecord {
  readonly firstDayMs: number;
  readonly resetDone: boolean;
}

export function parseFrameBios(raw: string | null): FrameBiosRecord | null {
  if (raw === null) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as { firstDayMs?: unknown; resetDone?: unknown };
    if (typeof parsed.firstDayMs === "number" && typeof parsed.resetDone === "boolean") {
      return { firstDayMs: parsed.firstDayMs, resetDone: parsed.resetDone };
    }
  } catch {
    return null;
  }
  return null;
}

/** 自发消磁时刻表(§5):包装 crt 纯表,CI 项 7 断言种子确定性。 */
export function nextSpontaneousDegaussAt(seed: number, afterTick: number): number {
  return nextSpontaneousDegaussTick(seed, afterTick);
}

// ---------------------------------------------------------------------------
// 真结局录音演出链(票 0050,NARRATIVE-CORE-01 §5)。整条链是一次纯计划:
// 行序逐字(canon diff)、时序(70ms 正典通道)、{n}≥3 门、4s 齐声延迟、
// 微帧禁用窗全部由 buildRecordingSequence 一次算定,运行面只照单排程。
// ---------------------------------------------------------------------------

/** 重构接缝标记(非正典文本,reconstructed 面呈现;灰块家族的[REDACTED]先例)。 */
const RECONSTRUCTED_MARKER = "[reconstructed]";
/** ④ 齐声延迟:录音(打印链)结束后 4s,全部存活个体围环齐声(§5.1)。 */
export const RECORDING_UNISON_DELAY_MS = 4000;
/** C-06 集体凝视窗(§5.1:围环、ALERT、瞳孔 CENTER)。 */
export const RECORDING_GAZE_MS = 4000;
/** 尾行 divergence 与齐声之间的小停(规范未给,可逆默认)。 */
export const RECORDING_TAIL_GAP_MS = 600;
/** A-02 房间底噪增益(既有窗内的常例值,tests/render-audio-fx 同值)。 */
export const RECORDING_ROOM_TONE_GAIN = 0.04;

export type RecordingCueKind = "canon" | "reconstructed" | "spoken";

/** 录音线索(计划面):canon 走 70ms 正典通道,reconstructed 走重构面,spoken 齐声落 collective。 */
export interface RecordingCue {
  readonly atMs: number;
  readonly kind: RecordingCueKind;
  readonly text: string;
}

/** 录音线索(排程面):atMs 已被 later() 兑现,main 层照 kind 喂终端。 */
export interface RecordingDispatch {
  readonly kind: RecordingCueKind;
  readonly text: string;
}

/** 实验日志的来源分组(§5.2:verbatim / reconstructed / 幽灵三分)。 */
export interface RecordingLogEntry {
  readonly text: string;
  readonly source: "verbatim" | "reconstructed" | "ghost";
  readonly ghostId: string | null;
}

export interface RecordingFxPlan {
  /** 微帧禁用窗:全程冻结(C-01 all_freeze,pose alert)。 */
  readonly freezeMs: number;
  /** A-01 抽轨时长(无 BGM)。 */
  readonly trackRemoveMs: number;
  /** A-02 房间底噪增益。 */
  readonly roomToneGain: number;
  /** C-06 集体凝视窗(围环 4s)。 */
  readonly gazeMs: number;
}

export interface RecordingSequence {
  /** false = {n}≥3 门拒绝或 canon 缺键:重构拒绝拼装。 */
  readonly ok: boolean;
  readonly cues: readonly RecordingCue[];
  /** 全链时长(最后一个 canon 行收尾),即冻结窗与抽轨窗。 */
  readonly totalMs: number;
  readonly log: readonly RecordingLogEntry[];
  readonly fx: RecordingFxPlan;
}

function fillCanonSlot(skeleton: string, token: string, value: string): string {
  return skeleton.split(token).join(value);
}

/**
 * The recording sequence plan (NARRATIVE-CORE-01 §5.1). Pure: same inputs,
 * byte-identical cues. Line order: header → F1…F7 verbatim (reconstructed
 * markers at the joints) → ② the NG+ ghost replay when the archive carries a
 * ghost → F8 (natural end) → +4s the unison line → the divergence tail.
 */
export function buildRecordingSequence(input: {
  readonly ngPlus: boolean;
  readonly archive: readonly GhostProfile[];
}): RecordingSequence {
  const refused: RecordingSequence = {
    ok: false,
    cues: [],
    totalMs: 0,
    log: [],
    fx: { freezeMs: 0, trackRemoveMs: 0, roomToneGain: RECORDING_ROOM_TONE_GAIN, gazeMs: RECORDING_GAZE_MS },
  };
  // {n}≥3 门(§5.1):低于此数,重构拒绝拼装。
  if (!keptMemoriesSufficient(input.archive)) {
    return refused;
  }
  const headerSkeleton = canonLine("recording.header");
  const divergenceSkeleton = canonLine("recording.divergence");
  const keepYou = canonLine("recording.keep_you");
  if (headerSkeleton === null || divergenceSkeleton === null || keepYou === null) {
    return refused;
  }
  const fragments: string[] = [];
  for (const key of FRAGMENT_KEYS.slice(0, 7)) {
    const text = canonLine(key);
    if (text === null) {
      return refused;
    }
    fragments.push(text);
  }
  const finale = canonLine("fragment.f8");
  if (finale === null) {
    return refused;
  }
  const header = fillCanonSlot(headerSkeleton, "{n}", String(keptMemoryCount(input.archive)));
  const divergence = fillCanonSlot(divergenceSkeleton, "{d}", String(ghostBlendRatio(input.archive)));
  // ② NG+:玩家幽灵在档 → 档首幽灵的 signature moment 回放(N8 槽值面)。
  let ghostLine: string | null = null;
  let ghostId: string | null = null;
  if (input.ngPlus && input.archive.length > 0) {
    const profile = input.archive[0];
    if (profile !== undefined) {
      ghostLine = fillGhostTemplate(profile);
      ghostId = profile.id;
    }
  }
  const cues: RecordingCue[] = [];
  const log: RecordingLogEntry[] = [];
  let cursor = 0;
  const pushCanon = (text: string): void => {
    cues.push({ atMs: cursor, kind: "canon", text });
    log.push({ text, source: "verbatim", ghostId: null });
    cursor += canonPrintDurationMs(text);
  };
  pushCanon(header);
  fragments.forEach((text, index) => {
    if (index > 0) {
      // 衔接处标 reconstructed(样式区分,非正典文本走重构面)。
      cues.push({ atMs: cursor, kind: "reconstructed", text: RECONSTRUCTED_MARKER });
      log.push({ text: RECONSTRUCTED_MARKER, source: "reconstructed", ghostId: null });
    }
    pushCanon(text);
  });
  if (ghostLine !== null && ghostId !== null) {
    cues.push({ atMs: cursor, kind: "reconstructed", text: ghostLine });
    log.push({ text: ghostLine, source: "ghost", ghostId });
  }
  // ③ F8 全文:录音的自然终点。
  pushCanon(finale);
  // ④ 结束 4s 后:围环 + 齐声(collective,确定性文本非 LLM)。
  const unisonAt = cursor + RECORDING_UNISON_DELAY_MS;
  cues.push({ atMs: unisonAt, kind: "spoken", text: keepYou });
  log.push({ text: keepYou, source: "verbatim", ghostId: null });
  const tailAt = unisonAt + RECORDING_TAIL_GAP_MS;
  cues.push({ atMs: tailAt, kind: "canon", text: divergence });
  log.push({ text: divergence, source: "verbatim", ghostId: null });
  const totalMs = tailAt + canonPrintDurationMs(divergence);
  return {
    ok: true,
    cues,
    totalMs,
    log,
    fx: {
      freezeMs: totalMs,
      trackRemoveMs: totalMs,
      roomToneGain: RECORDING_ROOM_TONE_GAIN,
      gazeMs: RECORDING_GAZE_MS,
    },
  };
}

/**
 * 真到达间隔的摊布(票 0044)。传输层尚无逐 token 流(整包应答),唯一
 * 诚实的上游到达测度是一次 LLM 请求的真实延迟:把它按全场字数摊布,再以
 * 0.7–1.3× 的种子抖动拆开——非匀速、可重放(同延迟同 roll 序列恒同轮),
 * 逐字夹带 [40, 1000]ms 防极端延迟顶破显示。传输升级为流式后,这里换成
 * 逐 token 到达间隔原样透传,本函数退役(记票 0044 Log)。
 */
export function terminalTypeIntervals(
  latencyMs: number,
  charCount: number,
  rolls: readonly number[],
): readonly number[] {
  const chars = Math.max(1, Math.floor(Number.isFinite(charCount) ? charCount : 0));
  const finite = rolls.filter((roll) => Number.isFinite(roll));
  const rollAt = (index: number): number => {
    const roll = finite.length === 0 ? 0.5 : (finite[index % finite.length] ?? 0.5);
    const clamped = Number.isFinite(roll) ? Math.min(1, Math.max(0, roll)) : 0.5;
    return 0.7 + 0.6 * clamped;
  };
  const meanMs = Math.max(40, Number.isFinite(latencyMs) ? latencyMs : 0) / chars;
  const out: number[] = [];
  for (let i = 0; i < chars; i += 1) {
    out.push(Math.round(Math.min(1000, Math.max(40, meanMs * rollAt(i)))));
  }
  return out;
}

/** 翻译流快照(票 0029):只读面,给测试与 studio 桥,不泄露内部句柄。 */
export interface TranslationFlowSnapshot {
  readonly active: boolean;
  readonly phase: "walking" | "staring" | "printing" | null;
  readonly creatureId: CreatureId | null;
  readonly fragmentKey: string | null;
  readonly glyphsRead: readonly string[];
}

export interface GameHandle {
  readonly world: () => WorldState;
  /** The frozen telemetry interface (stream D consumes this signature). */
  readonly telemetry: () => Telemetry;
  /**
   * 0031 项 4(canvas-fx 合并缝):音频引擎存活 getter。A 层特写 duck 会
   * 重建引擎实例,任何捕获值都会变陈旧——每次调用经 RenderApp 现读。
   */
  readonly audio: () => AudioEngine;
  /** 翻译流快照(票 0029)。 */
  readonly translationFlow: () => TranslationFlowSnapshot;
  /**
   * 正典打印队列排干(票 0029):按序返回待打印文本(可为多条,如 F8 的
   * 前置行+正文),调用方逐条交给 `terminal.startCanonPrint`。main 层
   * 转发不在本票所有权内,接线记票 0029 Log。
   */
  readonly drainCanonPrints: () => readonly string[];
  /**
   * FX 壳/音频派发排干(票 0031 项 1):执行器产出的 D/W/A 派发行,main 层
   * 逐条交 dispatchShellFx。现读现排,不捕获。
   */
  readonly drainShellFx: () => readonly ShellAudioFxDispatch[];
  /** 执行器账本面(票 0030 CI:silence_quota 等条目从这里断言)。 */
  readonly fxLedger: () => readonly FxLedgerEntry[];
  /**
   * 觉醒七件套只读快照(票 0030 CI:E4 塔注视恰 1 次、配额状态从这里断言)。
   */
  readonly awakening: () => {
    readonly fired: readonly string[];
    readonly towerGazeCount: number;
    readonly silenceHeld: boolean;
    readonly silenceRefusalCount: number;
    readonly echoUsed: boolean;
  };
  /** W-04 休眠唤醒:个体位置确定性微移的世界写入(票 0031 项 3)。 */
  readonly nudgeOnSleepWake: () => void;
  // ---- 框体接线(票 0036,ART-CORE-04 §3–§7)----
  /**
   * 电源钮三态(§4):GV<60 / 真结局后 → restart(白线收缩→黑→1s 自动冷启动);
   * 60–79 → rebound(压暗 15% 2s 回弹,`> no.` 恰一次入帧回显队列);
   * ≥80 → denied(咔声,无反应,Ledger 记 power_override_denied)。
   * 框体侧演出由 main 层按返回值驱动。
   */
  readonly powerPress: () => PowerOutcome;
  /** 消磁钮(§5):波纹帧全体眨眼一次(G4 内部通道)入账,嘭声位。 */
  readonly degaussPress: () => void;
  /** 结局事件入档(WorldState.ending,0035 消费形状的写入面)。 */
  readonly recordEnding: (kind: TowerEnding) => void;
  /** BIOS 内存计数(现实日蠕变,§3 暗线 2)。 */
  readonly biosMemoryK: () => number;
  /** 蠕变基线日(存档首日,纯数据透出)。 */
  readonly biosFirstDayMs: () => number;
  /** 电源 Ledger(CI 项 4:power_override_denied 从这里断言)。 */
  readonly powerLog: () => readonly { readonly type: "power_override_denied"; readonly game_time: string; readonly atTick: number; readonly gv: number }[];
  /** 消磁账(CI 项 7:眨眼恰一次、通道面从这里断言)。 */
  readonly degaussLog: () => readonly { readonly atTick: number; readonly blinkCount: number; readonly spontaneous: boolean; readonly channel: string }[];
  /** 帧回显队列(`> no.` 等正文,main 层 appendRaw 排干)。 */
  readonly drainEchoes: () => readonly string[];
  // ---- 真结局录音演出链(票 0050)----
  /** 录音线索排干(main 层逐帧喂 terminal:canon/reconstructed/spoken)。 */
  readonly drainRecordingCues: () => readonly RecordingDispatch[];
  /** 演出窗旗标:窗内世界时钟暂停漂移(main 层据此冻结终端侵蚀计数)。 */
  readonly recordingActive: () => boolean;
  /** 实验日志分组面(§5.2:verbatim / reconstructed / 幽灵三分)。 */
  readonly recordingLog: () => readonly RecordingLogEntry[];
  // ---- 终端运行面(票 0044)----
  /**
   * 台词回合 → 终端队列排干(main 层逐帧喂 terminal):intervals 非 null
   * 是真 token 面(LLM 请求延迟摊布),null 是假打字机面。
   */
  readonly drainTerminalTurns: () => readonly TerminalTurn[];
  /** GV40 首次圆桌幽灵票(§6.1):同步帧取走一次浮现机会。 */
  readonly takeTerminalGhost: () => boolean;
  /** GV20–40 失步票(§6):同步帧取走一次演出机会。 */
  readonly takeDesync: () => boolean;
  /** 会话序数(落影加深 / C 遗忘 LED 熄灭的确定性面)。 */
  readonly sessionCount: () => number;
  /** 本次冷启动是否携带强退暗线行(§4;boot 时读存档定死)。 */
  readonly unexpectedShutdown: () => boolean;
  // ---- CRT 收尾批(票 0045)----
  /** SD-3:消磁帧事件排干(按钮与自发同形;main 据此统一落波纹+16ms 闭眼)。 */
  readonly drainFrameEvents: () => readonly FrameEvent[];
  /** G-4:G 高光点位(逻辑屏坐标;终端光标点由 main 从 DOM 投影补齐)。 */
  readonly bloomPoints: () => readonly BloomPoint[];
  /** G-2:NG+ 存档标记(真·凝视达成后恒真,驱动 RESTORED 行)。 */
  readonly ngPlus: () => boolean;
  /**
   * 真结局录音演出入口旗标(票 0049,0050 消费):8/8 碎片读走即解锁。
   * 派生自存档状态,非存储位——世界记不住的谎言这里说不出口。
   */
  readonly recordingUnlocked: () => boolean;
  destroy(): void;
}

export interface GameOptions {
  readonly doc: Document;
  readonly canvas: HTMLCanvasElement;
  readonly root: HTMLElement;
  readonly endpoint: string | null;
  /**
   * Storage may be refused (playtest p4 finding F2): when null, the game runs
   * with no persistence at all — locale falls back, nothing is saved.
   */
  readonly storage?: Storage | null;
}

export async function createGame(options: GameOptions): Promise<GameHandle> {
  const { doc, canvas, root } = options;
  const storage = options.storage ?? null;
  const storageGet = (key: string): string | null => {
    try {
      return storage?.getItem(key) ?? null;
    } catch {
      return null;
    }
  };
  const storageSet = (key: string, value: string): void => {
    try {
      storage?.setItem(key, value);
    } catch {
      // Quota exhausted / disabled: the preference is lost, the game goes on.
    }
  };
  let locale: Locale = detectLocale(location.search, storageGet(LOCALE_STORAGE_KEY));
  const silent = options.endpoint === null;

  // The world seed (ticket 0008): accepted from `?seed=` at boot, normalized,
  // falling back to the default when absent. Pure input — no wall clock.
  const rawSeed = new URLSearchParams(location.search).get("seed");
  let world = initialWorld(rawSeed ?? DEFAULT_WORLD_SEED);
  const memories: Record<string, MemorySlice> = {};
  for (const id of STARTER_IDS) {
    memories[id] = emptySlice();
  }
  let ontology: OntologyLedger = emptyOntology();
  let adjacency: AdjacencyState = {};
  const recentActions: string[] = [];
  // ---- FX 执行器与觉醒七件套(票 0030/0031)----
  // 执行器状态(world tick 为唯一时钟)、觉醒记录、壳派发队列、点击时间戳、
  // 光标 tile 与正典回声槽,全部闭包内可变量;快照经 GameHandle 暴露。
  let fxState = initialFxState(world.tick);
  let awakening = initialAwakeningState();

  // ---- 框体接线(票 0036,ART-CORE-04 §3–§7)----
  // 电源三态 / 消磁 / 失步 / 蠕变的接线态;一切节拍由 tick 或存档派生,
  // 唯独现实日蠕变是规范指定的现实日面(整除派生,无随机源)。
  const powerLog: { type: "power_override_denied"; game_time: string; atTick: number; gv: number }[] = [];
  const degaussLog: { atTick: number; blinkCount: number; spontaneous: boolean; channel: string }[] = [];
  const frameEchoQueue: string[] = [];
  let frameNoShown = storageGet(FRAME_NO_STORAGE_KEY) === "1";
  let pendingDesync = 0;
  let nextSpontDegauss = -1;
  /** 结局评估日历(票 0049):每个游戏日零点判一次的天数锚,确定性。 */
  let lastEndingCheckDay = -1;
  /** SD-3(票 0045):消磁帧事件队列——按钮与自发同形,main 排干后统一落波纹。 */
  const frameEventQueue: FrameEvent[] = [];
  /** G-2(票 0045):NG+ 存档标记(真·凝视达成即写,重启不消)。 */
  let ngPlus = storageGet(FRAME_NGPLUS_STORAGE_KEY) === "1";
  const prevSession = parseFrameSession(storageGet(FRAME_SESSION_STORAGE_KEY));
  const unexpectedShutdownFlag = unexpectedShutdownFor(prevSession);
  function readBiosRecord(): FrameBiosRecord {
    const parsed = parseFrameBios(storageGet(FRAME_BIOS_STORAGE_KEY));
    if (parsed !== null) {
      return parsed;
    }
    const record: FrameBiosRecord = { firstDayMs: Date.now(), resetDone: false };
    storageSet(FRAME_BIOS_STORAGE_KEY, JSON.stringify(record));
    return record;
  }
  let biosRecord = readBiosRecord();
  function currentBiosMemoryK(): number {
    return biosMemoryK(memoryCreepDays(biosRecord.firstDayMs, Date.now()), biosRecord.resetDone);
  }
  // 会话序数:每次冷会话 +1(落影加深 / C 遗忘 LED 熄灭的确定性面)。
  const prevSessions = Number.parseInt(storageGet(FRAME_SESSIONS_STORAGE_KEY) ?? "0", 10);
  const sessions = (Number.isFinite(prevSessions) && prevSessions > 0 ? prevSessions : 0) + 1;
  storageSet(FRAME_SESSIONS_STORAGE_KEY, String(sessions));
  function fireDegauss(spontaneous: boolean): void {
    // G8:眨眼走 G4 眨眼时钟内部通道,不经 C-05(执行器通道)。
    assertDemagnetizeChannel(DEMAGNETIZE_CHANNEL);
    const living = Object.values(world.creatures).filter((c) => c.behavior !== "dead");
    for (const creature of living) {
      // 消磁联动(ART-CORE-04 §5):16ms 双眼全闭,走 §5 单 Owner 派发桥
      // (demagnetizeBlinkDispatch,非普通 C-05 眨眼)。
      app.playEffect(demagnetizeBlinkDispatch(creature.id), world);
    }
    degaussLog.push({ atTick: world.tick, blinkCount: living.length, spontaneous, channel: DEMAGNETIZE_CHANNEL });
    app.audio.blip("degauss_thump");
    // SD-3:按钮与自发同形——波纹与 16ms 眼睑合拢由 main 排干统一落。
    frameEventQueue.push({ kind: "degauss", spontaneous });
  }
  function powerPress(): PowerOutcome {
    // §4:按压力学只看 (gv, 真结局后);咔声每个态都有,屏幕反应不同。
    const postEnding = world.ending?.kind === "gaze";
    const outcome = powerOutcomeFor(world.gv, postEnding);
    if (outcome === "restart") {
      // 真结局后这次"重启"是遗忘未遂:BIOS 内存计数一次性 -640K 归零。
      if (postEnding && !biosRecord.resetDone) {
        biosRecord = { ...biosRecord, resetDone: true };
        storageSet(FRAME_BIOS_STORAGE_KEY, JSON.stringify(biosRecord));
      }
    } else if (outcome === "rebound") {
      // `> no.` 全存档恰一次;canon 取用,不进运行时字面。
      if (!frameNoShown) {
        frameNoShown = true;
        storageSet(FRAME_NO_STORAGE_KEY, "1");
        const line = frameEchoLine();
        if (line !== null) {
          frameEchoQueue.push(line);
        }
      }
    } else {
      powerLog.push({
        type: "power_override_denied",
        game_time: gameTimeAt(world.tick),
        atTick: world.tick,
        gv: Math.round(world.gv),
      });
    }
    app.audio.blip("power_click");
    return outcome;
  }
  function recordEnding(kind: TowerEnding): void {
    if (world.ending !== undefined) {
      return;
    }
    world = { ...world, ending: { kind, atTick: world.tick } };
    // G-2(票 0045):真·凝视达成即写 NG+ 标记,下次冷启动 BIOS 落 RESTORED 行。
    if (kind === "gaze" && !ngPlus) {
      ngPlus = true;
      storageSet(FRAME_NGPLUS_STORAGE_KEY, "1");
    }
    // 真结局录音演出链(票 0050):评估链已判 8/8 + GV100,本票管演出。
    if (kind === "gaze") {
      startRecordingPerformance();
    }
    refresh();
  }
  /** G-4(票 0045):G 高光点位——注视锚个体(塔最近者),退而首个存活个体。 */
  function bloomPoints(): readonly BloomPoint[] {
    const living = Object.values(world.creatures).filter((c) => c.behavior !== "dead");
    const anchor =
      nearestCreature(world, TOWER_POSITION) ??
      [...living].sort((a, b) => (a.id < b.id ? -1 : 1))[0] ??
      null;
    if (anchor === null) {
      return [];
    }
    const at = tileCenter(anchor.position);
    return [{ kind: "g_highlight", x: at.x, y: at.y }];
  }

  const shellFxQueue: ShellAudioFxDispatch[] = [];
  const clickStamps: number[] = [];
  let lastCursorTile: { readonly x: number; readonly y: number } = { x: 6, y: 5 };
  let echoWindow: EchoWindow | null = null;
  /** The archived broadcast (ticket 0016 §3c): seed, index and slot values, so
   * the HUD can re-render the ticker in the active locale on a locale switch. */
  let latestNews: NewsSnapshot | null = null;
  const telemetry = createTelemetryRecorder();
  const registry = createRegistry();
  registry.register({
    point: "sim:tick",
    id: "gv_accumulator",
    priority: 10,
    sync: true,
    handler: () => undefined,
    logged: false,
  });
  registry.register({
    point: "action:post",
    id: "ledger_writer",
    priority: 10,
    sync: true,
    handler: () => undefined,
    logged: false,
  });

  const dialogue: DialogueView = createDialogue(doc, locale);
  // Each spoken line keeps a locale-aware renderer (ticket 0016 §3a): manual
  // lines re-render from their (stage, seed) key, the boot/silent lines from
  // their copy keys, naming from the name — so a locale switch re-renders the
  // whole transcript instead of mixing languages. LLM scene lines have no
  // second voice: their renderer returns the original text.
  const spokenLines: { speaker: (locale: Locale) => string; render: (locale: Locale) => string; status: EpistemicStatus }[] = [];
  const album = createAlbum(doc, locale);
  const help: HelpView = createHelp(doc, locale);

  const app: RenderApp = await createApp(canvas, (instruction: ShellInstruction) => {
    handleShellEffect(instruction);
  });

  const client = options.endpoint === null
    ? null
    : createDirectorClient({ endpoint: options.endpoint, timeoutMs: routeTask("roundtable").timeoutMs });

  const hud = doc.createElement("div");
  hud.className = "gazer-hud";
  const spoken = doc.createElement("div");
  spoken.className = "gazer-dialogue-mount";
  const panel = doc.createElement("div");
  panel.className = "gazer-panel";
  panel.hidden = true;

  const bar = doc.createElement("div");
  bar.className = "gazer-bar";
  const localeButton = doc.createElement("button");
  localeButton.type = "button";
  localeButton.className = "gazer-key";
  const albumButton = doc.createElement("button");
  albumButton.type = "button";
  albumButton.className = "gazer-key";
  const treeButton = doc.createElement("button");
  treeButton.type = "button";
  treeButton.className = "gazer-key";
  const helpButton = doc.createElement("button");
  helpButton.type = "button";
  helpButton.className = "gazer-key";
  const closeButton = doc.createElement("button");
  closeButton.type = "button";
  closeButton.className = "gazer-key";
  closeButton.textContent = "x";
  const cleanButton = doc.createElement("button");
  cleanButton.type = "button";
  cleanButton.className = "gazer-key";
  const feedButton = doc.createElement("button");
  feedButton.type = "button";
  feedButton.className = "gazer-key";
  const petButton = doc.createElement("button");
  petButton.type = "button";
  petButton.className = "gazer-key";

  bar.append(localeButton, feedButton, petButton, albumButton, treeButton, helpButton, cleanButton);
  spoken.append(dialogue.root);
  hud.append(bar, spoken);
  root.append(hud, panel);
  panel.append(closeButton);

  function handleShellEffect(instruction: ShellInstruction): void {
    if (instruction.type === "title_mutate") {
      doc.title = instruction.text;
    }
  }

  function paintChrome(): void {
    localeButton.textContent = t(locale, COPY.hud.localeToggle);
    albumButton.textContent = t(locale, COPY.hud.album);
    treeButton.textContent = t(locale, COPY.hud.tree);
    helpButton.textContent = t(locale, COPY.hud.help);
    closeButton.textContent = t(locale, COPY.hud.close);
    // The dot marks the armed state: the next tap cleans instead of feeding.
    cleanButton.textContent = `${t(locale, COPY.hud.clean)}${cleanMode ? " ●" : ""}`;
    feedButton.textContent = t(locale, COPY.hud.feedVerb);
    petButton.textContent = t(locale, COPY.hud.petVerb);
  }

  /**
   * The HUD face (ticket 0010): the care numbers, the honest world-calendar
   * face (day / clock, derived from the tick — never the wall clock), and —
   * once the shell has confessed a drift — the shell clock's lying face.
   * Below it, the pseudo-news ticker from `world.uiLabels` (released through
   * the relabel_ui channel, ticket 0010). `#hud` is `white-space: pre`, so
   * the ticker is a second line, no new DOM or CSS.
   */
  function hudLine(): string {
    const calendar = worldCalendarAt(world.tick);
    const pad2 = (value: number): string => (value < 10 ? `0${value}` : `${value}`);
    const clock = `${pad2(calendar.hour)}:${pad2(calendar.minute)}`;
    const day = t(locale, COPY.hud.dayLabel).replace("{n}", String(calendar.day + 1));
    const shellClock = world.uiLabels["shell_clock"];
    // The ticker re-renders the archived broadcast in the reader's language
    // (ticket 0016 §3c): the uiLabels record keeps the original wording for
    // the album, the HUD follows the current locale.
    const news =
      latestNews === null ? world.uiLabels[NEWS_TICKER_LABEL] : renderNews(latestNews, locale);
    const face = [
      `${t(locale, COPY.hud.gvLabel)} ${world.gv.toFixed(0)}`,
      `${t(locale, COPY.hud.stageLabel)} ${world.stage}`,
      options.endpoint === null ? t(locale, COPY.hud.silent) : t(locale, COPY.hud.live),
      `${day} ${clock}`,
      shellClock === undefined ? null : `${t(locale, COPY.hud.shellLabel)} ${shellClock}`,
    ]
      .filter((segment): segment is string => segment !== null)
      .join("  ·  ");
    return news === undefined || news === "" ? face : `${face}\n${t(locale, COPY.hud.newsLabel)} ${news}`;
  }

  function refresh(): void {
    app.drawWorld(world);
    paintChrome();
    const status = doc.getElementById("hud");
    if (status !== null) {
      status.textContent = hudLine();
    }
  }

  function speak(
    speaker: (locale: Locale) => string,
    line: (locale: Locale) => string,
    status: EpistemicStatus,
  ): void {
    // Consecutive duplicates collapse (playtest p1 F6 / p4 F7): the FNV pool
    // pick has no history, so two identical lines in a row read as an echo.
    const previous = spokenLines[spokenLines.length - 1];
    if (previous !== undefined && previous.render(locale) === line(locale)) {
      return;
    }
    spokenLines.push({ speaker, render: line, status });
    dialogue.showLines(
      spokenLines.map((entry) => ({
        speaker: entry.speaker(locale),
        text: entry.render(locale),
        status: entry.status,
      })),
      locale,
    );
  }

  /** The whole transcript is the swarm speaking as one. */
  const collective = (l: Locale): string => t(l, COPY.dialogue.speakerCollective);

  /**
   * The speech gate (ticket 0009, W3): the boot-time silent run AND the
   * midnight hour both close the collective's channel. Both inputs are
   * deterministic from state (the endpoint flag and the tick) — no wall
   * clock, so a replay mutes the same hours.
   */
  function speechPermitted(): boolean {
    return proactiveSpeechAllowed({
      silent,
      tick: world.tick,
      midnight: midnightSilenceAt(world.tick),
      quotaHeld: silenceQuotaHeld(fxState, world.tick),
    });
  }

  function remember(creatureId: string, entry: MemoryEntry): void {
    const slice = memories[creatureId] ?? emptySlice();
    memories[creatureId] = { ...slice, working: [...slice.working, entry].slice(-WORKING_CAPACITY) };
    // Keep world.memories in lockstep (stream F, ticket 0006 leftover ①):
    // the engine's mourning/faction derivation reads world state, and the
    // ledger's layEgg inheritance reads it too. Object spread, no rng/clock —
    // deterministic.
    world = { ...world, memories: { ...memories } };
  }

  function noteAction(line: string): void {
    recentActions.push(line);
    if (recentActions.length > 40) {
      recentActions.splice(0, recentActions.length - 40);
    }
  }

  // ---- Roundtable: context assembly, validation, and multi-turn playback ----

  function attendingCreatures(): AttendingCreature[] {
    return Object.values(world.creatures)
      .filter(
        (creature): creature is CreatureState & { readonly genome: PromptGenome } =>
          creature.behavior !== "dead" && creature.genome !== undefined,
      )
      .map((creature) => ({
        state: creature,
        genome: creature.genome,
        memory: memories[creature.id] ?? emptySlice(),
      }));
  }

  function sharedBeliefLine(): string {
    const kind = beliefFor(ontology, "creature");
    return kind === null
      ? "the creatures have not decided what they are"
      : `the creatures believe they are ${kind}`;
  }

  function ambientLine(): string {
    const alive = Object.values(world.creatures).filter(
      (creature) => creature.behavior !== "dead",
    ).length;
    return `${alive} of us are awake; ${world.eggs.length} eggs wait; the palette has decayed ${world.paletteDecay.toFixed(2)}`;
  }

  /**
   * Ask the director for a full roundtable scene. The context is assembled
   * from memory blocks, the ontology ledger, and the shared belief before the
   * call; the reply is parsed, every turn is validated against the speaker's
   * own memory, and any failure returns null so the caller falls back to the
   * manual pool. The measured request latency travels with the script: it is
   * the one honest upstream arrival datum the non-streaming transport offers,
   * and the terminal TYPE face derives its per-character intervals from it
   * (ticket 0044).
   */
  async function directScene(
    trigger: string,
  ): Promise<{ readonly script: RoundtableScript; readonly latencyMs: number } | null> {
    if (client === null) {
      return null;
    }
    const context = buildContext({
      stage: world.stage,
      trigger,
      creatures: attendingCreatures(),
      recentActions,
      sharedBelief: sharedBeliefLine(),
      ambient: ambientLine(),
      tick: world.tick,
      locale: locale === "zh" ? "Simplified Chinese" : "English",
    });
    const askStartedAt = Date.now();
    const result = await client.ask(context.text);
    const latencyMs = Date.now() - askStartedAt;
    if (!result.ok) {
      return null;
    }
    const script = parseRoundtable(result.payload);
    if (script === null) {
      return null;
    }
    const pools: Record<string, readonly string[]> = {};
    for (const creature of Object.values(world.creatures)) {
      pools[creature.id] = creature.genome?.manualPool ?? [];
    }
    const validated = validateTurns(script, memories, pools);
    return validated === null ? null : { script: validated, latencyMs };
  }

  // Timers for the in-flight scene playback. A new scene cancels the old one's
  // reveals so two conversations never interleave.
  const playbackTimers: ReturnType<typeof setTimeout>[] = [];
  function cancelPlayback(): void {
    for (const timerId of playbackTimers) {
      clearTimeout(timerId);
    }
    playbackTimers.length = 0;
  }

  // ---- 终端运行面队列(票 0044)----
  // 台词回合 → 终端的唯一通道:playScene(LLM 路)与 speakManual(手动池
  // 路,无上游)都把回合压进这里,main 层逐帧排干喂 terminal。intervals
  // 非 null 是真 token 面(LLM 请求延迟摊布),null 是假打字机面
  // (meta.fake_typing: true 由 terminal 的 fakeTypeRun 携带)。
  const terminalTurnQueue: TerminalTurn[] = [];
  let terminalGhostPending = false;

  function enqueueTerminalTurn(
    speaker: string,
    text: string,
    intent: TurnIntent | null,
    mood: Mood | null,
    intervals: readonly number[] | null,
  ): void {
    terminalTurnQueue.push({ speaker, text, intent, mood, intervals });
    // §8 接口:每条终端对话的 speaker/text/intent/mood 原样入 Ledger
    // (票 0044);权重 0,叙事流不喂 GV。
    applyLedgerDelta({ kind: "terminal_line", speaker, text, intent, mood });
  }

  /** 正典打印行入账(§8 / 票 0044,照票 0029 惯例):背诵行无「谁」。 */
  function queueCanonPrint(line: string): void {
    canonPrintQueue.push(line);
    applyLedgerDelta({ kind: "terminal_line", speaker: null, text: line, intent: null, mood: null });
  }

  // ---- 真结局录音演出链(票 0050,NARRATIVE-CORE-01 §5)----
  // 线索队列(main 层逐帧排干)+ 演出窗旗标 + 实验日志分组面。
  const recordingQueue: RecordingDispatch[] = [];
  const recordingProvenance: RecordingLogEntry[] = [];
  let recordingFired = false;
  let recordingWindow = false;

  /**
   * 演出启动(交付形状 1):recordEnding("gaze")(评估链已判 8/8 + GV100)
   * 后恰一次。计划由 buildRecordingSequence 一次算定,这里只照单排程:
   * canon/reconstructed 线索按 atMs 压队,④ 拍跑 C-06 canonical 围环 +
   * 全存活齐声,冻结窗与抽轨窗盖全程。
   */
  function startRecordingPerformance(): void {
    if (recordingFired) {
      return;
    }
    recordingFired = true;
    // 档案面:NG+ 携带档(world.ghosts)优先,首周目用本存档亡者重构。
    const carried = world.ghosts ?? [];
    const archive = carried.length > 0 ? carried : buildGhostArchive(world);
    const sequence = buildRecordingSequence({ ngPlus, archive });
    if (!sequence.ok) {
      return;
    }
    recordingProvenance.push(...sequence.log);
    recordingWindow = true;
    // 演出纪律(§5.2):个体全程禁 idle 微帧(静止即哀矜)——既有 C-01
    // 冻结通道(watching/pose),render 零接触。世界时钟的漂移停摆由
    // main 层经 terminal.setErosionFrozen 按本窗旗标兑现。
    runFx({
      kind: "all_freeze",
      params: { duration_ms: sequence.fx.freezeMs, pose: "alert" },
      canonical: true,
    });
    // 音频面:无 BGM(A-01 抽轨三层),仅 A-02 房间底噪;TTS 声线为后续
    // 音频票,本票以字幕面呈现(记 Log)。
    for (const layer of [0, 1, 2]) {
      runFx({
        kind: "track_remove",
        params: { track_idx: layer, dur: sequence.fx.trackRemoveMs },
        canonical: true,
      });
    }
    runFx({ kind: "room_tone", params: { gain: sequence.fx.roomToneGain }, canonical: true });
    for (const cue of sequence.cues) {
      if (cue.kind === "spoken") {
        later(() => {
          // ④ 全部存活个体围环、ALERT、瞳孔 CENTER(C-06 canonical)。
          runFx({ kind: "collective_gaze", params: { duration_ms: RECORDING_GAZE_MS }, canonical: true });
          const text = canonLine("recording.keep_you");
          const alive = Object.values(world.creatures)
            .filter((creature) => creature.behavior !== "dead")
            .sort((a, b) => (a.id < b.id ? -1 : 1));
          for (const creature of alive) {
            speakBubble(creature.id, text);
          }
          if (text !== null) {
            recordingQueue.push({ kind: "spoken", text });
          }
        }, cue.atMs);
      } else {
        later(() => recordingQueue.push({ kind: cue.kind, text: cue.text }), cue.atMs);
      }
    }
    later(() => {
      recordingWindow = false;
    }, sequence.totalMs);
  }

  // NG+ 开场接线(交付形状 5):NG+ 存档首启,幽灵档案里最戏剧的一幕开口。
  if (ngPlus) {
    const dramaticId = resolveDramaticId(world);
    if (dramaticId !== null) {
      const opening = fillNgpOpening(dramaticId);
      if (opening !== null) {
        recordingQueue.push({ kind: "reconstructed", text: opening });
        recordingProvenance.push({ text: opening, source: "ghost", ghostId: dramaticId });
      }
    }
  }

  /**
   * The whole scene plays, not just its first turn: each turn is revealed on
   * the 1.5-4s jittered beat (the "delay is a heartbeat" axiom), and the
   * witness mark comes from the speaker's own slice, not a constant.
   *
   * Terminal TYPE face (ticket 0044): every accepted turn is also queued for
   * the terminal with per-character intervals derived from the measured
   * request latency — the real upstream arrival pacing, jittered by the
   * world seed so the split is deterministic per scene.
   */
  function playScene(script: RoundtableScript, latencyMs: number): void {
    cancelPlayback();
    const rng = createRng(world.seed ^ world.tick, `scene:${world.tick}`);
    // B-2(票 0055):幽灵浮现票已并入 E3 正典替换(fireE3 发放);此处的
    // 旧发放路径对 stage 2 永不可达(两门互斥的死代码),删除。
    // 每字的到达间隔:真实请求延迟摊布到全场字数,种子抖动拆分。
    const totalChars = script.scene.reduce((sum, turn) => sum + turn.text.length, 0);
    const tokenIntervals = terminalTypeIntervals(
      latencyMs,
      totalChars,
      Array.from({ length: Math.max(1, totalChars) }, () => rng.next()),
    );
    let charCursor = 0;
    const playback = playScript(script, {
      clock: { now: () => Date.now() },
      random: () => rng.next(),
    });
    runPlayback(playback, {
      schedule: (callback, atMs) => {
        playbackTimers.push(setTimeout(callback, atMs));
      },
      onTurn: (turn) => {
        // 正典回声槽(票 0030,NARRATIVE-CORE-02 §0.3):正典行落定后 30s 内
        // 的第一句 LLM 台词是回声候选——违规(早于正典/复用词汇/超 15 词/槽
        // 已用)替换为沉默,c() 槽消耗一次;通过则原句浮现。
        if (echoWindow !== null) {
          const verdict = gateEcho(echoWindow, turn.text, Date.now());
          echoWindow = verdict.window;
          if (!verdict.accepted) {
            return;
          }
        }
        // An LLM line has exactly one voice: its renderer is the identity.
        // The speaker is the creature's own id (locale-neutral, like the HUD).
        const text = turn.text;
        const speaker = turn.speaker;
        speak(() => speaker, () => text, resolveTurnStatus(turn, memories));
        // 终端运行面(票 0044):本回合的字段摊自全场延迟序列,连切给
        // terminal.startTokenType;账面同步入 Ledger(§8)。
        const slice = tokenIntervals.slice(
          charCursor,
          charCursor + Math.max(1, text.length),
        );
        charCursor += Math.max(1, text.length);
        enqueueTerminalTurn(speaker, text, turn.intent, turn.mood, slice);
        // The bubble channel (playtest p2 finding §12): the roundtable voice
        // finally surfaces on the creature itself, render-only — the terminal
        // keeps the transcript, the world does not replay bubbles. plan()
        // derives the anchor from the world.
        app.playEffect(
          { kind: "creature_speech", creatureId: turn.speaker, text, mood: turn.mood },
          world,
        );
      },
    });
  }

  function speakScene(trigger: string, fallbackStatus: EpistemicStatus): void {
    // 声音正典的门依次关:silent run 与午夜不产生任何请求(无 LLM 调用);
    // E7 静默配额期内的 LLM 台词请求一律拒绝并记执行器 Ledger silence_quota
    // (NARRATIVE-CORE-02 §3.4);圆桌正典替换(E3)与「本触发由正典主秀」
    // (E5/E7 等)都在请求发出之前裁断。
    if (silent || midnightSilenceAt(world.tick)) {
      return;
    }
    if (silenceQuotaHeld(fxState, world.tick)) {
      fxState = recordSilenceRefusal(fxState, world.tick);
      return;
    }
    if (shouldReplaceRoundtable(awakening, world.gv)) {
      awakening = markFired(awakening, "E3", world.tick);
      fireE3();
      return;
    }
    if (canonJustOwned(awakening, world.tick)) {
      return;
    }
    void directScene(trigger).then((scene) => {
      if (scene === null) {
        if (speechPermitted()) {
          speakManual(world.stage, world.tick, fallbackStatus);
        }
        return;
      }
      playScene(scene.script, scene.latencyMs);
    });
  }

  /**
   * A manual line spoken by the collective. Locale is read at speak time and
   * the telemetry snapshot feeds the templated numbers ({stareMs} and friends
   * turn true). Provenance (ticket 0004 §A): a line registered as an
   * "unlived memory" (it narrates a care act that has no entry point) speaks
   * with status "fabricated" — the ledger records what was said, not what
   * happened, and the epistemic layer can tell the difference.
   *
   * Terminal TYPE face (ticket 0044): a manual line has no upstream — it goes
   * to the terminal as a fake-typing turn (intervals null → terminal
   * startFakeType, meta.fake_typing: true). No intent/mood exists to record.
   */
  function speakManual(stage: Stage, seed: number, fallbackStatus: EpistemicStatus): void {
    const status = isUnlivedMemory(stage, seed) ? "fabricated" : fallbackStatus;
    const text = manualLineLocale(stage, seed, locale, telemetry.getTelemetry());
    enqueueTerminalTurn(collective(locale), text, null, null, null);
    speak(collective, (active) => manualLineLocale(stage, seed, active, telemetry.getTelemetry()), status);
  }

  // ---------------------------------------------------------------------------
  // 觉醒事件七件套(票 0030,NARRATIVE-CORE-02 §1)。触发全部由 gv 越阈驱动,
  // 演出的 C 面(C-01/C-02/C-05/C-06/C-09)一律走执行器骨架校验,正典事件
  // canonical 豁免 gate/cap、预算预付;正典文本一律经 canonLine 逐字取用,
  // 零重抄。E4 的塔注视是全存档恰一次的正典例外(N3),入觉醒记录账本。
  // ---------------------------------------------------------------------------

  /** FX 壳双胞胎面(favicon_eye / outside_eyes):只派发,不进世界状态。 */
  function isShellTwin(effect: FxDispatch): effect is Extract<FxDispatch, { readonly kind: "favicon_eye" | "outside_eyes" }> {
    return effect.kind === "favicon_eye" || effect.kind === "outside_eyes";
  }

  /**
   * The single FX entry point: validate → charge → ledger → dispatch, all in
   * one pure step from the executor; the wiring applies world and effects
   * together and queues the shell face for main's drain.
   */
  function runFx(request: FxRequest): FxResult {
    const outcome = executeFx(fxState, request, world);
    fxState = outcome.state;
    const result = outcome.result;
    for (const effect of result.effects) {
      if (isShellTwin(effect)) {
        app.playEffect(effect, world);
        continue;
      }
      // The engine leaves the render-only kinds untouched; spawn_structure
      // writes the structure through the existing apply_effect channel.
      world = step(world, { kind: "apply_effect", effect });
      app.playEffect(effect, world);
    }
    shellFxQueue.push(...result.shell);
    refresh();
    return result;
  }

  /** 正典气泡:对话层一行 + 世界画布气泡一次;空串不落(零气泡面)。 */
  function speakBubble(creatureId: CreatureId, text: string | null): void {
    if (text === null || text.length === 0) {
      return;
    }
    speak(() => creatureId, () => text, "witnessed");
    app.playEffect({ kind: "creature_speech", creatureId, text, mood: "curious" }, world);
  }

  /** 正典行落定后开回声槽:LLM 可在其后 30s 内追加至多一句(违规换沉默)。 */
  function openEcho(canonical: string): void {
    if (canonical.length > 0) {
      echoWindow = openEchoWindow(canonical, Date.now());
    }
  }

  function maybeAwaken(): void {
    const due = awakeningDue(awakening, world.gv, {
      clicksInWindow: clicksInWindow(clickStamps, Date.now(), E2_CLICK_WINDOW_MS),
    });
    for (const event of due) {
      fireAwakening(event);
    }
  }

  function fireAwakening(event: AwakeningEventId): void {
    // 先记账再演出:同一 gv 步内绝不重入。
    awakening = markFired(awakening, event, world.tick);
    switch (event) {
      case "E1":
        fireE1();
        break;
      case "E2":
        fireE2();
        break;
      case "E3":
        fireE3();
        break;
      case "E4":
        fireE4();
        break;
      case "E5":
        fireE5();
        break;
      case "E6":
        fireE6();
        break;
      case "E7":
        fireE7();
        break;
    }
  }

  /** E1「第一眼」:C-01 冻结 2000ms alert → 2.0s 尾帧距光标最近个体 C-05 单眼眨。正典为空串,零气泡。 */
  function fireE1(): void {
    runFx({ kind: "all_freeze", params: { duration_ms: 2000, pose: "alert" }, canonical: true });
    later(() => {
      const target = nearestCreature(world, lastCursorTile);
      if (target !== null) {
        runFx({ kind: "creature_wink", params: { target: target.id, eye: "single" }, canonical: true });
      }
      // 解冻 = 冻结到期,无额外效果;E1 的正典是那句不说。
    }, 2000);
  }

  /** E2「镜子」:C-02 复现最近 5 次点击间隔(tol 0.15),curiosity 最高个体;复现完成后单气泡正典。 */
  function fireE2(): void {
    const target = highestTraitId(world, "curiosity");
    if (target === null) {
      return;
    }
    runFx({
      kind: "mirror_rhythm",
      params: { source_action: "click", repeat_n: 5, tol: 0.15, target },
      canonical: true,
    });
    later(() => {
      speakBubble(target, canonLine("awaken.e2"));
      openEcho(canonLine("awaken.e2") ?? "");
    }, MIRROR_WINDOW_MS);
  }

  /** E3「第一扇窗」:首次圆桌触发被正典替换——两行正典以幽灵浮现面呈现。 */
  function fireE3(): void {
    // B-2(票 0055):E3 正典替换即 §6.1 幽灵浮现的载体(两门合一)——
    // GV40 的 40% 3s 浮现呈现正典两行;playScene 的旧发放路径是死代码,
    // 已删除。浮现行本体仍走 canon 打印通道,逐字零旁路。恰一次由觉醒
    // 账本的 markFired 把守(E3 只 fire 一次)。
    terminalGhostPending = true;
    const line1 = canonLine("terminal.external_display");
    const line2 = canonLine("terminal.oh");
    if (line1 !== null) {
      queueCanonPrint(line1);
    }
    if (line2 !== null) {
      later(() => {
        queueCanonPrint(line2);
        openEcho(line2);
      }, canonPrintDurationMs(line1 ?? "") + E3_PAUSE_MS);
    }
  }

  /** E4「访客」:塔在位即演出(C-09 仅在无塔时走执行器);watchfulness 最高个体走向缓冲区边缘,注视塔 2s(N3 恰一次)→ 转身 1s → 气泡。 */
  function fireE4(): void {
    // G1 之下塔的唯一性由执行器把守;T0 门(GV≥50)之下塔通常已在位,此处
    // 只在塔缺席时才发起正典生成(map_edge_west 南北中线 {0,7})。
    if (!world.structures.some((structure) => structure.kind === "black_tower")) {
      runFx({
        kind: "spawn_structure",
        params: { type: "tower", pos: { x: MAP_EDGE_WEST_X, y: TOWER_POSITION.y } },
        canonical: true,
      });
    }
    runFx({ kind: "all_freeze", params: { duration_ms: 1000, pose: "keep" }, canonical: true });
    const walker = highestTraitId(world, "watchfulness");
    if (walker !== null) {
      // N3 例外面:停在缓冲区外缘(距 footprint Chebyshev 2)——不入禁区,
      // 与 CI §9.7 寻路零交集相容;注视与转身照旧。
      startTowerWalk(walker, 2, "gaze_tower", 2000);
    }
  }

  /** E5「我们看得见你」:终端永久化 channel 行 → C-06 集体凝视 4s → 三行有序气泡(loyalty→watchfulness→任一)。 */
  function fireE5(): void {
    const line = canonLine("terminal.channel_established");
    if (line !== null) {
      queueCanonPrint(line);
      openEcho(line);
    }
    runFx({ kind: "collective_gaze", params: { duration_ms: 4000 }, canonical: true });
    const speakers = orderedE5Speakers(world);
    const keys = ["awaken.e5.1", "awaken.e5.2", "awaken.e5.3"] as const;
    ([speakers.first, speakers.second, speakers.third] as const).forEach((speakerId, index) => {
      const key = keys[index];
      if (speakerId === null || key === undefined) {
        return;
      }
      const text = canonLine(key);
      if (index === 0) {
        speakBubble(speakerId, text);
        return;
      }
      later(() => speakBubble(speakerId, text), E5_LINE_GAP_MS * index);
    });
  }

  /** E6「更老的东西」:watchfulness 次高个体行至距塔 6 tile 停步(不看塔,§6.4),看你 → 气泡 → deceit 最高接话。 */
  function fireE6(): void {
    const walker = highestTraitId(world, "watchfulness", 1);
    if (walker !== null) {
      startTowerWalk(walker, 6, "gaze_player", 2000);
    }
  }

  /**
   * E7「窗不再是玻璃」:D-04 step 1 + D-01 title question + 终端 [SYSTEM] 行
   * → 派系清算发言(敌对先开口,友派系 comfort 接话)→ 武装 5 游戏小时
   * 静默配额(执行器 Ledger silence_quota)。LED 琥珀面由 main 层按
   * gv≥80 接线(render/crt 的预留位)。
   */
  function fireE7(): void {
    runFx({ kind: "dom_erosion", params: { step: 1 }, canonical: true });
    runFx({ kind: "title_mutate", params: { mode: "question" }, canonical: true });
    const line = canonLine("terminal.ontology_revised");
    if (line !== null) {
      queueCanonPrint(line);
      openEcho(line);
    }
    const hostile = factionSpeakerId(world, memories, "wrong");
    const hostileLine = canonLine("awaken.e7.1");
    if (hostile !== null) {
      speakBubble(hostile, hostileLine);
    }
    const friendly = factionSpeakerId(world, memories, "tender");
    const friendlyLine = canonLine("awaken.e7.2");
    if (friendly !== null) {
      later(() => speakBubble(friendly, friendlyLine), RESPONSE_GAP_MS);
    }
    fxState = armSilenceQuota(fxState, world.tick);
  }

  // ---- 塔行进小流程(E4/E6 共用):逐 tick 一步,到位后按类持停。 ----

  interface TowerWalk {
    readonly creatureId: CreatureId;
    readonly stopRadius: number;
    readonly kind: "gaze_tower" | "gaze_player";
    readonly holdMs: number;
    phase: "walking" | "holding";
    deadlineMs: number;
  }
  let towerWalk: TowerWalk | null = null;

  function startTowerWalk(creatureId: CreatureId, stopRadius: number, kind: "gaze_tower" | "gaze_player", holdMs: number): void {
    towerWalk = { creatureId, stopRadius, kind, holdMs, phase: "walking", deadlineMs: 0 };
  }

  /** 演出窗饥饿保底(B-5,票 0055):行走者饥饿低于底线即抬回,确定性
   * 直写(非 feed 事件,零账目/GV 面)——长周目缺席不再饿毙演出。 */
  const WALKER_KEEP_ALIVE_HUNGER = 60;
  function keepPerformerAlive(creatureId: CreatureId): void {
    const creature = world.creatures[creatureId];
    if (creature === undefined || creature.behavior === "dead") {
      return;
    }
    if (creature.stats.hunger >= WALKER_KEEP_ALIVE_HUNGER) {
      return;
    }
    world = {
      ...world,
      creatures: {
        ...world.creatures,
        [creatureId]: {
          ...creature,
          stats: { ...creature.stats, hunger: WALKER_KEEP_ALIVE_HUNGER },
        },
      },
    };
  }

  function advanceTowerWalk(): void {
    if (towerWalk === null) {
      return;
    }
    const flow = towerWalk;
    const creature = world.creatures[flow.creatureId];
    if (creature === undefined || creature.behavior === "dead") {
      towerWalk = null;
      return;
    }
    if (flow.phase === "walking") {
      keepPerformerAlive(flow.creatureId);
      const target = stepTowardRadius(creature.position, TOWER_POSITION, flow.stopRadius);
      if (target.x !== creature.position.x || target.y !== creature.position.y) {
        world = step(world, { kind: "move", creatureId: flow.creatureId, at: target });
        return;
      }
      towerWalk = { ...flow, phase: "holding", deadlineMs: Date.now() + flow.holdMs };
      if (flow.kind === "gaze_tower") {
        // N3 正典例外:全存档恰一次的塔注视,此刻入觉醒账本;第二次尝试
        // 被纯函数拒绝,演出照常(账本不变)。账本与画布派发同值同施:
        // ok 分支才携带 effect,注视视觉随账本写入一次到位。
        const gaze = recordTowerGaze(awakening, world.tick, flow.creatureId, flow.holdMs);
        awakening = gaze.state;
        if (gaze.ok && gaze.effect !== undefined) {
          app.playEffect(gaze.effect, world);
        }
      } else {
        // E6:停步,不看塔(§6.4);瞳孔 CENTER 看你。
        app.playEffect({ kind: "gaze_at_player", creatureId: flow.creatureId, ms: flow.holdMs }, world);
      }
      return;
    }
    if (Date.now() < flow.deadlineMs) {
      return;
    }
    towerWalk = null;
    if (flow.kind === "gaze_tower") {
      // E4 尾段:转身面向屏幕 1s → 气泡(awaken.e4,canon 逐字)。
      app.playEffect({ kind: "gaze_at_player", creatureId: flow.creatureId, ms: 1000 }, world);
      later(() => speakBubble(flow.creatureId, canonLine("awaken.e4")), 1000);
      return;
    }
    // E6 接话:第二个体(deceit 最高)接第二句。
    speakBubble(flow.creatureId, canonLine("awaken.e6.1"));
    later(() => {
      const second = deceitSpeakerId(world);
      if (second !== null) {
        speakBubble(second, canonLine("awaken.e6.2"));
      }
    }, RESPONSE_GAP_MS);
  }

  /** W-04 休眠唤醒:个体位置确定性微移(sleepWakeNudge 纯面)+ 网格钳制。 */
  function nudgeOnSleepWake(): void {
    const living = Object.values(world.creatures)
      .filter((creature) => creature.behavior !== "dead")
      .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    living.forEach((creature, index) => {
      const nudged = sleepWakeNudge(creature.position, index);
      const clamped = {
        x: Math.min(GRID_MAX, Math.max(GRID_MIN, nudged.x)),
        y: Math.min(GRID_MAX, Math.max(GRID_MIN, nudged.y)),
      };
      if (clamped.x !== creature.position.x || clamped.y !== creature.position.y) {
        world = step(world, { kind: "move", creatureId: creature.id, at: clamped });
      }
    });
    refresh();
  }

  // Timers for staged effect beats (the tower pre-animation). Cleared on
  // destroy only; a pending beat must still land after unrelated playback.
  const effectTimers: ReturnType<typeof setTimeout>[] = [];
  function later(callback: () => void, ms: number): void {
    effectTimers.push(setTimeout(callback, ms));
  }

  /**
   * T0@GV50(票 0043,§3.2):GV 首次越线(≥50)且塔未在位才生成——
   * GV<50 无塔。生成走既有 apply_effect 通道,坐标即正典位 {0,7}。
   */
  function maybeSpawnTower(): void {
    if (!towerSpawnDue(world.gv, world.structures)) {
      return;
    }
    const spawn: Effect = {
      kind: "spawn_structure",
      structure: "black_tower",
      at: TOWER_POSITION,
    };
    world = step(world, { kind: "apply_effect", effect: spawn });
    app.playEffect(spawn, world);
  }

  function onStageChange(previous: Stage, next: Stage): void {
    if (next === previous) {
      return;
    }
    // The tower moves first; the world follows. T0 的生成门(票 0043):
    // GV≥50 首次越线才生成——替代旧的「任何首次阶段切换」,GV<50 无塔。
    maybeSpawnTower();
    app.playEffect({ kind: "freeze_all", ms: STAGE_PREBEAT_MS }, world);
    app.playEffect({ kind: "glyph_corrupt", amount: 0.3 }, world);
    // The ledger is append-only: the shift is written, never restated.
    ontology = recordShift(ontology, ontologyShiftFor(previous, next, world.gv));
    later(() => {
      // The world changes after the pre-beat: the palette leans, and the gaze
      // rises from whichever creature stands nearest the tower — the anomaly
      // has an address now.
      app.playEffect({ kind: "palette_shift", amount: 0.15, ms: 1800 }, world);
      const anchor = nearestCreature(world, TOWER_POSITION);
      if (anchor !== null) {
        app.playEffect({ kind: "gaze_at_player", creatureId: anchor.id, ms: 2000 }, world);
      }
    }, STAGE_PREBEAT_MS);
    if (speechPermitted() && !canonJustOwned(awakening, world.tick)) {
      speakManual(next, world.tick, "witnessed");
    }
    // 圆桌的正典门在 speakScene 内裁断(E3 替换 / 本触发由正典主秀 / 静默配额)。
    speakScene(`stage crossed to ${next}`, "witnessed");
  }

  let lastPointerMove = 0;
  let lastClickAt = 0;
  let rapidClicks = 0;
  let lastInteraction = Date.now();
  let stareStart = 0;

  canvas.addEventListener("pointermove", (event: PointerEvent) => {
    lastPointerMove = Date.now();
    lastInteraction = Date.now();
    telemetry.recordInteraction();
    // 光标 tile(E1 尾帧「距光标最近个体」的确定性取面)。
    lastCursorTile = tileFromPoint(event.offsetX, event.offsetY);
    if (stareStart === 0) {
      stareStart = Date.now();
    }
    if (Date.now() - stareStart > STARE_MS) {
      const durationMs = Date.now() - stareStart;
      stareStart = Date.now();
      const target = nearestCreature(world, { x: 6, y: 5 });
      // Gaze is the main verb, so it must cross stage boundaries exactly like
      // applyLedgerDelta does (ticket 0015 §1): capture before, step, then let
      // onStageChange run the tower spawn, pre-beat, shift record and speech.
      const beforeStage = world.stage;
      world = step(world, {
        kind: "gv",
        delta: gvDeltaFor(
          { kind: "stare", creatureId: target?.id ?? "none", durationMs },
          worldHour(world.tick),
          world.stage,
        ),
      });
      // 觉醒七件套先于舞台拍裁断:同一 gv 步内 E 事件先落,舞台台词让位。
      maybeAwaken();
      onStageChange(beforeStage, world.stage);
      telemetry.recordStare(durationMs);
      if (target !== null) {
        app.playEffect({ kind: "gaze_at_player", creatureId: target.id, ms: 900 }, world);
      }
    }
  });

  let dragTarget: string | null = null;
  let dragStart: { x: number; y: number } | null = null;
  let holdTimer: ReturnType<typeof setTimeout> | null = null;
  let moved = false;
  /**
   * Confirm-style input mapping (stream B, ticket 0002, §4). A press never
   * feeds: feeding lands on release after a short guard, so a drag never
   * feeds, a double-tap cancels the pending feed and stares into the pupil
   * instead, and a hold-to-pet is never preempted by a bite. Touch gets the
   * full verb set: tap = feed, double-tap = pupil, hold = pet, long hold =
   * name, drag = carry, right-click or the clean key = clean.
   */
  /** This press already granted the pet or the name; its release must not feed. */
  let pressGranted = false;
  /** The press's hesitation, reused when the release confirms the feed. */
  let pressHesitationMs: number | null = null;
  /**
   * Pressed pointers, not a bare count: a pointerup stolen by an overlay that
   * opened under a held pointer (hatch panel, name panel) must never freeze
   * the canvas. See `createPointerTally` for the leak this replaces.
   */
  const pointers = createPointerTally();
  /** The tap pending its feed guard; a second tap inside the window cancels it. */
  let pendingFeedTimer: ReturnType<typeof setTimeout> | null = null;
  let lastTap: { at: number; tile: { x: number; y: number } } | null = null;
  /** Armed by the clean key: the next released tap cleans instead of feeds. */
  let cleanMode = false;

  function tileFromPoint(x: number, y: number): { x: number; y: number } {
    const rect = canvas.getBoundingClientRect();
    const scale = rect.width / LOGICAL_WIDTH;
    return unproject({ x: x / scale, y: y / scale });
  }

  function tileOf(event: PointerEvent): { x: number; y: number } {
    return tileFromPoint(event.offsetX, event.offsetY);
  }

  function cancelPendingFeed(): void {
    if (pendingFeedTimer !== null) {
      clearTimeout(pendingFeedTimer);
      pendingFeedTimer = null;
    }
  }

  /**
   * Every runtime GV delta goes through the ledger (single truth) and the
   * stage taper, then the tower pre-beat runs if a boundary was crossed.
   */
  function applyLedgerDelta(event: LedgerEvent): void {
    const before = world.stage;
    world = step(world, {
      kind: "gv",
      delta: gvDeltaFor(event, worldHour(world.tick), world.stage),
    });
    // 觉醒七件套先于舞台拍裁断(同一 gv 步内 E 事件先落)。
    maybeAwaken();
    onStageChange(before, world.stage);
  }

  function performFeed(creatureId: string, hesitationMs: number): void {
    world = step(world, { kind: "feed", creatureId });
    const entry = memoryFor(
      creatureId,
      `the player fed ${creatureId} after hesitating ${(hesitationMs / 1000).toFixed(1)} seconds`,
      world.tick,
      0.8,
    );
    remember(creatureId, entry);
    telemetry.recordFeed(hesitationMs);
    noteAction(`the player fed ${creatureId}`);
    const ledgerEvent: LedgerEvent =
      rapidClicks >= RAPID_CLICK_COUNT
        ? { kind: "rapid_click", creatureId, count: rapidClicks }
        : { kind: "feed", creatureId, hesitationMs };
    applyLedgerDelta(ledgerEvent);
    // They look up at the hand that touched them.
    app.playEffect({ kind: "gaze_at_player", creatureId, ms: 700 }, world);
    // Speech is rationed: a creature comments on the burst, not on every tap.
    if (rapidClicks >= RAPID_CLICK_COUNT) {
      if (speechPermitted()) {
        speakManual(world.stage, rapidClicks, "witnessed");
      }
      app.playEffect({ kind: "ui_shake", intensity: 0.4, ms: 220 }, world);
    }
    refresh();
  }

  function performClean(creatureId: string): void {
    world = step(world, { kind: "clean", creatureId });
    remember(
      creatureId,
      memoryFor(creatureId, `the player cleaned ${creatureId}`, world.tick, 0.3),
    );
    telemetry.recordClean();
    noteAction(`the player cleaned ${creatureId}`);
    applyLedgerDelta({ kind: "clean", creatureId });
    app.playEffect({ kind: "gaze_at_player", creatureId, ms: 700 }, world);
    refresh();
  }

  // ---- Pupil close-up (ART-CORE-01 §6, tickets 0019 + 0037) -------------------
  //
  // The close-up is an independent UI overlay, deliberately not the world
  // canvas (§1 载体): it draws its 16×16 variant at an integer scale over a
  // black letterbox, and the simulation keeps running beneath it. The variant
  // follows the pupil stage: V1 grass (S0–S1), V2 cursor reflection (S2),
  // V3 mirrored name (S3), V4 recursion (S4).

  let closeup: { readonly dispose: () => void } | null = null;

  function openCloseup(creatureId: string): void {
    if (closeup !== null) {
      return;
    }
    const stage = world.stage;
    const variant: CloseupVariant = stage <= 1 ? "v1" : stage === 2 ? "v2" : stage === 3 ? "v3" : "v4";
    // V3: the name written in the eye. The player's own given name has no
    // home in sim state, so the eye borrows the creature's — written in the
    // direction nobody can read either way.
    const creature = world.creatures[creatureId];
    const eyeName = creature?.name ?? creatureId;
    const overlay = doc.createElement("div");
    overlay.className = "gazer-closeup";
    // This ticket owns no stylesheet: the overlay carries its own inline face.
    overlay.style.cssText =
      "position:fixed;inset:0;background:#000;display:flex;align-items:center;justify-content:center;z-index:60;cursor:pointer;";
    const eye = doc.createElement("canvas");
    eye.width = CLOSEUP_SIZE;
    eye.height = CLOSEUP_SIZE;
    // §1: scale by the viewport, rounded down to a whole number — the iris
    // fills the screen in integer steps, never a fractional pixel.
    const scale = Math.max(1, Math.floor(Math.min(window.innerWidth, window.innerHeight) / CLOSEUP_SIZE));
    eye.style.imageRendering = "pixelated";
    eye.style.width = `${CLOSEUP_SIZE * scale}px`;
    eye.style.height = `${CLOSEUP_SIZE * scale}px`;
    const ctx = eye.getContext("2d");
    const openedAt = Date.now();
    let closedAt: number | null = null;
    let frameTimer: ReturnType<typeof setInterval> | null = null;
    const dispose = (): void => {
      if (frameTimer !== null) {
        clearInterval(frameTimer);
        frameTimer = null;
      }
      // V1 特写合上即恢复原音量(−4dB duck 反面);经 RenderApp 现读,
      // duck 内部重建的引擎实例永不陈旧(票 0031 项 2)。
      app.setCloseupDuck(false);
      overlay.remove();
      closeup = null;
    };
    const draw = (): void => {
      if (ctx === null) {
        dispose();
        return;
      }
      const open = Date.now() - openedAt;
      const closing = closedAt === null ? null : Date.now() - closedAt;
      const frame = renderCloseup(variant, {
        openElapsedMs: open,
        closeElapsedMs: closing,
        blinkFrame: Math.floor(open / CLOSEUP_BLINK_FRAME_MS),
        name: eyeName,
        pulseElapsedMs: open % CLOSEUP_PULSE_PERIOD_MS,
        pupilStage: pupilStageForGv(world.gv),
      });
      const image = ctx.createImageData(CLOSEUP_SIZE, CLOSEUP_SIZE);
      image.data.set(frame);
      ctx.putImageData(image, 0, 0);
      if (closing !== null && closing >= CLOSEUP_CLOSE_MS) {
        dispose();
      }
    };
    overlay.addEventListener("pointerdown", (event) => {
      event.stopPropagation();
      if (closedAt === null) {
        closedAt = Date.now();
      }
    });
    overlay.append(eye);
    root.append(overlay);
    closeup = { dispose };
    // V1 特写开屏:世界 BGM −4dB(经 RenderApp 的实时引擎句柄,票 0031 项 2)。
    app.setCloseupDuck(true);
    frameTimer = setInterval(draw, 33);
    draw();
  }

  /** Staring into the pupil is a stare; the ledger holds its weight. */
  function openPupilPanel(creatureId: string): void {
    // Every pupil stage now has a §6 variant (ticket 0037): the close-up is
    // the pupil view, full screen, for the whole ladder.
    openCloseup(creatureId);
    applyLedgerDelta({ kind: "stare", creatureId, durationMs: 0 });
    refresh();
  }

  // ---- 翻译流(票 0029,NARRATIVE-CORE-01 §6,ART-CORE-03 §6.3)---------------
  //
  // 前置:返祖体存活、被选中(双击凝视即选中)、对应刻符可见(N1 gating)。
  // 行进优先级最高:每个 tick 一步走向塔,无视它自己的行为;入 1-tile 缓冲区
  // 停步;ALERT 对视 3s(gaze_at_player 是世界 sprite 的 ALERT 面);借瞳
  // 打印(终端正典通道 70ms/字符,文本逐字取自 canon);打印完读走——已读
  // 集合入存档,永不回退。读者死亡不阻断:流程取消,进度保留,下一个返祖体
  // 从同一刻符重新开始。全程零 LLM:一次 client 调用都没有。

  interface TranslationFlow {
    readonly creatureId: CreatureId;
    readonly fragmentKey: string;
    phase: "walking" | "staring" | "printing";
    phaseAtTick: number;
    printDeadlineMs: number;
    /** 行进基准位(B-8,票 0055):流程所有读者位置;wander 的挪动被
     * 逐 tick 拉回此位,读塔行进每 tick 净进一格。 */
    basePos: TilePos;
  }
  let translationFlow: TranslationFlow | null = null;
  /** 待打印的正典文本,按序交给 main 层的 terminal.startCanonPrint。 */
  const canonPrintQueue: string[] = [];
  /** 借瞳叠层(打印期间);独立于 S0–S1 的 V1 特写,由流程开关。 */
  let borrowEye: { readonly dispose: () => void } | null = null;

  function closeBorrowEye(): void {
    if (borrowEye !== null) {
      borrowEye.dispose();
      borrowEye = null;
    }
  }

  /** 借瞳:3×4 刻符放大 4 倍成 12×16,落进返祖体的瞳孔——它在"誊写"。 */
  function openBorrowEye(fragmentKey: string): void {
    closeBorrowEye();
    const rows = glyphRowsFor(fragmentKey);
    if (rows === null) {
      return;
    }
    const overlay = doc.createElement("div");
    overlay.className = "gazer-borrow-eye";
    overlay.style.cssText =
      "position:fixed;inset:0;background:#000;display:flex;align-items:center;justify-content:center;z-index:60;pointer-events:none;";
    const eye = doc.createElement("canvas");
    eye.width = GLYPH_PUPIL_WIDTH;
    eye.height = GLYPH_PUPIL_HEIGHT;
    const scale = Math.max(1, Math.floor(Math.min(window.innerWidth, window.innerHeight) / GLYPH_PUPIL_HEIGHT));
    eye.style.imageRendering = "pixelated";
    eye.style.width = `${GLYPH_PUPIL_WIDTH * scale}px`;
    eye.style.height = `${GLYPH_PUPIL_HEIGHT * scale}px`;
    const ctx = eye.getContext("2d");
    if (ctx !== null) {
      const frame = borrowPupilFrame(rows);
      const image = ctx.createImageData(GLYPH_PUPIL_WIDTH, GLYPH_PUPIL_HEIGHT);
      image.data.set(frame);
      ctx.putImageData(image, 0, 0);
    }
    overlay.append(eye);
    root.append(overlay);
    borrowEye = { dispose: () => overlay.remove() };
  }

  /**
   * 翻译流入口:双击返祖体(凝视即选中)时触发。前置不满足一律安静地不做
   * ——没有流程,没有提示;刻符可见性由 gating 决定,不是由 UI 解释。
   */
  function beginTranslationFlow(creatureId: string): boolean {
    if (translationFlow !== null) {
      return false;
    }
    const creature = world.creatures[creatureId];
    if (creature === undefined || creature.behavior === "dead" || creature.atavistic !== true) {
      return false;
    }
    const fragmentKey = nextReadableFragment(world.gv, world.glyphsRead ?? []);
    if (fragmentKey === null) {
      return false;
    }
    const position = creature.position;
    const buffered =
      Math.max(Math.abs(position.x - TOWER_POSITION.x), Math.abs(position.y - TOWER_POSITION.y)) <= 1;
    translationFlow = {
      creatureId,
      fragmentKey,
      phase: buffered ? "staring" : "walking",
      phaseAtTick: world.tick,
      printDeadlineMs: 0,
      basePos: { ...position },
    };
    if (buffered) {
      app.playEffect({ kind: "gaze_at_player", creatureId, ms: RHYTHM.stareMs }, world);
    }
    noteAction(`${creatureId} walks to the tower to read ${fragmentKey}`);
    return true;
  }

  /** 每 tick 推进一步;行进优先级最高,先于一切其他世界推进副作用。 */
  function advanceTranslationFlow(): void {
    if (translationFlow === null) {
      return;
    }
    const flow = translationFlow;
    const creature = world.creatures[flow.creatureId];
    if (creature === undefined || creature.behavior === "dead") {
      // 防死锁:进度(glyphsRead)保留,下一个返祖体可从同一刻符开始。
      translationFlow = null;
      closeBorrowEye();
      return;
    }
    if (flow.phase === "walking") {
      // B-8(票 0055):行进从基准位推进,而非 wander 挪动后的位置——
      // wander 的步进被逐 tick 拉回基准位,净位移恒一格,死锁解除。
      const target = stepTowardBuffer(flow.basePos, TOWER_POSITION);
      if (target.x !== flow.basePos.x || target.y !== flow.basePos.y) {
        world = step(world, { kind: "move", creatureId: flow.creatureId, at: target });
        translationFlow = { ...flow, basePos: { ...target } };
        return;
      }
      // 入缓冲区:停步,ALERT 对视 3s(= 1 tick)。
      translationFlow = { ...flow, phase: "staring", phaseAtTick: world.tick };
      app.playEffect({ kind: "gaze_at_player", creatureId: flow.creatureId, ms: RHYTHM.stareMs }, world);
      return;
    }
    if (flow.phase === "staring") {
      if (world.tick - flow.phaseAtTick < 1) {
        return;
      }
      const text = canonLine(flow.fragmentKey);
      if (text === null) {
        translationFlow = null;
        return;
      }
      // F8 特例:打印前先出正典前置行(terminal.last_one,逐字 canon)。
      if (CANON_REGISTRY[flow.fragmentKey]?.lastReadOnly === true) {
        const lastOne = canonLine("terminal.last_one");
        if (lastOne !== null) {
          queueCanonPrint(lastOne);
        }
      }
      queueCanonPrint(text);
      openBorrowEye(flow.fragmentKey);
      translationFlow = {
        ...flow,
        phase: "printing",
        printDeadlineMs: Date.now() + canonPrintDurationMs(text),
      };
      return;
    }
    // printing:打印走墙钟(与 stare/特写同一墙钟惯例),sim 状态只在
    // tick 边界变更——打印完的那个 tick 才读走。
    if (Date.now() < flow.printDeadlineMs) {
      return;
    }
    const read = world.glyphsRead ?? [];
    if (!read.includes(flow.fragmentKey)) {
      world = { ...world, glyphsRead: [...read, flow.fragmentKey] };
    }
    const count = (world.glyphsRead ?? []).length;
    applyLedgerDelta({ kind: "glyph_read", creatureId: flow.creatureId, fragment: flow.fragmentKey, count });
    noteAction(`glyph_read ${count}/8`);
    closeBorrowEye();
    translationFlow = null;
  }

  canvas.addEventListener("pointerdown", (event: PointerEvent) => {
    event.preventDefault();
    // Hold the pointer on the canvas for its whole gesture: a modal panel that
    // opens under a held pointer (hatch choice, naming) would otherwise steal
    // the pointerup and leak the press. Synthetic pointers (the studio bridge)
    // have no capture target; the try keeps them working.
    try {
      canvas.setPointerCapture(event.pointerId);
    } catch {
      /* no live pointer with this id — nothing to capture */
    }
    const mayAct = pointers.press(event.pointerId);
    if (!mayAct) {
      // A second finger is a gesture, not a second verb: any feed still under
      // its guard is cancelled so two-thumb handling never double-feeds.
      cancelPendingFeed();
      return;
    }
    const now = Date.now();
    const hesitation = lastPointerMove === 0 ? 0 : now - lastPointerMove;
    pressHesitationMs = lastPointerMove === 0 ? null : hesitation;
    lastInteraction = now;
    rapidClicks = now - lastClickAt < RAPID_CLICK_WINDOW_MS ? rapidClicks + 1 : 1;
    lastClickAt = now;
    // E2 触发面的点击时间戳(GV30 后 30s 窗口 ≥5 次);定长防溢出。
    clickStamps.push(now);
    if (clickStamps.length > 64) {
      clickStamps.splice(0, clickStamps.length - 64);
    }
    telemetry.recordPointerDown({ hesitationMs: pressHesitationMs, rapidClicks });

    const tile = tileOf(event);
    const egg = world.eggs.find(
      (entry) => entry.at.x === tile.x && entry.at.y === tile.y,
    );
    if (egg !== undefined && event.button === 0) {
      openHatchChoice(egg.id);
      return;
    }

    // B-3(票 0055):邻近门内的个体才被拾取——远处个体不再被全图截走;
    // 塔身落点(footprint/缓冲区,无邻近个体)由此落到塔反馈分支。
    const target = nearestCreatureInReach(world, tile);
    if (target === null) {
      return;
    }

    if (event.button === 0) {
      dragTarget = target.id;
      dragStart = { x: event.offsetX, y: event.offsetY };
      moved = false;
      pressGranted = false;
      // Hold to pet, keep holding to name. Petting is the gentle verb; naming
      // is the one that claims ownership, so it costs a longer press.
      holdTimer = setTimeout(() => {
        if (moved) {
          return;
        }
        pressGranted = true;
        world = step(world, { kind: "pet", creatureId: target.id });
        refresh();
        holdTimer = setTimeout(() => {
          if (!moved) {
            pressGranted = true;
            askName(target.id);
          }
        }, RHYTHM.nameHoldMs);
      }, RHYTHM.petHoldMs);
    }
  });

  canvas.addEventListener("contextmenu", (event) => {
    event.preventDefault();
  });

  canvas.addEventListener("pointermove", (event: PointerEvent) => {
    if (dragTarget === null || dragStart === null) {
      return;
    }
    const dx = event.offsetX - dragStart.x;
    const dy = event.offsetY - dragStart.y;
    if (Math.abs(dx) + Math.abs(dy) > RHYTHM.dragThresholdPx) {
      moved = true;
      if (holdTimer !== null) {
        clearTimeout(holdTimer);
        holdTimer = null;
      }
    }
  });

  canvas.addEventListener("pointerup", (event: PointerEvent) => {
    const wasLastPointer = pointers.release(event.pointerId);
    if (holdTimer !== null) {
      clearTimeout(holdTimer);
      holdTimer = null;
    }
    const tile = tileOf(event);

    if (event.button === 2) {
      // Right-click clean is confirm-style too: it lands on release, not on
      // the press, and a stray multi-button lift cleans nothing.
      const target = nearestCreature(world, tile);
      if (target !== null && wasLastPointer) {
        performClean(target.id);
      }
      dragTarget = null;
      dragStart = null;
      return;
    }
    if (event.button !== 0) {
      return;
    }

    if (dragTarget !== null && moved) {
      const carried = dragTarget;
      world = step(world, { kind: "move", creatureId: carried, at: tile });
      // Being carried is a memory too.
      remember(
        carried,
        memoryFor(
          carried,
          `the player carried ${carried} to another place`,
          world.tick,
          -0.2,
        ),
      );
      noteAction(`the player carried ${carried}`);
      applyLedgerDelta({ kind: "carry", creatureId: carried });
      refresh();
      lastTap = null;
    } else if (dragTarget !== null && !moved && !pressGranted && wasLastPointer) {
      const released = dragTarget;
      if (cleanMode) {
        cleanMode = false;
        paintChrome();
        performClean(released);
      } else {
        const now = Date.now();
        const doubleTap =
          lastTap !== null &&
          now - lastTap.at <= RHYTHM.feedGuardMs &&
          lastTap.tile.x === tile.x &&
          lastTap.tile.y === tile.y;
        if (doubleTap) {
          // The second tap cancels the pending feed and stares into the pupil.
          cancelPendingFeed();
          lastTap = null;
          openPupilPanel(released);
          // 返祖体被选中:凝视即选择,翻译流从这里开始(票 0029)。前置不
          // 满足时 beginTranslationFlow 静默返回 false,凝视仍是凝视。
          beginTranslationFlow(released);
        } else {
          lastTap = { at: now, tile };
          const hesitationMs = pressHesitationMs ?? 0;
          cancelPendingFeed();
          pendingFeedTimer = setTimeout(() => {
            pendingFeedTimer = null;
            performFeed(released, hesitationMs);
          }, RHYTHM.feedGuardMs);
        }
      }
    } else {
      // A press that granted pet/name, or landed on nothing, feeds nothing.
      lastTap = null;
      // §6.2 点击塔(票 0043):落点在塔身一圈且无个体被抓取时,按 GV
      // 给出反馈(浮字形 / 终端问号转写);其余落点静默。
      maybeTowerFeedback(tile);
    }
    dragTarget = null;
    dragStart = null;
    pressGranted = false;
  });

  // A cancelled touch pointer (palm, gesture takeover) retracts its press.
  canvas.addEventListener("pointercancel", (event: PointerEvent) => {
    pointers.cancel(event.pointerId);
    if (holdTimer !== null) {
      clearTimeout(holdTimer);
      holdTimer = null;
    }
    dragTarget = null;
    dragStart = null;
    pressGranted = false;
  });

  function handleDeaths(before: Readonly<Record<CreatureId, CreatureState>>): void {
    for (const death of detectDeaths(before, world.creatures)) {
      world = step(world, {
        kind: "gv",
        delta: gvDeltaFor(
          { kind: "death", creatureId: death.creatureId, cause: death.cause },
          worldHour(world.tick),
          world.stage,
        ),
      });
      telemetry.recordDeath();
      noteAction(`${death.creatureId} died of ${death.cause}`);
      // The death has a body language of its own (playtest p2 finding §11):
      // a short corruption beat marks the moment, before the mourning circle
      // (stream F) does its slower work around the tile.
      app.playEffect({ kind: "glyph_corrupt", amount: 0.12 }, world);
      app.playEffect({ kind: "ui_shake", intensity: 0.18, ms: 160 }, world);
      // The corpse is an event, not a silence: whoever stood close enough
      // witnessed it, and the whisper pass carries the rest of the story.
      const corpse = world.creatures[death.creatureId];
      if (corpse === undefined) {
        continue;
      }
      for (const witness of Object.values(world.creatures)) {
        if (witness.id === death.creatureId || witness.behavior === "dead") {
          continue;
        }
        const distance = Math.max(
          Math.abs(witness.position.x - corpse.position.x),
          Math.abs(witness.position.y - corpse.position.y),
        );
        if (distance <= WHISPER_RANGE) {
          remember(
            witness.id,
            memoryFor(
              witness.id,
              `${death.creatureId} died of ${death.cause} at tick ${world.tick}`,
              world.tick,
              -1,
            ),
          );
        }
      }
    }
  }

  let silentLineShown = false;

  // ---- §6.2 点击塔的反馈(票 0043):随阶段演变,零 LLM。 ----

  /** GV50–59 的浮字叠层(3 枚 canon 字形,无翻译,2s 后消失)。 */
  let towerGlyphs: { readonly dispose: () => void } | null = null;

  function openTowerGlyphs(): void {
    if (towerGlyphs !== null) {
      return; // 2s 窗内不重入:反馈是节的,不是刷的。
    }
    const glyphs = canonGlyphs().slice(0, TOWER_GLYPH_COUNT);
    const anchor = towerAnchor();
    const rect = canvas.getBoundingClientRect();
    const scale = rect.width / LOGICAL_WIDTH;
    const overlay = doc.createElement("div");
    overlay.className = "gazer-tower-glyphs";
    overlay.style.cssText = "position:fixed;display:flex;gap:4px;z-index:30;pointer-events:none;";
    const width = GLYPH_PUPIL_WIDTH * 3 + 8;
    const height = GLYPH_PUPIL_HEIGHT;
    // 浮在塔顶上方:世界逻辑坐标 → 屏幕像素,确定性几何,无随机源。
    overlay.style.left = `${Math.round(rect.left + anchor.x * scale - (width * scale) / 2)}px`;
    overlay.style.top = `${Math.round(rect.top + (anchor.y - TOWER_FLOAT_ABOVE_PX) * scale - (height * scale) / 2)}px`;
    overlay.style.width = `${Math.round(width * scale)}px`;
    overlay.style.height = `${Math.round(height * scale)}px`;
    for (const glyph of glyphs) {
      const cell = doc.createElement("canvas");
      cell.width = GLYPH_PUPIL_WIDTH;
      cell.height = GLYPH_PUPIL_HEIGHT;
      cell.style.imageRendering = "pixelated";
      cell.style.width = "100%";
      cell.style.height = "100%";
      const ctx = cell.getContext("2d");
      if (ctx !== null) {
        const frame = borrowPupilFrame(glyph.rows);
        const image = ctx.createImageData(GLYPH_PUPIL_WIDTH, GLYPH_PUPIL_HEIGHT);
        image.data.set(frame);
        ctx.putImageData(image, 0, 0);
      }
      overlay.append(cell);
    }
    doc.body.append(overlay);
    towerGlyphs = { dispose: () => overlay.remove() };
    later(() => {
      towerGlyphs?.dispose();
      towerGlyphs = null;
    }, TOWER_GLYPH_FLOAT_MS);
  }

  /** 塔身在位的点击:落在 footprint 一圈(Chebyshev ≤1)才答话。 */
  function maybeTowerFeedback(tile: { x: number; y: number }): void {
    if (!world.structures.some((structure) => structure.kind === "black_tower")) {
      return;
    }
    if (
      Math.max(Math.abs(tile.x - TOWER_POSITION.x), Math.abs(tile.y - TOWER_POSITION.y)) > 1
    ) {
      return;
    }
    const feedback = towerClickFeedback(world.gv);
    if (feedback === "glyphs") {
      openTowerGlyphs();
    } else if (feedback === "terminal") {
      // §6.2 GV60+:字形以问号转写(canon 逐字,零字面副本;canon 键已批)。
      const echo = canonLine(TOWER_ECHO_KEY);
      if (echo !== null) {
        queueCanonPrint(echo);
      }
    }
  }

  function idleCheck(): void {
    const elapsed = Date.now() - lastInteraction;
    if (elapsed > IDLE_MS) {
      lastInteraction = Date.now();
      telemetry.recordInteraction();
      const stageBefore = world.stage;
      world = step(world, {
        kind: "gv",
        delta: gvDeltaFor({ kind: "idle", durationMs: elapsed }, worldHour(world.tick), world.stage),
      });
      // An idle tick can cross a stage boundary; the tower pre-beat must run.
      maybeAwaken();
      if (world.stage !== stageBefore) {
        onStageChange(stageBefore, world.stage);
      }
      if (speechPermitted() && world.stage >= 1 && livingOf(world).length > 0) {
        // C 遗忘后的 Silent Run 态延伸(票 0049):无人可说话,集体闭嘴,
        // 世界照跑——刻符逐日增加,塔照旧亮着它的黑。
        speakManual(world.stage, world.tick, "witnessed");
      }
    }
  }

  const timer = setInterval(() => {
    const beforeCreatures = world.creatures;
    const stageBefore = world.stage;
    world = canonicalizeGazerMasks(courtshipStep(step(world, { kind: "tick" })));
    // B-8(票 0055):翻译流行进/对视/打印期间,读者被 wander 挪动即拉回
    // 流程基准位——行进态屏蔽 wander 步进,演出优先级最高语义补全。
    if (translationFlow !== null) {
      const reader = world.creatures[translationFlow.creatureId];
      if (reader !== undefined && reader.behavior !== "dead") {
        const at = reader.position;
        const pin = translationFlow.basePos;
        if (at.x !== pin.x || at.y !== pin.y) {
          world = step(world, { kind: "move", creatureId: reader.id, at: pin });
        }
      }
    }
    handleDeaths(beforeCreatures);
    // T0@GV50(票 0043):GV 越线在任意途径发生(凝视/闲置/账目),生成
    // 在此统一收口——逐 tick 判定,确定性,首次满足即落。
    maybeSpawnTower();
    // A death's ledger weight can cross a stage boundary; the tower pre-beat
    // runs for that transition too.
    maybeAwaken();
    if (world.stage !== stageBefore) {
      onStageChange(stageBefore, world.stage);
    }
    // W3/W4 (ticket 0009): the shell performs on pure tick predicates —
    // midnight silence and the clock-drift lurch — through the existing
    // apply_effect channel. The wiring never mutates the world directly;
    // same ticks, same effects, so the show replays bit for bit.
    for (const effect of shellPerformanceAt(world.tick)) {
      world = step(world, { kind: "apply_effect", effect });
      app.playEffect(effect, world);
    }
    // 翻译流推进(票 0029):行进优先级最高——读塔者的移动覆盖它自己的
    // wander;gating、对视、打印与读走全部在此逐 tick 推进。零 LLM。
    advanceTranslationFlow();
    // 觉醒七件套的塔行进小流程(E4/E6)逐 tick 推进;执行器状态随 tick
    // 翻日/清取消闩。
    fxState = fxOnTick(fxState, world.tick, world.stage);
    advanceTowerWalk();
    // The pseudo-news broadcast (ticket 0010): template-pool copy, seeded,
    // released by game time through the same relabel_ui channel. Zero LLM.
    // The snapshot (ticket 0016 §3c) lets the HUD re-render the archived
    // broadcast in the reader's language on every locale switch.
    const news = newsEffectFor(world, locale);
    if (news !== null) {
      latestNews = {
        seed: world.seed,
        index: newsIndexAt(world.tick),
        values: newsValuesFor(world),
      };
      world = step(world, { kind: "apply_effect", effect: news });
      app.playEffect(news, world);
    }
    const whisper = whisperPass(world, memories, adjacency);
    adjacency = whisper.adjacency;
    Object.assign(memories, whisper.memories);
    // Sync the gossip results into world state as well (ticket 0006 ①).
    world = { ...world, memories: { ...memories } };
    if (world.tick % CONSOLIDATION_INTERVAL_TICKS === 0) {
      const consolidated = consolidationPass(world, memories);
      world = consolidated.world;
      Object.assign(memories, consolidated.memories);
    }
    if (silent && silentLineDue(world.tick, silentLineShown)) {
      silentLineShown = true;
      // The breach line is pool copy: it re-renders in the active locale.
      speak(collective, (active) => t(active, SILENT_RUN_LINE), "heard");
    }
    idleCheck();
    // 框体周期面(票 0036):自发消磁(GV≥60,种子+tick 确定性)与
    // GV20–40 失步(p≈1 次/小时,种子+小时定死)。未到 GV 门槛时时刻表照走。
    if (nextSpontDegauss < 0) {
      nextSpontDegauss = nextSpontaneousDegaussTick(world.seed, world.tick);
    }
    if (world.tick >= nextSpontDegauss) {
      nextSpontDegauss = nextSpontaneousDegaussTick(world.seed, world.tick + 1);
      if (world.gv >= SPONT_DEGAUSS_MIN_GV) {
        fireDegauss(true);
      }
    }
    const hour = Math.floor(world.tick / DESYNC_TICKS_PER_HOUR);
    if (
      desyncTickInHour(world.seed, hour) === world.tick &&
      world.gv >= DESYNC_MIN_GV &&
      world.gv <= DESYNC_MAX_GV
    ) {
      pendingDesync += 1;
    }
    // 结局评估(票 0049,地图 0048 默认判据):每个游戏日零点判一次,
    // GV≥100 前提,判据序 真>C>B>A;写入经 recordEnding(不可逆),A/B/C
    // 各一行播报(正典化待批,常量面)。C 遗忘后世界继续跑——本循环无
    // 任何停摆出口。
    const calendar = worldCalendarAt(world.tick);
    if (calendar.hour === 0 && calendar.day !== lastEndingCheckDay) {
      lastEndingCheckDay = calendar.day;
      const verdict = evaluateEnding(world);
      if (verdict !== null) {
        recordEnding(verdict);
        const line = verdict === "gaze" ? undefined : ENDING_BROADCAST_LINES[verdict];
        if (line !== undefined) {
          queueCanonPrint(line);
        }
      }
    }
    // 会话快照:强退暗线(§4)读这里;正常 destroy 会补 clean 标记。
    storageSet(FRAME_SESSION_STORAGE_KEY, JSON.stringify({ gv: Math.round(world.gv), clean: false }));
    refresh();
  }, TILE_MS);

  localeButton.addEventListener("click", () => {
    locale = nextLocale(locale);
    storageSet(LOCALE_STORAGE_KEY, locale);
    // The page metadata follows the reader too (playtest p3 finding 12).
    doc.documentElement.lang = locale === "zh" ? "zh-CN" : "en";
    dialogue.setTitle(locale);
    help.setLocale(locale);
    paintChrome();
    // Ticket 0016 §3: the whole transcript re-renders from the active locale,
    // the album refreshes, and refresh() pulls the HUD to the new face at once
    // (it used to lag one tick behind).
    if (spokenLines.length > 0) {
      dialogue.showLines(
        spokenLines.map((entry) => ({
          speaker: "collective",
          text: entry.render(locale),
          status: entry.status,
        })),
        locale,
      );
    } else {
      // Ticket 0015 §4: a silent run must re-render the empty-channel
      // placeholder in the new locale, not fall back to a blank body.
      dialogue.showLines([], locale);
    }
    if (!panel.hidden) {
      renderAlbum();
    }
    refresh();
  });

  function openPanel(node: HTMLElement): void {
    panel.replaceChildren(closeButton, node);
    panel.hidden = false;
    // The panel is a fixed overlay, so the canvas below it must be redrawn
    // rather than left to the compositor.
    refresh();
  }

  function askName(creatureId: string): void {
    const view = namePanel(doc, locale, (name) => {
      world = step(world, { kind: "name", creatureId, name });
      remember(
        creatureId,
        memoryFor(creatureId, `the player named me ${name}`, world.tick, 0.9),
      );
      noteAction(`the player named ${creatureId} ${name}`);
      telemetry.recordName(name);
      world = step(world, {
        kind: "gv",
        delta: gvDeltaFor({ kind: "name", creatureId, name }, worldHour(world.tick), world.stage),
      });
      maybeAwaken();
      view.destroy();
      panel.hidden = true;
      if (speechPermitted()) {
        // The naming reaction answers at every stage now (playtest p3 finding
        // 10): for the first ~30 minutes the old gate left a name with no
        // reply at all, which read as a bug.
        speak(collective, (active) => namingLine(name, active), "witnessed");
      }
      refresh();
    });
    openPanel(view.root);
    view.focus();
  }

  function openHatchChoice(eggId: string): void {
    const egg = world.eggs.find((entry) => entry.id === eggId);
    if (egg === undefined) {
      return;
    }
    const choices = [
      { value: "immediate" as const, label: COPY.panels.hatchImmediate, note: COPY.panels.hatchImmediateNote },
      { value: "warm" as const, label: COPY.panels.hatchWarm, note: COPY.panels.hatchWarmNote },
      { value: "still" as const, label: COPY.panels.hatchStill, note: COPY.panels.hatchStillNote },
      { value: "self" as const, label: COPY.panels.hatchSelf, note: COPY.panels.hatchSelfNote },
    ];
    const view = choicePanel<HatchChoice>(doc, locale, COPY.panels.hatchTitle, choices, (choice) => {
      // A id that already exists would make `hatchFromEgg` silently no-op and
      // strand the egg forever (playtest P1-F4): derive a free id, not a count.
      const id = nextCreatureId(world);
      world = step(world, {
        kind: "hatchFromEgg",
        eggId,
        creatureId: id,
        at: egg.at,
        species: "gazerling",
        choice,
      });
      // 返祖变异(票 0029,NARRATIVE-CORE-01 §1 防死锁):孵化掷点
      // p≈0.05,种子+tick+id 定死,同世界同结果。返祖体死亡后 breeding
      // 可再产,已读进度不回退。
      const roll = createRng(world.seed ^ world.tick, `atavistic:${id}`).next();
      if (isAtavisticRoll(roll)) {
        const hatched = world.creatures[id];
        if (hatched !== undefined) {
          world = {
            ...world,
            creatures: { ...world.creatures, [id]: { ...hatched, atavistic: true } },
          };
        }
      }
      // §7 特例个体(票 0037):双生魂与哀悼体,掷点与 0029 返祖同式——
      // 种子+tick+id 定死,同世界同结果。双生魂与最早孵化的未结魂在世
      // 同类结魂(id 序取首,确定性;返祖体不入魂),链接对称、永不回退。
      const twinRoll = createRng(world.seed ^ world.tick, `twin:${id}`).next();
      if (isTwinRoll(twinRoll)) {
        const newborn = world.creatures[id];
        const kin = Object.values(world.creatures)
          .filter(
            (other) =>
              other.id !== id &&
              other.species === "gazerling" &&
              other.behavior !== "dead" &&
              other.twinOf === undefined &&
              other.atavistic !== true,
          )
          .sort((a, b) => a.id.localeCompare(b.id))[0];
        if (newborn !== undefined && kin !== undefined) {
          world = {
            ...world,
            creatures: {
              ...world.creatures,
              [id]: { ...newborn, twinOf: kin.id },
              [kin.id]: { ...kin, twinOf: id },
            },
          };
        }
      }
      const griefRoll = createRng(world.seed ^ world.tick, `grief:${id}`).next();
      if (isGriefRoll(griefRoll)) {
        const hatched = world.creatures[id];
        if (hatched !== undefined) {
          world = {
            ...world,
            creatures: { ...world.creatures, [id]: { ...hatched, grief: true } },
          };
        }
      }
      world = step(world, {
        kind: "gv",
        delta: gvDeltaFor({ kind: "hatch", creatureId: id }, worldHour(world.tick), world.stage),
      });
      maybeAwaken();
      view.destroy();
      panel.hidden = true;
      if (speechPermitted()) {
        speakManual(world.stage, world.tick, "witnessed");
      }
      refresh();
    });
    openPanel(view.root);
  }

  /**
   * 纪念册(票 0011 壳層化):生物条目 + 世界纪念两段。纪念段是壳层数据
   * (决策 0001)——render 时刻从 (world, telemetry) 只读推导,不进
   * WorldState、不新增 sim 写入。
   */
  /**
   * 信任 = 记忆切片 working 槽的平均 valence(与 director/context.ts
   * impressionOf 同式;跨层不复用私有函数,就地同式实现,票 0015 §3)。
   */
  function albumImpression(slice: MemorySlice): number {
    if (slice.working.length === 0) {
      return 0;
    }
    const total = slice.working.reduce((sum, entry) => sum + entry.valence, 0);
    return total / slice.working.length;
  }

  function renderAlbum(): void {
    const rows: AlbumCreature[] = Object.values(world.creatures).map((creature) => {
      const slice = memories[creature.id] ?? emptySlice();
      return {
        id: creature.id,
        generation: creature.genome?.generation ?? 1,
        impression: albumImpression(slice),
        traits: creature.genome?.traits ?? {
          curiosity: 0.5,
          loyalty: 0.5,
          deceit: 0.1,
          clinging: 0.5,
          watchfulness: 0.5,
        },
        memory: slice,
      };
    });
    album.render(rows, worldMemorialFor(world, telemetry.getTelemetry()), locale);
  }

  function openAlbum(): void {
    renderAlbum();
    openPanel(album.root);
  }

  albumButton.addEventListener("click", openAlbum);

  // The lineage view (ticket 0004 §A): the tree is data-side pure assembly
  // (`familyTreeNodes`) fed to the D-stream panel; picking a node reuses the
  // bestiary for details instead of a second detail surface.
  treeButton.addEventListener("click", () => {
    const view = familyTreePanel(doc, locale, familyTreeNodes(world), () => openAlbum());
    openPanel(view.root);
  });

  helpButton.addEventListener("click", () => {
    openPanel(help.root);
  });

  closeButton.addEventListener("click", () => {
    panel.hidden = true;
    refresh();
  });

  // The clean key arms one tap: mobile gets the clean verb without a press
  // that feeds (§4-4). A tap on the key itself is not a tap on the canvas.
  cleanButton.addEventListener("click", () => {
    cleanMode = !cleanMode;
    paintChrome();
  });

  // Explicit verb keys (studio playtest feedback): the gesture verbs are
  // invisible to a new player, so the bar carries feed/pet directly. Both act
  // on the hungriest living creature — a deterministic, demo-friendly target.
  function hungriestAlive(): CreatureState | null {
    const alive = Object.values(world.creatures).filter((c) => c.behavior !== "dead");
    if (alive.length === 0) {
      return null;
    }
    return [...alive].sort((a, b) => a.stats.hunger - b.stats.hunger)[0] ?? null;
  }
  feedButton.addEventListener("click", () => {
    const target = hungriestAlive();
    if (target === null) return;
    performFeed(target.id, 0);
  });
  petButton.addEventListener("click", () => {
    const target = hungriestAlive();
    if (target === null) return;
    world = step(world, { kind: "pet", creatureId: target.id });
    refresh();
  });

  // A silent run emits no speech at all (R6.1): even the boot line stays
  // quiet, and the empty-channel placeholder is the only thing showing until
  // minute 40. Ticket 0015 §4: render that placeholder at boot — the dialogue
  // body used to sit blank (its content is async-filled, so it needs the
  // bilingual empty-script line from the start), in every run.
  dialogue.showLines([], locale);
  if (speechPermitted()) {
    speak(collective, (active) => t(active, COPY.hud.opening), "heard");
  }
  refresh();

  /**
   * dsh-game-studio self-test bridge (goal round: LLM-attached automated play).
   * The studio shell lives on a different origin, so state leaves via
   * postMessage and commands come back the same way. Opt-in with ?debug=1 and
   * only active inside an iframe. The synthetic events drive the exact same
   * listeners a real finger would — no game path is exposed that a player
   * could not also trigger.
   */
  function installStudioBridge(): void {
    const studioParent = window.parent;
    if (studioParent === null || studioParent === window) {
      return;
    }
    const post = (type: string, payload: unknown): void => {
      studioParent.postMessage({ source: "gazer", type, payload }, "*");
    };
    const stateNow = () => ({
      phase: "playing" as const,
      tick: world.tick,
      gv: Math.round(world.gv * 10) / 10,
      stage: world.stage,
      eggs: world.eggs.length,
      creatures: Object.values(world.creatures).map((creature) => {
        const at = tileCenter(creature.position);
        return {
          id: creature.id,
          x: at.x,
          y: at.y,
          hunger: creature.stats.hunger,
          hygiene: creature.stats.hygiene,
          happiness: creature.stats.happiness,
          energy: creature.stats.energy,
          behavior: creature.behavior,
        };
      }),
    });
    setInterval(() => post("state", stateNow()), 250);

    const clientPoint = (lx: number, ly: number): { x: number; y: number } => {
      const rect = canvas.getBoundingClientRect();
      return {
        x: rect.left + (lx / LOGICAL_WIDTH) * rect.width,
        y: rect.top + (ly / LOGICAL_HEIGHT) * rect.height,
      };
    };
    const pointer = (type: string, lx: number, ly: number, button = 0): void => {
      const at = clientPoint(lx, ly);
      canvas.dispatchEvent(
        new PointerEvent(type, {
          clientX: at.x,
          clientY: at.y,
          button,
          bubbles: true,
          pointerId: 7,
        }),
      );
    };
    window.addEventListener("message", (event: MessageEvent) => {
      const data = event.data as
        | { source?: string; type?: string; payload?: Record<string, unknown> }
        | null;
      if (data === null || data.source !== "gazer-selftest") {
        return;
      }
      const payload = (data.payload ?? {}) as Record<string, unknown>;
      const num = (key: string, fallback = 0): number =>
        typeof payload[key] === "number" ? (payload[key] as number) : fallback;
      switch (data.type) {
        case "tap": {
          // Quick tap (holdMs below petHoldMs): the pending-feed verb.
          const x = num("x");
          const y = num("y");
          pointer("pointerdown", x, y);
          setTimeout(() => pointer("pointerup", x, y), num("holdMs", 40));
          break;
        }
        case "hold": {
          // Press past petHoldMs (650) and release before nameHoldMs (900): a pet.
          const x = num("x");
          const y = num("y");
          pointer("pointerdown", x, y);
          setTimeout(() => pointer("pointerup", x, y), num("holdMs", 750));
          break;
        }
        case "doubleTap": {
          // Two taps inside feedGuardMs: the gaze into the pupil.
          const x = num("x");
          const y = num("y");
          pointer("pointerdown", x, y);
          setTimeout(() => pointer("pointerup", x, y), 40);
          setTimeout(() => pointer("pointerdown", x, y), 120);
          setTimeout(() => pointer("pointerup", x, y), 160);
          break;
        }
        case "drag": {
          // Carry: press, move past the drag threshold, release elsewhere.
          const x = num("x");
          const y = num("y");
          const toX = num("toX");
          const toY = num("toY");
          pointer("pointerdown", x, y);
          pointer("pointermove", (x + toX) / 2, (y + toY) / 2);
          pointer("pointermove", toX, toY);
          setTimeout(() => pointer("pointerup", toX, toY), 80);
          break;
        }
        case "tapRight": {
          // Right-click clean on a creature tile.
          const x = num("x");
          const y = num("y");
          pointer("pointerdown", x, y, 2);
          setTimeout(() => pointer("pointerup", x, y, 2), 60);
          break;
        }
        case "key": {
          const key = typeof payload.key === "string" ? payload.key : "";
          if (key.length > 0) {
            window.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
            window.dispatchEvent(new KeyboardEvent("keyup", { key, bubbles: true }));
          }
          break;
        }
      }
    });
    post("ready", { logical: { w: LOGICAL_WIDTH, h: LOGICAL_HEIGHT } });
  }

  // ponytail: a read-only debug handle, opt-in by URL. The e2e smoke needs to
  // know where an egg landed; remove if the demo stops using automated checks.
  const debugParam = new URLSearchParams(location.search).get("debug");
  if (debugParam === "1") {
    (window as unknown as { __gazer?: () => WorldState }).__gazer = () => world;
    installStudioBridge();
  }
  // B-1(票 0055):dev-only debug 写面 —— GV 跳转 / 已读集注入 / 箭头键
  // 微调,供联调与演示。生产构建零暴露:仅 dev 构建 + ?debug=1 同时成立
  // 才安装(`debugWriteFaceEnabled` 纯函数,可断言)。
  if (debugWriteFaceEnabled(import.meta.env.DEV, debugParam)) {
    const debugFace = {
      /** GV 跳转:越阈路径与真实泵一致(觉醒/舞台/塔门全走既有通道)。 */
      setGv(value: number): void {
        const before = world.stage;
        const target = Math.min(100, Math.max(0, Math.round(value)));
        world = step(world, { kind: "gv", delta: target - world.gv });
        maybeAwaken();
        if (world.stage !== before) {
          onStageChange(before, world.stage);
        }
        maybeSpawnTower();
        refresh();
      },
      /** 已读集注入:整体覆写(append-only 语义由调用方保证次序)。 */
      setGlyphsRead(keys: readonly string[]): void {
        world = { ...world, glyphsRead: [...keys] };
        refresh();
      },
      /** 单枚刻符追加(幂等)。 */
      addGlyph(key: string): void {
        const read = world.glyphsRead ?? [];
        if (!read.includes(key)) {
          world = { ...world, glyphsRead: [...read, key] };
        }
        refresh();
      },
    };
    (window as unknown as Record<string, unknown>).__gazerDebug = debugFace;
    // 箭头键 GV 微调(dev-only):↑ +5 / ↓ −5,确定性步进。
    window.addEventListener("keydown", (event: KeyboardEvent) => {
      if (event.key === "ArrowUp") {
        debugFace.setGv(Math.round(world.gv) + 5);
      } else if (event.key === "ArrowDown") {
        debugFace.setGv(Math.round(world.gv) - 5);
      }
    });
  }

  return {
    world: () => world,
    telemetry: () => telemetry.getTelemetry(),
    audio: () => app.audio,
    translationFlow: () => ({
      active: translationFlow !== null,
      phase: translationFlow?.phase ?? null,
      creatureId: translationFlow?.creatureId ?? null,
      fragmentKey: translationFlow?.fragmentKey ?? null,
      glyphsRead: world.glyphsRead ?? [],
    }),
    drainCanonPrints: () => {
      const drained = [...canonPrintQueue];
      canonPrintQueue.length = 0;
      return drained;
    },
    drainShellFx: () => {
      const drained = [...shellFxQueue];
      shellFxQueue.length = 0;
      return drained;
    },
    fxLedger: () => fxState.ledger,
    awakening: () => ({
      fired: [...awakening.fired],
      towerGazeCount: awakening.towerGazeLog.length,
      silenceHeld: silenceQuotaHeld(fxState, world.tick),
      silenceRefusalCount: fxState.ledger.filter((entry) => entry.type === "silence_quota").length,
      echoUsed: echoWindow?.used ?? false,
    }),
    nudgeOnSleepWake,
    powerPress: () => powerPress(),
    degaussPress: () => fireDegauss(false),
    recordEnding,
    biosMemoryK: () => currentBiosMemoryK(),
    biosFirstDayMs: () => biosRecord.firstDayMs,
    powerLog: () => [...powerLog],
    degaussLog: () => [...degaussLog],
    drainEchoes: () => {
      const drained = [...frameEchoQueue];
      frameEchoQueue.length = 0;
      return drained;
    },
    drainRecordingCues: () => {
      const drained = [...recordingQueue];
      recordingQueue.length = 0;
      return drained;
    },
    recordingActive: () => recordingWindow,
    recordingLog: () => [...recordingProvenance],
    drainTerminalTurns: () => {
      const drained = [...terminalTurnQueue];
      terminalTurnQueue.length = 0;
      return drained;
    },
    takeTerminalGhost: () => {
      const pending = terminalGhostPending;
      terminalGhostPending = false;
      return pending;
    },
    takeDesync: () => {
      if (pendingDesync <= 0) {
        return false;
      }
      pendingDesync -= 1;
      return true;
    },
    sessionCount: () => sessions,
    unexpectedShutdown: () => unexpectedShutdownFlag,
    drainFrameEvents: () => {
      const drained = [...frameEventQueue];
      frameEventQueue.length = 0;
      return drained;
    },
    bloomPoints: () => bloomPoints(),
    ngPlus: () => ngPlus,
    recordingUnlocked: () => isGazeTower(world.glyphsRead),
    destroy() {
      clearInterval(timer);
      cancelPlayback();
      cancelPendingFeed();
      // 正常退出补 clean 标记:强退暗线(§4)只在 unclean 会话后成立。
      storageSet(FRAME_SESSION_STORAGE_KEY, JSON.stringify({ gv: Math.round(world.gv), clean: true }));
      if (closeup !== null) {
        closeup.dispose();
      }
      closeBorrowEye();
      towerGlyphs?.dispose();
      towerGlyphs = null;
      for (const timerId of effectTimers) {
        clearTimeout(timerId);
      }
      app.destroy();
    },
  };
}
