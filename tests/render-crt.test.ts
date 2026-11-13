import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  APERTURE_ALPHA,
  BEEP_TOLERANCE_MS,
  BORDER,
  COLD_AUDIO_BEATS,
  COLD_BOOT_TOLERANCE_MS,
  COLD_BOOT_TOTAL_MS,
  COLD_TIMELINE,
  createRenderCallCounter,
  DEFAULT_BIOS_MEMORY_K,
  DEGAUSS_BUTTON,
  DESKTOP_GEOMETRY,
  DESYNC_MAX_GV,
  DESYNC_MIN_GV,
  DESYNC_TICKS_PER_HOUR,
  desyncTickInHour,
  DROP_SHADOW_BASE_PX,
  DROP_SHADOW_MAX_PX,
  DROP_SHADOW_STEP_PX,
  dropShadowPxFor,
  EDGE_DARKEN_PX,
  endingFrameFor,
  FORGETTING_LED_DEAD_SESSIONS,
  FRAME_HEIGHT,
  FRAME_WIDTH,
  FULLBLEED_HIDDEN_LAYERS,
  GLARE_ALPHA,
  GLARE_BAND_PX,
  GLARE_FADE_START_GV,
  GLARE_JUDGMENT_ALPHA,
  glareAlphaForGv,
  LED_CURSOR_BEAT_MS,
  LED_SLOT,
  ledBeatVisible,
  ledDeadFor,
  LOGICAL_HEIGHT,
  LOGICAL_WIDTH,
  MOBILE_COLD_TIMELINE,
  MOBILE_COLD_BOOT_TOTAL_MS,
  MOBILE_GEOMETRY,
  MOBILE_WARM_BOOT_TOTAL_MS,
  MOBILE_BORDER,
  NAMEPLATE_SHORT,
  NAMEPLATE_TEXT,
  POWER_BUTTON,
  POWER_DIM_AMOUNT,
  POWER_DIM_MS,
  POWER_HOLD_MS,
  PROGRESS_BLOCKS,
  RESERVED_FX,
  SCANLINE_ALPHA,
  SCANLINE_PERIOD_PX,
  SHELL_BEIGE,
  SHELL_DUST_SPECKS,
  SHELL_EDGE,
  SHUTDOWN_BLACK_HOLD_MS,
  SHUTDOWN_SHRINK_MS,
  SPONT_DEGAUSS_MAX_TICKS,
  SPONT_DEGAUSS_MIN_TICKS,
  SPONT_DEGAUSS_MIN_GV,
  SPLASH_LOGO_MASK,
  SPLASH_TAGLINE,
  VIGNETTE_ALPHA,
  WARM_AUDIO_BEATS,
  WARM_BOOT_TOLERANCE_MS,
  WARM_BOOT_TOTAL_MS,
  WARM_TIMELINE,
  apertureColumns,
  beatsCrossed,
  biosLines,
  biosMemoryK,
  BLOOM_KINDS,
  bloomPaintOps,
  bootFrame,
  degaussWaveProgress,
  dissolveAlphaAt,
  FORGETTING_AGING_STEP,
  forgettingAgingFor,
  FULLBLEED_DISSOLVE_MS,
  fxPaintOps,
  fxParamsDefault,
  fitScaleFor,
  geometryFor,
  isWarmBoot,
  memoryCreepDays,
  mixHex,
  MOBILE_COLD_AUDIO_BEATS,
  MOBILE_WARM_AUDIO_BEATS,
  nextSpontaneousDegaussTick,
  powerActionFor,
  powerHoldFires,
  scanlineTile,
  scanlineTileWithAlpha,
  screenRect,
  shellPaintOps,
  skipTarget,
  spontaneousDegaussGapTicks,
} from "../src/render/crt";
import type { BloomPoint } from "../src/render/crt";
import { CURSOR_ON_MS, EROSION_STEP_GV } from "../src/ui/terminal";
import { clampOsdScanline, nextOsdScanline } from "../src/ui/shell";

// ART-CORE-04 (ticket 0022) CI 验收 1/2/3:全部以时间轴常量与纯配方断言;
// 音频位只验证拍表(本票静默 stub,不实现声音)。

describe("crt: boot timeline on a constant axis (CI 3)", () => {
  it("cold boot totals 6.5s within ±0.3s", () => {
    expect(COLD_BOOT_TOTAL_MS).toBe(6500);
    expect(COLD_BOOT_TOTAL_MS).toBeGreaterThanOrEqual(6500 - COLD_BOOT_TOLERANCE_MS);
    expect(COLD_BOOT_TOTAL_MS).toBeLessThanOrEqual(6500 + COLD_BOOT_TOLERANCE_MS);
  });

  it("warm boot totals 2.5s within ±0.2s", () => {
    expect(WARM_BOOT_TOTAL_MS).toBe(2500);
    expect(WARM_BOOT_TOTAL_MS).toBeGreaterThanOrEqual(2500 - WARM_BOOT_TOLERANCE_MS);
    expect(WARM_BOOT_TOTAL_MS).toBeLessThanOrEqual(2500 + WARM_BOOT_TOLERANCE_MS);
  });

  it("POST beep lands at 2.2s within ±0.05s, on both boots", () => {
    expect(COLD_TIMELINE.beepMs).toBe(2200);
    expect(Math.abs(COLD_TIMELINE.beepMs - 2200)).toBeLessThanOrEqual(BEEP_TOLERANCE_MS);
    expect(WARM_TIMELINE.beepMs).toBeGreaterThan(0);
    expect(WARM_TIMELINE.beepMs).toBeLessThan(WARM_BOOT_TOTAL_MS);
  });

  it("cold beats run in spec order: line → noise → bios → splash → progress → world", () => {
    const T = COLD_TIMELINE;
    expect(T.lineStartMs).toBe(200);
    expect(T.noiseStartMs).toBe(1400);
    expect(T.biosStartMs).toBe(2200);
    expect(T.splashStartMs).toBe(4000);
    expect(T.progressStartMs).toBe(5500);
    expect(T.endMs).toBe(6500);
    expect(T.lineStartMs).toBeLessThan(T.noiseStartMs);
    expect(T.noiseStartMs).toBeLessThan(T.biosStartMs);
    expect(T.biosStartMs).toBeLessThan(T.splashStartMs);
    expect(T.splashStartMs).toBeLessThan(T.progressStartMs);
    expect(T.progressStartMs).toBeLessThan(T.endMs);
  });

  it("skip rule: unlocked after 1.4s, jumps to the 5.5s mark", () => {
    expect(COLD_TIMELINE.skipAfterMs).toBe(1400);
    expect(COLD_TIMELINE.skipToMs).toBe(5500);
  });
});

