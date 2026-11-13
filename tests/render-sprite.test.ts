import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { DEFAULT_MASK } from "../src/sim/engine";
import type { CreatureState, WorldState } from "../src/sim/types";
import { canonicalizeGazerMasks } from "../src/game";
import { TWIN_PHASE_EPSILON_MS } from "../src/sim/genome";
import {
  FRAMES,
  MASK_CHANNELS,
  MASK_PIXELS,
  MASK_SIZE,
  canonicalMask,
  frameFor,
  frameMask,
  microFor,
  normalizeMask,
  pupilAnchorFor,
  renderMask,
  spriteKey,
  spriteMask,
} from "../src/render/sprite";
import type { Micro, PupilAnchor, SpritePose } from "../src/render/sprite";
import { PUPIL_ANCHORS, renderGazerMask } from "../src/render/masks";
import {
  BODY_BASE_COLOR,
  BODY_HI_COLOR,
  BODY_SHADE_COLOR,
  COZY_PALETTE,
  EYE_VOID_COLOR,
  GAZER_SCENE_PALETTE,
  GLINT_COLOR,
  PUPIL_STAGE_COLORS,
  canonicalPalette,
  pupilStageForGv,
} from "../src/render/palette";

const palette = COZY_PALETTE.creature;

function pixel(pixels: Uint8Array, x: number, y: number): number[] {
  const at = (y * MASK_SIZE + x) * MASK_CHANNELS;
  return Array.from(pixels.slice(at, at + MASK_CHANNELS));
}

function coordsOf(mask: readonly string[], ch: string): { x: number; y: number }[] {
  const found: { x: number; y: number }[] = [];
  mask.forEach((row, y) => {
    for (let x = 0; x < row.length; x += 1) {
      if (row[x] === ch) {
        found.push({ x, y });
      }
    }
  });
  return found;
}

function bboxOf(mask: readonly string[]): { width: number; height: number } {
  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  let any = false;
  mask.forEach((row, y) => {
    for (let x = 0; x < row.length; x += 1) {
      if (row[x] !== ".") {
        any = true;
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
      }
    }
  });
  if (!any) {
    return { width: 0, height: 0 };
  }
  return { width: maxX - minX + 1, height: maxY - minY + 1 };
}

/** Every canonical pose, in microframe terms. ALERT/GRIEF ignore the letter. */
const POSE_MICROS: readonly [SpritePose, Micro][] = [
  ["idle", "a"],
  ["idle", "b"],
  ["eat", "a"],
  ["eat", "b"],
  ["sleep", "a"],
  ["sleep", "b"],
  ["alert", "a"],
  ["grief", "a"],
];

