/**
 * Ticket 0068 — race & robustness regression tests.
 *
 * Pure helpers are imported directly; the DOM-bound `createGame()` closure is
 * pinned by source assertions (no test constructs a real game / WebAudio).
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  createSceneEpoch,
  createVisibilityDriver,
  debugWriteFaceEnabled,
  sceneDelivery,
} from "../src/game";
import {
  CLOSEUP_DUCK_RAMP_MS,
  CLOSEUP_UNDUCK_RAMP_MS,
  createCloseupDuck,
} from "../src/render/app";

const gameSource = readFileSync(fileURLToPath(new URL("../src/game.ts", import.meta.url)), "utf8");
const appSource = readFileSync(fileURLToPath(new URL("../src/render/app.ts", import.meta.url)), "utf8");

describe("0068 (1) directScene epoch — out-of-order replies are dropped", () => {
  it("drops the older token once a newer request is issued", () => {
    const epoch = createSceneEpoch();
    const first = epoch.next();
    const second = epoch.next();
    expect(first).toBe(1);
    expect(second).toBe(2);
    expect(epoch.current).toBe(2);

    expect(sceneDelivery(epoch, first, { value: "old scene" })).toEqual({ status: "dropped" });
    expect(sceneDelivery(epoch, second, { value: "new scene" })).toEqual({
      status: "deliver",
      scene: { value: "new scene" },
    });
  });

  it("a stale reply cannot even speak a manual fallback", () => {
    const epoch = createSceneEpoch();
    const first = epoch.next();
    epoch.next();
    expect(sceneDelivery(epoch, first, null)).toEqual({ status: "dropped" });
    expect(sceneDelivery(epoch, epoch.current, null)).toEqual({ status: "manual" });
  });

  it("rejects foreign / non-finite tokens and delivers only the live one", () => {
    const epoch = createSceneEpoch();
    const live = epoch.next();
    expect(epoch.isCurrent(live)).toBe(true);
    expect(epoch.isCurrent(live + 1)).toBe(false);
    expect(epoch.isCurrent(0)).toBe(false);
    expect(epoch.isCurrent(Number.NaN)).toBe(false);
    expect(sceneDelivery(epoch, live, { value: "ok" }).status).toBe("deliver");
  });

  it("pins the game.ts wiring: token taken at request, delivery checked in .then", () => {
    expect(gameSource).toContain("const token = sceneEpoch.next();");
    expect(gameSource).toContain("sceneDelivery(sceneEpoch, token, scene)");
    expect(gameSource).toContain("if (!sceneEpoch.isCurrent(token))");
  });
});

describe("0068 (2) visibilitychange — returning never backfills world ticks", () => {
  it("pauses while hidden and only re-arms on return; tick count never jumps", () => {
    let nextHandle = 0;
    let fire: () => void = () => {};
    let tickCount = 0;
    let clearCalls = 0;
    const driver = createVisibilityDriver({
      setInterval: (fn) => {
        nextHandle += 1;
        fire = fn;
        return nextHandle;
      },
      clearInterval: () => {
        clearCalls += 1;
      },
      intervalMs: 3000,
      tick: () => {
        tickCount += 1;
      },
    });
    driver.start();
    expect(driver.running).toBe(true);
    fire();
    fire();
    expect(tickCount).toBe(2);

    driver.onVisibility(true); // tab hidden
    expect(driver.running).toBe(false);
    expect(tickCount).toBe(2); // no backfill at pause

    driver.onVisibility(false); // tab returns
    expect(driver.running).toBe(true);
    expect(tickCount).toBe(2); // KEY: no catch-up steps on return

    fire();
    expect(tickCount).toBe(3); // only the re-armed interval drives ticks
    expect(nextHandle).toBe(2);
    driver.stop();
    expect(driver.running).toBe(false);
    expect(clearCalls).toBe(2);
  });

  it("is idempotent: repeated hidden/visible events do not stack intervals", () => {
    let armed = 0;
    const driver = createVisibilityDriver({
      setInterval: () => {
        armed += 1;
        return armed;
      },
      clearInterval: () => {},
      intervalMs: 3000,
      tick: () => {},
    });
    driver.start();
    driver.onVisibility(true);
    driver.onVisibility(true);
    driver.onVisibility(false);
    driver.onVisibility(false);
    expect(armed).toBe(2); // initial + one resume, never stacked
    expect(driver.running).toBe(true);
  });

  it("pins the game.ts wiring: listener installed/removed, no Date.now() catch-up", () => {
    expect(gameSource).toContain('doc.addEventListener("visibilitychange", onVisibilityChange)');
    expect(gameSource).toContain('doc.removeEventListener("visibilitychange", onVisibilityChange)');
    expect(gameSource).toContain("createVisibilityDriver(");
    expect(gameSource).not.toContain("const timer = setInterval(");
  });
});

describe("0068 (3) throttled save — no per-tick JSON.stringify", () => {
  it("pins that the per-tick session stringify is gone and saveWorld is throttled", () => {
    expect(gameSource).not.toContain(
      'storageSet(FRAME_SESSION_STORAGE_KEY, JSON.stringify({ gv: Math.round(world.gv), clean: false }))',
    );
    expect(gameSource).toContain("writeSessionSnapshot(false)");
    expect(gameSource).toContain("writeSessionSnapshot(true)");
    expect(gameSource).toContain("WORLD_SAVE_THROTTLE_MS");
    expect(gameSource).toContain("saveWorld(storage, world)");
  });
});

describe("0068 (4) unified debug gate", () => {
  it("debugWriteFaceEnabled is DEV && debug=1", () => {
    expect(debugWriteFaceEnabled(true, "1")).toBe(true);
    expect(debugWriteFaceEnabled(false, "1")).toBe(false);
    expect(debugWriteFaceEnabled(true, null)).toBe(false);
  });

  it("pins the studio bridge behind the same debugEnabled gate", () => {
    expect(gameSource).toContain(
      "const debugEnabled = debugWriteFaceEnabled(import.meta.env.DEV, debugParam);",
    );
    expect(gameSource).toContain("if (debugEnabled) {");
    expect(gameSource).toContain("installStudioBridge();");
    expect(gameSource).not.toContain('if (debugParam === "1")');
  });
});

describe("0068 (5) close-up duck — parameterized on the existing engine, idempotent", () => {
  it("ducks once and undocks once; repeated calls are no-ops", () => {
    const calls: string[] = [];
    const audio = {
      duckAmbient: (db: number, ramp: number): void => {
        calls.push(`duck:${db}:${ramp}`);
      },
      unduckAmbient: (ramp: number): void => {
        calls.push(`unduck:${ramp}`);
      },
    };
    const duck = createCloseupDuck(audio);
    duck.set(true);
    duck.set(true);
    expect(duck.active).toBe(true);
    duck.set(false);
    duck.set(false);
    expect(duck.active).toBe(false);
    expect(calls).toEqual([
      `duck:-4:${CLOSEUP_DUCK_RAMP_MS}`,
      `unduck:${CLOSEUP_UNDUCK_RAMP_MS}`,
    ]);
  });

  it("pins that the engine is never disposed/recreated by the duck", () => {
    expect(appSource).not.toContain("rebuildAudio");
    expect(appSource).toContain("audio.duckAmbient(CLOSEUP_DUCK_DB, CLOSEUP_DUCK_RAMP_MS)");
    expect(appSource).toContain("audio.unduckAmbient(CLOSEUP_UNDUCK_RAMP_MS)");
    expect(appSource).toContain("const audio: AudioEngine = createAudio({ volume: BASE_VOLUME })");
  });
});