describe("crt: boot frame phases follow the timeline", () => {
  it("cold: black → white line expands → noise → bios → splash → progress → done", () => {
    expect(bootFrame(0, true).phase).toBe("black");
    expect(bootFrame(199, true).phase).toBe("black");

    const early = bootFrame(210, true);
    expect(early.phase).toBe("expand");
    expect(early.lineHeightPx).toBeGreaterThanOrEqual(1);
    const mid = bootFrame(800, true);
    expect(mid.lineHeightPx).toBe(Math.round((800 - 200) / 1200 * LOGICAL_HEIGHT));
    expect(bootFrame(1399, true).phase).toBe("expand");

    expect(bootFrame(1400, true).phase).toBe("noise");
    expect(bootFrame(1400, true).noise).toBe(true);
    expect(bootFrame(2199, true).phase).toBe("noise");

    const bios = bootFrame(2200, true);
    expect(bios.phase).toBe("bios");
    expect(bios.bios).toHaveLength(1);
    expect(bootFrame(2601, true).bios).toHaveLength(2);
    // 全部 BIOS 行(含暗线槽)在 splash 之前出完。
    expect(bootFrame(3999, true).bios.length).toBe(
      biosLines(DEFAULT_BIOS_MEMORY_K, null).length,
    );

    expect(bootFrame(4000, true).phase).toBe("splash");
    expect(bootFrame(4000, true).splash).toBe(true);
    expect(bootFrame(4000, true).bios).toHaveLength(0);
    expect(bootFrame(5499, true).phase).toBe("splash");

    expect(bootFrame(5500, true).phase).toBe("progress");
    expect(bootFrame(5500, true).blocks).toBe(0);
    expect(bootFrame(5626, true).blocks).toBe(1);
    expect(bootFrame(6499, true).blocks).toBeLessThan(PROGRESS_BLOCKS);

    const done = bootFrame(6500, true);
    expect(done.phase).toBe("done");
    expect(done.lineHeightPx).toBe(LOGICAL_HEIGHT);
  });

  it("warm: keeps beep + splash, omits the BIOS detail, still 2.5s", () => {
    expect(bootFrame(0, false).phase).toBe("black");
    expect(bootFrame(799, false).phase).toBe("black");
    expect(bootFrame(800, false).phase).toBe("splash");
    expect(bootFrame(800, false).splash).toBe(true);
    expect(bootFrame(2499, false).bios).toHaveLength(0);
    expect(bootFrame(2500, false).phase).toBe("done");
  });

  it("progress bar is the 8-block chunky run", () => {
    expect(PROGRESS_BLOCKS).toBe(8);
    expect(bootFrame(6499, true).blocks).toBeGreaterThan(0);
  });
});

describe("crt: BIOS text with the two hidden-line slots", () => {
  it("carries the two required canon lines verbatim", () => {
    const lines = biosLines(640, null);
    expect(lines).toContain("Lumen Soft LS-97 BIOS v2.31");
    expect(lines).toContain("Memory Test: 640K OK");
    expect(lines).toContain("Detecting: THRESHOLD.EXE ... FOUND");
    expect(lines).toHaveLength(3);
  });

  it("the settlement slot appends a second Detecting line when named", () => {
    const lines = biosLines(640, "settlement_01");
    expect(lines).toContain("Detecting: settlement_01 ... FOUND");
    expect(lines).toHaveLength(4);
  });

  it("the memory creep slot moves the count, never the format", () => {
    expect(biosLines(641, null)).toContain("Memory Test: 641K OK");
    expect(DEFAULT_BIOS_MEMORY_K).toBe(640);
  });
});

describe("crt: scanline period is exactly 2px (CI 2)", () => {
  it("the 2×2 tile carries one 1px dark row at 10%", () => {
    expect(SCANLINE_PERIOD_PX).toBe(2);
    const tile = scanlineTile();
    expect(tile).toHaveLength(2);
    for (const row of tile) {
      expect(row).toHaveLength(2);
    }
    const dark = tile.filter((row) => (row[0] ?? 0) > 0);
    expect(dark).toHaveLength(1);
    expect(dark[0]?.[0]).toBe(SCANLINE_ALPHA);
    expect(SCANLINE_ALPHA).toBe(0.1);
    expect(dark[0]?.[1]).toBe(SCANLINE_ALPHA);
  });
});

