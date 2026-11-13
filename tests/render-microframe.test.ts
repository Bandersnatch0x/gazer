/**
 * Ticket 0042 — microframes into the live scene, the 400ms anchor beat, the
 * twin-souls follow, and the EAT verbatim fix (ART-CORE-01 §2/§3/§7).
 *
 * CI checklist:
 *   - EAT pixel-verbatim (rows 2/3 squint centred at cols 3–4; B opens one
 *     column per side);
 *   - the microframe loop timing (idle 250/250, sleep 1200, injected clock);
 *   - the 400ms anchor beat (jumps, never eases);
 *   - twin mirror (the pair follows the lead twin, one eye in two bodies);
 *   - the GV90 exception (within two tiles of the tower, an idle creature's
 *     pupil is forced CENTER — it is not looking at the tower).
 */

import { describe, expect, it } from "vitest";
import {
  ANCHOR_BEAT_MS,
  anchorBeatAt,
  canonicalMask,
  microFor,
  microMaskFor,
  microPoseFor,
  phaseOffsetMsFor,
  resolvePupilAnchors,
  twinPartner,
} from "../src/render/sprite";
import { GAZER_MASKS } from "../src/render/masks";
import { TWIN_PHASE_EPSILON_MS } from "../src/sim/genome";

// ---------------------------------------------------------------------------
// 1. EAT verbatim (R4: the pixel map is the truth)
// ---------------------------------------------------------------------------

describe("EAT verbatim — the squint line is centred (§2.3)", () => {
  it("EAT-A keeps the rim rows and squints rows 2/3 to the centre two columns", () => {
    expect(GAZER_MASKS.gazer_eat_a).toEqual([
      "..JJJJ..",
      ".JEEEEJ.",
      "JJJEEJJJ",
      "JJJEEJJJ",
      ".JEEEEJ.",
      "..JJJJ..",
      "..SS....",
      "........",
    ]);
  });

  it("EAT-B opens one column per side, still centred, still glintless", () => {
    const eatB = GAZER_MASKS.gazer_eat_b ?? [];
    expect(eatB).toEqual([
      "..JJJJ..",
      ".JEEEEJ.",
      "JJEEEEJJ",
      "JJEEEEJJ",
      ".JEEEEJ.",
      "..JJJJ..",
      "..SS....",
      "........",
    ]);
    for (const row of eatB) {
      expect(row).not.toContain("G");
    }
  });

  it("the composed eat frame renders the squint at cols 3–4 and no glint", () => {
    const frame = canonicalMask("eat", { micro: "a" });
    // bodyPaint renames the outer body cells to rims (H/S); the composed row
    // keeps the squint's open cells at cols 3–4 and never reopens cols 2/5
    // (the four-wide idle rim would read S J E E E E J S).
    expect(frame[2]).toBe("HJJPPJJH"); // the pupil takes the stage colour
    expect(frame[3]).toBe("SJJPPJJS");
    expect(frame[1]).toBe(".HEEEEH."); // the rim row keeps its four eye columns
    for (const row of frame) {
      expect(row).not.toContain("G");
    }
  });
});

// ---------------------------------------------------------------------------
// 2. Microframes into the scene (injected clock; no wall-clock scattering)
// ---------------------------------------------------------------------------

