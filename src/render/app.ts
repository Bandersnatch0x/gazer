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
import type { CanvasInstruction, RenderHost, ShellHandler } from "./effects";
import { apply, plan } from "./effects";
import type { RenderEffect } from "./effects";
import { applyDecay, paletteAt } from "./palette";
import type { Palette } from "./palette";
import type { CreatureDraw, SceneObject, ScenePlan, ScreenPos } from "./scene";
import {
  LOGICAL_HEIGHT,
  LOGICAL_WIDTH,
  TILE_DEPTH,
  TILE_W,
  creatureDraws,
  gridTiles,
  integerScale,
  planStructure,
  scenePlan,
} from "./scene";
import { MASK_SIZE, renderMask, spriteKey } from "./sprite";

export interface RenderApp extends RenderHost {
  readonly canvas: HTMLCanvasElement;
  drawWorld(world: WorldState): void;
  playEffect(effect: RenderEffect, world: WorldState): void;
  destroy(): void;
}

interface SpeechBubble {
  readonly container: Container;
  readonly text: Text;
  lifeMs: number;
}

/** Bubble lifetime; speech is atmosphere, not a log. */
const BUBBLE_MS = 4200;
const BUBBLE_RISE_PX = 10;
const SHAKE_FALLOFF_MS = 320;
/** An 8x8 creature drawn at 2x reads at one tile wide, still crisp. */
const CREATURE_SCALE = 2;
const WINK_SCALE_X = 1.6;