describe("crt: framing purity — no shell pixel inside the screen rect (CI 1)", () => {
  const screen = screenRect();

  it("screen rect sits inside the native frame, offset by the border widths", () => {
    expect(FRAME_WIDTH).toBe(LOGICAL_WIDTH + BORDER.left + BORDER.right);
    expect(FRAME_HEIGHT).toBe(LOGICAL_HEIGHT + BORDER.top + BORDER.bottom);
    expect(screen).toEqual({ x: BORDER.left, y: BORDER.top, w: LOGICAL_WIDTH, h: LOGICAL_HEIGHT });
  });

  it("every shell paint op stays outside the screen rect", () => {
    for (const op of shellPaintOps()) {
      if (op.kind === "rect") {
        const overlaps =
          op.x < screen.x + screen.w &&
          op.x + op.w > screen.x &&
          op.y < screen.y + screen.h &&
          op.y + op.h > screen.y;
        expect({ op, overlaps }).toEqual({ op, overlaps: false });
      } else {
        // Ink ops must sit in the border bands, never over the picture.
        expect(op.y).toBeGreaterThanOrEqual(screen.y + screen.h);
      }
    }
  });

  it("body bands plus 4px edge strips cover the frame edges", () => {
    const ops = shellPaintOps();
    const rects = ops.filter((op): op is Extract<typeof op, { kind: "rect" }> => op.kind === "rect");
    expect(rects.some((r) => r.color === SHELL_BEIGE && r.y === 0 && r.h === BORDER.top)).toBe(true);
    expect(rects.some((r) => r.color === SHELL_BEIGE && r.y === screen.y + screen.h && r.h === BORDER.bottom)).toBe(true);
    expect(rects.some((r) => r.color === SHELL_EDGE && r.h === EDGE_DARKEN_PX && r.y === 0)).toBe(true);
    expect(rects.some((r) => r.color === SHELL_EDGE && r.h === EDGE_DARKEN_PX && r.y === FRAME_HEIGHT - EDGE_DARKEN_PX)).toBe(true);
    expect(SHELL_BEIGE).toBe("#D8CBAF");
    expect(SHELL_EDGE).toBe("#C4B79C");
  });

  it("nameplate, power button, LED slot and degauss button sit in the bottom band", () => {
    const bottom = screen.y + screen.h;
    expect(NAMEPLATE_TEXT).toBe("Lumen Soft LS-97");
    for (const hardware of [POWER_BUTTON, LED_SLOT, DEGAUSS_BUTTON]) {
      expect(hardware.y).toBeGreaterThanOrEqual(bottom);
      expect(hardware.y + hardware.h).toBeLessThanOrEqual(FRAME_HEIGHT);
    }
    expect(POWER_BUTTON).toEqual({ x: FRAME_WIDTH - BORDER.right - 4 - 18, y: FRAME_HEIGHT - BORDER.bottom + 5, w: 18, h: 18 });
    expect(DEGAUSS_BUTTON.x).toBeLessThan(LED_SLOT.x);
    expect(LED_SLOT.x).toBeLessThan(POWER_BUTTON.x);
  });

  it("the effect-layer recipe is the only thing allowed over the screen", () => {
    const ops = fxPaintOps();
    expect(ops.map((op) => op.kind)).toEqual(["scanlines", "rgbStripes", "vignette", "glare"]);
    const glare = ops.find((op) => op.kind === "glare");
    expect(glare).toEqual({ kind: "glare", alpha: GLARE_ALPHA, bandPx: GLARE_BAND_PX });
    expect(GLARE_ALPHA).toBe(0.05);
    expect(GLARE_BAND_PX).toBeGreaterThanOrEqual(12);
    expect(GLARE_BAND_PX).toBeLessThanOrEqual(20);
  });
});

describe("crt: effect layer parameters (§2.2)", () => {
  it("aperture grille is three 1px RGB columns at 3%, toggleable", () => {
    const columns = apertureColumns();
    expect(columns).toHaveLength(3);
    expect(columns.map((c) => c.color)).toEqual(["#ff0000", "#00ff00", "#0000ff"]);
    for (const column of columns) {
      expect(column.alpha).toBe(APERTURE_ALPHA);
      expect(APERTURE_ALPHA).toBe(0.03);
    }
    expect(fxPaintOps().some((op) => op.kind === "rgbStripes")).toBe(true);
  });

  it("vignette is the 8% corner falloff", () => {
    expect(VIGNETTE_ALPHA).toBe(0.08);
    expect(fxPaintOps().some((op) => op.kind === "vignette")).toBe(true);
  });

  it("the scanline op carries the exact 2px tile", () => {
    const op = fxPaintOps().find((entry) => entry.kind === "scanlines");
    expect(op).toEqual({ kind: "scanlines", tile: scanlineTile() });
  });

  it("barrel distortion and breathing stay reserved slots, not implemented (R11)", () => {
    expect(RESERVED_FX).toEqual({ barrelDistortion: 0.015, breathingAmplitude: 0.015, breathingPeriodMs: 12000 });
    // The baked recipe must not contain them: nothing per-frame is allowed.
    expect(fxPaintOps().map((op) => op.kind)).not.toContain("distortion");
    expect(fxPaintOps().map((op) => op.kind)).not.toContain("breathing");
  });
});

describe("crt: skip rule (§3)", () => {
  it("first boot can never skip", () => {
    expect(skipTarget(3000, { cold: true, firstBoot: true })).toBeNull();
  });

  it("cold boot skips only after 1.4s, landing on the 5.5s mark", () => {
    expect(skipTarget(1399, { cold: true, firstBoot: false })).toBeNull();
    expect(skipTarget(1400, { cold: true, firstBoot: false })).toBe(5500);
    expect(skipTarget(3000, { cold: true, firstBoot: false })).toBe(5500);
  });

  it("warm boot has no skip at all", () => {
    expect(skipTarget(2000, { cold: false, firstBoot: false })).toBeNull();
  });
});

