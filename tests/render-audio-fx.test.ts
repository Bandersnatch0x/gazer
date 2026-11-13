/**
 * 票 0026 — FX 音频层(render/audio.ts 侧,FX-LIB-01d)。
 *
 * 覆盖票内交付形状 6 的音频面:
 * - A-04 增益曲线:BGM −2dB±0.1、恢复斜坡 ≥0.8s;
 * - A-01 抽轨静默移除与无痕恢复(音频参数自动化,无定时器);
 * - A-02 房间底噪 gain 0.02–0.06 钳制、幂等;
 * - A-03 环境压低 −2dB/1s;A-05 极低音量心跳;A-06 低语床 voices 2–5 幂等;
 * - A-04 塔周区域几何(radius 4 tile,自动执行非 LLM);
 * - 全部静默降级安全:无 AudioContext / 无 BiquadFilter 环境不报错。
 */

import { describe, expect, it, vi } from "vitest";
import {
  AMBIENT_DUCK_DB,
  HEARTBEAT_GAIN,
  LOWPASS_VOID_FC,
  LOWPASS_VOID_RADIUS_TILES,
  ROOM_TONE_MAX_GAIN,
  ROOM_TONE_MIN_GAIN,
  TRACK_LAYER_COUNT,
  VOID_DUCK_DB,
  VOID_RESTORE_RAMP_MS,
  WHISPER_BED_MAX_VOICES,
  WHISPER_BED_MIN_VOICES,
  clampDuckDb,
  clampRoomToneGain,
  clampWhisperVoices,
  createAudio,
  duckGainFactor,
  lowpassZoneContains,
} from "../src/render/audio";
import type {
  AudioContextLike,
  BiquadFilterNodeLike,
  BufferSourceNodeLike,
  GainNodeLike,
  OscillatorNodeLike,
} from "../src/render/audio";

// ---------------------------------------------------------------------------
// 记录面 Fake:记录每条参数自动化(ramp),供增益曲线断言。
// ---------------------------------------------------------------------------

class FakeParam {
  ramp: { value: number; at: number }[] = [];
  constructor(public value: number) {}
  setValueAtTime(value: number, at: number): void {
    this.value = value;
    this.ramp.push({ value, at });
  }
  linearRampToValueAtTime(value: number, at: number): void {
    this.ramp.push({ value, at });
  }
  exponentialRampToValueAtTime(value: number, at: number): void {
    this.ramp.push({ value, at });
  }
}

class FakeContext implements AudioContextLike {
  currentTime = 12.5;
  sampleRate = 48000;
  destination = {};
  closed = false;
  oscillators: OscillatorNodeLike[] = [];
  gains: GainNodeLike[] = [];
  sources: BufferSourceNodeLike[] = [];
  filters: BiquadFilterNodeLike[] = [];

  resume(): void {}
  close(): void {
    this.closed = true;
  }
  createOscillator(): OscillatorNodeLike {
    const osc = {
      type: "sine",
      frequency: new FakeParam(440),
      connect: vi.fn(),
      disconnect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
      onended: null,
    };
    this.oscillators.push(osc);
    return osc;
  }
  createGain(): GainNodeLike {
    const gain = {
      gain: new FakeParam(1),
      connect: vi.fn(),
      disconnect: vi.fn(),
    };
    this.gains.push(gain);
    return gain;
  }
  createBufferSource(): BufferSourceNodeLike {
    const source = {
      buffer: null,
      loop: false,
      connect: vi.fn(),
      disconnect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
    };
    this.sources.push(source);
    return source;
  }
  createBuffer(channels: number, length: number): { getChannelData(): Float32Array } {
    return { getChannelData: () => new Float32Array(Math.max(1, length * channels)) };
  }
  createBiquadFilter(): BiquadFilterNodeLike {
    const filter = {
      type: "lowpass",
      frequency: new FakeParam(350),
      connect: vi.fn(),
      disconnect: vi.fn(),
    };
    this.filters.push(filter);
    return filter;
  }
}

function makeEngine(opts: { withFilter?: boolean } = {}) {
  const ctx = new FakeContext();
  if (opts.withFilter === false) {
    // 类方法是原型方法,delete 不掉:用实例属性遮蔽为 undefined。
    Object.defineProperty(ctx, "createBiquadFilter", { value: undefined });
  }
  const engine = createAudio({ createContext: () => ctx });
  return { ctx, engine };
}

// 图序:master(0)、noise gain(1)、drone gain(2)、track gain(3)。

