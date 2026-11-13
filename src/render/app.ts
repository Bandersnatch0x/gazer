/**
 * The PixiJS bootstrap.
 *
 * This is the only file in the render layer that knows PixiJS exists. It owns
 * one `Application`, one fixed-camera stage, and the small amount of mutable
 * animation state that effects need. Everything testable lives in the sibling
 * pure modules.
 */

import { Application, BufferImageSource, Container, Graphics, Sprite, Text, Texture } from "pixi.js";
import type { CreatureId, WorldState } from "../sim/types";
import type { StainKind } from "../sim/social";
import { TWIN_PHASE_EPSILON_MS } from "../sim/genome";
import { createAudio } from "./audio";
import type { AudioEngine } from "./audio";
import type { CanvasInstruction, RenderHost, ShellHandler } from "./effects";
import { CLOSEUP_DUCK_DB, WINK_MS, apply, dbToGain, plan, winkFaceFor } from "./effects";
import type { RenderEffect } from "./effects";
import { TOWER_VOID_COLOR, applyPalettePollution, rotatePalette, skyAt } from "./palette";
import { PALETTE_POLLUTION_MAX_DEGREES, paletteAt } from "./palette";
import { TOWER_BODY_COLOR } from "./palette";
import type { Palette } from "./palette";
import { backSilhouette, renderGazerMask } from "./masks";
import type { CreatureDraw, EyePair, SceneObject, ScenePlan, ScreenPos } from "./scene";
import {
  LOGICAL_HEIGHT,
  LOGICAL_WIDTH,
  TILE_DEPTH,
  TILE_H,
  TILE_W,
  creatureDraws,
  gridTiles,
  integerScale,
  planStructure,
  scenePlan,
  unproject,
  witherTiles,
} from "./scene";
import type { PupilAnchor } from "./sprite";
import {
  MASK_SIZE,
  anchorBeatAt,
  canonicalMask,
  eggMask,
  hash01,
  microMaskFor,
  phaseOffsetMsFor,
  renderMask,
  resolvePupilAnchors,
  spriteKey,
  twinPartner,
} from "./sprite";
import {
  renderTower,
  renderTowerForEnding,
  towerAnchor,
  towerReadKey,
  towerShadowOffset,
  towerSpriteSize,
  towerStateForGv,
} from "./tower";
import type { TowerState } from "./tower";
import { isGazeTower } from "../sim/endings";
import type { TowerEnding } from "../sim/endings";

export interface RenderApp extends RenderHost {
  readonly canvas: HTMLCanvasElement;
  drawWorld(world: WorldState): void;
  playEffect(effect: RenderEffect, world: WorldState): void;
  /**
   * V1 特写 BGM −4dB (sprite-core ruling ③): the close-up call site asks the
   * host to duck the soundtrack while the pupil fills the screen. The duck is
   * a real master-gain change (−4 dB), rebuilt through the audio engine.
   */
  setCloseupDuck(active: boolean): void;
  /**
   * The world's own audio engine handle (ticket 0026's merge seam). It is a
   * live getter, not a captured instance: the close-up duck rebuilds the
   * engine underneath, so callers must read through it every time.
   */
  readonly audio: AudioEngine;
  destroy(): void;
}

/** Bubble lifetime; speech is atmosphere, not a log. */
const BUBBLE_MS = 4200;
const BUBBLE_RISE_PX = 10;
const SHAKE_FALLOFF_MS = 320;
/**
 * An 8x8 creature drawn at 3x reads as the biggest living thing on a tile:
 * the gaze has to be visible from across the room (GAME_REVIEW A2).
 */
const CREATURE_SCALE = 3;
const WINK_SCALE_X = 1.6;
/** Movement tween: ~4 frames at 60fps. Short enough to feel responsive,
 * long enough that a tile step reads as a walk, not a teleport (A1). */
const MOVE_TWEEN_MS = 66;
/**
 * The tower's shadow length in logical pixels. The tower's shadow points AT
 * the light (ART-CORE-03 §4, the misdirected shadow) at 100% alpha.
 */
const TOWER_SHADOW_LENGTH = 8;
/** Nested stroke rings for the vignette; each ring adds one alpha step. */
const VIGNETTE_RINGS = 6;
/**
 * C-04: the spec names no duration for the corruption, so the host holds a
 * default window — long enough to be seen, short enough to stay "temporary".
 */
const CORRUPT_MS = 4000;
/** C-07: the replay window is the keeper's last ten actions, one every ~260ms. */
const REPLAY_MAX = 10;
const REPLAY_STEP_MS = 260;
/** C-08: withering paints over the ground, it never replaces what is there. */
const WITHER_COLOR = 0x8a7d3a;
/** The audio engine's base master volume; the close-up duck scales it. */
const BASE_VOLUME = 0.16;

interface SpeechBubble {
  readonly container: Container;
  readonly text: Text;
  lifeMs: number;
}

interface Tween {
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  start: number;
}

/** A fading sprite ghost (C-10 afterimage). */
interface Afterimage {
  readonly sprite: Sprite;
  readonly born: number;
  readonly tailMs: number;
}

/**
 * Optional wiring for the host's animation clocks (ticket 0042). The
 * microframe loop and the 400ms anchor beat both read ONE injected clock, so
 * every creature shares a single phase source — no wall-clock scattering. The
 * default is the host's own monotonic render clock; the wiring may inject a
 * sim-tick-derived clock for replay-grade determinism.
 */
export interface RenderAppOptions {
  readonly clock?: () => number;
}

