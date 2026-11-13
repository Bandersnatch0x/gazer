import { describe, expect, it } from "vitest";
import {
  TAP_REACH_TILES,
  TOWER_POSITION,
  debugWriteFaceEnabled,
  nearestCreature,
  nearestCreatureInReach,
  stepTowardBuffer,
} from "../src/game";
import { step } from "../src/sim/engine";
import type { CreatureState, WorldState } from "../src/sim/types";

// ---------------------------------------------------------------------------
// 构造面:0055 联调缺陷批的最小世界。
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

function worldWith(creatures: Readonly<Record<string, CreatureState>>): WorldState {
  return {
    tick: 0,
    gv: 100,
    stage: 4,
    creatures,
    structures: [{ kind: "black_tower", at: { ...TOWER }, createdBy: "director" }],
    eggs: [],
    uiLabels: {},
    paletteDecay: 0,
    seed: 1997,
    silent: true,
    glyphsRead: [],
  };
}

/** 确定性 LCG,供 wander 模拟循环,无 Math.random。 */
function lcg(seed: number): () => number {
  let x = seed >>> 0;
  return () => {
    x = (Math.imul(x, 1664525) + 1013904223) >>> 0;
    return x / 4294967296;
  };
}

function clampTile(value: number): number {
  return Math.min(14, Math.max(1, value));
}

// ---------------------------------------------------------------------------
// B-4:同格并列 nearestCreature 平局改确定性 id tie。
// ---------------------------------------------------------------------------

describe("B-4: nearestCreature same-cell tie is deterministic (ticket 0055)", () => {
  it("picks the lowest id when several creatures share the tapped cell", () => {
    // 插入序 gazer_05 在前(generator 记录序),平局必须落 gazer_01。
    const world = worldWith({
      gazer_05: creatureAt("gazer_05", { x: 3, y: 3 }),
      gazer_01: creatureAt("gazer_01", { x: 3, y: 3 }),
    });
    expect(nearestCreature(world, { x: 3, y: 3 })?.id).toBe("gazer_01");
  });

  it("is id-stable across equal-distance cells, not insertion order", () => {
    const world = worldWith({
      gazer_09: creatureAt("gazer_09", { x: 2, y: 3 }),
      gazer_02: creatureAt("gazer_02", { x: 4, y: 3 }),
    });
    // 两枚距 (3,3) 均 1:平局落 id 字典序最小者,重复调用恒同答。
    expect(nearestCreature(world, { x: 3, y: 3 })?.id).toBe("gazer_02");
    expect(nearestCreature(world, { x: 3, y: 3 })?.id).toBe("gazer_02");
  });

  it("still answers the strictly nearest creature first", () => {
    const world = worldWith({
      gazer_01: creatureAt("gazer_01", { x: 8, y: 8 }),
      gazer_02: creatureAt("gazer_02", { x: 4, y: 3 }),
    });
    expect(nearestCreature(world, { x: 3, y: 3 })?.id).toBe("gazer_02");
  });
});

// ---------------------------------------------------------------------------
// B-3:点击路由邻近门 —— 塔身落点可达塔反馈,返祖体读者可选中。
// ---------------------------------------------------------------------------

describe("B-3: the tap reach gate opens the tower feedback branch (ticket 0055)", () => {
  it("rejects far creatures: a tower tap with the flock elsewhere reaches the tower branch", () => {
    const world = worldWith({ gazer_01: creatureAt("gazer_01", { x: 10, y: 10 }) });
    const tap = { x: 0, y: 7 }; // footprint
    expect(TAP_REACH_TILES).toBe(2);
    // 邻近门:footprint 落点无个体够得着 → 路由落到塔反馈分支。
    expect(nearestCreatureInReach(world, tap)).toBeNull();
    expect(towerClickGate(tap, world)).toBe("tower");
  });

  it("keeps the atavistic reader selectable while it stands in the buffer", () => {
    const world = worldWith({ gazer_4: creatureAt("gazer_4", { x: 1, y: 7 }, true) });
    // 读者站在缓冲区:落点命中读者(距离 0),选中优先于塔反馈。
    const reader = nearestCreatureInReach(world, { x: 1, y: 7 });
    expect(reader?.id).toBe("gazer_4");
    expect(towerClickGate({ x: 1, y: 7 }, world)).toBe("creature");
  });

  it("a far tap with nobody in reach answers nothing at all", () => {
    const world = worldWith({ gazer_01: creatureAt("gazer_01", { x: 14, y: 14 }) });
    expect(nearestCreatureInReach(world, { x: 3, y: 3 })).toBeNull();
  });

  function towerClickGate(tap: { x: number; y: number }, world: WorldState): "tower" | "creature" {
    // 镜像 pointerup 的路由序(票 0055 B-3):邻近个体优先,否则塔反馈。
    return nearestCreatureInReach(world, tap) !== null ? "creature" : "tower";
  }
});

// ---------------------------------------------------------------------------
// B-8:翻译流行进态屏蔽 wander —— 净位移恒一格,有限步到达。
// ---------------------------------------------------------------------------

describe("B-8: the translation walk makes net progress despite wander (ticket 0055)", () => {
  it("arrives at the buffer in finitely many ticks: wander is pinned each tick", () => {
    const next = lcg(1997);
    let world = worldWith({ gazer_4: creatureAt("gazer_4", { x: 8, y: 6 }, true) });
    let basePos = { x: 8, y: 6 };
    for (let ticks = 0; ticks < 60; ticks += 1) {
      // step(tick) 的 wander:随机相邻挪动(引擎钳制 + 禁区由返祖豁免)。
      const dx = Math.sign(next() - 0.5) * (next() < 0.8 ? 1 : 0);
      const dy = Math.sign(next() - 0.5) * (next() < 0.8 ? 1 : 0);
      const drifted = { x: clampTile(basePos.x + dx), y: clampTile(basePos.y + dy) };
      world = step(world, { kind: "move", creatureId: "gazer_4", at: drifted });
      // 逐 tick 拉回基准位(接线面的 pin)。
      world = step(world, { kind: "move", creatureId: "gazer_4", at: basePos });
      // 流程行进:从基准位推进一格。
      const target = stepTowardBuffer(basePos, TOWER_POSITION);
      if (target.x === basePos.x && target.y === basePos.y) {
        // 到达:世界位置与基准位一致,且落在缓冲区。
        const reader = world.creatures["gazer_4"]?.position;
        expect(reader).toEqual(basePos);
        expect(
          Math.max(Math.abs(basePos.x - TOWER_POSITION.x), Math.abs(basePos.y - TOWER_POSITION.y)),
        ).toBeLessThanOrEqual(1);
        return;
      }
      world = step(world, { kind: "move", creatureId: "gazer_4", at: target });
      basePos = target;
    }
    throw new Error("the pinned walk never arrived");
  });
});

// ---------------------------------------------------------------------------
// B-1:dev-only debug 写面的纯开关(生产零暴露)。
// ---------------------------------------------------------------------------

describe("B-1: the debug write face is dev-only (ticket 0055)", () => {
  it("opens only on a dev build with ?debug=1", () => {
    expect(debugWriteFaceEnabled(true, "1")).toBe(true);
    expect(debugWriteFaceEnabled(false, "1")).toBe(false);
    expect(debugWriteFaceEnabled(true, null)).toBe(false);
    expect(debugWriteFaceEnabled(true, "0")).toBe(false);
    expect(debugWriteFaceEnabled(false, null)).toBe(false);
  });
});