describe("A-04 增益曲线:−2dB±0.1、恢复斜坡 ≥0.8s", () => {
  it("duckGainFactor:−2dB ≈ 0.7943,误差 ≤0.1dB", () => {
    const factor = duckGainFactor(VOID_DUCK_DB);
    const dB = 20 * Math.log10(factor);
    expect(dB).toBeGreaterThanOrEqual(-2.1);
    expect(dB).toBeLessThanOrEqual(-1.9);
  });

  it("进入塔周区域:低通 fc 1200 + BGM −2dB", () => {
    const { ctx, engine } = makeEngine();
    engine.setLowpass(true, LOWPASS_VOID_FC);
    expect(ctx.filters).toHaveLength(1);
    expect(ctx.filters[0]?.type).toBe("lowpass");
    expect(ctx.filters[0]?.frequency.value).toBe(1200);
    const master = (ctx.gains[0]?.gain as FakeParam).ramp.at(-1);
    expect(master?.value).toBeCloseTo(0.16 * duckGainFactor(AMBIENT_DUCK_DB), 6);
    engine.dispose();
  });

  it("离开区域:恢复斜坡 ≥0.8s(票 0026 硬约束)", () => {
    const { ctx, engine } = makeEngine();
    engine.setLowpass(true);
    engine.setLowpass(false);
    const masterRamp = (ctx.gains[0]?.gain as FakeParam).ramp;
    const last = masterRamp.at(-1);
    expect(last?.value).toBeCloseTo(0.16, 6);
    // 斜坡时长 = at − currentTime ≥ 0.8s。
    expect(last!.at - ctx.currentTime).toBeGreaterThanOrEqual(VOID_RESTORE_RAMP_MS / 1000 - 1e-9);
    engine.dispose();
  });

  it("区域面常量:radius 4 tile / fc 1.2kHz(正典)", () => {
    expect(LOWPASS_VOID_RADIUS_TILES).toBe(4);
    expect(LOWPASS_VOID_FC).toBe(1200);
    expect(VOID_DUCK_DB).toBe(-2);
  });

  it("区域几何:切比雪夫距离 ≤ radius,自动执行面(纯函数)", () => {
    const tower = { x: 12, y: 2 };
    expect(lowpassZoneContains({ x: 12, y: 2 }, tower)).toBe(true);
    expect(lowpassZoneContains({ x: 8, y: 6 }, tower)).toBe(true); // 恰 4
    expect(lowpassZoneContains({ x: 7, y: 6 }, tower)).toBe(false); // 距离 5
    expect(lowpassZoneContains({ x: 16, y: 2 }, tower, 4)).toBe(true);
    expect(lowpassZoneContains({ x: 17, y: 2 }, tower, 4)).toBe(false);
  });

  it("重复进/出区域不重复接线(engage 幂等)", () => {
    const { ctx, engine } = makeEngine();
    engine.setLowpass(true);
    engine.setLowpass(true);
    expect(ctx.filters).toHaveLength(1);
    engine.setLowpass(false);
    engine.setLowpass(false);
    expect(ctx.filters).toHaveLength(1);
    engine.dispose();
  });
});

describe("A-03 ambient_duck 环境压低", () => {
  it("db −2 / ramp 1s:master 增益落到 volume × 因子", () => {
    const { ctx, engine } = makeEngine();
    engine.duckAmbient(-2, 1000);
    const last = (ctx.gains[0]?.gain as FakeParam).ramp.at(-1);
    expect(last?.value).toBeCloseTo(0.16 * duckGainFactor(-2), 6);
    expect(last!.at - ctx.currentTime).toBeCloseTo(1, 6);
    engine.dispose();
  });

  it("db 钳制 [−6, 0]", () => {
    expect(clampDuckDb(-20)).toBe(-6);
    expect(clampDuckDb(3)).toBe(0);
    expect(clampDuckDb(Number.NaN)).toBe(0);
    expect(clampDuckDb(-2)).toBe(-2);
  });
});

describe("A-02 room_tone 房间底噪", () => {
  it("gain 钳制 0.02–0.06,两端可达", () => {
    expect(ROOM_TONE_MIN_GAIN).toBe(0.02);
    expect(ROOM_TONE_MAX_GAIN).toBe(0.06);
    expect(clampRoomToneGain(0.5)).toBe(0.06);
    expect(clampRoomToneGain(0.001)).toBe(0.02);
    expect(clampRoomToneGain(Number.NaN)).toBe(0.02);
    expect(clampRoomToneGain(0.04)).toBe(0.04);
  });

  it("建一路循环噪音源;同参再调只校增益,不叠加", () => {
    const { ctx, engine } = makeEngine();
    engine.resume(); // 先建图:图内已有 1 路氛围噪音。
    const baseSources = ctx.sources.length;
    engine.roomTone(0.04);
    expect(ctx.sources).toHaveLength(baseSources + 1);
    expect(ctx.sources[ctx.sources.length - 1]?.loop).toBe(true);
    const roomGainIndex = ctx.gains.length - 1;
    expect(ctx.gains[roomGainIndex]?.gain.value).toBe(0.04);
    engine.roomTone(0.04);
    expect(ctx.sources).toHaveLength(baseSources + 1);
    engine.dispose();
  });

  it("stopRoomTone 清场;可重复建停", () => {
    const { ctx, engine } = makeEngine();
    engine.roomTone(0.04);
    engine.stopRoomTone();
    const after = ctx.sources.length;
    engine.roomTone(0.05);
    expect(ctx.sources).toHaveLength(after + 1);
    engine.dispose();
  });
});