describe("sprite", () => {
  it("renders 8x8 RGBA for any mask and any palette", () => {
    const arbitraryMask = fc.array(fc.string({ maxLength: 12 }), { maxLength: 12 });
    const arbitraryPalette = fc.array(fc.string({ maxLength: 12 }), { maxLength: 6 });
    fc.assert(
      fc.property(arbitraryMask, arbitraryPalette, (mask, colors) => {
        const pixels = renderMask(mask, colors);
        expect(pixels).toBeInstanceOf(Uint8Array);
        expect(pixels.length).toBe(MASK_PIXELS * MASK_CHANNELS);
        expect(pixels.length).toBe(64 * 4);
        for (let i = 3; i < pixels.length; i += 4) {
          expect(pixels[i] === 0 || pixels[i] === 255).toBe(true);
        }
      }),
      { numRuns: 150 },
    );
  });

  it("maps mask characters to palette slots", () => {
    const mask = ["#o+*", "....", "....", "....", "....", "....", "....", "...."];
    const pixels = renderMask(mask, palette);
    expect(pixel(pixels, 0, 0)).toEqual([0xf2, 0xe6, 0xc9, 255]);
    expect(pixel(pixels, 1, 0)).toEqual([0x7e, 0xf0, 0xa6, 255]);
    expect(pixel(pixels, 2, 0)).toEqual([0x1a, 0x2b, 0x1f, 255]);
    expect(pixel(pixels, 3, 0)).toEqual([0xe8, 0xa8, 0x7c, 255]);
    expect(pixel(pixels, 0, 1)).toEqual([0, 0, 0, 0]);
  });

  it("pads short masks and drops trailing rows", () => {
    const pixels = renderMask(["##", "#"], palette);
    expect(pixel(pixels, 1, 0)).toEqual([0xf2, 0xe6, 0xc9, 255]);
    expect(pixel(pixels, 2, 0)).toEqual([0, 0, 0, 0]);
    expect(pixel(pixels, 0, 0)).toEqual([0xf2, 0xe6, 0xc9, 255]);
    for (let y = 2; y < MASK_SIZE; y += 1) {
      expect(pixel(pixels, 0, y)).toEqual([0, 0, 0, 0]);
    }
  });

  it("treats unknown characters as transparent and missing palette slots as body", () => {
    const pixels = renderMask(["#?!o"], ["#ffffff"]);
    expect(pixel(pixels, 0, 0)).toEqual([255, 255, 255, 255]);
    expect(pixel(pixels, 1, 0)).toEqual([0, 0, 0, 0]);
    expect(pixel(pixels, 2, 0)).toEqual([0, 0, 0, 0]);
    // `o` has no slot 1, so it falls back to the body colour.
    expect(pixel(pixels, 3, 0)).toEqual([255, 255, 255, 255]);
  });

  it("has seven frames — the ART-CORE-01 pose set with the grief vigil — and none of them throw", () => {
    expect(FRAMES).toEqual(["idle", "alert", "hungry", "dead", "sleep", "eat", "grief"]);
    for (const frame of FRAMES) {
      const mask = frameMask(DEFAULT_MASK, frame);
      expect(mask).toHaveLength(MASK_SIZE);
      for (const row of mask) {
        expect(row).toHaveLength(MASK_SIZE);
      }
    }
  });

  it("alert eyes glow and dead feet are gone", () => {
    const idle = frameMask(DEFAULT_MASK, "idle").join("");
    const alert = frameMask(DEFAULT_MASK, "alert").join("");
    const dead = frameMask(DEFAULT_MASK, "dead").join("");
    expect(alert.includes("o")).toBe(true);
    expect(idle.includes("o")).toBe(false);
    const count = (s: string, ch: string): number => s.split(ch).length - 1;
    expect(count(dead, ".")).toBeGreaterThan(count(idle, "."));
    // The eye sockets survive normalization as body, not as holes.
    expect(normalizeMask(DEFAULT_MASK)).toHaveLength(MASK_SIZE);
  });

  it("no frame carves a mouth: hunger never deletes body pixels", () => {
    // ART-CORE-01 iron law 1: these creatures have no mouth. The old hungry
    // frame punched two transparent cells below the sockets — removed.
    const opaque = (mask: readonly string[]): number => (mask.join("").match(/[^.]/g) ?? []).length;
    expect(opaque(frameMask(DEFAULT_MASK, "hungry"))).toBe(opaque(frameMask(DEFAULT_MASK, "idle")));
  });

  it("picks frames from behaviour, then the watcher trait", () => {
    const create = (
      behavior: "idle" | "hungry" | "eating" | "dead" | "sleeping" | "playing",
      trait: "watcher" | "mimic" | null,
    ) => ({
      behavior,
      trait,
      mask: DEFAULT_MASK,
    });
    expect(frameFor(create("dead", "watcher"))).toBe("dead");
    expect(frameFor(create("hungry", null))).toBe("hungry");
    expect(frameFor(create("eating", null))).toBe("eat");
    expect(frameFor(create("sleeping", "mimic"))).toBe("sleep");
    expect(frameFor(create("idle", "watcher"))).toBe("alert");
    expect(frameFor(create("idle", null))).toBe("idle");
    expect(frameFor(create("playing", null))).toBe("idle");
    // §7 哀悼体 (ticket 0037): the closed eye beats the stare.
    const grieving = (behavior: "idle" | "hungry" | "eating" | "dead" | "sleeping" | "playing", trait: "watcher" | "mimic" | null) => ({
      behavior,
      trait,
      mask: DEFAULT_MASK,
      grief: true,
    });
    expect(frameFor(grieving("idle", null))).toBe("grief");
    expect(frameFor(grieving("idle", "watcher"))).toBe("grief");
    expect(frameFor(grieving("sleeping", null))).toBe("sleep");
  });

  it("derives the sprite mask from the creature, not a global", () => {
    const custom = ["########", "########", "########", "########", "########", "########", "########", "########"];
    const mask = spriteMask({ behavior: "idle", trait: null, mask: custom });
    expect(mask.every((row) => row === "########")).toBe(true);
    expect(spriteKey(custom, palette)).not.toBe(spriteKey(DEFAULT_MASK, palette));
  });

  it("routes canonical masks to the ART-CORE-01 pipeline, legacy masks to the old one", () => {
    // A legacy mask keeps its socket heuristics.
    expect(frameMask(DEFAULT_MASK, "idle").join("")).not.toContain("G");
    // A canonical idle mask comes back as the canonical body-painted sprite.
    expect(frameMask(canonicalMask("idle"), "idle")).toEqual(canonicalMask("idle"));
    // The gaze seam renders the true ALERT map, glint centred [R1].
    expect(frameMask(canonicalMask("idle"), "alert")).toEqual(canonicalMask("alert"));
    expect(coordsOf(frameMask(canonicalMask("idle"), "alert"), "G")).toEqual([{ x: 3, y: 2 }]);
    // Sleep and eat arrive through the behaviour mapping.
    expect(frameMask(canonicalMask("idle"), "sleep")).toEqual(canonicalMask("sleep"));
    expect(frameMask(canonicalMask("idle"), "eat")).toEqual(canonicalMask("eat"));
    // Grief arrives through its marker (§7, ticket 0037).
    expect(frameMask(canonicalMask("idle"), "grief")).toEqual(canonicalMask("grief"));
  });

  it("§7 grief: SLEEP's closed-eye line, standing, tilting lower-right", () => {
    const mask = canonicalMask("grief");
    // The standing silhouette: the idle body frame with its row6 shadow.
    expect(mask[0]).toBe(canonicalMask("idle")[0]);
    expect(mask[6]).toBe(canonicalMask("idle")[6]);
    // The stagger is SLEEP's: row2's run at cols 3–4, row3's sunk one row
    // and one column right — the tilt reads lower-right, never mirrored.
    // (The body-paint rims add their own S at the silhouette edge; the eye
    // line is read inside the eye block, cols 2–5.)
    const sRow = (y: number): number[] =>
      (mask[y] ?? "")
        .split("")
        .map((ch, x) => (ch === "S" && x >= 2 && x <= 5 ? x : -1))
        .filter((x) => x >= 0);
    expect(sRow(2)).toEqual([3, 4]);
    expect(sRow(3)).toEqual([4, 5]);
    // The vigil is a single frame: no micro loop.
    expect(canonicalMask("grief", { micro: "b" })).toEqual(mask);
    expect(microFor("grief", 0)).toBe("a");
    expect(microFor("grief", 10_000)).toBe("a");
  });

  it("§7 twin souls: one shared phase, zero error (ticket 0037)", () => {
    // Same clock, same offset → the same microframe at every instant: the
    // 0ms law. With identical frames and anchors the pair renders identical
    // masks, so the pupil follows in the same frame by construction.
    for (let ms = 0; ms < 3000; ms += 13) {
      const micro = microFor("idle", ms, 42);
      expect(microFor("idle", ms, 42)).toBe(micro);
      expect(canonicalMask("idle", { micro })).toEqual(canonicalMask("idle", { micro }));
    }
    // The offset is real: half a beat apart, two creatures do desync — which
    // is exactly why twins must share one, and share it at zero.
    expect(microFor("idle", 250, 0)).toBe("b");
    expect(microFor("idle", 250, 250)).toBe("a");
    expect(TWIN_PHASE_EPSILON_MS).toBe(0);
  });
});

