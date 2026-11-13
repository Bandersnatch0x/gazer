import { describe, expect, it } from "vitest";
import { TOWER_POSITION, stepTowardBuffer, towerClickFeedback } from "../src/game";
import { canonLine } from "../src/canon";
import {
  GRID_MAX,
  GRID_MIN,
  TOWER_CANON_TILE,
  TOWER_PIN_RADIUS,
  TOWER_SPAWN_GV,
  TOWER_ZONE_RADIUS,
  pinnedCenterAt,
  step,
  tileAllowedByTower,
  towerAt,
  towerSpawnDue,
  withinTowerZone,
} from "../src/sim/engine";
import { TOWER_CANON_TILE as RENDER_CANON_TILE } from "../src/render/tower";
import type { CreatureState, WorldState } from "../src/sim/types";

// ---------------------------------------------------------------------------
// 世界与个体构造(最小面)。塔在正典位 {0,7};GRID 1..14 的可达面里,
// footprint+1 缓冲区与网格的交集是 {(1,6),(1,7),(1,8)}。
// ---------------------------------------------------------------------------

const TOWER = { x: 0, y: 7 } as const;

function creatureAt(id: string, position: { x: number; y: number }, atavistic = false): CreatureState {
  return {
    id,
    species: "gazerling",
    stats: { hunger: 70, hygiene: 70, happiness: 70, energy: 70 },
    behavior: "idle",
    trait: null,
    position,
    palette: ["#f2e6c9", "#7ef0a6", "#1a2b1f"],
    mask: ["..####.."],
    hatchedAtTick: 0,
    name: null,
    willingness: 40,
    courtshipTicks: 0,
    ...(atavistic ? { atavistic: true } : {}),
  };
}

function worldWithTower(): WorldState {
  return {
    tick: 0,
    gv: 50,
    stage: 2,
    creatures: {},
    structures: [{ kind: "black_tower", at: { ...TOWER }, createdBy: "director" }],
    eggs: [],
    uiLabels: {},
    paletteDecay: 0,
    seed: 1997,
    silent: true,
  };
}

function worldWithoutTower(): WorldState {
  return { ...worldWithTower(), structures: [] };
}

/** 确定性 LCG(与仓内 rng 同式),供 1000 次采样循环,无 Math.random。 */
function lcg(seed: number): () => number {
  let x = seed >>> 0;
  return () => {
    x = (Math.imul(x, 1664525) + 1013904223) >>> 0;
    return x / 4294967296;
  };
}

function randomTile(next: () => number): { x: number; y: number } {
  return {
    x: GRID_MIN + Math.floor(next() * (GRID_MAX - GRID_MIN + 1)),
    y: GRID_MIN + Math.floor(next() * (GRID_MAX - GRID_MIN + 1)),
  };
}

// ---------------------------------------------------------------------------
// 交付形状 1:正典位统一(裁决 0013 项 5)。
// ---------------------------------------------------------------------------

describe("tower canon position (ticket 0043, 裁决 0013-5)", () => {
  it("sim/game/render three faces agree on {0,7} — the west-edge midline, forever", () => {
    expect(TOWER_POSITION).toEqual({ x: 0, y: 7 });
    expect(TOWER_CANON_TILE).toEqual({ x: 0, y: 7 });
    expect(RENDER_CANON_TILE).toEqual({ x: 0, y: 7 });
  });

  it("spawns archive the canonical tile", () => {
    const spawned = step(worldWithoutTower(), {
      kind: "apply_effect",
      effect: { kind: "spawn_structure", structure: "black_tower", at: { ...TOWER_POSITION } },
    });
    expect(towerAt(spawned)).toEqual({ x: 0, y: 7 });
  });

  it("the buffer is measured as distance-to-footprint: ring ∩ grid = the three west tiles", () => {
    expect(TOWER_ZONE_RADIUS).toBe(1);
    for (const tile of [
      { x: 1, y: 6 },
      { x: 1, y: 7 },
      { x: 1, y: 8 },
    ]) {
      expect(withinTowerZone(tile, TOWER, TOWER_ZONE_RADIUS)).toBe(true);
    }
    expect(withinTowerZone({ x: 2, y: 7 }, TOWER, TOWER_ZONE_RADIUS)).toBe(false);
  });

  it("the translation walk reaches the buffer ring from across the map", () => {
    let position = { x: 14, y: 14 };
    for (let steps = 0; steps < 100; steps += 1) {
      const next = stepTowardBuffer(position, TOWER_POSITION);
      if (next.x === position.x && next.y === position.y) {
        expect(withinTowerZone(next, TOWER_POSITION, 1)).toBe(true);
        return;
      }
      position = next;
    }
    throw new Error("the walk never arrived");
  });
});

// ---------------------------------------------------------------------------
// 交付形状 2:T0@GV50 生成门。
// ---------------------------------------------------------------------------

