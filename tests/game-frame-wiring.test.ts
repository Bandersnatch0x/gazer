import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  FRAME_NO_CANON_KEY,
  FRAME_SESSION_STORAGE_KEY,
  frameEchoLine,
  nextSpontaneousDegaussAt,
  parseFrameBios,
  parseFrameSession,
  powerOutcomeFor,
  unexpectedShutdownFor,
} from "../src/game";
import type { PowerOutcome } from "../src/game";
import { TICK_MS } from "../src/sim/rhythm";

// 票 0036 接线面:电源三态/消磁账/蠕变存档键的纯面与源码钉面。
// DOM 侧(安装器/同步帧)由 render-crt.test.ts 的纯配方与本文件的源码钉面
// 合力把守;CI 项 4 的 Ledger 断言走 GameHandle.powerLog 的形状约定。

describe("frame wiring: the power tri-state (§4, CI 项 4)", () => {
  it("maps (gv, postEnding) to the three outcomes", () => {
    const table: readonly { gv: number; postEnding: boolean; want: PowerOutcome }[] = [
      { gv: 0, postEnding: false, want: "restart" },
      { gv: 59, postEnding: false, want: "restart" },
      { gv: 60, postEnding: false, want: "rebound" },
      { gv: 79, postEnding: false, want: "rebound" },
      { gv: 80, postEnding: false, want: "denied" },
      { gv: 96, postEnding: false, want: "denied" },
      { gv: 100, postEnding: true, want: "restart" },
    ];
    for (const row of table) {
      expect(powerOutcomeFor(row.gv, row.postEnding)).toBe(row.want);
    }
  });
});

describe("frame wiring: the `> no.` echo travels the canon channel", () => {
  it("resolves the frozen frame.power_no line, never a runtime literal", () => {
    expect(FRAME_NO_CANON_KEY).toBe("frame.power_no");
    expect(frameEchoLine()).toBe("> no.");
  });
});

describe("frame wiring: the spontaneous degauss schedule (§5, CI 项 7)", () => {
  it("is seeded, monotonic, and maps to 30-60 minutes at the 3s tick", () => {
    expect(TICK_MS).toBe(3000);
    const first = nextSpontaneousDegaussAt(2026, 0);
    expect(first).toBe(nextSpontaneousDegaussAt(2026, 0));
    const second = nextSpontaneousDegaussAt(2026, first);
    expect(second).toBeGreaterThan(first);
    // Gap in ticks × 3s lands inside the 30-60 minute window.
    const gapMinutes = ((second - first) * TICK_MS) / 60_000;
    expect(gapMinutes).toBeGreaterThanOrEqual(30);
    expect(gapMinutes).toBeLessThanOrEqual(60);
  });

  it("different seeds diverge (the schedule is not a fixed loop)", () => {
    const a = nextSpontaneousDegaussAt(1, 0);
    const b = nextSpontaneousDegaussAt(2, 0);
    expect(nextSpontaneousDegaussAt(a, 0)).toBe(nextSpontaneousDegaussAt(a, 0));
    expect(nextSpontaneousDegaussAt(b, 0)).toBe(nextSpontaneousDegaussAt(b, 0));
  });
});

describe("frame wiring: the session save records (§3/§4 暗线)", () => {
  it("parses the session record and derives the hard-quit dark line", () => {
    expect(parseFrameSession(null)).toBeNull();
    expect(parseFrameSession("not json")).toBeNull();
    expect(parseFrameSession('{"gv":85,"clean":false}')).toEqual({ gv: 85, clean: false });
    expect(unexpectedShutdownFor({ gv: 85, clean: false })).toBe(true);
    expect(unexpectedShutdownFor({ gv: 85, clean: true })).toBe(false);
    expect(unexpectedShutdownFor({ gv: 40, clean: false })).toBe(false);
    expect(unexpectedShutdownFor(null)).toBe(false);
  });

  it("parses the BIOS creep record, refusing malformed shapes", () => {
    expect(parseFrameBios(null)).toBeNull();
    expect(parseFrameBios("{}")).toBeNull();
    expect(parseFrameBios('{"firstDayMs":100,"resetDone":false}')).toEqual({
      firstDayMs: 100,
      resetDone: false,
    });
    expect(FRAME_SESSION_STORAGE_KEY).toBe("gazer:frame.session");
  });
});