describe("A-01 track_remove 抽轨", () => {
  it("第 idx 层静默移除 durMs 后无痕恢复(参数自动化,无定时器)", () => {
    const { ctx, engine } = makeEngine();
    expect(TRACK_LAYER_COUNT).toBe(3);
    engine.setStage(2); // 把 drone 抬起来,拿一个非零恢复值
    const droneGain = ctx.gains[2]!.gain as FakeParam;
    const before = droneGain.value;
    engine.removeTrack(1, 4000);
    const entries = droneGain.ramp.slice(-2);
    expect(entries[0]).toEqual({ value: 0, at: ctx.currentTime });
    expect(entries[1]).toEqual({ value: before, at: ctx.currentTime + 4 });
    engine.dispose();
  });

  it("索引钳制 0–2;非法输入不抛", () => {
    const { engine } = makeEngine();
    expect(() => {
      engine.removeTrack(-1, 1000);
      engine.removeTrack(99, 1000);
      engine.removeTrack(Number.NaN, Number.NaN);
    }).not.toThrow();
    engine.dispose();
  });
});

describe("A-05 heartbeat_sonify 心跳外化", () => {
  it("两记闷响,极低音量(≤0.02)", () => {
    const { ctx, engine } = makeEngine();
    engine.resume(); // 先建图:图内 2 只常驻振荡器(drone/track)。
    const base = ctx.oscillators.length;
    engine.heartbeat();
    expect(ctx.oscillators).toHaveLength(base + 2);
    for (const osc of ctx.oscillators.slice(base)) {
      expect(osc.start).toHaveBeenCalled();
      expect(osc.stop).toHaveBeenCalled();
      expect(osc.frequency.value).toBeLessThanOrEqual(55);
    }
    // 峰值增益 ≤ HEARTBEAT_GAIN。
    const peaks = ctx.gains.slice(4).map((g) => Math.max(...(g.gain as FakeParam).ramp.map((r) => r.value)));
    for (const peak of peaks) {
      expect(peak).toBeLessThanOrEqual(HEARTBEAT_GAIN + 1e-9);
    }
    engine.dispose();
  });
});

describe("A-06 whisper_bed 低语床", () => {
  it("voices 钳制 2–5", () => {
    expect(WHISPER_BED_MIN_VOICES).toBe(2);
    expect(WHISPER_BED_MAX_VOICES).toBe(5);
    expect(clampWhisperVoices(1)).toBe(2);
    expect(clampWhisperVoices(9)).toBe(5);
    expect(clampWhisperVoices(Number.NaN)).toBe(2);
    expect(clampWhisperVoices(3.9)).toBe(3);
  });

  it("N 声部确定性失谐;同声部数幂等不叠加", () => {
    const { ctx, engine } = makeEngine();
    engine.resume(); // 先建图。
    const base = ctx.oscillators.length;
    engine.whisperBed(3);
    expect(ctx.oscillators).toHaveLength(base + 3);
    const freqs = ctx.oscillators.slice(base).map((o) => o.frequency.value);
    expect(freqs).toEqual([70, 79, 88]);
    engine.whisperBed(3);
    expect(ctx.oscillators).toHaveLength(base + 3);
    // 声部数变化:先拆旧床再建新床(记录面累计已建节点,含旧床 3 声部)。
    engine.whisperBed(5);
    expect(ctx.oscillators).toHaveLength(base + 3 + 5);
    // 极低音量底床。
    const bedGain = ctx.gains[ctx.gains.length - 1]!.gain.value;
    expect(bedGain).toBeLessThanOrEqual(0.02);
    engine.stopWhisperBed();
    engine.dispose();
  });
});

describe("FX 音频层静默降级安全", () => {
  it("无 AudioContext 环境:全部 A 方法不抛、零 UI 错误", () => {
    const engine = createAudio({
      createContext: (): AudioContextLike => {
        throw new Error("no audio device");
      },
    });
    expect(() => {
      engine.roomTone(0.04);
      engine.stopRoomTone();
      engine.duckAmbient(-2, 1000);
      engine.unduckAmbient(800);
      engine.setLowpass(true);
      engine.setLowpass(false);
      engine.heartbeat();
      engine.whisperBed(3);
      engine.stopWhisperBed();
      engine.removeTrack(1, 4000);
      engine.dispose();
    }).not.toThrow();
  });

  it("无 BiquadFilter 环境:低通静默降级,压低面照常", () => {
    const { ctx, engine } = makeEngine({ withFilter: false });
    expect(() => engine.setLowpass(true, LOWPASS_VOID_FC)).not.toThrow();
    expect(ctx.filters).toHaveLength(0);
    const last = (ctx.gains[0]?.gain as FakeParam).ramp.at(-1);
    expect(last?.value).toBeCloseTo(0.16 * duckGainFactor(-2), 6);
    engine.dispose();
  });
});