describe("tower spawn gate GV50 (ticket 0043, §3.2)", () => {
  it("no tower below GV50, first crossing spawns", () => {
    expect(TOWER_SPAWN_GV).toBe(50);
    expect(towerSpawnDue(0, [])).toBe(false);
    expect(towerSpawnDue(49, [])).toBe(false);
    expect(towerSpawnDue(50, [])).toBe(true);
    expect(towerSpawnDue(100, [])).toBe(true);
    // Junk input is deterministic: T0's gate never opens on NaN.
    expect(towerSpawnDue(Number.NaN, [])).toBe(false);
  });

  it("never spawns twice: a tower in place keeps the gate shut", () => {
    expect(towerSpawnDue(100, [{ kind: "black_tower", at: { x: 0, y: 7 }, createdBy: "director" }])).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 交付形状 3:footprint+1 禁区 enforcement(CI §9.7:1000 次采样交集 = 0)。
// ---------------------------------------------------------------------------

describe("tower no-go zone (ticket 0043, §6.4, CI §9.7)", () => {
  it("pure verdict over 1000 random samples: normals stay out, atavistics may buffer but never the footprint", () => {
    const next = lcg(1997);
    for (let i = 0; i < 1000; i += 1) {
      const tile = randomTile(next);
      const normalAllowed = tileAllowedByTower(tile, TOWER, false);
      const atavisticAllowed = tileAllowedByTower(tile, TOWER, true);
      expect(normalAllowed).toBe(!withinTowerZone(tile, TOWER, TOWER_ZONE_RADIUS));
      // 返祖体豁免缓冲区,永不入 footprint。
      expect(atavisticAllowed).toBe(tile.x !== TOWER.x || tile.y !== TOWER.y);
      // 无塔全图可入。
      expect(tileAllowedByTower(tile, null, false)).toBe(true);
    }
  });

  it("engine move rejects zone entry over 1000 random path samples: paths ∩ buffer = 0", () => {
    const next = lcg(42);
    let rejections = 0;
    for (let i = 0; i < 1000; i += 1) {
      const start = randomTile(next);
      const target = randomTile(next);
      const world = { ...worldWithTower(), creatures: { gazer_01: creatureAt("gazer_01", start) } };
      const moved = step(world, { kind: "move", creatureId: "gazer_01", at: target });
      const final = moved.creatures["gazer_01"]?.position ?? start;
      // 路径与 footprint+1 缓冲区交集 = 0。
      expect(withinTowerZone(final, TOWER, TOWER_ZONE_RADIUS)).toBe(false);
      if (final.x === start.x && final.y === start.y && withinTowerZone(target, TOWER, TOWER_ZONE_RADIUS)) {
        rejections += 1;
      }
    }
    // The zone really does bite: the 1000 samples include rejections.
    expect(rejections).toBeGreaterThan(0);
  });

  it("an atavistic reader walks into the buffer; a normal one cannot", () => {
    let world = {
      ...worldWithTower(),
      creatures: {
        normal: creatureAt("normal", { x: 3, y: 7 }),
        reader: creatureAt("reader", { x: 3, y: 7 }, true),
      },
    };
    let next = step(world, { kind: "move", creatureId: "normal", at: { x: 1, y: 7 } });
    expect(next.creatures["normal"]?.position).toEqual({ x: 3, y: 7 }); // 拒入
    next = step(next, { kind: "move", creatureId: "reader", at: { x: 1, y: 7 } });
    expect(next.creatures["reader"]?.position).toEqual({ x: 1, y: 7 }); // 缓冲区豁免
    // 永不入 footprint:{0,7} 本就 GRID_MIN 之外,判定面同样拒绝。
    const blocked = step(next, { kind: "move", creatureId: "reader", at: { x: 0, y: 7 } });
    expect(blocked.creatures["reader"]?.position).toEqual({ x: 1, y: 7 });
  });

  it("wander never walks a normal creature into the buffer over 30 ticks", () => {
    let world: WorldState = { ...worldWithTower(), creatures: { gazer_01: creatureAt("gazer_01", { x: 4, y: 7 }) } };
    for (let i = 0; i < 30; i += 1) {
      world = step(world, { kind: "tick" });
      const position = world.creatures["gazer_01"]?.position;
      expect(position).toBeDefined();
      if (position !== undefined) {
        expect(withinTowerZone(position, TOWER, TOWER_ZONE_RADIUS)).toBe(false);
      }
    }
  });

  it("leaving the zone is always allowed: an occupant can walk out", () => {
    const world = { ...worldWithTower(), creatures: { legacy: creatureAt("legacy", { x: 1, y: 7 }) } };
    const moved = step(world, { kind: "move", creatureId: "legacy", at: { x: 5, y: 7 } });
    expect(moved.creatures["legacy"]?.position).toEqual({ x: 5, y: 7 });
  });
});

// ---------------------------------------------------------------------------
// 交付形状 4:§6.2 点击反馈两态;交付形状 5:GV90 瞳孔 CENTER sim 信号。
// ---------------------------------------------------------------------------

describe("tower click feedback and the GV90 center pin (ticket 0043, §6.2/§6.4)", () => {
  it("click feedback: silent below GV50, glyphs at 50–59, terminal echo from GV60", () => {
    expect(towerClickFeedback(0)).toBeNull();
    expect(towerClickFeedback(49)).toBeNull();
    expect(towerClickFeedback(50)).toBe("glyphs");
    expect(towerClickFeedback(59)).toBe("glyphs");
    expect(towerClickFeedback(60)).toBe("terminal");
    expect(towerClickFeedback(100)).toBe("terminal");
    expect(towerClickFeedback(Number.NaN)).toBeNull();
  });

  it("the terminal echo line is frozen canon, byte for byte (canon 键已批)", () => {
    expect(canonLine("terminal.glyph_transcribe")).toBe("> ??? ?? ??? ????");
  });

  it("GV90 center pin: idle within 2 tiles of the tower, never before GV90", () => {
    expect(TOWER_PIN_RADIUS).toBe(2);
    expect(pinnedCenterAt({ x: 2, y: 7 }, TOWER, 90, "idle")).toBe(true);
    expect(pinnedCenterAt({ x: 2, y: 7 }, TOWER, 89, "idle")).toBe(false);
    expect(pinnedCenterAt({ x: 2, y: 7 }, TOWER, 90, "hungry")).toBe(false);
    expect(pinnedCenterAt({ x: 3, y: 7 }, TOWER, 90, "idle")).toBe(false);
    expect(pinnedCenterAt({ x: 2, y: 7 }, null, 90, "idle")).toBe(false);
  });
});