describe("microframes — the loop the scene now runs", () => {
  it("maps scene frames onto breathing poses, single frames stay single", () => {
    expect(microPoseFor("idle")).toBe("idle");
    expect(microPoseFor("hungry")).toBe("idle"); // hunger is posture
    expect(microPoseFor("eat")).toBe("eat");
    expect(microPoseFor("sleep")).toBe("sleep");
    expect(microPoseFor("alert")).toBeNull(); // stillness is the performance
    expect(microPoseFor("grief")).toBeNull();
    expect(microPoseFor("dead")).toBeNull();
  });

  it("alternates A/B on the injected clock: idle 250/250, sleep 1200", () => {
    expect(microFor("idle", 0)).toBe("a");
    expect(microFor("idle", 249)).toBe("a");
    expect(microFor("idle", 250)).toBe("b");
    expect(microFor("idle", 500)).toBe("a");
    expect(microFor("sleep", 1199)).toBe("a");
    expect(microFor("sleep", 1200)).toBe("b");
  });

  it("builds the frame the scene draws: canonical bodies loop, the rest do not", () => {
    const idleA = microMaskFor("idle", true, 0, 0, "CENTER");
    const idleB = microMaskFor("idle", true, 250, 0, "CENTER");
    expect(idleA).not.toBeNull();
    expect(idleA).toEqual(canonicalMask("idle", { micro: "a", anchor: "CENTER" }));
    expect(idleB).toEqual(canonicalMask("idle", { micro: "b", anchor: "CENTER" }));
    expect(idleA).not.toEqual(idleB);
    // Legacy masks have no authored grids to alternate.
    expect(microMaskFor("idle", false, 250, 0, "CENTER")).toBeNull();
    // Single-frame poses and the corpse hold one frame.
    expect(microMaskFor("alert", true, 250, 0, "CENTER")).toBeNull();
    expect(microMaskFor("grief", true, 250, 0, "CENTER")).toBeNull();
    expect(microMaskFor("dead", true, 250, 0, "CENTER")).toBeNull();
  });

  it("carries the pupil anchor through the loop, glint last ([R2])", () => {
    const bl = microMaskFor("idle", true, 250, 0, "BL");
    expect(bl).toEqual(canonicalMask("idle", { micro: "b", anchor: "BL" }));
    expect(bl?.[3]?.[2]).toBe("P");
    expect(bl?.[1]?.[2]).toBe("G");
  });

  it("phase offsets are deterministic, bounded, and never wall-clock", () => {
    expect(phaseOffsetMsFor("gazer_01")).toBe(80);
    expect(phaseOffsetMsFor("gazer_02")).toBe(200);
    expect(phaseOffsetMsFor("gazer_01")).toBe(phaseOffsetMsFor("gazer_01"));
    expect(phaseOffsetMsFor("gazer_01")).toBeGreaterThanOrEqual(0);
    expect(phaseOffsetMsFor("gazer_01")).toBeLessThan(500);
    expect(phaseOffsetMsFor("gazer_01", 0)).toBe(0);
    expect(phaseOffsetMsFor("gazer_01", Number.NaN)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 3. The 400ms anchor beat
// ---------------------------------------------------------------------------

describe("anchor beat — evaluate on the beat, jump, never ease", () => {
  it("uses the canonical 400ms", () => {
    expect(ANCHOR_BEAT_MS).toBe(400);
  });

  it("indexes time into beats", () => {
    expect(anchorBeatAt(0)).toBe(0);
    expect(anchorBeatAt(399)).toBe(0);
    expect(anchorBeatAt(400)).toBe(1);
    expect(anchorBeatAt(799)).toBe(1);
    expect(anchorBeatAt(800)).toBe(2);
    expect(anchorBeatAt(-5)).toBe(0);
    expect(anchorBeatAt(Number.NaN)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 4. Twin souls — one eye in two bodies (§7)
// ---------------------------------------------------------------------------

const twinWorld = (
  creatures: Record<string, { id: string; position: { x: number; y: number }; behavior?: string; twinOf?: string }>,
  gv = 0,
  structures: readonly { kind: string; at: { x: number; y: number } }[] = [],
) => ({
  gv,
  creatures,
  structures,
});

describe("twin souls — mirrored pupil, shared phase", () => {
  it("recognises only mutual pairs as twins", () => {
    const world = twinWorld({
      a: { id: "a", position: { x: 3, y: 3 }, twinOf: "b" },
      b: { id: "b", position: { x: 6, y: 6 }, twinOf: "a" },
      c: { id: "c", position: { x: 9, y: 9 }, twinOf: "ghost" },
    });
    expect(twinPartner(world, "a")).toBe("b");
    expect(twinPartner(world, "b")).toBe("a");
    expect(twinPartner(world, "c")).toBeNull(); // dangling marker follows nobody
    expect(twinPartner(world, "ghost")).toBeNull();
  });

  it("the pair follows the lead twin — the smaller id owns the eye", () => {
    const world = twinWorld({
      b: { id: "b", position: { x: 6, y: 6 }, twinOf: "a" },
      a: { id: "a", position: { x: 3, y: 3 }, twinOf: "b" },
    });
    const anchors = resolvePupilAnchors(world, { x: 5, y: 6 });
    // The cursor sits next to b; a mirrors b's anchor (a is the lead).
    expect(anchors.get("a")).toBe(anchors.get("b"));
  });

  it("both twins read the same phase offset — the 0ms epsilon", () => {
    expect(TWIN_PHASE_EPSILON_MS).toBe(0);
    const world = twinWorld({
      a: { id: "a", position: { x: 3, y: 3 }, twinOf: "b" },
      b: { id: "b", position: { x: 6, y: 6 }, twinOf: "a" },
    });
    for (const id of ["a", "b"]) {
      const partner = twinPartner(world, id);
      expect(partner).not.toBeNull();
      // The wiring gives twins the epsilon; the herd keeps its own phase.
      expect(partner !== null ? TWIN_PHASE_EPSILON_MS : phaseOffsetMsFor(id)).toBe(0);
    }
    expect(phaseOffsetMsFor("twin_a")).toBe(260);
    expect(phaseOffsetMsFor("twin_b")).toBe(376); // untwinned, it drifts by design
  });
});

// ---------------------------------------------------------------------------
// 5. The GV90 exception — they look at whether you are looking (§6.4)
// ---------------------------------------------------------------------------

describe("GV90 exception — tower-side idle pupils forced CENTER", () => {
  const towerWorld = (
    creatures: Record<string, { id: string; position: { x: number; y: number }; behavior?: string; twinOf?: string }>,
    gv: number,
  ) =>
    twinWorld(creatures, gv, [{ kind: "black_tower", at: { x: 2, y: 8 } }]);

  it("forces CENTER for idle creatures within two tiles at GV 90", () => {
    const world = towerWorld(
      {
        near: { id: "near", position: { x: 4, y: 8 }, behavior: "idle" }, // Chebyshev 2
        far: { id: "far", position: { x: 8, y: 8 }, behavior: "idle" }, // Chebyshev 6
      },
      90,
    );
    const anchors = resolvePupilAnchors(world, { x: 8, y: 8 }); // cursor near `far`
    expect(anchors.get("near")).toBe("CENTER"); // the tower beats the cursor
    // `far` stands six tiles from the cursor: at exactly 6 it still tracks,
    // so with the cursor one tile away it reads BR. The tower never touches it.
    const shifted = resolvePupilAnchors(world, { x: 7, y: 7 });
    expect(anchors.get("far")).toBe("CENTER"); // cursor ON its tile
    expect(shifted.get("far")).not.toBe("CENTER");
    expect(shifted.get("near")).toBe("CENTER"); // the exception holds at any cursor
  });

  it("does not apply below GV 90", () => {
    const world = towerWorld({ near: { id: "near", position: { x: 4, y: 8 }, behavior: "idle" } }, 89);
    const anchors = resolvePupilAnchors(world, { x: 8, y: 8 });
    expect(anchors.get("near")).not.toBe("CENTER");
  });

  it("spares the non-idle and the towerless world", () => {
    const world = towerWorld(
      {
        eater: { id: "eater", position: { x: 4, y: 8 }, behavior: "eating" },
        sleeper: { id: "sleeper", position: { x: 3, y: 8 }, behavior: "sleeping" },
      },
      90,
    );
    const anchors = resolvePupilAnchors(world, { x: 8, y: 8 });
    expect(anchors.get("eater")).not.toBe("CENTER");
    expect(anchors.get("sleeper")).not.toBe("CENTER");
    const towerless = resolvePupilAnchors(
      twinWorld({ near: { id: "near", position: { x: 4, y: 8 }, behavior: "idle" } }, 90),
      { x: 8, y: 8 },
    );
    expect(towerless.get("near")).not.toBe("CENTER");
  });

  it("the exception beats the twin mirror", () => {
    const world = towerWorld(
      {
        a: { id: "a", position: { x: 4, y: 8 }, behavior: "idle", twinOf: "b" },
        b: { id: "b", position: { x: 8, y: 8 }, behavior: "idle", twinOf: "a" },
      },
      90,
    );
    const anchors = resolvePupilAnchors(world, { x: 8, y: 8 });
    // a is within two tiles: it is forced CENTER, and the mirror follows it.
    expect(anchors.get("a")).toBe("CENTER");
    expect(anchors.get("b")).toBe("CENTER");
  });
});