export async function createApp(canvas: HTMLCanvasElement, shell?: ShellHandler, options: RenderAppOptions = {}): Promise<RenderApp> {
  const app = new Application();
  await app.init({
    canvas,
    width: LOGICAL_WIDTH,
    height: LOGICAL_HEIGHT,
    background: "#0a0f0c",
    antialias: false,
    resolution: 1,
    autoDensity: false,
    roundPixels: true,
    preference: "webgl",
    // A fixed-size backing store plus an opaque CSS box keeps the compositor
    // from showing an uninitialised buffer when a fixed-position panel forces
    // a repaint.
    clearBeforeRender: true,
    // Without this, a compositor-driven repaint can show an uninitialised
    // rectangle where the canvas was not re-rendered. The scene is static
    // between draws, so keeping the buffer costs nothing and removes the
    // class of bug entirely.
    preserveDrawingBuffer: true,
  });

  const root = new Container();
  const tileLayer = new Graphics();
  const objectLayer = new Container();
  const overlayLayer = new Container();
  root.addChild(tileLayer, objectLayer, overlayLayer);
  app.stage.addChild(root);

  /** The world's own decay; `drawWorld` owns it. */
  let stateDecay = 0;
  /** Transient decay from render-only effects, on top of the world's. */
  let extraDecay = 0;
  let palette: Palette = paletteAt(0);
  let world: WorldState | null = null;
  let shakeUntil = 0;
  let shakeIntensity = 0;
  let frozenUntil = 0;
  /** C-01 pose: keep the current pose or freeze everyone in ALERT. */
  let freezePose: "keep" | "alert" = "keep";
  let glyphCorruption = 0;
  /** C-03a: the permanent hue pollution this session carries (≤45°, save-persistent via the executor). */
  let huePermanent = 0;
  /** C-03: the transient hue lean while a recoverable shift is mid-flight. */
  let hueTransient = 0;
  /** V1 close-up duck (sprite-core ruling ③): the soundtrack sits −4 dB low while held. */
  let closeupDuck = false;
  /**
   * The single animation clock (ticket 0042): microframes and the 400ms anchor
   * beat both read it, so every creature shares one phase source — no
   * wall-clock scattering. Injection point for a sim-tick-derived clock.
   */
  const clock = options.clock ?? ((): number => now());
  /** The anchor beat the cached anchors were computed on; −1 = never yet. */
  let anchorBeat = -1;
  let cachedAnchors: Map<CreatureId, PupilAnchor> | null = null;

  const glyphNoise = new Graphics();
  const vignette = new Graphics();
  const darkEyes = new Graphics();
  // Vignette under the noise, eyes above: the dark watches over the corruption.
  overlayLayer.addChild(vignette, darkEyes, glyphNoise);
  /** C-06's enclosure ring, above everything but the bubbles. */
  const gazeRing = new Graphics();
  /** C-07's replayed keeper actions. */
  const replayLayer = new Graphics();
  /** C-11's blackened lineage nodes. Persistent: the dead stay black. */
  const lineageLayer = new Graphics();
  /** C-10's fading tails live between the objects and the overlay. */
  const ghostLayer = new Container();
  overlayLayer.addChild(ghostLayer, gazeRing, replayLayer, lineageLayer);

  let audio: AudioEngine = createAudio();

  /**
   * The duck is a real master-gain change: the engine is rebuilt with its base
   * volume scaled by the −4 dB factor, then retuned to the world's act. The
   * next pointer press resumes the (possibly new) context, so nothing stays
   * stuck silent.
   */
  function rebuildAudio(): void {
    audio.dispose();
    audio = createAudio({ volume: BASE_VOLUME * dbToGain(closeupDuck ? CLOSEUP_DUCK_DB : 0) });
    if (world !== null) {
      audio.setStage(world.stage);
      audio.setSilent(world.silent);
    }
    audio.resume();
  }

  /** Per-creature movement tween state (A1). Render-only; sim never knows. */
  const tweens = new Map<CreatureId, Tween>();
  /** Last integer position actually drawn, per creature. */
  const rendered = new Map<CreatureId, ScreenPos>();
  /** The number of dark-eye pairs currently drawn, for the flicker. */
  let eyePairCount = 0;

  const textureCache = new Map<string, Texture>();
  const sprites = new Map<string, Sprite>();
  /** Grounding shadow per creature (ticket 0017 细腻度). */
  const shadows = new Map<string, Graphics>();
  const gazing = new Map<CreatureId, number>();
  /** creatureId -> the live wink: until when, and which face it wears. */
  const winking = new Map<CreatureId, { until: number; lids: boolean }>();
  const pulling = new Map<CreatureId, { strength: number; until: number }>();
  const bubbles: SpeechBubble[] = [];
  /** creatureId -> mirror window: until when it answers, and how many echoes are left. */
  const mirroring = new Map<CreatureId, { until: number; remaining: number }>();
  /** C-04: creatureId -> the corruption's mode and deadline. */
  const corrupting = new Map<CreatureId, { mode: "eye_only" | "full"; until: number }>();
  /** C-08: withered tiles, "x,y" — an overlay the world's own mood paints under. */
  const withered = new Set<string>();
  /** C-12: eggId -> the y it rests at; it jitters on the keeper's click rhythm. */
  const eggPulse = new Map<string, number>();
  /** C-07: the keeper's last ten presses, logical pixels, oldest first. */
  const replayClicks: ScreenPos[] = [];
  /** The keeper's last press as a tile, for C-08's `last_click`. */
  let lastClickTile: { x: number; y: number } | null = null;
  /** C-10: live afterimages. */
  const afterimages: Afterimage[] = [];
  /** C-11: blackened lineage nodes; each remembers where the tower leans it. */
  const lineageNodes: { at: ScreenPos; leanTo: ScreenPos | null }[] = [];
  /** C-06: until when the enclosure ring is drawn. */
  let gazeRingUntil = 0;
  let gazeRingCenter: ScreenPos = { x: LOGICAL_WIDTH / 2, y: LOGICAL_HEIGHT / 2 };
  /** E4 (ticket 0033): creatureId -> until when its body faces the tower. */
  const towerGazing = new Map<CreatureId, number>();
  /** C-07: when the current replay started and how many actions it remembers. */
  let replayStart = 0;
  let replayTotal = 0;
  /** C-12: until when the pulsed eggs quiver with the latest press. */
  let eggJitterUntil = 0;

  function now(): number {
    return performance.now();
  }

  function textureFor(mask: readonly string[], colors: readonly string[], canon = false): Texture {
    const key = `${canon ? "canon" : "scene"}:${spriteKey(mask, colors)}`;
    const cached = textureCache.get(key);
    if (cached !== undefined) {
      return cached;
    }
    const source = new BufferImageSource({
      // Canonical masks render through the seven-slot spec-exact table
      // (ticket 0025, sprite-core ruling ③); legacy masks keep the scene path.
      resource: canon ? renderGazerMask(mask, colors) : renderMask(mask, colors),
      width: MASK_SIZE,
      height: MASK_SIZE,
      format: "rgba8unorm",
      scaleMode: "nearest",
      alphaMode: "premultiply-alpha-on-upload",
    });
    const texture = new Texture({ source, label: key });
    textureCache.set(key, texture);
    return texture;
  }

  function disposeTexture(key: string): void {
    const texture = textureCache.get(key);
    if (texture !== undefined) {
      texture.destroy(true);
      textureCache.delete(key);
    }
  }

  /** Stain tint per kind (ticket 0006 §7): path dust, feed green, hoard amber, mourning ash. */
const STAIN_COLORS: Record<StainKind, number> = {
  wear: 0x6b5d4f,
  feed: 0x7fa35c,
  hoard: 0xc9a227,
  mourning: 0x8a7d94,
};

function drawTiles(tiles: ScenePlan["tiles"], seed: number): void {
    tileLayer.clear();
    for (const tile of tiles) {
      const { center } = tile;
      const fill = tile.light ? palette.tileLight : palette.tileDark;
      tileLayer
        .moveTo(center.x, center.y - TILE_DEPTH)
        .lineTo(center.x + TILE_W / 2, center.y)
        .lineTo(center.x, center.y + TILE_DEPTH)
        .lineTo(center.x - TILE_W / 2, center.y)
        .closePath()
        .fill({ color: fill })
        .stroke({ width: 1, color: palette.tileEdge, alpha: 0.5 });
      // Terrain traces (stream F, ticket 0006 §7, consumed by integration):
      // a soft stain inside the tile diamond. Mourning never fades, so it
      // reads slightly stronger at equal intensity.
      const stain = tile.stain;
      if (stain !== undefined) {
        const alpha =
          stain.kind === "mourning"
            ? 0.25 + 0.55 * stain.intensity
            : 0.1 + 0.45 * stain.intensity;
        tileLayer
          .ellipse(center.x, center.y, TILE_W / 2 - 2, TILE_DEPTH - 1)
          .fill({ color: STAIN_COLORS[stain.kind], alpha });
      }
      // Rotten pattern (A3): hashed 1px nibbles inside the diamond, density
      // driven by the tile's own corruption level. Deterministic per tile.
      if (tile.corrupt > 0) {
        const count = Math.max(1, Math.round(tile.corrupt * 6));
        for (let i = 0; i < count; i += 1) {
          const hx = Math.floor(hash01(tile.tile.x * 7 + i, tile.tile.y * 13, seed) * (TILE_W - 2)) - TILE_W / 2 + 1;
          const hy = Math.floor(hash01(tile.tile.x * 3, tile.tile.y * 17 + i, seed + i) * (TILE_H - 2)) - TILE_H / 2 + 1;
          // Keep the nibble inside the diamond: |dx|/halfW + |dy|/depth <= 1.
          if (Math.abs(hx) / (TILE_W / 2) + Math.abs(hy) / TILE_DEPTH > 1) {
            continue;
          }
          tileLayer.rect(center.x + hx, center.y + hy, 1, 1).fill({ color: palette.tileEdge, alpha: 0.9 });
        }
      }
      // C-08 map_wither: a withered-yellow overlay painted on top of whatever
      // the world's own mood put there — added to, never replacing (叠加不覆盖).
      if (withered.has(`${tile.tile.x},${tile.tile.y}`)) {
        tileLayer
          .ellipse(center.x, center.y, TILE_W / 2 - 2, TILE_DEPTH - 1)
          .fill({ color: WITHER_COLOR, alpha: 0.42 });
      }
    }
  }

  /**
   * The tower's texture: one frame per state (ART-CORE-03 §3.2 [R9]). The
   * three canonical tower colours are baked straight into the bytes by
   * `renderTower` — no tint, no bake palette — so the day cycle cannot touch
   * a single pixel of the tower layer (§4 light immunity).
   */
  function towerTextureFor(state: TowerState, readSet?: readonly string[]): Texture {
    const key = `tower:${state}:${towerReadKey(readSet)}`;
    const cached = textureCache.get(key);
    if (cached !== undefined) {
      return cached;
    }
    const size = towerSpriteSize(state);
    const source = new BufferImageSource({
      resource: renderTower(state, readSet),
      width: size.width,
      height: size.height,
      format: "rgba8unorm",
      scaleMode: "nearest",
      alphaMode: "premultiply-alpha-on-upload",
    });
    const texture = new Texture({ source, label: key });
    textureCache.set(key, texture);
    return texture;
  }

  /**
   * §7 结局塔面:四结局各一副贴图,从 world 状态逐 tick 派生。溶解进度按
   * tick 差进缓存键——每 tick 恰一帧,确定性,且缓存不泄漏。
   */
  function towerEndingTexture(
    state: TowerState,
    readSet: readonly string[] | undefined,
    ending: TowerEnding,
    endTick: number,
    nowTick: number,
  ): Texture {
    const progress = ending === "fusion" ? Math.max(0, Math.floor(nowTick) - Math.floor(endTick)) : 0;
    const key = `tower-ending:${state}:${towerReadKey(readSet)}:${ending}:${progress}`;
    const cached = textureCache.get(key);
    if (cached !== undefined) {
      return cached;
    }
    const size = towerSpriteSize(state);
    const source = new BufferImageSource({
      resource: renderTowerForEnding(state, readSet, ending, endTick, nowTick),
      width: size.width,
      height: size.height,
      format: "rgba8unorm",
      scaleMode: "nearest",
      alphaMode: "premultiply-alpha-on-upload",
    });
    const texture = new Texture({ source, label: key });
    textureCache.set(key, texture);
    return texture;
  }

  /**
   * The black tower (ART-CORE-03 §2/§3/§4/§7, tickets 0021/0029/0035). It
   * never animates: the state is a pure function of the world's GV, and each
   * state is one frame that appears at full height, instantly. It stands at
   * the canonical spot — the world's west edge on the north–south midline —
   * regardless of where sim's structure event recorded it (sim coordinates
   * are untouched; the render side takes its bearing from the frozen canon
   * constant). Its shadow points at the light, 100% alpha, pure tower_body:
   * the daily wrongness the spec asks for. Once an ending is archived — or
   * the fragments are 8/8 read — the tower answers with its §7 face.
   */
  function drawStructure(_object: Extract<SceneObject, { kind: "structure" }>): void {
    const state = towerStateForGv(world?.gv ?? 0);
    const size = towerSpriteSize(state);
    const readSet = world?.glyphsRead;
    const ending = world?.ending;
    const gaze = isGazeTower(readSet);
    // 已读刻符消色 (§6.3 读走,票 0029):存档里的已读集合直接上塔。
    const texture =
      ending !== undefined || gaze
        ? towerEndingTexture(
            state,
            readSet,
            ending?.kind ?? "gaze",
            ending?.atTick ?? world?.tick ?? 0,
            world?.tick ?? 0,
          )
        : towerTextureFor(state, readSet);
    const sprite = new Sprite({ texture });
    sprite.anchor.set(0.5, 1);
    const anchor = towerAnchor();
    sprite.position.set(anchor.x, anchor.y);
    const offset = towerShadowOffset(world?.tick ?? 0, TOWER_SHADOW_LENGTH);
    const shadow = new Graphics();
    shadow
      .ellipse(anchor.x + offset.x, anchor.y + offset.y, Math.round(size.width / 2) - 1, 2)
      .fill({ color: TOWER_BODY_COLOR, alpha: 1 });
    objectLayer.addChild(shadow, sprite);
  }

  /**
   * C-04: the corrupted palette. The pupil (and, on the legacy four-slot path,
   * the eye slot) borrows the tower black; everything else stays itself.
   */
  function corruptPaletteOf(object: CreatureDraw): readonly string[] {
    const base = object.canonPalette ?? object.palette;
    const next = [...base];
    const pupilSlot = object.canonPalette !== undefined ? 4 : 1;
    if (next[pupilSlot] !== undefined) {
      next[pupilSlot] = TOWER_VOID_COLOR;
    }
    return next;
  }

  function drawCreature(object: CreatureDraw): void {
    const key = `c:${object.id}`;
    let sprite = sprites.get(key);
    const time = now();
    // E4's canonical exception: while the body faces the tower, the viewer
    // sees the back silhouette — the pupil rules never engage (§6.4).
    const towerGazeUntil = towerGazing.get(object.id);
    const gazingTower = towerGazeUntil !== undefined && towerGazeUntil > time;
    if (towerGazeUntil !== undefined && !gazingTower) {
      towerGazing.delete(object.id);
    }
    const gaze = gazing.get(object.id);
    // C-01 pose=alert: a frozen world still wears its watching face.
    const frozenAlert = time < frozenUntil && freezePose === "alert";
    const watching =
      !gazingTower && object.frame !== "dead" && ((gaze !== undefined && gaze > time) || frozenAlert);
    // C-04: while corrupted, the pupils borrow the tower black; `full` pulls
    // the whole sprite down with them (the tint below).
    const corrupt = corrupting.get(object.id);
    const corrupted = corrupt !== undefined && corrupt.until > time;
    if (corrupt !== undefined && !corrupted) {
      corrupting.delete(object.id);
    }
    const colors = corrupted ? corruptPaletteOf(object) : (object.canonPalette ?? object.palette);
    // Microframes (ticket 0042): a canonical body alternates its authored A/B
    // grids on the shared clock. Twin souls breathe with the same offset (the
    // 0ms epsilon), the rest of the herd carries its own deterministic phase.
    // A watching (ALERT) face has no loop — stillness is the performance.
    const twin = world === null ? null : twinPartner(world, object.id);
    const phase = twin !== null ? TWIN_PHASE_EPSILON_MS : phaseOffsetMsFor(object.id);
    const microMask = watching
      ? null
      : microMaskFor(
          object.frame,
          object.canonPalette !== undefined,
          clock(),
          phase,
          object.pupilAnchor ?? "CENTER",
        );
    const sceneMask = watching ? object.alertMask : (microMask ?? object.mask);
    // Ticket 0047: the demagnetize linkage's 16ms blink closes both eyelids
    // through the masks closed-eye standing face; the ordinary 260ms wink
    // keeps the horizontal squeeze (the scale.x below).
    const winkState = winking.get(object.id);
    const winkActive = winkState !== undefined && winkState.until > time;
    if (winkState !== undefined && !winkActive) {
      winking.delete(object.id);
    }
    const lidsFace =
      winkActive === true && winkState.lids && object.canonPalette !== undefined
        ? canonicalMask("grief") // §7: the standing posture with SLEEP's shut line
        : null;
    const faceMask = gazingTower
      ? backSilhouette(lidsFace ?? sceneMask)
      : (lidsFace ?? sceneMask);
    const texture = textureFor(
      faceMask,
      colors,
      object.canonPalette !== undefined,
    );
    // The shadow is created before the sprite so it always paints beneath it.
    let shadow = shadows.get(key);
    if (shadow === undefined) {
      shadow = new Graphics();
      shadow.ellipse(0, 2, 5, 1.5).fill({ color: palette.tileEdge, alpha: 0.35 });
      shadows.set(key, shadow);
      objectLayer.addChild(shadow);
    }
    if (sprite === undefined) {
      sprite = new Sprite({ texture });
      sprite.anchor.set(0.5, 1);
      sprite.scale.set(CREATURE_SCALE);
      sprites.set(key, sprite);
      objectLayer.addChild(sprite);
    } else {
      sprite.texture = texture;
    }
    // A slow vertical bob, phase-offset per creature, so a settled scene still
    // reads as alive. It is visual only: the simulation's tile never moves.
    const bob =
      object.frame === "dead"
        ? 0
        : Math.round(Math.sin(time / 620 + object.center.x) * 1.5);

    // Movement tween (A1): when the sim's tile changes, the sprite glides to
    // the new centre over MOVE_TWEEN_MS instead of teleporting. Interrupted
    // tweens restart from wherever the sprite actually is. Dead things do
    // not walk. All intermediate positions are rounded: integers always.
    const last = rendered.get(object.id);
    let move = tweens.get(object.id);
    if (object.frame !== "dead" && (last !== undefined || move !== undefined)) {
      const target = object.center;
      if (move !== undefined && (move.toX !== target.x || move.toY !== target.y)) {
        // A newer target landed mid-glide: retarget from the current point.
        const p = Math.min(1, Math.max(0, (time - move.start) / MOVE_TWEEN_MS));
        move = {
          fromX: Math.round(move.fromX + (move.toX - move.fromX) * p),
          fromY: Math.round(move.fromY + (move.toY - move.fromY) * p),
          toX: target.x,
          toY: target.y,
          start: time,
        };
        tweens.set(object.id, move);
      } else if (move === undefined && last !== undefined && (last.x !== target.x || last.y !== target.y)) {
        move = { fromX: last.x, fromY: last.y, toX: target.x, toY: target.y, start: time };
        tweens.set(object.id, move);
      }
    }

    let x = object.center.x;
    let y = object.center.y;
    if (move !== undefined) {
      const p = Math.min(1, Math.max(0, (time - move.start) / MOVE_TWEEN_MS));
      x = Math.round(move.fromX + (move.toX - move.fromX) * p);
      y = Math.round(move.fromY + (move.toY - move.fromY) * p);
      if (p >= 1) {
        tweens.delete(object.id);
        rendered.set(object.id, { x: move.toX, y: move.toY });
      } else {
        rendered.set(object.id, { x, y });
      }
    } else {
      rendered.set(object.id, { x, y });
    }

    const pull = pulling.get(object.id);
    if (pull !== undefined && time < pull.until) {
      const t = (pull.until - time) / 900;
      sprite.position.set(
        x + (pointerX - x) * pull.strength * t * 0.12,
        y + (pointerY - y) * pull.strength * t * 0.12 + bob,
      );
    } else {
      pulling.delete(object.id);
      // A corpse keeps lying where it fell (playtest p2 finding §11): no bob,
      // and a grey tint — the room reads "something stopped here".
      sprite.position.set(x, object.frame === "dead" ? y : y + bob);
    }
    if (shadow !== undefined) {
      shadow.position.set(x, y + 2);
      shadow.alpha = object.frame === "dead" ? 0.5 : 0.35;
      shadow.scale.set(object.frame === "dead" ? 0.9 : 1);
    }
    sprite.tint =
      corrupted && corrupt?.mode === "full"
        ? 0x39414f
        : watching
          ? 0xd8ffe8
          : object.frame === "dead"
            ? 0x8a938c
            : 0xffffff;
    const wink = winking.get(object.id);
    const winkSqueezing = wink !== undefined && wink.until > time && !wink.lids;
    sprite.scale.x = winkSqueezing ? WINK_SCALE_X : CREATURE_SCALE;
  }

  /**
   * The cursor→anchor line (sprite-core ruling ③ + ticket 0042): the anchors
   * are re-evaluated once per 400ms beat on the shared clock — never per
   * frame — so the pupil steps hold the mechanical beat of §3 and the
   * per-frame jitter is gone. Twin souls mirror and the GV90 tower-side
   * CENTER exception live inside `resolvePupilAnchors`.
   */
  function cursorAnchors(w: WorldState): Map<CreatureId, PupilAnchor> {
    const beat = anchorBeatAt(clock());
    if (cachedAnchors !== null && beat === anchorBeat) {
      return cachedAnchors;
    }
    anchorBeat = beat;
    cachedAnchors = resolvePupilAnchors(w, unproject({ x: pointerX, y: pointerY }));
    return cachedAnchors;
  }

  function rebuildScene(): ScenePlan | null {
    if (world === null) {
      return null;
    }
    const decay = Math.min(1, Math.max(0, stateDecay + extraDecay));
    const scene: ScenePlan = scenePlan(world, decay, undefined, cursorAnchors(world));
    // C-03a's pollution sits permanently under C-03's transient lean. Both are
    // pure functions of the degrees, so a replayed session paints identically.
    palette = rotatePalette(applyPalettePollution(scene.palette, huePermanent), hueTransient);
    drawTiles(scene.tiles, world.seed);
    for (const child of objectLayer.removeChildren()) {
      child.destroy({ children: true });
    }
    sprites.clear();
    shadows.clear();
    // Eggs that left the world stop pulsing.
    for (const id of [...eggPulse.keys()]) {
      if (!world.eggs.some((egg) => egg.id === id)) {
        eggPulse.delete(id);
      }
    }
    for (const object of scene.objects) {
      if (object.kind === "structure") {
        drawStructure(object);
      } else if (object.kind === "egg") {
        drawEgg(object);
      } else {
        drawCreature(object);
      }
    }
    // Stage dressing (A3): vignette rings and the dark's extra eyes.
    drawVignette(scene.vignette);
    drawDarkEyes(scene.eyePairs);
    // Day/night (A7) plus the season's lean: the sky is never the same twice.
    app.renderer.background.color = skyAt(world.tick, decay, scene.season);
    // Sprites are recreated above; redraw is enough because the camera is fixed.
    return scene;
  }

  /**
   * The egg, drawn as a pixel sprite directly every creature (playtest: the
   * vector-ellipse egg turned to mud under integer upscaling). A grounding
   * shadow ellipse keeps it sitting on the tile. Forced eggs wear the
   * eggForced shell.
   */
  function drawEgg(object: Extract<SceneObject, { kind: "egg" }>): void {
    const key = `e:${object.id}`;
    let sprite = sprites.get(key);
    if (sprite === undefined) {
      const shell = object.forced ? palette.eggForced : palette.egg;
      const colors = [shell, shell, palette.text, palette.tileEdge];
      sprite = new Sprite({ texture: textureFor(eggMask(), colors) });
      sprite.anchor.set(0.5, 1);
      sprite.scale.set(2);
      sprites.set(key, sprite);
      const shadow = new Graphics();
      shadow.ellipse(object.center.x, object.center.y + 2, 4, 1.5).fill({ color: palette.tileEdge, alpha: 0.4 });
      objectLayer.addChild(shadow, sprite);
      sprite.position.set(object.center.x, object.center.y + 2);
    }
  }

  function drawVignette(strength: number): void {
    vignette.clear();
    if (strength <= 0) {
      return;
    }
    for (let i = 0; i < VIGNETTE_RINGS; i += 1) {
      vignette
        .rect(i, i, LOGICAL_WIDTH - i * 2, LOGICAL_HEIGHT - i * 2)
        .stroke({ width: 1, color: "#000000", alpha: strength });
    }
  }

  function drawDarkEyes(pairs: readonly EyePair[]): void {
    darkEyes.clear();
    eyePairCount = pairs.length;
    for (const pair of pairs) {
      darkEyes
        .rect(pair.a.x, pair.a.y, 2, 2)
        .rect(pair.b.x, pair.b.y, 2, 2)
        .fill({ color: palette.creature[1], alpha: 0.85 });
    }
  }

  function syncCreatures(): void {
    if (world === null) {
      return;
    }
    for (const creature of creatureDraws(world, palette, cursorAnchors(world))) {
      drawCreature(creature);
    }
  }

  /** C-11: the blackened lineage nodes, with their lean toward the tower. */
  function redrawLineage(): void {
    lineageLayer.clear();
    for (const node of lineageNodes) {
      lineageLayer.rect(node.at.x - 1, node.at.y - 5, 2, 2).fill({ color: 0x000000, alpha: 0.95 });
      if (node.leanTo !== null) {
        lineageLayer
          .moveTo(node.at.x, node.at.y - 4)
          .lineTo(node.leanTo.x, node.leanTo.y - 8)
          .stroke({ width: 1, color: TOWER_VOID_COLOR, alpha: 0.45 });
      }
    }
  }

  function drawBubble(anchor: ScreenPos, text: string, mood: string): void {
    const container = new Container();
    const label = new Text({
      text,
      resolution: 3,
      style: {
        fill: palette.text,
        fontSize: 7,
        fontFamily: "monospace",
        wordWrap: true,
        wordWrapWidth: 96,
        lineHeight: 9,
      },
    });
    const padX = 3;
    const padY = 2;
    const box = new Graphics();
    box
      .roundRect(0, 0, label.width + padX * 2, label.height + padY * 2, 2)
      .fill({ color: palette.bubble, alpha: 0.92 })
      .stroke({ width: 1, color: mood === "wrong" ? palette.wrong : palette.tileEdge });
    label.position.set(padX, padY);
    container.addChild(box, label);
    container.position.set(
      Math.round(Math.min(LOGICAL_WIDTH - label.width - 8, Math.max(4, anchor.x - label.width / 2))),
      Math.round(Math.max(2, anchor.y - label.height - 16)),
    );
    overlayLayer.addChild(container);
    bubbles.push({ container, text: label, lifeMs: BUBBLE_MS });
  }

  function applyCanvas(instruction: CanvasInstruction): void {
    switch (instruction.type) {
      case "freeze":
        frozenUntil = now() + instruction.ms;
        freezePose = instruction.pose;
        return;
      case "gaze":
        gazing.set(instruction.creatureId, now() + instruction.ms);
        audio.blip("gaze");
        return;
      case "mirror_click_rhythm":
        // C-02: the mirror answers exactly `repeatN` presses within its window.
        mirroring.set(instruction.creatureId, {
          until: now() + instruction.durationMs,
          remaining: instruction.repeatN,
        });
        return;
      case "palette_shift": {
        const started = now();
        if (instruction.hueRot !== 0) {
          // C-03: a signed hue lean out and back — the world recovers.
          const step = (): void => {
            const t = Math.min(1, (now() - started) / Math.max(1, instruction.ms));
            hueTransient = instruction.hueRot * Math.sin(t * Math.PI);
            rebuildScene();
            if (t < 1) {
              requestAnimationFrame(step);
            } else {
              hueTransient = 0;
              rebuildScene();
            }
          };
          step();
          return;
        }
        // A transient lean: out to `amount` and back to where the world was.
        const from = extraDecay;
        const step = (): void => {
          const elapsed = now() - started;
          const t = Math.min(1, elapsed / Math.max(1, instruction.ms));
          const lean = Math.sin(t * Math.PI);
          extraDecay = from + instruction.amount * lean;
          rebuildScene();
          if (t < 1) {
            requestAnimationFrame(step);
          } else {
            extraDecay = from;
            rebuildScene();
          }
        };
        step();
        return;
      }
      case "palette_pollution":
        // C-03a: the degrees stay. The executor hard-counted them; the canvas
        // clamps again at 45 so a bad wiring can never paint past the ceiling.
        huePermanent = Math.min(PALETTE_POLLUTION_MAX_DEGREES, huePermanent + instruction.degrees);
        rebuildScene();
        return;
      case "desaturate":
        // The engine folds `desaturate` into `WorldState.paletteDecay`, and
        // `drawWorld` is authoritative for decay. Redraw so the change is
        // visible even if the caller has not drawn the new state yet.
        rebuildScene();
        return;
      case "audio":
        // The audio subsystem exists now: the dropped track retunes the
        // oscillator voice; the canvas has nothing to draw.
        audio.dropTrack(instruction.track);
        return;
      case "spawn_structure":
        // Draw it now so the effect is visible before the next `drawWorld`.
        // A rebuild replaces it with the world's own copy, so it never doubles.
        drawStructure(
          planStructure(
            { kind: instruction.structure, at: instruction.at, createdBy: "director" },
            world?.stage ?? 0,
          ),
        );
        return;
      case "relabel":
      case "set_trait":
        // Both are world mutations; the next `drawWorld` picks them up.
        return;
      case "rewrite_sprite": {
        const key = `c:${instruction.creatureId}`;
        const sprite = sprites.get(key);
        if (sprite !== undefined) {
          sprite.texture = textureFor(instruction.mask, instruction.palette);
        }
        return;
      }
      case "glyph_corrupt":
        glyphCorruption = Math.max(glyphCorruption, instruction.amount);
        return;
      case "speech": {
        for (const anchor of instruction.anchors) {
          if (anchor.at !== null) {
            drawBubble(anchor.at, instruction.text, instruction.mood);
          }
        }
        return;
      }
      case "shake":
        shakeIntensity = instruction.intensity;
        shakeUntil = now() + instruction.ms;
        audio.blip("shake");
        return;
      case "wink": {
        // Ticket 0047: the duration picks the face — 16ms (the demagnetize
        // linkage) closes both eyelids; everything else squeezes 260ms.
        const face = winkFaceFor(instruction.ms);
        winking.set(instruction.creatureId, {
          until: now() + instruction.ms,
          lids: face === "lids",
        });
        audio.blip("wink");
        return;
      }
      case "cursor_pull": {
        if (instruction.from !== null) {
          pulling.set(instruction.creatureId, {
            strength: instruction.strength,
            until: now() + 900,
          });
        }
        return;
      }
      // --- Ticket 0025: canvas-layer FX instructions (FX-LIB-01a) ---
      case "sprite_corrupt": {
        const until = now() + CORRUPT_MS;
        for (const id of instruction.creatureIds) {
          corrupting.set(id, { mode: instruction.mode, until });
        }
        syncCreatures();
        return;
      }
      case "collective_gaze": {
        // C-06: everyone to the ring — ALERT faces, centred pupils, one
        // enclosure drawn around the herd.
        const until = now() + instruction.ms;
        for (const id of instruction.creatureIds) {
          gazing.set(id, until);
        }
        gazeRingUntil = until;
        gazeRingCenter = instruction.center;
        syncCreatures();
        audio.blip("gaze");
        return;
      }
      case "replay_player_action": {
        // C-07: the keeper's last presses replay, fainter than memory; the
        // fidelity decides how much of the window it remembers.
        replayStart = now();
        replayTotal = Math.min(REPLAY_MAX, Math.round(instruction.fidelity * REPLAY_MAX));
        return;
      }
      case "map_wither": {
        const site = lastClickTile;
        const tiles =
          instruction.tiles.length > 0
            ? instruction.tiles
            : site === null
              ? []
              : witherTiles(site, instruction.radius);
        for (const tile of tiles) {
          withered.add(`${tile.x},${tile.y}`);
        }
        if (tiles.length > 0) {
          rebuildScene();
        }
        return;
      }
      case "afterimage": {
        if (instruction.at === null) {
          return;
        }
        const source = sprites.get(`c:${instruction.creatureId}`);
        if (source === undefined) {
          return;
        }
        const ghost = new Sprite({ texture: source.texture });
        ghost.anchor.set(0.5, 1);
        ghost.scale.set(CREATURE_SCALE);
        ghost.position.set(instruction.at.x, instruction.at.y);
        ghost.alpha = 0.35;
        ghostLayer.addChild(ghost);
        afterimages.push({ sprite: ghost, born: now(), tailMs: instruction.tailMs });
        return;
      }
      case "lineage_blacken": {
        for (const node of instruction.nodes) {
          if (node.at !== null) {
            lineageNodes.push({ at: node.at, leanTo: instruction.leanTo });
          }
        }
        redrawLineage();
        return;
      }
      case "egg_pulse": {
        if (instruction.at !== null) {
          eggPulse.set(instruction.eggId, instruction.at.y + 2);
        }
        return;
      }
      case "gaze_at_tower": {
        // E4 (ticket 0033): the body turns to the tower for `ms`; the canvas
        // shows the back silhouette, so the pupil rules never engage (§6.4).
        // The gaze at the PLAYER after the turn stays the wiring's business.
        if (instruction.at !== null) {
          towerGazing.set(instruction.creatureId, now() + instruction.ms);
          syncCreatures();
        }
        return;
      }
    }
  }

  app.ticker.add(() => {
    const time = now();

    // Camera shake: the whole fixed-camera stage jitters, never the tiles' order.
    if (time < shakeUntil) {
      const fade = Math.min(1, (shakeUntil - time) / SHAKE_FALLOFF_MS);
      const amount = shakeIntensity * fade * 3;
      root.position.set(
        Math.round((Math.random() * 2 - 1) * amount),
        Math.round((Math.random() * 2 - 1) * amount),
      );
    } else if (root.position.x !== 0 || root.position.y !== 0) {
      root.position.set(0, 0);
    }

    if (time >= frozenUntil) {
      syncCreatures();
    }

    // The dark's eyes flicker; the tower never does (R9: it does not animate).
    if (eyePairCount > 0) {
      darkEyes.alpha = 0.55 + 0.35 * Math.sin(time / 900) * Math.sin(time / 1730);
    }

    // C-06: the enclosure ring breathes while the herd watches.
    gazeRing.clear();
    if (time < gazeRingUntil && time >= frozenUntil) {
      gazeRing
        .ellipse(gazeRingCenter.x, gazeRingCenter.y, 46, 26)
        .stroke({ width: 1, color: palette.text, alpha: 0.25 + 0.15 * Math.sin(time / 220) });
    }

    // C-10: the tails fade on their own clock.
    for (let i = afterimages.length - 1; i >= 0; i -= 1) {
      const image = afterimages[i];
      if (image === undefined) {
        continue;
      }
      const age = time - image.born;
      if (age >= image.tailMs) {
        image.sprite.destroy({ children: true });
        afterimages.splice(i, 1);
        continue;
      }
      image.sprite.alpha = 0.35 * (1 - age / image.tailMs);
    }

    // C-07: the keeper's own actions replay, one every beat, fainter than memory.
    replayLayer.clear();
    if (replayTotal > 0) {
      const elapsed = time - replayStart;
      const count = Math.min(replayTotal, replayClicks.length);
      for (let i = 0; i < count; i += 1) {
        const age = elapsed - i * REPLAY_STEP_MS;
        if (age < 0 || age > REPLAY_STEP_MS) {
          continue;
        }
        const click = replayClicks[i];
        if (click !== undefined) {
          replayLayer
            .circle(click.x, click.y, 3)
            .stroke({ width: 1, color: palette.text, alpha: 0.4 * (1 - age / REPLAY_STEP_MS) });
        }
      }
      if (elapsed > (replayTotal + 1) * REPLAY_STEP_MS) {
        replayTotal = 0;
      }
    }

    // C-12: pulsed eggs quiver with the keeper's rhythm — unless frozen.
    for (const [id, base] of eggPulse) {
      const egg = sprites.get(`e:${id}`);
      if (egg === undefined) {
        continue;
      }
      egg.y = time < eggJitterUntil && time >= frozenUntil ? base + (Math.sin(time / 70) > 0 ? 1 : -1) : base;
    }

    // Glyph corruption: sparse one-pixel noise, fading as it ages.
    glyphCorruption = Math.max(0, glyphCorruption - app.ticker.deltaMS / 8000);
    glyphNoise.clear();
    if (glyphCorruption > 0) {
      const count = Math.round(glyphCorruption * 60);
      for (let i = 0; i < count; i += 1) {
        glyphNoise
          .rect(Math.floor(Math.random() * LOGICAL_WIDTH), Math.floor(Math.random() * LOGICAL_HEIGHT), 1, 1)
          .fill({ color: palette.text, alpha: 0.35 });
      }
    }

    // Speech bubbles expire, unless the world is frozen.
    for (let i = bubbles.length - 1; i >= 0; i -= 1) {
      const bubble = bubbles[i];
      if (bubble === undefined) {
        continue;
      }
      if (time < frozenUntil) {
        continue;
      }
      bubble.lifeMs -= app.ticker.deltaMS;
      const progress = 1 - bubble.lifeMs / BUBBLE_MS;
      bubble.container.alpha = Math.min(1, Math.max(0, bubble.lifeMs / 600));
      bubble.container.position.y -= (BUBBLE_RISE_PX / BUBBLE_MS) * app.ticker.deltaMS * progress;
      if (bubble.lifeMs <= 0) {
        bubble.container.destroy({ children: true });
        bubbles.splice(i, 1);
      }
    }
  });

  // Pointer position in logical pixels, used by `cursor_pull`.
  let pointerX = LOGICAL_WIDTH / 2;
  let pointerY = LOGICAL_HEIGHT / 2;

  function onPointerMove(event: PointerEvent): void {
    const rect = canvas.getBoundingClientRect();
    pointerX = ((event.clientX - rect.left) / Math.max(1, rect.width)) * LOGICAL_WIDTH;
    pointerY = ((event.clientY - rect.top) / Math.max(1, rect.height)) * LOGICAL_HEIGHT;
  }

  // A creature under `mirror_click_rhythm` answers each click in kind — now
  // exactly `repeatN` of them (C-02). The same gesture unlocks WebAudio:
  // contexts start suspended until the player has interacted, and this is the
  // interaction. The press is also the replay source (C-07) and the eggs'
  // rhythm (C-12).
  function onPointerDown(): void {
    audio.resume();
    const time = now();
    replayClicks.push({ x: pointerX, y: pointerY });
    if (replayClicks.length > REPLAY_MAX) {
      replayClicks.shift();
    }
    lastClickTile = unproject({ x: pointerX, y: pointerY });
    if (eggPulse.size > 0) {
      eggJitterUntil = time + 400;
    }
    for (const [id, mirror] of mirroring) {
      if (time >= mirror.until) {
        mirroring.delete(id);
        continue;
      }
      if (mirror.remaining > 0) {
        // The mirror answers with the ordinary squeeze face (never the lids).
        winking.set(id, { until: time + WINK_MS, lids: false });
        mirror.remaining -= 1;
        if (mirror.remaining <= 0) {
          mirroring.delete(id);
        }
      }
    }
  }

  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerdown", onPointerDown);

  // Integer scaling: the canvas keeps its logical size, CSS scales by whole steps.
  function resize(): void {
    const host = canvas.parentElement;
    const width = host?.clientWidth ?? window.innerWidth;
    const height = host?.clientHeight ?? window.innerHeight;
    const scale = integerScale(width, height);
    canvas.style.imageRendering = "pixelated";
    canvas.style.width = `${LOGICAL_WIDTH * scale}px`;
    canvas.style.height = `${LOGICAL_HEIGHT * scale}px`;
  }
  resize();
  window.addEventListener("resize", resize);

  const renderApp: RenderApp = {
    canvas,
    drawWorld(next: WorldState): void {
      world = next;
      stateDecay = next.paletteDecay;
      rebuildScene();
      // One act, one drone: the audio floor follows the world's act, and the
      // world's own mute switch silences everything.
      audio.setStage(next.stage);
      audio.setSilent(next.silent);
    },
    playEffect(effect: RenderEffect, current: WorldState): void {
      world = current;
      stateDecay = current.paletteDecay;
      apply(plan(effect, current), renderApp, shell);
    },
    applyInstruction(instruction: CanvasInstruction): void {
      applyCanvas(instruction);
    },
    setCloseupDuck(active: boolean): void {
      if (active === closeupDuck) {
        return;
      }
      closeupDuck = active;
      rebuildAudio();
    },
    get audio(): AudioEngine {
      return audio;
    },
    destroy(): void {
      window.removeEventListener("resize", resize);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerdown", onPointerDown);
      audio.dispose();
      for (const key of [...textureCache.keys()]) {
        disposeTexture(key);
      }
      app.destroy({ removeView: false }, { children: true });
    },
  };

  // Prime the tile layer so the first frame is not blank before `drawWorld`.
  palette = paletteAt(0);
  drawTiles(gridTiles(), 0);

  // TEMP-DEBUG: scene graph inspection for the mystery black box.
  if (new URLSearchParams(location.search).get("debug") === "1") {
    (window as unknown as Record<string, unknown>).__gazerScene = () =>
      ({
        overlay: overlayLayer.children.map((c) => ({
          type: c.constructor.name,
          x: c.x,
          y: c.y,
          w: c.width,
          h: c.height,
          alpha: c.alpha,
          kids: "children" in c ? (c as Container).children.map((k) => ({ type: k.constructor.name, x: k.x, y: k.y, w: k.width, h: k.height, text: (k as Text).text ?? undefined })) : undefined,
        })),
        objectCount: objectLayer.children.length,
        tileBounds: { w: tileLayer.width, h: tileLayer.height },
      });
    (window as unknown as Record<string, unknown>).__gazerLayers = { root, tileLayer, objectLayer, overlayLayer };
  }

  return renderApp;
}