export async function createApp(canvas: HTMLCanvasElement, shell?: ShellHandler): Promise<RenderApp> {
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
  let glyphCorruption = 0;

  const glyphNoise = new Graphics();
  overlayLayer.addChild(glyphNoise);

  const textureCache = new Map<string, Texture>();
  const sprites = new Map<string, Sprite>();
  const gazing = new Map<CreatureId, number>();
  const winking = new Map<CreatureId, number>();
  const pulling = new Map<CreatureId, { strength: number; until: number }>();
  const bubbles: SpeechBubble[] = [];
  /** creatureId -> time until which it answers the player's clicks. */
  const mirroring = new Map<CreatureId, number>();

  function now(): number {
    return performance.now();
  }

  function textureFor(mask: readonly string[], colors: readonly string[]): Texture {
    const key = spriteKey(mask, colors);
    const cached = textureCache.get(key);
    if (cached !== undefined) {
      return cached;
    }
    const source = new BufferImageSource({
      resource: renderMask(mask, colors),
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

  function drawTiles(tiles: ScenePlan["tiles"]): void {
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
    }
  }

  function drawStructure(object: Extract<SceneObject, { kind: "structure" }>): void {
    const g = new Graphics();
    const { center, height } = object;
    const halfW = TILE_W / 2;
    // A thin isometric prism: front face, side face, then the dark eye slit.
    g.moveTo(center.x - halfW, center.y)
      .lineTo(center.x, center.y + TILE_DEPTH)
      .lineTo(center.x, center.y + TILE_DEPTH - height)
      .lineTo(center.x - halfW, center.y - height)
      .closePath()
      .fill({ color: palette.tower });
    g.moveTo(center.x + halfW, center.y)
      .lineTo(center.x, center.y + TILE_DEPTH)
      .lineTo(center.x, center.y + TILE_DEPTH - height)
      .lineTo(center.x + halfW, center.y - height)
      .closePath()
      .fill({ color: applyDecay(palette.tower, 0.35) });
    g.rect(center.x - halfW, center.y - height - 3, TILE_W, 2).fill({ color: palette.towerEdge });
    g.rect(center.x - 3, center.y - height + 12, 6, 3).fill({ color: palette.towerEdge });
    objectLayer.addChild(g);
  }

  function drawCreature(object: CreatureDraw): void {
    const key = `c:${object.id}`;
    let sprite = sprites.get(key);
    const gaze = gazing.get(object.id);
    const watching = object.frame !== "dead" && gaze !== undefined && gaze > now();
    const texture = textureFor(watching ? object.alertMask : object.mask, object.palette);
    if (sprite === undefined) {
      sprite = new Sprite({ texture });
      sprite.anchor.set(0.5, 1);
      sprite.scale.set(CREATURE_SCALE);
      sprites.set(key, sprite);
      objectLayer.addChild(sprite);
    } else {
      sprite.texture = texture;
    }
    const time = now();
    const pull = pulling.get(object.id);
    if (pull !== undefined && time < pull.until) {
      const t = (pull.until - time) / 900;
      sprite.position.set(
        object.center.x + (pointerX - object.center.x) * pull.strength * t * 0.12,
        object.center.y + (pointerY - object.center.y) * pull.strength * t * 0.12,
      );
    } else {
      pulling.delete(object.id);
      sprite.position.set(object.center.x, object.center.y);
    }
    sprite.tint = watching ? 0xd8ffe8 : 0xffffff;
    const wink = winking.get(object.id);
    sprite.scale.x = wink !== undefined && wink > time ? WINK_SCALE_X : CREATURE_SCALE;
  }

  function rebuildScene(): void {
    if (world === null) {
      return;
    }
    const decay = Math.min(1, Math.max(0, stateDecay + extraDecay));
    const scene: ScenePlan = scenePlan(world, decay);
    palette = scene.palette;
    drawTiles(scene.tiles);
    for (const child of objectLayer.removeChildren()) {
      child.destroy({ children: true });
    }
    sprites.clear();
    for (const object of scene.objects) {
      if (object.kind === "structure") {
        drawStructure(object);
      } else {
        drawCreature(object);
      }
    }
    // Sprites are recreated above; redraw is enough because the camera is fixed.
  }

  function syncCreatures(): void {
    if (world === null) {
      return;
    }
    for (const creature of creatureDraws(world, palette)) {
      drawCreature(creature);
    }
  }

  function drawBubble(anchor: ScreenPos, text: string, mood: string): void {
    const container = new Container();
    const label = new Text({
      text,
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
      .stroke({ width: 1, color: mood === "wrong" ? "#b46a8a" : palette.tileEdge });
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
        return;
      case "gaze":
        gazing.set(instruction.creatureId, now() + instruction.ms);
        return;
      case "mirror_click_rhythm":
        mirroring.set(instruction.creatureId, now() + instruction.durationMs);
        return;
      case "palette_shift": {
        // A transient lean: out to `amount` and back to where the world was.
        const from = extraDecay;
        const started = now();
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
      case "desaturate":
        // The engine folds `desaturate` into `WorldState.paletteDecay`, and
        // `drawWorld` is authoritative for decay. Redraw so the change is
        // visible even if the caller has not drawn the new state yet.
        rebuildScene();
        return;
      case "audio":
        // The audio subsystem listens for this; the canvas has nothing to draw.
        return;
      case "spawn_structure":
        // Draw it now so the effect is visible before the next `drawWorld`.
        // A rebuild replaces it with the world's own copy, so it never doubles.
        drawStructure(
          planStructure({ kind: instruction.structure, at: instruction.at, createdBy: "director" }),
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
        return;
      case "wink":
        winking.set(instruction.creatureId, now() + 260);
        return;
      case "cursor_pull": {
        if (instruction.from !== null) {
          pulling.set(instruction.creatureId, {
            strength: instruction.strength,
            until: now() + 900,
          });
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

  // A creature under `mirror_click_rhythm` answers each click in kind.
  function onPointerDown(): void {
    const time = now();
    for (const [id, until] of mirroring) {
      if (time < until) {
        winking.set(id, time + 260);
      } else {
        mirroring.delete(id);
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
    },
    playEffect(effect: RenderEffect, current: WorldState): void {
      world = current;
      stateDecay = current.paletteDecay;
      apply(plan(effect, current), renderApp, shell);
    },
    applyInstruction(instruction: CanvasInstruction): void {
      applyCanvas(instruction);
    },
    destroy(): void {
      window.removeEventListener("resize", resize);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerdown", onPointerDown);
      for (const key of [...textureCache.keys()]) {
        disposeTexture(key);
      }
      app.destroy({ removeView: false }, { children: true });
    },
  };

  // Prime the tile layer so the first frame is not blank before `drawWorld`.
  palette = paletteAt(0);
  drawTiles(gridTiles());

  return renderApp;
}
