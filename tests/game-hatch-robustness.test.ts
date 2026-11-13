/**
 * 蛋孵化鲁棒性回归（playtest P1-F4「egg_42 长期不孵化」/ 票 0016 §2）。
 *
 * 实机证据链（e2e/playtest/p1/report.json + 本仓复现探针）：
 * 1. 触发：指针按住期间打开的定UI面板（孵化选择/命名）若压在光标下，
 *    pointerup 被面板截走，canvas 收不到 release；
 * 2. 放大：旧实现用计数器记按压，泄漏 1 之后每次 pointerdown 都被当成
 *    「第二根手指」早退——整个画布交互永久冻结，蛋永远点不出孵化面板
 *    （egg_42 被 150+ 次孵化点击，面板一次都没出现，世界随后饿死）。
 * 3. 潜雷：孵化 id 由 `gazer_${数量+1}` 推导，一旦 creatures 集合非稠密
 *    （未来存档裁剪/导入），id 撞车 → `hatchFromEgg` 静默 no-op → 蛋永久挂起。
 *
 * 本文件锁三件事：sim 层蛋跨天仍可孵、id 推导永不撞车、指针记账可自愈。
 */
import { describe, expect, it } from "vitest";
import { createPointerTally, nextCreatureId } from "../src/game";
import { DEFAULT_MASK, step } from "../src/sim/engine";
import { DAY_CYCLE_TICKS } from "../src/sim/clock";
import type { CreatureState, WorldState } from "../src/sim/types";

function creature(id: string, position = { x: 2, y: 2 }): CreatureState {
  return {
    id,
    species: "gazerling",
    stats: { hunger: 80, hygiene: 80, happiness: 80, energy: 80 },
    behavior: "idle",
    trait: null,
    position,
    palette: ["#fff", "#0f0", "#000"],
    mask: DEFAULT_MASK,
    hatchedAtTick: 0,
    name: null,
    willingness: 40,
    courtshipTicks: 0,
  };
}

function world(creatures: Record<string, CreatureState>): WorldState {
  return {
    tick: 0,
    gv: 0,
    stage: 0,
    creatures,
    structures: [],
    eggs: [],
    uiLabels: {},
    paletteDecay: 0,
    seed: 1997,
    silent: true,
  };
}

describe("egg stays hatchable across a long hang (the egg_42 scenario)", () => {
  it("hatches an egg laid at tick 42 even after 3+ game days of ticks", () => {
    let state = world({ gazer_01: creature("gazer_01"), gazer_02: creature("gazer_02", { x: 3, y: 2 }) });
    // 推进到 tick 42 再产蛋：与实机证据里 egg_42_gazer_01 同款 id。
    for (let i = 0; i < 42; i += 1) {
      state = step(state, { kind: "tick" });
    }
    state = step(state, { kind: "layEgg", parentA: "gazer_01", parentB: "gazer_02", forced: false });
    const eggId = state.eggs[0]?.id ?? "";
    expect(eggId).toBe("egg_42_gazer_01");

    const hatchId = nextCreatureId(state);
    expect(hatchId).toBe("gazer_3");

    // 三天多的无人交互：蛋不孵化、也不失效（孵化没有时间窗条件）。
    for (let i = 0; i < DAY_CYCLE_TICKS * 3; i += 1) {
      state = step(state, { kind: "tick" });
    }
    expect(state.tick).toBeGreaterThanOrEqual(DAY_CYCLE_TICKS * 3 + 42);
    expect(state.eggs.some((egg) => egg.id === eggId)).toBe(true);

    // 玩家此时点击孵化：必须成功消费蛋并产出新个体。
    const hatched = step(state, {
      kind: "hatchFromEgg",
      eggId,
      creatureId: hatchId,
      at: state.eggs[0]?.at ?? { x: 7, y: 7 },
      species: "gazerling",
      choice: "warm",
    });
    expect(hatched.eggs.some((egg) => egg.id === eggId)).toBe(false);
    expect(hatched.creatures[hatchId]).toBeDefined();
  });
});