describe("canonical gazer sprite: ART-CORE-01 §8 CI (ticket 0019)", () => {
  it("§8.1 eye ratio ≥ 0.40 in the idle and alert poses", () => {
    for (const [pose, micro] of POSE_MICROS) {
      // The ratio is an idle/alert law (§8.1); sleep has no eye at all, and
      // eat/grief close it, so their counts are their own canon.
      if (pose === "sleep" || pose === "eat" || pose === "grief") {
        continue;
      }
      const chars = canonicalMask(pose, { micro }).join("");
      const eye = (chars.match(/[EPGI]/g) ?? []).length;
      const opaque = (chars.match(/[^.]/g) ?? []).length;
      expect(eye / opaque).toBeGreaterThanOrEqual(0.4);
    }
  });

  it("§8.2 [R1] the glint never moves: (2,1) everywhere but ALERT, which holds (3,2)", () => {
    const anchors = Object.keys(PUPIL_ANCHORS) as PupilAnchor[];
    for (const anchor of anchors) {
      for (const micro of ["a", "b"] as const) {
        const glints = coordsOf(canonicalMask("idle", { anchor, micro }), "G");
        expect(glints).toEqual([{ x: 2, y: 1 }]);
      }
    }
    // EAT: the glint vanishes while squinting (§2.3). GRIEF: the eye is shut
    // (§7), so nothing in it lights.
    for (const pose of ["eat", "grief"] as const) {
      for (const micro of ["a", "b"] as const) {
        expect(canonicalMask(pose, { micro }).join("")).not.toContain("G");
      }
    }
    // ALERT: the one canonical exception — the glint faces the viewer.
    expect(coordsOf(canonicalMask("alert"), "G")).toEqual([{ x: 3, y: 2 }]);
    // And it renders pure white at both canon positions (§5.1).
    const palette7 = canonicalPalette(0);
    const idlePixels = renderGazerMask(canonicalMask("idle"), palette7);
    expect(Array.from(idlePixels.slice((1 * MASK_SIZE + 2) * MASK_CHANNELS, (1 * MASK_SIZE + 2) * MASK_CHANNELS + 4))).toEqual([
      255, 255, 255, 255,
    ]);
    const alertPixels = renderGazerMask(canonicalMask("alert"), palette7);
    expect(Array.from(alertPixels.slice((2 * MASK_SIZE + 3) * MASK_CHANNELS, (2 * MASK_SIZE + 3) * MASK_CHANNELS + 4))).toEqual([
      255, 255, 255, 255,
    ]);
  });

  it("§8.3 [R13] every pose fits 8×7 — canon verbatim, nothing clipped — and the row6 shadow never moves", () => {
    for (const [pose, micro] of POSE_MICROS) {
      const bounds = bboxOf(canonicalMask(pose, { micro }));
      expect(bounds.width).toBeLessThanOrEqual(8);
      expect(bounds.height).toBeLessThanOrEqual(7);
    }
    // R13: the pixel maps are per-pixel canon. The widest body rows keep
    // their full eight-column span; the renderer never trims an edge.
    const span = (row: string | undefined): number => (row ?? "").replace(/\./g, "").length;
    expect(span(canonicalMask("idle", { micro: "a" })[2])).toBe(8);
    expect(span(canonicalMask("idle", { micro: "b" })[3])).toBe(8);
    expect(span(canonicalMask("alert")[2])).toBe(8);
    const shadowOn = (row: string | undefined): number[] =>
      (row ?? "")
        .split("")
        .map((ch, x) => (ch === "S" ? x : -1))
        .filter((x) => x >= 0);
    // Standing poses pin the shadow to row6, identical across microframes.
    for (const pose of ["idle", "eat", "alert", "grief"] as const) {
      expect(shadowOn(canonicalMask(pose, { micro: "a" })[6])).toEqual([2, 3]);
      expect(shadowOn(canonicalMask(pose, { micro: "b" })[6])).toEqual([2, 3]);
    }
    // SLEEP follows its own canon: micro B sinks the whole body one row,
    // which is exactly what lands its shadow on row6.
    expect(canonicalMask("sleep", { micro: "a" })[5]).toBe("..SS....");
    expect(canonicalMask("sleep", { micro: "b" })[6]).toBe("..SS....");
  });

  it("§8.4 palette lock: the canonical palette matches §4/§5 exactly", () => {
    expect([...PUPIL_STAGE_COLORS]).toEqual(["#E8A93C", "#C2A04A", "#7E93A6", "#39414F", "#0B0D12"]);
    expect(BODY_BASE_COLOR).toBe("#7ED957");
    expect(BODY_HI_COLOR).toBe("#B8F0A8");
    expect(BODY_SHADE_COLOR).toBe("#3F8F3A");
    expect(EYE_VOID_COLOR).toBe("#101018");
    expect(GLINT_COLOR).toBe("#FFFFFF");
    for (let stage = 0; stage < PUPIL_STAGE_COLORS.length; stage += 1) {
      const palette7 = canonicalPalette(stage);
      expect(palette7).toHaveLength(7);
      expect(palette7[4]).toBe(PUPIL_STAGE_COLORS[stage]); // P: the stage colour
      expect(palette7[6]).toBe(PUPIL_STAGE_COLORS[stage]); // I: iris takes it too
      expect(palette7[5]).toBe("#FFFFFF"); // G: white, forever
      expect(palette7[3]).toBe("#101018"); // E: the void, forever
    }
    // GV ladder mirrors the sim stage thresholds (20/40/60/80).
    expect(pupilStageForGv(0)).toBe(0);
    expect(pupilStageForGv(19.9)).toBe(0);
    expect(pupilStageForGv(20)).toBe(1);
    expect(pupilStageForGv(40)).toBe(2);
    expect(pupilStageForGv(60)).toBe(3);
    expect(pupilStageForGv(80)).toBe(4);
    expect(pupilStageForGv(100)).toBe(4);
    expect(pupilStageForGv(Number.NaN)).toBe(0);
  });

  it("§8.5 five pupil anchors render exactly, one-pixel steps, no interpolation", () => {
    const expected: Record<PupilAnchor, readonly string[]> = {
      CENTER: ["(3,2)", "(4,2)", "(3,3)", "(4,3)"],
      TL: ["(3,1)", "(2,2)", "(3,2)"], // (2,1) stays the glint's pixel [R2]
      TR: ["(4,1)", "(5,1)", "(4,2)", "(5,2)"],
      BL: ["(2,3)", "(3,3)", "(2,4)", "(3,4)"],
      BR: ["(4,3)", "(5,3)", "(4,4)", "(5,4)"],
    };
    for (const anchor of Object.keys(PUPIL_ANCHORS) as PupilAnchor[]) {
      const pupils = coordsOf(canonicalMask("idle", { anchor }), "P").map((p) => `(${p.x},${p.y})`);
      expect([...pupils].sort()).toEqual([...expected[anchor]].sort());
    }
    // Anchor selection is a pure step function: far or on-top → CENTER.
    const home = { x: 5, y: 5 };
    expect(pupilAnchorFor({ x: 5, y: 5 }, home)).toBe("CENTER");
    expect(pupilAnchorFor({ x: 12, y: 5 }, home)).toBe("CENTER"); // 7 tiles: too far
    expect(pupilAnchorFor({ x: 11, y: 5 }, home)).toBe("BR"); // exactly 6: still tracked
    expect(pupilAnchorFor({ x: 2, y: 2 }, home)).toBe("TL");
    expect(pupilAnchorFor({ x: 11, y: 2 }, home)).toBe("TR");
    expect(pupilAnchorFor({ x: 2, y: 9 }, home)).toBe("BL");
    expect(pupilAnchorFor({ x: 11, y: 9 }, home)).toBe("BR");
    // The cadence knows only two discrete frames — there is no tween frame.
    for (let ms = 0; ms < 2000; ms += 7) {
      expect(["a", "b"]).toContain(microFor("idle", ms));
    }
  });

  it("the four eye rows never move between microframes", () => {
    const a = canonicalMask("idle", { micro: "a" });
    const b = canonicalMask("idle", { micro: "b" });
    // The eye block (rows 1–4 × cols 2–5) is byte-identical across the breath.
    for (const y of [1, 2, 3, 4]) {
      expect(a[y]?.slice(2, 6)).toBe(b[y]?.slice(2, 6));
    }
    // The breath is body-only: top narrows, bottom widens.
    expect(a[0]).toBe("..HHHH..");
    expect(b[0]).toBe("...HHH..");
    expect(a[5]).toBe("..SSSS..");
    expect(b[5]).toBe(".SSSSSS.");
  });

  it("ALERT is one frame with no microframe loop", () => {
    for (let ms = 0; ms < 5000; ms += 97) {
      expect(microFor("alert", ms)).toBe("a");
    }
    expect(canonicalMask("alert", { micro: "b" })).toEqual(canonicalMask("alert", { micro: "a" }));
  });

  it("microframe cadence: 250ms idle/eat, 1200ms sleep, supplied by the caller", () => {
    expect(microFor("idle", 0)).toBe("a");
    expect(microFor("idle", 249)).toBe("a");
    expect(microFor("idle", 250)).toBe("b");
    expect(microFor("idle", 499)).toBe("b");
    expect(microFor("idle", 500)).toBe("a");
    expect(microFor("eat", 250)).toBe("b");
    expect(microFor("sleep", 1199)).toBe("a");
    expect(microFor("sleep", 1200)).toBe("b");
    expect(microFor("idle", Number.NaN)).toBe("a");
    expect(microFor("idle", -5)).toBe("a");
  });

  it("canonical masks render through the four-slot scene palette without holes", () => {
    // The scene path maps legend chars onto the legacy four slots; the wiring
    // layer fills those slots with the canonical colours, so the glint still
    // reads white and the eye still reads void.
    const pixels = renderMask(canonicalMask("idle"), GAZER_SCENE_PALETTE);
    expect(pixel(pixels, 0, 0)).toEqual([0, 0, 0, 0]); // the canon's empty corner
    expect(pixel(pixels, 3, 0)).toEqual([0x7e, 0xd9, 0x57, 255]); // body #7ED957
    expect(pixel(pixels, 3, 2)).toEqual([0x10, 0x10, 0x18, 255]); // pupil as eye void
    expect(pixel(pixels, 2, 1)).toEqual([255, 255, 255, 255]); // the glint: white
    expect(pixel(pixels, 2, 6)).toEqual([0x3f, 0x8f, 0x3a, 255]); // shadow #3F8F3A
  });
});

