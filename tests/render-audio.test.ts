import { describe, expect, it, vi } from "vitest";
import { createAudio } from "../src/render/audio";
import type {
  AudioContextLike,
  BufferSourceNodeLike,
  GainNodeLike,
  OscillatorNodeLike,
} from "../src/render/audio";

/** Records every node the engine builds, without any real WebAudio. */
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
  resumed = 0;
  oscillators: OscillatorNodeLike[] = [];
  gains: GainNodeLike[] = [];
  sources: BufferSourceNodeLike[] = [];

  resume(): void {
    this.resumed += 1;
  }
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
}

function makeEngine() {
  const ctx = new FakeContext();
  const engine = createAudio({ createContext: () => ctx });
  return { ctx, engine };
}

describe("audio: the subsystem that listens (A6)", () => {
  it("builds its graph lazily from oscillators and one noise buffer", () => {
    const { ctx, engine } = makeEngine();
    engine.setStage(2);
    // One noise source, one drone oscillator, one track oscillator, gains.
    expect(ctx.sources).toHaveLength(1);
    expect(ctx.sources[0]?.loop).toBe(true);
    expect(ctx.oscillators).toHaveLength(2);
    engine.dispose();
    expect(ctx.closed).toBe(true);
  });

  it("brings the drone up from stage 2 and descends with the acts", () => {
    const { ctx, engine } = makeEngine();
    // Graph order: master, noise gain, drone gain, track gain.
    engine.setStage(1);
    expect(ctx.gains[2]?.gain.value).toBe(0);
    engine.setStage(3);
    // linearRampToValueAtTime does not change .value before the ramp elapses;
    // the recorded ramp is what the engine drives.
    const droneRamp = (ctx.gains[2]?.gain as FakeParam).ramp;
    expect(droneRamp.at(-1)?.value).toBeGreaterThan(0);
    expect(ctx.oscillators[0]?.frequency.value).toBeLessThan(55);
    engine.dispose();
  });

  it("tunes a dropped track deterministically and never throws on any name", () => {
    const { ctx, engine } = makeEngine();
    engine.dropTrack("gazer/1997/live");
    expect(ctx.oscillators[1]?.frequency.value).toBeGreaterThan(0);
    const first = ctx.oscillators[1]?.type;
    engine.dropTrack("gazer/1997/live");
    expect(ctx.oscillators[1]?.type).toBe(first);
    engine.dropTrack("");
    engine.dropTrack("%%garbled%%track%%");
    engine.dispose();
  });

  it("blips: a short envelope oscillator per event", () => {
    const { ctx, engine } = makeEngine();
    engine.blip("gaze");
    expect(ctx.oscillators.length).toBe(3);
    const blip = ctx.oscillators[2];
    expect(blip?.start).toHaveBeenCalled();
    expect(blip?.stop).toHaveBeenCalled();
    engine.dispose();
  });

  it("resumes on the gesture path and mutes through the world's silent flag", () => {
    const { ctx, engine } = makeEngine();
    engine.resume();
    expect(ctx.resumed).toBe(1);
    engine.setSilent(true);
    const master = ctx.gains[0];
    const last = (master?.gain as FakeParam | undefined)?.ramp.at(-1);
    expect(last?.value).toBe(0);
    engine.setSilent(false);
    expect((ctx.gains[0]?.gain as FakeParam).ramp.at(-1)?.value).toBeGreaterThan(0);
    engine.dispose();
  });

  it("survives a world without audio hardware", () => {
    const engine = createAudio({
      createContext: (): AudioContextLike => {
        throw new Error("no audio device");
      },
    });
    expect(() => {
      engine.setStage(2);
      engine.dropTrack("x");
      engine.blip("wink");
      engine.resume();
      engine.dispose();
    }).not.toThrow();
  });
});