describe("nextCreatureId never collides", () => {
  it("continues the dense sequence exactly like the old count formula", () => {
    const state = world({
      gazer_01: creature("gazer_01"),
      gazer_02: creature("gazer_02"),
      gazer_03: creature("gazer_03"),
    });
    expect(nextCreatureId(state)).toBe("gazer_4");
  });

  it("skips ids that already exist when the creature set is not dense", () => {
    // 非稠密集合（3 只初始 + 一只 gazer_5）：旧公式 数量+1 = gazer_5 撞车。
    const state = world({
      gazer_01: creature("gazer_01"),
      gazer_02: creature("gazer_02"),
      gazer_03: creature("gazer_03"),
      gazer_5: creature("gazer_5"),
    });
    expect(nextCreatureId(state)).toBe("gazer_6");
  });

  it("walks past double digits without reusing a suffix", () => {
    const creatures: Record<string, CreatureState> = {};
    for (let n = 1; n <= 9; n += 1) {
      const id = n <= 3 ? `gazer_0${n}` : `gazer_${n}`;
      creatures[id] = creature(id);
    }
    const state = world(creatures);
    expect(nextCreatureId(state)).toBe("gazer_10");
  });

  it("avoids every existing id, not only gazer-shaped ones", () => {
    const state = world({ gazer_01: creature("gazer_01"), watcher: creature("watcher") });
    const id = nextCreatureId(state);
    expect(Object.keys(state.creatures)).not.toContain(id);
  });
});

describe("the id collision trap the old formula had", () => {
  it("documents it: a colliding id makes hatchFromEgg silently strand the egg", () => {
    const state = world({
      gazer_01: creature("gazer_01"),
      gazer_02: creature("gazer_02"),
      gazer_03: creature("gazer_03"),
      gazer_5: creature("gazer_5"),
    });
    const laid = step(state, { kind: "layEgg", parentA: "gazer_01", parentB: "gazer_02", forced: false });
    const eggId = laid.eggs[0]?.id ?? "";

    // 旧公式：数量+1 → gazer_5，与现存个体撞车 → 引擎拒绝、蛋原地不动。
    const legacyId = `gazer_${Object.keys(laid.creatures).length + 1}`;
    expect(legacyId).toBe("gazer_5");
    const stuck = step(laid, {
      kind: "hatchFromEgg",
      eggId,
      creatureId: legacyId,
      at: { x: 2, y: 2 },
      species: "gazerling",
      choice: "immediate",
    });
    expect(stuck.eggs.some((egg) => egg.id === eggId)).toBe(true);
    expect(stuck.creatures["gazer_5"]).toBeDefined();

    // 新推导：空位 id → 同一枚蛋正常孵化。
    const hatched = step(laid, {
      kind: "hatchFromEgg",
      eggId,
      creatureId: nextCreatureId(laid),
      at: { x: 2, y: 2 },
      species: "gazerling",
      choice: "immediate",
    });
    expect(hatched.eggs.some((egg) => egg.id === eggId)).toBe(false);
    expect(hatched.creatures[nextCreatureId(laid)]).toBeDefined();
  });
});

describe("pointer tally self-heals instead of freezing (ticket 0016 §2)", () => {
  it("lets the only pointer act, and reports it as the last one on release", () => {
    const pointers = createPointerTally();
    expect(pointers.press(1)).toBe(true);
    expect(pointers.release(1)).toBe(true);
  });

  it("blocks a genuine second concurrent pointer, like the old guard", () => {
    const pointers = createPointerTally();
    expect(pointers.press(1)).toBe(true);
    expect(pointers.press(2)).toBe(false); // 第二根手指是手势，不是第二个动词
    expect(pointers.release(2)).toBe(false);
    expect(pointers.release(1)).toBe(true);
    expect(pointers.press(1)).toBe(true); // 世界继续可用
  });

  it("self-heals when an overlay steals the pointerup (the egg_42 leak)", () => {
    const pointers = createPointerTally();
    expect(pointers.press(1)).toBe(true);
    // 没有 release：面板在光标下打开，pointerup 被面板截走。
    // 旧计数器在这里永久泄漏；同 id 再次按下必须仍可动作。
    expect(pointers.press(1)).toBe(true);
    expect(pointers.release(1)).toBe(true);
    expect(pointers.press(1)).toBe(true);
  });

  it("treats a stray release as a no-op, not as corrupting the tally", () => {
    const pointers = createPointerTally();
    expect(pointers.release(99)).toBe(false);
    expect(pointers.press(1)).toBe(true);
    pointers.cancel(1);
    expect(pointers.press(1)).toBe(true);
  });
});