describe("crt: audio beats are a silent stub surface", () => {
  it("cold beat table carries the POST beep exactly once at 2.2s", () => {
    const beeps = COLD_AUDIO_BEATS.filter((beat) => beat.name === "post_beep");
    expect(beeps).toHaveLength(1);
    expect(beeps[0]?.atMs).toBe(2200);
  });

  it("warm beat table keeps the beep and the splash read", () => {
    expect(WARM_AUDIO_BEATS.some((beat) => beat.name === "post_beep")).toBe(true);
    expect(WARM_AUDIO_BEATS.some((beat) => beat.name === "floppy_read")).toBe(true);
  });

  it("beatsCrossed fires each beat once on the open interval it crosses", () => {
    expect(beatsCrossed(COLD_AUDIO_BEATS, 0, 2200)).toContain("post_beep");
    expect(beatsCrossed(COLD_AUDIO_BEATS, 2200, 2200)).toHaveLength(0);
    // The driver starts from -1, so the t=0 power-switch beat is included.
    expect(beatsCrossed(COLD_AUDIO_BEATS, -1, COLD_BOOT_TOTAL_MS)).toEqual(
      COLD_AUDIO_BEATS.map((beat) => beat.name),
    );
  });
});

describe("crt: splash is the single-eye logo plus the © 1997 tagline", () => {
  it("logo mask is an 8×8 single-eye silhouette", () => {
    expect(SPLASH_LOGO_MASK).toHaveLength(8);
    for (const row of SPLASH_LOGO_MASK) {
      expect(row).toHaveLength(8);
      expect(row).toMatch(/^[.o]+$/);
    }
    // Top and bottom rows stay empty; the eye (outline + centre pupil) is the
    // only figure, drawn as one contiguous band of rows.
    expect(SPLASH_LOGO_MASK[0]).toBe("........");
    expect(SPLASH_LOGO_MASK[7]).toBe("........");
    const figureRows = SPLASH_LOGO_MASK
      .map((row, index) => (row.includes("o") ? index : null))
      .filter((index): index is number => index !== null);
    expect(figureRows).toEqual([1, 2, 3, 4, 5, 6]);
    expect(SPLASH_LOGO_MASK[3]).toBe("o..oo..o");
    expect(SPLASH_LOGO_MASK[4]).toBe("o..oo..o");
  });

  it("tagline is the canon © line", () => {
    expect(SPLASH_TAGLINE).toBe("Lumen Soft © 1997");
  });
});