describe("wiring: canonical sprites reach the scene (ticket 0019)", () => {
  const fixtureCreature = (id: string, mask: readonly string[], colors: readonly string[]): CreatureState => ({
    id,
    species: "gazerling",
    stats: { hunger: 80, hygiene: 90, happiness: 80, energy: 90 },
    behavior: "idle",
    trait: null,
    position: { x: 3, y: 3 },
    palette: [...colors],
    mask: [...mask],
    hatchedAtTick: 0,
    name: null,
    willingness: 40,
    courtshipTicks: 0,
  });
  const fixtureWorld = (creatures: Record<string, CreatureState>): WorldState => ({
    tick: 0,
    gv: 0,
    stage: 0,
    creatures,
    structures: [],
    eggs: [],
    uiLabels: {},
    paletteDecay: 0,
    seed: 1,
    silent: true,
  });
  const enginePalette = ["#f2e6c9", "#7ef0a6", "#1a2b1f", "#e8a87c"];

  it("engine-fresh gazerlings wear the canonical mask and palette", () => {
    const world = fixtureWorld({ a: fixtureCreature("a", DEFAULT_MASK, enginePalette) });
    const next = canonicalizeGazerMasks(world);
    expect(next.creatures["a"]?.mask).toEqual(canonicalMask("idle"));
    expect(next.creatures["a"]?.palette).toEqual(GAZER_SCENE_PALETTE);
  });

  it("is idempotent and never touches director-supplied sprites", () => {
    const world = fixtureWorld({
      fresh: fixtureCreature("fresh", DEFAULT_MASK, enginePalette),
      director: fixtureCreature("director", ["########", "########"], ["#123456"]),
    });
    const once = canonicalizeGazerMasks(world);
    expect(canonicalizeGazerMasks(once)).toBe(once);
    expect(once.creatures["director"]?.mask).toEqual(["########", "########"]);
    expect(once.creatures["director"]?.palette).toEqual(["#123456"]);
  });

  it("leaves non-gazerling species alone", () => {
    const stranger = { ...fixtureCreature("x", DEFAULT_MASK, enginePalette), species: "mossling" };
    const world = fixtureWorld({ x: stranger });
    expect(canonicalizeGazerMasks(world)).toBe(world);
  });
});
