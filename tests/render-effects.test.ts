import { describe, expect, it } from "vitest";
import fc from "fast-check";
import type { RenderEffect, RenderEffectKind } from "../src/render/effects";
import {
  CANVAS_EFFECT_KINDS,
  EFFECT_KINDS,
  SHELL_EFFECT_KINDS,
  apply,
  isShellInstruction,
  plan,
} from "../src/render/effects";
import type { CanvasInstruction, ShellInstruction } from "../src/render/effects";
import type { WorldState } from "../src/sim/types";
import { DEFAULT_MASK } from "../src/sim/engine";

function world(): WorldState {
  return {
    tick: 3,
    gv: 40,
    stage: 2,
    creatures: {
      gazer_01: {
        id: "gazer_01",
        species: "gazerling",
        stats: { hunger: 70, hygiene: 70, happiness: 70, energy: 70 },
        behavior: "idle",
        trait: null,
        position: { x: 4, y: 5 },
        palette: ["#f2e6c9", "#7ef0a6", "#1a2b1f"],
        mask: DEFAULT_MASK,
        hatchedAtTick: 0,
        name: null,
        willingness: 40,
        courtshipTicks: 0,
      },
      gazer_02: {
        id: "gazer_02",
        species: "gazerling",
        stats: { hunger: 0, hygiene: 20, happiness: 10, energy: 10 },
        behavior: "dead",
        trait: "mourner",
        position: { x: 7, y: 2 },
        palette: ["#f2e6c9", "#7ef0a6", "#1a2b1f"],
        mask: DEFAULT_MASK,
        hatchedAtTick: 1,
        name: null,
        willingness: 40,
        courtshipTicks: 0,
      },
    },
    structures: [{ kind: "black_tower", at: { x: 8, y: 8 }, createdBy: "director" }],
    eggs: [],
    uiLabels: {},
    paletteDecay: 0.25,
    seed: 1997,
    silent: false,
  };
}

/** One valid sample per effect kind. Keys are compile-time checked. */
const SAMPLES: Readonly<Record<RenderEffectKind, RenderEffect>> = {
  freeze_all: { kind: "freeze_all", ms: 900 },
  gaze_at_player: { kind: "gaze_at_player", creatureId: "gazer_01", ms: 1200 },
  mirror_click_rhythm: { kind: "mirror_click_rhythm", creatureId: "gazer_01" },
  palette_shift: { kind: "palette_shift", amount: 0.4, ms: 800 },
  desaturate: { kind: "desaturate", amount: 0.3 },
  audio_drop_track: { kind: "audio_drop_track", track: "hum_low" },
  spawn_structure: { kind: "spawn_structure", structure: "black_tower", at: { x: 2, y: 3 } },
  relabel_ui: { kind: "relabel_ui", target: "feed", text: "Offer" },
  set_trait: { kind: "set_trait", creatureId: "gazer_01", trait: "watcher" },
  rewrite_sprite: {
    kind: "rewrite_sprite",
    creatureId: "gazer_01",
    palette: ["#fff", "#0f0", "#000", "#f00"],
    mask: DEFAULT_MASK,
  },
  glyph_corrupt: { kind: "glyph_corrupt", amount: 0.6 },
  creature_speech: { kind: "creature_speech", creatureId: "gazer_01", text: "you came back", mood: "loving" },
  collective_speech: { kind: "collective_speech", text: "we saw it too", mood: "wrong" },
  ui_shake: { kind: "ui_shake", intensity: 0.5, ms: 400 },
  creature_wink: { kind: "creature_wink", creatureId: "gazer_01" },
  cursor_pull: { kind: "cursor_pull", creatureId: "gazer_01", strength: 0.7 },
  favicon_eye: { kind: "favicon_eye", intensity: 0.8 },
  title_mutate: { kind: "title_mutate", text: "GAZER is watching" },
  outside_eyes: { kind: "outside_eyes", opacity: 0.5 },
};