describe("frame wiring: source pins on the owned files", () => {
  const gameSource = readFileSync(fileURLToPath(new URL("../src/game.ts", import.meta.url)), "utf8");
  const audioSource = readFileSync(fileURLToPath(new URL("../src/render/audio.ts", import.meta.url)), "utf8");
  const shellSource = readFileSync(fileURLToPath(new URL("../src/ui/shell.ts", import.meta.url)), "utf8");
  const mainSource = readFileSync(fileURLToPath(new URL("../src/main.ts", import.meta.url)), "utf8");

  it("the GV>=80 refusal books power_override_denied on the wiring ledger", () => {
    expect(gameSource).toContain("power_override_denied");
    expect(gameSource).toContain("powerLog");
  });

  it("the wave blink travels the G4 blink-clock channel, not C-05", () => {
    expect(gameSource).toContain("assertDemagnetizeChannel");
    expect(gameSource).toContain("DEMAGNETIZE_CHANNEL");
    // 眨眼经渲染效果的 creature_wink 直连(接线面),不经执行器请求。
    expect(gameSource).toContain('kind: "creature_wink"');
  });

  it("the audio hardware slots exist and degrade silently by construction", () => {
    expect(audioSource).toContain('"power_click"');
    expect(audioSource).toContain('"degauss_thump"');
    expect(audioSource).toContain('"frame_tick"');
    // blip 的静默降级路径仍然是 ensureGraph 早退。
    expect(audioSource).toContain("blip(kind: BlipKind): void");
  });

  it("the OSD panel lives in the shell layer with the three dials", () => {
    expect(shellSource).toContain("createOsdPanel");
    expect(shellSource).toContain("SCANLINE");
    expect(shellSource).toContain("FLICKER REDUCTION");
    expect(shellSource).toContain("LCD MODE");
    // main 层把三个开关接到 crt handle 上。
    expect(mainSource).toContain("crt.setScanlineAlpha");
    expect(mainSource).toContain("crt.setAperture");
    expect(mainSource).toContain("crt.setLcdMode(true)");
  });

  it("the sync frame drives glare, endings and the LED faces", () => {
    expect(mainSource).toContain("crt.setGlare");
    expect(mainSource).toContain("crt.setEnding");
    expect(mainSource).toContain("crt.tickLed");
    expect(mainSource).toContain("crt.setShadowDepth");
    expect(mainSource).toContain("drainEchoes");
    expect(mainSource).toContain("takeDesync");
    expect(mainSource).toContain("isGazeTower");
  });

  it("terminal.ts stays untouched except by consumption", () => {
    // `> no.` 只经 canonLine 取用;terminal 的 appendRaw 通道已存在,本票不改它。
    expect(gameSource).toContain("frameEchoLine");
    expect(gameSource).not.toContain("startCanonPrint(\"> no.\")");
  });
});

describe("frame wiring: the verify-defect regression pins (票 0039)", () => {
  const crtSource = readFileSync(fileURLToPath(new URL("../src/render/crt.ts", import.meta.url)), "utf8");
  const indexSource = readFileSync(fileURLToPath(new URL("../index.html", import.meta.url)), "utf8");
  const mainSource = readFileSync(fileURLToPath(new URL("../src/main.ts", import.meta.url)), "utf8");
  const mainSource2 = mainSource;

  it("P1: the hardware hotspots reclaim pointer-events from the pass-through frame", () => {
    const hotspotBlock = indexSource.slice(
      indexSource.indexOf(".gazer-crt-hotspot"),
      indexSource.indexOf("}", indexSource.indexOf(".gazer-crt-hotspot")),
    );
    expect(hotspotBlock).toContain("pointer-events: auto");
  });

  it("P2: align() writes explicit CSS boxes on the shell and spill canvases", () => {
    // inset:0 对替换元素(canvas)不生效——必须按 scale 显式写宽高。
    expect(crtSource).toContain("shellCanvas.style.width");
    expect(crtSource).toContain("shellCanvas.style.height");
    expect(crtSource).toContain("spillCanvas.style.width");
    expect(crtSource).toContain("spillCanvas.style.height");
    expect(crtSource).toContain("inset:0 does not size a replaced element");
  });

  it("P3: a ResizeObserver on the world canvas covers non-resize geometry changes", () => {
    expect(crtSource).toContain("new ResizeObserver");
    expect(crtSource).toContain("resizeObserver.observe(canvas)");
    expect(crtSource).toContain("resizeObserver?.disconnect()");
  });

  it("P4: the keyboard reaches terminal.submitInput through the 0020 semantics", () => {
    expect(mainSource2).toContain('addEventListener("keydown"');
    expect(mainSource2).toContain("terminal.submitInput");
    expect(mainSource2).toContain("terminal.playerTyped");
  });

  it("P5 fit + P1 reach: the power verb stays wired through the game handle", () => {
    expect(mainSource2).toContain("gameRef?.powerPress()");
    expect(mainSource2).toContain("crt.shutdown()");
    expect(mainSource2).toContain("crt.dimRebound()");
    expect(mainSource2).toContain("gameRef?.degaussPress()");
    expect(crtSource).toContain("fitScaleFor");
  });
});