describe("crt: LCD MODE is game-logic-free by construction (§9 断言)", () => {
  const source = readFileSync(fileURLToPath(new URL("../src/render/crt.ts", import.meta.url)), "utf8");

  it("the module imports nothing at all — no sim, no game wiring", () => {
    expect(source.match(/^import\b/gm)).toBeNull();
    expect(source).not.toMatch(/from\s+"\.\.\/(sim|game)/);
    expect(source).not.toContain("WorldState");
  });

  it("the kill switch exists and hides the whole effect layer", () => {
    expect(source).toContain("setLcdMode");
    expect(source).toContain("fxCanvas.style.display");
  });
});

// ---------------------------------------------------------------------------
// 票 0036:电源三态 / 消磁 / 失步 / 阶段演变 / 四结局 / 移动端(CI 项 4–8、10)
// ---------------------------------------------------------------------------

describe("crt: geometry sets — desktop canon and mobile slim (§8)", () => {
  it("the desktop geometry reproduces the module constants exactly", () => {
    expect(DESKTOP_GEOMETRY.border).toEqual(BORDER);
    expect(DESKTOP_GEOMETRY.frameWidth).toBe(FRAME_WIDTH);
    expect(DESKTOP_GEOMETRY.frameHeight).toBe(FRAME_HEIGHT);
    expect(DESKTOP_GEOMETRY.screen).toEqual(screenRect());
    expect(DESKTOP_GEOMETRY.power).toEqual(POWER_BUTTON);
    expect(DESKTOP_GEOMETRY.led).toEqual(LED_SLOT);
    expect(DESKTOP_GEOMETRY.degauss).toEqual(DEGAUSS_BUTTON);
    expect(DESKTOP_GEOMETRY.nameplate).toBe(NAMEPLATE_TEXT);
    expect(DESKTOP_GEOMETRY.edgeDarkenPx).toBe(EDGE_DARKEN_PX);
    expect(geometryFor(false)).toEqual(DESKTOP_GEOMETRY);
  });

  it("the mobile set is the 12px-equivalent frame with the abbreviated plate", () => {
    expect(MOBILE_BORDER).toEqual({ left: 12, right: 12, top: 16, bottom: 12 });
    expect(MOBILE_GEOMETRY.frameWidth).toBe(LOGICAL_WIDTH + 24);
    expect(MOBILE_GEOMETRY.frameHeight).toBe(LOGICAL_HEIGHT + 28);
    expect(MOBILE_GEOMETRY.nameplate).toBe(NAMEPLATE_SHORT);
    expect(NAMEPLATE_SHORT).toBe("LS-97");
    expect(geometryFor(true)).toEqual(MOBILE_GEOMETRY);
  });

  it("every mobile hardware rect and paint op stays outside the mobile screen", () => {
    const s = MOBILE_GEOMETRY.screen;
    for (const hardware of [MOBILE_GEOMETRY.power, MOBILE_GEOMETRY.led, MOBILE_GEOMETRY.degauss]) {
      const overlaps =
        hardware.x < s.x + s.w &&
        hardware.x + hardware.w > s.x &&
        hardware.y < s.y + s.h &&
        hardware.y + hardware.h > s.y;
      expect({ hardware, overlaps }).toEqual({ hardware, overlaps: false });
    }
    for (const op of shellPaintOps(MOBILE_GEOMETRY)) {
      if (op.kind === "rect") {
        const overlaps =
          op.x < s.x + s.w &&
          op.x + op.w > s.x &&
          op.y < s.y + s.h &&
          op.y + op.h > s.y;
        expect({ op, overlaps }).toEqual({ op, overlaps: false });
      }
    }
  });

  it("the aged and dusty shell variants still keep the screen rect pure", () => {
    for (const opts of [{ aged: 0.4 }, { dust: true }, { aged: 1, dust: true }]) {
      for (const op of shellPaintOps(DESKTOP_GEOMETRY, opts)) {
        if (op.kind === "rect") {
          const overlaps =
            op.x < DESKTOP_GEOMETRY.screen.x + DESKTOP_GEOMETRY.screen.w &&
            op.x + op.w > DESKTOP_GEOMETRY.screen.x &&
            op.y < DESKTOP_GEOMETRY.screen.y + DESKTOP_GEOMETRY.screen.h &&
            op.y + op.h > DESKTOP_GEOMETRY.screen.y;
          expect({ opts, op, overlaps }).toEqual({ opts, op, overlaps: false });
        }
      }
    }
    expect(SHELL_DUST_SPECKS).toBeGreaterThan(0);
  });

  it("aging shifts the beige toward yellow deterministically", () => {
    expect(mixHex(SHELL_BEIGE, "#C9B183", 0)).toBe(SHELL_BEIGE);
    expect(mixHex(SHELL_BEIGE, "#C9B183", 1)).toBe("#C9B183");
    expect(mixHex(SHELL_BEIGE, "#C9B183", 0.5)).toBe(mixHex(SHELL_BEIGE, "#C9B183", 0.5));
  });
});

describe("crt: mobile boot timelines (§8)", () => {
  it("cold is the 4.0s reduced cut: line + beep + splash, no BIOS/progress", () => {
    expect(MOBILE_COLD_BOOT_TOTAL_MS).toBe(4000);
    expect(MOBILE_COLD_TIMELINE.beepMs).toBeGreaterThan(0);
    const splash = bootFrame(3000, true, { mobile: true });
    expect(splash.splash).toBe(true);
    expect(splash.bios).toHaveLength(0);
    expect(bootFrame(199, true, { mobile: true }).phase).toBe("black");
    expect(bootFrame(201, true, { mobile: true }).phase).toBe("expand");
    expect(bootFrame(4000, true, { mobile: true }).phase).toBe("done");
    // 移动端无进度条相。
    expect(bootFrame(3999, true, { mobile: true }).blocks).toBe(0);
  });

  it("warm is 2.0s on mobile and 2.5s on desktop", () => {
    expect(MOBILE_WARM_BOOT_TOTAL_MS).toBe(2000);
    expect(WARM_BOOT_TOTAL_MS).toBe(2500);
    expect(bootFrame(1000, false, { mobile: true }).splash).toBe(true);
    expect(bootFrame(2000, false, { mobile: true }).phase).toBe("done");
  });

  it("mobile audio beats keep the beep and stay inside the 4.0s axis", () => {
    expect(MOBILE_COLD_AUDIO_BEATS.some((beat) => beat.name === "post_beep")).toBe(true);
    for (const beat of MOBILE_COLD_AUDIO_BEATS) {
      expect(beat.atMs).toBeLessThanOrEqual(MOBILE_COLD_BOOT_TOTAL_MS);
    }
    expect(MOBILE_WARM_AUDIO_BEATS.some((beat) => beat.name === "post_beep")).toBe(true);
  });
});

describe("crt: power tri-state (§4, CI 项 4)", () => {
  it("GV<60 restarts, 60-79 dims with rebound, >=80 refuses", () => {
    expect(powerActionFor(0, false)).toBe("restart");
    expect(powerActionFor(59.9, false)).toBe("restart");
    expect(powerActionFor(60, false)).toBe("rebound");
    expect(powerActionFor(79.9, false)).toBe("rebound");
    expect(powerActionFor(80, false)).toBe("denied");
    expect(powerActionFor(100, false)).toBe("denied");
  });

  it("the button works again after the true ending", () => {
    expect(powerActionFor(80, true)).toBe("restart");
    expect(powerActionFor(100, true)).toBe("restart");
  });

  it("dim rebound and shutdown are the constant-axis performances", () => {
    expect(POWER_DIM_AMOUNT).toBe(0.15);
    expect(POWER_DIM_MS).toBe(2000);
    expect(SHUTDOWN_SHRINK_MS).toBeGreaterThan(0);
    expect(SHUTDOWN_BLACK_HOLD_MS).toBe(1000);
  });

  it("mobile fires the power verb only on the 800ms long press", () => {
    expect(POWER_HOLD_MS).toBe(800);
    expect(powerHoldFires(799)).toBe(false);
    expect(powerHoldFires(800)).toBe(true);
  });
});

describe("crt: degauss wave and the spontaneous schedule (§5, CI 项 7)", () => {
  it("the wave lasts 0.8s and reports progress only inside the window", () => {
    expect(degaussWaveProgress(1000, 999)).toBeNull();
    expect(degaussWaveProgress(1000, 1000)).toBe(0);
    expect(degaussWaveProgress(1000, 1400)).toBeCloseTo(0.5);
    expect(degaussWaveProgress(1000, 1800)).toBe(1);
    expect(degaussWaveProgress(1000, 1801)).toBeNull();
  });

  it("spontaneous gaps are deterministic and within 30-60 minutes", () => {
    for (let i = 0; i < 50; i += 1) {
      const gap = spontaneousDegaussGapTicks(1234, i);
      expect(gap).toBeGreaterThanOrEqual(SPONT_DEGAUSS_MIN_TICKS);
      expect(gap).toBeLessThanOrEqual(SPONT_DEGAUSS_MAX_TICKS);
      expect(gap).toBe(spontaneousDegaussGapTicks(1234, i));
    }
  });

  it("the schedule is monotonic, seeded, and gated by GV>=60 at the wiring", () => {
    const a = nextSpontaneousDegaussTick(42, 0);
    const b = nextSpontaneousDegaussTick(42, a);
    expect(a).toBe(nextSpontaneousDegaussTick(42, 0));
    expect(b).toBeGreaterThan(a);
    expect(SPONT_DEGAUSS_MIN_GV).toBe(60);
  });
});

describe("crt: desync, shadow depth and the glare curve (§6, CI 项 6)", () => {
  it("desync is seeded per game hour, at most once per hour", () => {
    for (let hour = 0; hour < 50; hour += 1) {
      const tick = desyncTickInHour(7, hour);
      if (tick !== null) {
        expect(tick).toBe(hour * DESYNC_TICKS_PER_HOUR);
        expect(desyncTickInHour(7, hour)).toBe(tick);
      }
    }
    const hits = Array.from({ length: 200 }, (_, hour) => desyncTickInHour(7, hour))
      .filter((tick) => tick !== null).length;
    expect(hits).toBeGreaterThan(0);
    expect(hits).toBeLessThan(200);
  });

  it("the GV window and the hour cadence match the spec", () => {
    expect(DESYNC_MIN_GV).toBe(20);
    expect(DESYNC_MAX_GV).toBe(40);
    expect(DESYNC_TICKS_PER_HOUR).toBe(20);
  });

  it("the shadow deepens per session from 8px, capped at 16px", () => {
    expect(dropShadowPxFor(0)).toBe(DROP_SHADOW_BASE_PX);
    expect(dropShadowPxFor(1)).toBe(DROP_SHADOW_BASE_PX + DROP_SHADOW_STEP_PX);
    expect(dropShadowPxFor(100)).toBe(DROP_SHADOW_MAX_PX);
    expect(dropShadowPxFor(-5)).toBe(DROP_SHADOW_BASE_PX);
  });

  it("the glare holds 5% below GV96 and fades linearly to 0 by GV100", () => {
    expect(glareAlphaForGv(0)).toBe(GLARE_ALPHA);
    expect(glareAlphaForGv(95)).toBe(GLARE_ALPHA);
    expect(glareAlphaForGv(96)).toBe(GLARE_ALPHA);
    expect(glareAlphaForGv(98)).toBeCloseTo(GLARE_ALPHA / 2);
    expect(glareAlphaForGv(100)).toBe(0);
    expect(glareAlphaForGv(120)).toBe(0);
    expect(GLARE_FADE_START_GV).toBe(96);
  });

  it("the fade start is the same GV as the terminal input hijack step", () => {
    // D-04 输入劫持 = 侵蚀 step 5 = GV96;同帧触发由接线保证(同一同步帧),
    // 常量面在这里钉死。
    expect(EROSION_STEP_GV[4]).toBe(96);
    expect(EROSION_STEP_GV[4]).toBe(GLARE_FADE_START_GV);
  });
});

describe("crt: the LED faces (§10.8)", () => {
  it("the cursor beat is 530ms, within 5% of the terminal cursor", () => {
    expect(LED_CURSOR_BEAT_MS).toBe(530);
    const diff = Math.abs(LED_CURSOR_BEAT_MS - CURSOR_ON_MS) / CURSOR_ON_MS;
    expect(diff).toBeLessThan(0.05);
  });

  it("the beat is a deterministic square wave", () => {
    expect(ledBeatVisible(0)).toBe(true);
    expect(ledBeatVisible(529)).toBe(true);
    expect(ledBeatVisible(530)).toBe(false);
    expect(ledBeatVisible(1060)).toBe(true);
    expect(ledBeatVisible(629, 100)).toBe(true);
    expect(ledBeatVisible(630, 100)).toBe(false);
    expect(ledBeatVisible(1059, 100)).toBe(false);
    expect(ledBeatVisible(1160, 100)).toBe(true);
  });

  it("the forgetting LED dies from the second session on", () => {
    expect(FORGETTING_LED_DEAD_SESSIONS).toBe(2);
    expect(ledDeadFor(1)).toBe(false);
    expect(ledDeadFor(2)).toBe(true);
  });

  it("judgment glare is the 12% face", () => {
    expect(GLARE_JUDGMENT_ALPHA).toBe(0.12);
  });
});

describe("crt: memory creep (§3 暗线 2, CI 项 5)", () => {
  it("counts whole real days from the save's first day", () => {
    const day = 86_400_000;
    expect(memoryCreepDays(1000, 1000)).toBe(0);
    expect(memoryCreepDays(1000, 1000 + day - 1)).toBe(0);
    expect(memoryCreepDays(1000, 1000 + day)).toBe(1);
    expect(memoryCreepDays(1000, 1000 + 2.5 * day)).toBe(2);
    expect(memoryCreepDays(1000, 999)).toBe(0);
  });

  it("the count grows monotonically and resets to zero exactly once", () => {
    expect(biosMemoryK(0, false)).toBe(640);
    expect(biosMemoryK(1, false)).toBe(641);
    expect(biosMemoryK(3, false)).toBe(643);
    // 真结局后重启一次:-640K 归零;此后从 0 重新单调爬。
    expect(biosMemoryK(3, true)).toBe(3);
    expect(biosMemoryK(4, true)).toBe(4);
    expect(DEFAULT_BIOS_MEMORY_K).toBe(640);
  });
});

describe("crt: effect layer is parameterized without breaking the canon face", () => {
  it("defaults are the §2.2 canon values", () => {
    expect(fxParamsDefault()).toEqual({
      scanlineAlpha: SCANLINE_ALPHA,
      aperture: true,
      glareAlpha: GLARE_ALPHA,
    });
    const ops = fxPaintOps();
    expect(ops[0]).toEqual({ kind: "scanlines", tile: scanlineTile() });
    expect(ops[1]).toEqual({ kind: "rgbStripes", columns: apertureColumns() });
  });

  it("the OSD scanline dial re-scales the tile, never the 2px period", () => {
    const ops = fxPaintOps({ scanlineAlpha: 0.25 });
    expect(ops[0]).toEqual({ kind: "scanlines", tile: scanlineTileWithAlpha(0.25) });
    expect(scanlineTileWithAlpha(0.25)).toHaveLength(2);
    expect(fxPaintOps({ scanlineAlpha: 0 })[0]).toEqual({
      kind: "scanlines",
      tile: scanlineTileWithAlpha(0),
    });
  });

  it("the flicker dial drops the RGB stripes; glare takes an explicit alpha", () => {
    expect(fxPaintOps({ aperture: false })[1]).toEqual({ kind: "rgbStripes", columns: [] });
    expect(fxPaintOps({ glareAlpha: 0.12 })[3]).toEqual({
      kind: "glare",
      alpha: 0.12,
      bandPx: GLARE_BAND_PX,
    });
  });
});

describe("crt: the OSD dial math (§2.3)", () => {
  it("scanline dials clamp to 0-100 and cycle in 25% steps", () => {
    expect(clampOsdScanline(-5)).toBe(0);
    expect(clampOsdScanline(50)).toBe(50);
    expect(clampOsdScanline(150)).toBe(100);
    expect(nextOsdScanline(0)).toBe(25);
    expect(nextOsdScanline(75)).toBe(100);
    expect(nextOsdScanline(100)).toBe(0);
    expect(nextOsdScanline(-1)).toBe(25);
  });
});

describe("crt: the four ending framings (§7)", () => {
  it("A fusion: noise spills onto the shell, then everything goes black", () => {
    expect(endingFrameFor("fusion", 0, 1).shellNoiseSpill).toBe(false);
    expect(endingFrameFor("fusion", 0.5, 1).shellNoiseSpill).toBe(true);
    expect(endingFrameFor("fusion", 0.5, 1).blackout).toBe(false);
    expect(endingFrameFor("fusion", 1, 1).shellNoiseSpill).toBe(false);
    expect(endingFrameFor("fusion", 1, 1).blackout).toBe(true);
  });

  it("B judgment: glare at 12% and the LED blinking on the cursor beat", () => {
    const frame = endingFrameFor("judgment", 0, 1);
    expect(frame.glareAlpha).toBe(0.12);
    expect(frame.ledBeat).toBe(true);
    expect(frame.fullbleed).toBe(false);
  });

  it("C forgetting: the shell ages, gathers dust, and the LED dies", () => {
    const early = endingFrameFor("forgetting", 0.2, 1);
    expect(early.dust).toBe(true);
    expect(early.ledDead).toBe(false);
    const late = endingFrameFor("forgetting", 0.8, 2);
    expect(late.ledDead).toBe(true);
    expect(late.aging).toBeCloseTo(0.8);
  });

  it("true gaze: the fullbleed cut — the frame dissolves entirely", () => {
    const frame = endingFrameFor("gaze", 1, 1);
    expect(frame.fullbleed).toBe(true);
    expect(FULLBLEED_HIDDEN_LAYERS).toContain("gazer-crt-shell");
    expect(FULLBLEED_HIDDEN_LAYERS).toContain("gazer-crt-glass");
  });
});

describe("crt: the render-call counter (§10.10)", () => {
  it("counts every bake kind while the frame is alive", () => {
    const counter = createRenderCallCounter();
    counter.bump("shell");
    counter.bump("shell");
    counter.bump("scanlines");
    counter.bump("aperture");
    counter.bump("vignette");
    counter.bump("glare");
    counter.bump("boot");
    expect(counter.snapshot()).toEqual({ shell: 2, scanlines: 1, aperture: 1, vignette: 1, glare: 1, boot: 1 });
    expect(counter.frozen()).toBe(false);
  });

  it("the fullbleed freeze zeroes every count and refuses new ones", () => {
    const counter = createRenderCallCounter();
    counter.bump("shell");
    counter.bump("scanlines");
    counter.freeze();
    expect(counter.frozen()).toBe(true);
    expect(counter.snapshot()).toEqual({ shell: 0, scanlines: 0, aperture: 0, vignette: 0, glare: 0, boot: 0 });
    counter.bump("shell");
    counter.bump("glare");
    expect(counter.snapshot()).toEqual({ shell: 0, scanlines: 0, aperture: 0, vignette: 0, glare: 0, boot: 0 });
  });
});

describe("crt: viewport-fit integer scale (票 0039 P5)", () => {
  it("reserves the frame chrome and keeps the scale a whole number", () => {
    // 960×600:无框档是 3,但 3 档框体 1128×726 溢出 → 2 档框体 696×436 完整。
    expect(fitScaleFor(960, 600, DESKTOP_GEOMETRY)).toBe(2);
    // 1080p:无框档 6 的框体溢出 → 5 档(1600×900 + 框)完整。
    expect(fitScaleFor(1920, 1080, DESKTOP_GEOMETRY)).toBe(5);
    expect(fitScaleFor(1280, 720, DESKTOP_GEOMETRY)).toBe(3);
    expect(fitScaleFor(800, 480, DESKTOP_GEOMETRY)).toBe(2);
  });

  it("never drops below 1 and never returns a fraction", () => {
    expect(fitScaleFor(400, 300, DESKTOP_GEOMETRY)).toBe(1);
    expect(fitScaleFor(300, 200, DESKTOP_GEOMETRY)).toBe(1);
    for (const [w, h] of [[960, 600], [1920, 1080], [1280, 720], [800, 480], [400, 300], [300, 200]] as const) {
      const s = fitScaleFor(w, h, DESKTOP_GEOMETRY);
      expect(Number.isInteger(s)).toBe(true);
      expect(s).toBeGreaterThanOrEqual(1);
    }
  });

  it("the mobile chrome is thinner, so the fit scale can only be higher", () => {
    for (const [w, h] of [[960, 600], [1280, 720], [1920, 1080]] as const) {
      expect(fitScaleFor(w, h, MOBILE_GEOMETRY)).toBeGreaterThanOrEqual(fitScaleFor(w, h, DESKTOP_GEOMETRY));
    }
    expect(fitScaleFor(960, 600, MOBILE_GEOMETRY)).toBe(2);
  });

  it("the fitted frame fits the viewport by construction", () => {
    for (const [w, h] of [[960, 600], [1920, 1080], [1280, 720], [800, 480]] as const) {
      const s = fitScaleFor(w, h, DESKTOP_GEOMETRY);
      expect(LOGICAL_WIDTH * s + BORDER.left + BORDER.right).toBeLessThanOrEqual(w);
      expect(LOGICAL_HEIGHT * s + BORDER.top + BORDER.bottom).toBeLessThanOrEqual(h);
    }
  });
});

describe("crt: the BIOS dark-line slots (§4 跨会话 / 票 0045 G-2)", () => {
  it("appends caller-provided dark lines (canon-sourced), never its own copies", () => {
    const base = biosLines(640, null);
    expect(base).not.toContain("Unexpected shutdown. They were left running.");
    const flagged = biosLines(640, null, ["Unexpected shutdown. They were left running."]);
    expect(flagged).toContain("Unexpected shutdown. They were left running.");
    expect(flagged).toHaveLength(base.length + 1);
    // 空行不追加。
    expect(biosLines(640, null, [""])).toHaveLength(base.length);
  });

  it("the cold boot frame carries the caller's extra lines into the BIOS phase", () => {
    const frame = bootFrame(3400, true, {
      biosExtraLines: ["Unexpected shutdown. They were left running."],
    });
    expect(frame.bios).toContain("Unexpected shutdown. They were left running.");
  });
});

describe("crt: warm-boot day gate (票 0045 G-2)", () => {
  it("same day ordinal is warm; a new day is cold", () => {
    expect(isWarmBoot(3, 3)).toBe(true);
    expect(isWarmBoot(2, 3)).toBe(false);
    expect(isWarmBoot(null, 3)).toBe(false);
    expect(isWarmBoot(-1, 3)).toBe(false);
  });
});

describe("crt: the forgetting aging ladder (票 0045 SD-4)", () => {
  it("ages 25% per session from the second one, capped at 1", () => {
    expect(forgettingAgingFor(0)).toBe(0);
    expect(forgettingAgingFor(1)).toBe(0);
    expect(forgettingAgingFor(2)).toBeCloseTo(0.25);
    expect(forgettingAgingFor(5)).toBe(1);
    expect(FORGETTING_AGING_STEP).toBe(0.25);
  });
});

describe("crt: the two-point bloom (票 0045 G-4, G9 白名单)", () => {
  it("keeps only whitelisted kinds and clamps into the screen", () => {
    const points = bloomPaintOps([
      { kind: "g_highlight", x: 100.4, y: 60.6 },
      { kind: "terminal_cursor", x: -5, y: 190 },
      { kind: "unknown_source", x: 50, y: 50 } as unknown as BloomPoint,
    ]);
    expect(points.map((p) => p.kind)).toEqual(["g_highlight", "terminal_cursor"]);
    expect(points[0]).toEqual({ kind: "g_highlight", x: 100, y: 61 });
    expect(points[1]).toEqual({ kind: "terminal_cursor", x: 0, y: 180 });
  });

  it("the whitelist is exactly the two canon bright spots", () => {
    expect(BLOOM_KINDS).toEqual(["g_highlight", "terminal_cursor"]);
  });
});

describe("crt: the true-ending dissolve sequence (票 0045 G-7)", () => {
  it("fades linearly over exactly 1s", () => {
    expect(FULLBLEED_DISSOLVE_MS).toBe(1000);
    expect(dissolveAlphaAt(0)).toBe(1);
    expect(dissolveAlphaAt(500)).toBeCloseTo(0.5);
    expect(dissolveAlphaAt(1000)).toBe(0);
    expect(dissolveAlphaAt(-1)).toBe(1);
    expect(dissolveAlphaAt(2000)).toBe(0);
  });
});