const arbitraryEffect: fc.Arbitrary<RenderEffect> = fc.oneof(
  fc.double({ min: -10, max: 10, noNaN: true }).map((ms): RenderEffect => ({ kind: "freeze_all", ms })),
  fc
    .tuple(fc.constantFrom("gazer_01", "gazer_02", "ghost"), fc.double({ min: -5, max: 5000, noNaN: true }))
    .map(([creatureId, ms]): RenderEffect => ({ kind: "gaze_at_player", creatureId, ms })),
  fc.constantFrom("gazer_01", "ghost").map((creatureId): RenderEffect => ({ kind: "mirror_click_rhythm", creatureId })),
  fc
    .tuple(fc.double({ min: -3, max: 3, noNaN: true }), fc.double({ min: -100, max: 9000, noNaN: true }))
    .map(([amount, ms]): RenderEffect => ({ kind: "palette_shift", amount, ms })),
  fc.double({ min: -3, max: 3, noNaN: true }).map((amount): RenderEffect => ({ kind: "desaturate", amount })),
  fc.string().map((track): RenderEffect => ({ kind: "audio_drop_track", track })),
  fc
    .tuple(fc.integer({ min: -4, max: 20 }), fc.integer({ min: -4, max: 20 }))
    .map(([x, y]): RenderEffect => ({ kind: "spawn_structure", structure: "black_tower", at: { x, y } })),
  fc
    .tuple(fc.string(), fc.string())
    .map(([target, text]): RenderEffect => ({ kind: "relabel_ui", target, text })),
  fc
    .constantFrom("gazer_01", "ghost")
    .map((creatureId): RenderEffect => ({ kind: "set_trait", creatureId, trait: "herald" })),
  fc
    .tuple(fc.array(fc.string(), { maxLength: 6 }), fc.array(fc.string({ maxLength: 10 }), { maxLength: 10 }))
    .map(
      ([palette, mask]): RenderEffect => ({
        kind: "rewrite_sprite",
        creatureId: "gazer_01",
        palette,
        mask,
      }),
    ),
  fc.double({ min: -1, max: 2, noNaN: true }).map((amount): RenderEffect => ({ kind: "glyph_corrupt", amount })),
  fc
    .tuple(fc.constantFrom("gazer_01", "ghost"), fc.string())
    .map(([creatureId, text]): RenderEffect => ({
      kind: "creature_speech",
      creatureId,
      text,
      mood: "curious",
    })),
  fc.string().map((text): RenderEffect => ({ kind: "collective_speech", text, mood: "sad" })),
  fc
    .tuple(fc.double({ min: -1, max: 2, noNaN: true }), fc.double({ min: -50, max: 5000, noNaN: true }))
    .map(([intensity, ms]): RenderEffect => ({ kind: "ui_shake", intensity, ms })),
  fc.constantFrom("gazer_01", "ghost").map((creatureId): RenderEffect => ({ kind: "creature_wink", creatureId })),
  fc
    .tuple(fc.constantFrom("gazer_01", "ghost"), fc.double({ min: -2, max: 2, noNaN: true }))
    .map(([creatureId, strength]): RenderEffect => ({ kind: "cursor_pull", creatureId, strength })),
  fc.double({ min: -1, max: 2, noNaN: true }).map((intensity): RenderEffect => ({ kind: "favicon_eye", intensity })),
  fc.string().map((text): RenderEffect => ({ kind: "title_mutate", text })),
  fc.double({ min: -1, max: 2, noNaN: true }).map((opacity): RenderEffect => ({ kind: "outside_eyes", opacity })),
);