describe("frame wiring: the CRT final batch pins (票 0045)", () => {
  const crtSource = readFileSync(fileURLToPath(new URL("../src/render/crt.ts", import.meta.url)), "utf8");
  const gameSource2 = readFileSync(fileURLToPath(new URL("../src/game.ts", import.meta.url)), "utf8");
  const mainSource3 = readFileSync(fileURLToPath(new URL("../src/main.ts", import.meta.url)), "utf8");
  const shellSource = readFileSync(fileURLToPath(new URL("../src/ui/shell.ts", import.meta.url)), "utf8");
  const indexSource = readFileSync(fileURLToPath(new URL("../index.html", import.meta.url)), "utf8");

  it("G-1: firstBoot comes from the save boolean, not a hardcoded true", () => {
    expect(mainSource3).toContain("FRAME_BOOTED_STORAGE_KEY");
    expect(mainSource3).toContain('safeGet(FRAME_BOOTED_STORAGE_KEY) !== "1"');
    expect(mainSource3).toContain('setItem(FRAME_BOOTED_STORAGE_KEY, "1")');
  });

  it("G-2: warm boot is day-gated and the dark BIOS lines come from canon", () => {
    expect(mainSource3).toContain("isWarmBoot");
    expect(mainSource3).toContain("FRAME_DAY_STORAGE_KEY");
    expect(mainSource3).toContain("FRAME_NGPLUS_STORAGE_KEY");
    expect(mainSource3).toContain("canonUnexpectedShutdownLine");
    expect(mainSource3).toContain("canonNgPlusLine");
    expect(mainSource3).toContain("biosExtraLines: bootBiosExtra");
    // 消双源:crt 不再自持暗线正文;game 层从 registry 键取用。
    expect(crtSource).not.toContain("Unexpected shutdown. They were left running.");
    expect(crtSource).not.toContain("previous soul state");
    expect(gameSource2).toContain('canonLine(FRAME_UNEXPECTED_SHUTDOWN_CANON_KEY)');
    expect(gameSource2).toContain('canonLine(FRAME_BIOS_CANON_KEY)');
  });

  it("SD-2: the wave blink is the 16ms eyelid flash on the G4 channel", () => {
    expect(shellSource).toContain("BLINK_FLASH_MS = 16");
    expect(shellSource).toContain("blinkFlash(nowMs)");
    expect(mainSource3).toContain("fxShell.blinkFlash(nowMs)");
    // 260ms 横压面在 game 层仍经渲染效果直连(个体面),注释面钉住 16ms 归属。
    expect(gameSource2).toContain("creature_wink");
  });

  it("SD-3: the button and spontaneous degauss share one event shape", () => {
    expect(gameSource2).toContain("frameEventQueue.push({ kind: \"degauss\", spontaneous })");
    expect(mainSource3).toContain("game.drainFrameEvents()");
    expect(mainSource3).toContain("crt.degauss(nowMs)");
    expect(mainSource3).not.toContain("onDegaussClick: () => {\n    crt.degauss");
  });

  it("SD-4: forgetting aging is session-fed through the setEnding channel", () => {
    expect(mainSource3).toContain("forgettingAgingFor(game.sessionCount())");
    expect(crtSource).toContain("FORGETTING_AGING_STEP");
  });

  it("SD-1: the mobile power button sits bottom-left (§8)", () => {
    expect(crtSource).toContain("MOBILE_BORDER.left + 2");
    expect(indexSource).toContain(".gazer-crt-hotspot");
  });

  it("B-1/B-2: the OSD dial starts at the live 10% and the grille is independent", () => {
    expect(shellSource).toContain("OSD_SCANLINE_DEFAULT = 10");
    expect(shellSource).toContain("let scanPercent = OSD_SCANLINE_DEFAULT");
    // 0% 扫描线不再连带关栅格:paintFx 只看 aperture 开关。
    expect(crtSource).toContain("if (params.aperture) {");
    expect(crtSource).not.toContain("params.aperture && params.scanlineAlpha > 0");
  });

  it("G-4: the bloom layer is the two-point whitelist with baked gradients", () => {
    expect(crtSource).toContain("BLOOM_KINDS");
    expect(crtSource).toContain("bloomPaintOps");
    expect(crtSource).toContain("setBloom");
    expect(crtSource).toContain("bloomSprite");
    expect(mainSource3).toContain("game.bloomPoints()");
    expect(mainSource3).toContain("terminalCursorBloomPoint");
    expect(gameSource2).toContain("readonly bloomPoints: () => readonly BloomPoint[]");
  });

  it("G-7: the true ending runs the 1s dissolve before the counter freeze", () => {
    expect(crtSource).toContain("FULLBLEED_DISSOLVE_MS = 1000");
    expect(crtSource).toContain("dissolveAlphaAt");
    expect(crtSource).toContain("dissolveStart");
    expect(crtSource).toContain("renderCounter.freeze()");
  });
});

describe("frame wiring: the N1 hit-testing pins (票 0040)", () => {
  const crtSource = readFileSync(fileURLToPath(new URL("../src/render/crt.ts", import.meta.url)), "utf8");
  const indexSource = readFileSync(fileURLToPath(new URL("../index.html", import.meta.url)), "utf8");

  function blockOf(source: string, selector: string): string {
    const start = source.indexOf(selector);
    expect(start).toBeGreaterThan(-1);
    return source.slice(start, source.indexOf("}", start));
  }

  it("the hotspots sit in the root stacking context, above #ui", () => {
    // 根因层 1:#stage{contain:paint} 自成 stacking context,内部任何 z-index
    // 都压不过 #ui{z-index:50}——热点必须 position:fixed 挂根语境。
    const block = blockOf(indexSource, ".gazer-crt-hotspot");
    expect(block).toContain("position: fixed");
    expect(block).toContain("pointer-events: auto");
    expect(block).toContain("z-index: 60");
  });

  it("the installer mounts them on <body> and projects the bezel slots", () => {
    expect(crtSource).toContain("doc.body.append(powerButton, degaussButton)");
    expect(crtSource).toContain("placeFixed(powerButton, geo.power)");
    expect(crtSource).toContain("placeFixed(degaussButton, geo.degauss)");
    expect(crtSource).toContain("powerButton.remove()");
    expect(crtSource).toContain("degaussButton.remove()");
  });

  it("the #ui child rule no longer overrides the HUD strip's none intent", () => {
    // 根因层 2:#ui > *(1-0-0)压过 .gazer-hud 的 none(0-1-0),整条底带吃点击。
    expect(indexSource).toContain("#ui > *:not(.gazer-hud)");
    expect(indexSource).not.toMatch(/#ui > \* \{/);
    const hudBlock = blockOf(indexSource, ".gazer-hud {");
    expect(hudBlock).toContain("pointer-events: none");
    // 子部件仍可点(playtest p1 F3 的原意保持)。
    expect(indexSource).toContain(".gazer-hud > *");
  });

  it("the mobile 800ms hold path rides the same reachable hotspot", () => {
    expect(crtSource).toContain("POWER_HOLD_MS");
    expect(crtSource).toContain('powerButton.addEventListener("pointerdown"');
    expect(crtSource).toContain('powerButton.addEventListener("pointerup"');
  });
});