describe("effect plans", () => {
  it("covers every kind with a sample", () => {
    expect(Object.keys(SAMPLES).sort()).toEqual([...EFFECT_KINDS].sort());
    expect(CANVAS_EFFECT_KINDS).toHaveLength(16);
    expect(SHELL_EFFECT_KINDS).toHaveLength(3);
  });

  it("emits at least one instruction for every kind and never throws", () => {
    fc.assert(
      fc.property(arbitraryEffect, (effect) => {
        const instructions = plan(effect, world());
        expect(instructions.length).toBeGreaterThan(0);
        for (const instruction of instructions) {
          expect(typeof instruction.type).toBe("string");
        }
      }),
      { numRuns: 200 },
    );
  });

  it("keeps numeric payloads inside their declared ranges", () => {
    fc.assert(
      fc.property(arbitraryEffect, (effect) => {
        for (const instruction of plan(effect, world())) {
          switch (instruction.type) {
            case "desaturate":
            case "glyph_corrupt":
              expect(instruction.amount).toBeGreaterThanOrEqual(0);
              expect(instruction.amount).toBeLessThanOrEqual(1);
              break;
            case "palette_shift":
              expect(instruction.amount).toBeGreaterThanOrEqual(0);
              expect(instruction.amount).toBeLessThanOrEqual(1);
              expect(instruction.ms).toBeGreaterThanOrEqual(0);
              break;
            case "shake":
              expect(instruction.intensity).toBeGreaterThanOrEqual(0);
              expect(instruction.intensity).toBeLessThanOrEqual(1);
              break;
            case "freeze":
              expect(instruction.ms).toBeGreaterThanOrEqual(0);
              break;
            case "favicon_eye":
              expect(instruction.intensity).toBeGreaterThanOrEqual(0);
              expect(instruction.intensity).toBeLessThanOrEqual(1);
              break;
            case "outside_eyes":
              expect(instruction.opacity).toBeGreaterThanOrEqual(0);
              expect(instruction.opacity).toBeLessThanOrEqual(1);
              break;
            default:
              break;
          }
        }
      }),
      { numRuns: 150 },
    );
  });

  it("routes the three browser-shell kinds to the shell channel", () => {
    for (const kind of SHELL_EFFECT_KINDS) {
      const instructions = plan(SAMPLES[kind], world());
      expect(instructions).toHaveLength(1);
      const [instruction] = instructions;
      expect(instruction).toBeDefined();
      expect(instruction !== undefined && isShellInstruction(instruction)).toBe(true);
    }
    for (const kind of CANVAS_EFFECT_KINDS) {
      for (const instruction of plan(SAMPLES[kind], world())) {
        expect(isShellInstruction(instruction)).toBe(false);
      }
    }
  });

  it("anchors speech on creatures that are present and skips the missing", () => {
    const solo = plan({ kind: "creature_speech", creatureId: "gazer_01", text: "hi", mood: "curious" }, world());
    const [soloInstruction] = solo;
    expect(soloInstruction?.type).toBe("speech");
    if (soloInstruction?.type === "speech") {
      expect(soloInstruction.collective).toBe(false);
      expect(soloInstruction.anchors).toHaveLength(1);
      // gazer_01 stands at tile (4,5): 2:1 projection around a fixed origin.
      expect(soloInstruction.anchors[0]?.at).toEqual({ x: 152, y: 70 });
    }

    const ghost = plan({ kind: "creature_speech", creatureId: "ghost", text: "hi", mood: "curious" }, world());
    const [ghostInstruction] = ghost;
    if (ghostInstruction?.type === "speech") {
      expect(ghostInstruction.anchors[0]?.at).toBeNull();
    }

    const collective = plan({ kind: "collective_speech", text: "we", mood: "wrong" }, world());
    const [collectiveInstruction] = collective;
    if (collectiveInstruction?.type === "speech") {
      expect(collectiveInstruction.collective).toBe(true);
      // The dead creature does not speak.
      expect(collectiveInstruction.anchors.map((anchor) => anchor.creatureId)).toEqual(["gazer_01"]);
    }
  });

  it("routes canvas instructions to the host and shell instructions to the UI", () => {
    const canvas: string[] = [];
    const shell: string[] = [];
    const instructions = [
      ...plan(SAMPLES.desaturate, world()),
      ...plan(SAMPLES.favicon_eye, world()),
      ...plan(SAMPLES.title_mutate, world()),
    ];
    apply(
      instructions,
      { applyInstruction: (instruction: CanvasInstruction) => canvas.push(instruction.type) },
      (instruction: ShellInstruction) => shell.push(instruction.type),
    );
    expect(canvas).toEqual(["desaturate"]);
    expect(shell).toEqual(["favicon_eye", "title_mutate"]);
  });

  it("passes rewrite_sprite payload through unchanged", () => {
    const palette = ["#111111", "#222222", "#333333", "#444444"];
    const mask = ["########", "........", "########", "........", "########", "........", "########", "........"];
    const [instruction] = plan(
      { kind: "rewrite_sprite", creatureId: "gazer_01", palette, mask },
      world(),
    );
    expect(instruction?.type).toBe("rewrite_sprite");
    if (instruction?.type === "rewrite_sprite") {
      expect(instruction.palette).toEqual(palette);
      expect(instruction.mask).toEqual(mask);
    }
  });
});
