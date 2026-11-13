/**
 * The minimal WebAudio subsystem (GAME_REVIEW A6).
 *
 * Zero assets: every sound is an oscillator or a generated noise buffer. The
 * engine is lazy — no context exists until the first call, and the browser's
 * gesture rule is honoured by resuming on the first player input (app.ts wires
 * `pointerdown` to `resume()`).
 *
 * Wiring contract (fulfils the "the audio subsystem listens" comment at the
 * old app.ts audio case): the canvas host forwards `audio_drop_track` to
 * `dropTrack`, feeds the act number to `setStage`, and calls `blip` for small
 * canvas events.
 *
 * Everything is testable without a browser: pass `createContext` returning a
 * structural fake; the real AudioContext satisfies the same shape.
 */

/**
 * Zero-asset event sounds. gaze/wink/shake are the canvas verbs; the frame
 * slots (ticket 0036, ART-CORE-04 §3–§5) are the hardware face: the power
 * click (§3/§4 咔), the degauss thump (§3/§5 嘭) and the desync tick (§6 嗒).
 * All degrade silently when no AudioContext exists.
 */
export type BlipKind = "gaze" | "wink" | "shake" | "power_click" | "degauss_thump" | "frame_tick";

/** The subset of AudioParam the engine uses. */
export interface AudioParamLike {
  value: number;
  setValueAtTime(value: number, when: number): unknown;
  linearRampToValueAtTime(value: number, when: number): unknown;
  exponentialRampToValueAtTime(value: number, when: number): unknown;
}

export interface AudioNodeLike {
  connect(destination: unknown): unknown;
  disconnect(): unknown;
}

/** The subset of BiquadFilterNode the void-region lowpass uses (A-04). */
export interface BiquadFilterNodeLike extends AudioNodeLike {
  type: string;
  frequency: AudioParamLike;
}

export interface OscillatorNodeLike extends AudioNodeLike {
  type: string;
  frequency: AudioParamLike;
  start(when?: number): unknown;
  stop(when?: number): unknown;
  /** Optional so structural fakes can omit it. */
  onended?: ((event: never) => void) | null;
}

export interface GainNodeLike extends AudioNodeLike {
  gain: AudioParamLike;
}

export interface BufferSourceNodeLike extends AudioNodeLike {
  buffer: unknown;
  loop: boolean;
  start(when?: number): unknown;
  stop(when?: number): unknown;
}

export interface AudioBufferLike {
  getChannelData(channel: number): Float32Array;
}

export interface AudioContextLike {
  readonly currentTime: number;
  readonly sampleRate: number;
  readonly destination: unknown;
  resume(): Promise<void> | void;
  close(): Promise<void> | void;
  createOscillator(): OscillatorNodeLike;
  createGain(): GainNodeLike;
  createBufferSource(): BufferSourceNodeLike;
  createBuffer(channels: number, length: number, sampleRate: number): AudioBufferLike;
  /** Optional so structural fakes can omit it; absent → the lowpass degrades to duck-only. */
  createBiquadFilter?(): BiquadFilterNodeLike;
}

export interface AudioDeps {
  /** Defaults to a real browser AudioContext; tests inject a fake. */
  createContext?: () => AudioContextLike;
  /** Master loudness; the default keeps everything a murmur under the HUD. */
  volume?: number;
}

/** Drone frequency descends as the acts deepen; stage 0-4. */
function droneFrequency(stage: number): number {
  return Math.max(36, 55 - Math.max(0, Math.min(4, Math.floor(stage))) * 4);
}

/** Drone loudness: silent until stage 2, then it breathes in. */
function droneGain(stage: number): number {
  const s = Math.max(0, Math.min(4, Math.floor(stage)));
  return s < 2 ? 0 : 0.04 + (s - 2) * 0.02;
}

/** Deterministic 0..1 hash; a track name always tunes to the same voice. */
function trackHash(track: string): number {
  let h = 2166136261;
  for (let i = 0; i < track.length; i += 1) {
    h = ((h ^ track.charCodeAt(i)) * 16777619) >>> 0;
  }
  return (h % 1000) / 1000;
}

const BLIP_PLAN: Readonly<Record<BlipKind, { readonly freq: number; readonly type: string; readonly gain: number }>> = {
  gaze: { freq: 880, type: "sine", gain: 0.06 },
  wink: { freq: 1320, type: "triangle", gain: 0.05 },
  shake: { freq: 110, type: "sawtooth", gain: 0.08 },
  // 框体硬件位(票 0036):咔(物理开关)/嘭(低频消磁)/嗒(失步)。
  power_click: { freq: 1500, type: "square", gain: 0.04 },
  degauss_thump: { freq: 55, type: "sine", gain: 0.12 },
  frame_tick: { freq: 900, type: "square", gain: 0.03 },
};

// ---------------------------------------------------------------------------
// FX audio layer (ticket 0026, FX-LIB-01d). Constants and pure faces the CI
// asserts on; every engine method degrades silently when no AudioContext or
// node exists (master §4 item 7: 0 UI errors, suppressed faces recorded).
// ---------------------------------------------------------------------------

/** A-02 room_tone gain window. */
export const ROOM_TONE_MIN_GAIN = 0.02;
export const ROOM_TONE_MAX_GAIN = 0.06;
/** A-03 canonical duck face. */
export const AMBIENT_DUCK_DB = -2;
export const AMBIENT_DUCK_MIN_DB = -6;
export const AMBIENT_DUCK_MAX_DB = 0;
/** A-04 canonical face: radius 4 tile / fc 1.2kHz, region-bound, never LLM-triggered. */
export const LOWPASS_VOID_RADIUS_TILES = 4;
export const LOWPASS_VOID_FC = 1200;
/** 塔之负空间内的 BGM 压低面:−2dB(±0.1)。 */
export const VOID_DUCK_DB = -2;
/** 区域恢复斜坡下限 ≥0.8s(票 0026 硬约束)。 */
export const VOID_RESTORE_RAMP_MS = 800;
/** A-05 极低音量心跳。 */
export const HEARTBEAT_GAIN = 0.02;
/** A-06 低语床:voices 2–5,极低频底床。 */
export const WHISPER_BED_MIN_VOICES = 2;
export const WHISPER_BED_MAX_VOICES = 5;
export const WHISPER_BED_GAIN = 0.02;
/** A-01 抽轨层索引:BGM 三层(0 底噪 / 1 谐振底 / 2 丢轨音色)。 */
export const TRACK_LAYER_COUNT = 3;

/** dB → 线性增益:−2dB ≈ 0.7943(±0.1dB 容差由 CI 断言)。 */
export function duckGainFactor(db: number): number {
  if (!Number.isFinite(db)) {
    return 1;
  }
  return Math.pow(10, db / 20);
}

export function clampDuckDb(db: number): number {
  if (!Number.isFinite(db)) {
    return AMBIENT_DUCK_MAX_DB;
  }
  return Math.min(AMBIENT_DUCK_MAX_DB, Math.max(AMBIENT_DUCK_MIN_DB, db));
}

export function clampRoomToneGain(gain: number): number {
  if (!Number.isFinite(gain)) {
    return ROOM_TONE_MIN_GAIN;
  }
  return Math.min(ROOM_TONE_MAX_GAIN, Math.max(ROOM_TONE_MIN_GAIN, gain));
}

export function clampWhisperVoices(voices: number): number {
  if (!Number.isFinite(voices)) {
    return WHISPER_BED_MIN_VOICES;
  }
  return Math.min(WHISPER_BED_MAX_VOICES, Math.max(WHISPER_BED_MIN_VOICES, Math.floor(voices)));
}

/** A-04 区域绑定几何:切比雪夫距离 ≤ radius(塔为中心的方形负空间)。 */
export interface TilePosLike {
  readonly x: number;
  readonly y: number;
}

export function lowpassZoneContains(
  player: TilePosLike,
  tower: TilePosLike,
  radius: number = LOWPASS_VOID_RADIUS_TILES,
): boolean {
  const safe = Number.isFinite(radius) ? Math.max(0, radius) : LOWPASS_VOID_RADIUS_TILES;
  return (
    Math.max(Math.abs(player.x - tower.x), Math.abs(player.y - tower.y)) <= safe
  );
}

export interface AudioEngine {
  /** One act, one drone: the low floor deepens as the stage rises. */
  setStage(stage: number): void;
  /** `WorldState.silent` is the world's own mute switch. */
  setSilent(silent: boolean): void;
  /** The `audio_drop_track` landing site: the world's soundtrack changes. */
  dropTrack(track: string): void;
  /** Short zero-asset event sound. */
  blip(kind: BlipKind): void;
  /** Call from a user gesture; unlocks the context in real browsers. */
  resume(): void;
  dispose(): void;
  // ---- FX audio layer (ticket 0026, FX-LIB-01d) ----
  /** A-02:极轻房间白噪音(gain 0.02–0.06 钳制);已在跑则只调增益,不叠加。 */
  roomTone(gain: number): void;
  stopRoomTone(): void;
  /** A-03:环境音压低(C-06 联动);ramp 毫秒,恢复走 unduckAmbient。 */
  duckAmbient(db: number, rampMs: number): void;
  /** 环境恢复:斜坡下限 VOID_RESTORE_RAMP_MS(≥0.8s)。 */
  unduckAmbient(rampMs: number): void;
  /**
   * A-04:塔周低通+静默。active 由接线按区域几何自动驱动(非 LLM 触发);
   * 进入区域 = 低通(fc)+ −2dB;离开 = 撤低通 + ≥0.8s 斜坡恢复。
   */
  setLowpass(active: boolean, fc?: number): void;
  /** A-05:API 延迟 → 极低音量心跳(Vitals 联动)。 */
  heartbeat(): void;
  /** A-06:低语床(voices 2–5);已在跑则幂等,不叠加。 */
  whisperBed(voices: number): void;
  stopWhisperBed(): void;
  /** A-01:BGM 第 trackIdx 层静默移除 durMs,后无痕恢复(音频参数自动化,无定时器)。 */
  removeTrack(trackIdx: number, durMs: number): void;
}

export function createAudio(deps: AudioDeps = {}): AudioEngine {
  const createContext = deps.createContext ?? ((): AudioContextLike => new AudioContext());
  const volume = deps.volume ?? 0.16;

  let ctx: AudioContextLike | null = null;
  let master: GainNodeLike | null = null;
  let drone: OscillatorNodeLike | null = null;
  let droneGainNode: GainNodeLike | null = null;
  let track: OscillatorNodeLike | null = null;
  let trackGainNode: GainNodeLike | null = null;
  let noiseGainNode: GainNodeLike | null = null;
  let roomToneSource: BufferSourceNodeLike | null = null;
  let roomToneGain: GainNodeLike | null = null;
  let whisperVoices: OscillatorNodeLike[] = [];
  let whisperBedGain: GainNodeLike | null = null;
  let whisperBedCount = 0;
  let lowpassFilter: BiquadFilterNodeLike | null = null;
  let lowpassEngaged = false;
  let silent = false;
  let stage = 0;
  let disposed = false;

  function ensureGraph(): boolean {
    if (disposed) {
      return false;
    }
    if (ctx !== null) {
      return true;
    }
    try {
      ctx = createContext();
    } catch {
      // No audio device or no WebAudio: the game is playable muted.
      ctx = null;
      return false;
    }
    master = ctx.createGain();
    master.gain.value = silent ? 0 : volume;
    master.connect(ctx.destination);

    // Ambient hiss: one looping noise buffer, always running, barely there.
    const noise = ctx.createBufferSource();
    const length = Math.floor(ctx.sampleRate / 2);
    const buffer = ctx.createBuffer(1, Math.max(1, length), ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let last = 0;
    for (let i = 0; i < length; i += 1) {
      // A cheap smoothed random walk: brown-ish hiss, no harsh white edge.
      last = (last + (Math.random() * 2 - 1) * 0.08) * 0.98;
      data[i] = last;
    }
    noise.buffer = buffer;
    noise.loop = true;
    const noiseGain = ctx.createGain();
    noiseGain.gain.value = 0.18;
    noise.connect(noiseGain);
    noiseGain.connect(master);
    noise.start(0);
    noiseGainNode = noiseGain;

    // The drone floor: stage 2+ brings it up through `setStage`.
    drone = ctx.createOscillator();
    drone.type = "sine";
    drone.frequency.value = droneFrequency(stage);
    droneGainNode = ctx.createGain();
    droneGainNode.gain.value = droneGain(stage);
    drone.connect(droneGainNode);
    droneGainNode.connect(master);
    drone.start(0);

    // The dropped track: silent until `dropTrack` names one.
    track = ctx.createOscillator();
    track.type = "sine";
    track.frequency.value = 90;
    trackGainNode = ctx.createGain();
    trackGainNode.gain.value = 0;
    track.connect(trackGainNode);
    trackGainNode.connect(master);
    track.start(0);

    return true;
  }

  function now(): number {
    return ctx?.currentTime ?? 0;
  }

  // FX 层内部助手:setLowpass 与对象方法共用同一落点,行为一致。
  function duckTo(db: number, rampMs: number): void {
    if (master === null || ctx === null) {
      return;
    }
    const factor = duckGainFactor(clampDuckDb(db));
    const seconds = Math.max(0.01, (Number.isFinite(rampMs) ? Math.max(0, rampMs) : 1000) / 1000);
    master.gain.linearRampToValueAtTime(volume * factor, now() + seconds);
  }

  function unduckFrom(rampMs: number): void {
    if (master === null || ctx === null) {
      return;
    }
    // 恢复斜坡下限 ≥0.8s(票 0026 硬约束)。
    const seconds = Math.max(
      VOID_RESTORE_RAMP_MS / 1000,
      (Number.isFinite(rampMs) ? Math.max(0, rampMs) : VOID_RESTORE_RAMP_MS) / 1000,
    );
    master.gain.linearRampToValueAtTime(volume, now() + seconds);
  }

  function stopBedNow(): void {
    const voices = whisperVoices;
    const bedGain = whisperBedGain;
    whisperVoices = [];
    whisperBedGain = null;
    whisperBedCount = 0;
    for (const osc of voices) {
      try {
        osc.stop();
      } catch {
        // 已停的源再 stop 会抛;清理永不破坏关停。
      }
      osc.disconnect();
    }
    bedGain?.disconnect();
  }

  return {
    setStage(next: number): void {
      stage = next;
      if (!ensureGraph() || droneGainNode === null || drone === null || ctx === null) {
        return;
      }
      const at = now();
      drone.frequency.setValueAtTime(droneFrequency(next), at);
      droneGainNode.gain.linearRampToValueAtTime(droneGain(next), at + 1.5);
    },
    setSilent(next: boolean): void {
      silent = next;
      if (!ensureGraph() || master === null || ctx === null) {
        return;
      }
      master.gain.linearRampToValueAtTime(next ? 0 : volume, now() + 0.4);
    },
    dropTrack(trackName: string): void {
      if (!ensureGraph() || track === null || trackGainNode === null || ctx === null) {
        return;
      }
      const at = now();
      const seed = trackHash(trackName);
      // The track name tunes the voice; the drop itself always falls.
      track.type = seed < 0.34 ? "sine" : seed < 0.67 ? "triangle" : "sawtooth";
      track.frequency.setValueAtTime(70 + seed * 160, at);
      track.frequency.exponentialRampToValueAtTime(40, at + 2.2);
      trackGainNode.gain.setValueAtTime(0, at);
      trackGainNode.gain.linearRampToValueAtTime(0.09, at + 0.12);
      trackGainNode.gain.linearRampToValueAtTime(0.02, at + 2.4);
    },
    blip(kind: BlipKind): void {
      if (!ensureGraph() || master === null || ctx === null) {
        return;
      }
      const plan = BLIP_PLAN[kind];
      const at = now();
      const osc = ctx.createOscillator();
      osc.type = plan.type;
      osc.frequency.setValueAtTime(plan.freq, at);
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(plan.gain, at + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.18);
      osc.connect(gain);
      gain.connect(master);
      osc.start(at);
      osc.stop(at + 0.2);
      osc.onended = (): void => {
        osc.disconnect();
        gain.disconnect();
      };
    },
    // ---- FX audio layer (ticket 0026) ------------------------------------

    roomTone(gain: number): void {
      if (!ensureGraph() || master === null || ctx === null) {
        return;
      }
      const clamped = clampRoomToneGain(gain);
      if (roomToneSource !== null && roomToneGain !== null) {
        // 幂等:同参不叠加,只校增益。
        roomToneGain.gain.value = clamped;
        return;
      }
      const source = ctx.createBufferSource();
      const length = Math.floor(ctx.sampleRate / 2);
      const buffer = ctx.createBuffer(1, Math.max(1, length), ctx.sampleRate);
      const data = buffer.getChannelData(0);
      // 房间白噪音:平滑白噪,极轻;音量面由 gain 节点把守。
      let last = 0;
      for (let i = 0; i < length; i += 1) {
        last = (last + (Math.random() * 2 - 1) * 0.3) * 0.85;
        data[i] = last;
      }
      source.buffer = buffer;
      source.loop = true;
      const gainNode = ctx.createGain();
      gainNode.gain.value = clamped;
      source.connect(gainNode);
      gainNode.connect(master);
      source.start(0);
      roomToneSource = source;
      roomToneGain = gainNode;
    },
    stopRoomTone(): void {
      const source = roomToneSource;
      const gainNode = roomToneGain;
      roomToneSource = null;
      roomToneGain = null;
      if (source === null || gainNode === null) {
        return;
      }
      try {
        source.stop();
      } catch {
        // 已停的源再 stop 会抛;清理永不破坏关停。
      }
      source.disconnect();
      gainNode.disconnect();
    },
    duckAmbient(db: number, rampMs: number): void {
      if (!ensureGraph()) {
        return;
      }
      duckTo(db, rampMs);
    },
    unduckAmbient(rampMs: number): void {
      if (!ensureGraph()) {
        return;
      }
      unduckFrom(rampMs);
    },
    setLowpass(active: boolean, fc: number = LOWPASS_VOID_FC): void {
      if (!ensureGraph() || master === null || ctx === null) {
        return;
      }
      const safeFc = Number.isFinite(fc) ? Math.max(20, Math.min(20000, Math.floor(fc))) : LOWPASS_VOID_FC;
      if (active && !lowpassEngaged) {
        lowpassEngaged = true;
        // 塔之负空间:低通(可用时)+ −2dB 压低。
        if (ctx.createBiquadFilter !== undefined && lowpassFilter === null) {
          const filter = ctx.createBiquadFilter();
          filter.type = "lowpass";
          filter.frequency.value = safeFc;
          try {
            master.disconnect();
            master.connect(filter);
            filter.connect(ctx.destination);
          } catch {
            // 重连失败:保留 duck 面,低通静默降级。
          }
          lowpassFilter = filter;
        }
        duckTo(VOID_DUCK_DB, 200);
        return;
      }
      if (!active && lowpassEngaged) {
        lowpassEngaged = false;
        if (lowpassFilter !== null) {
          try {
            master.disconnect();
            master.connect(ctx.destination);
            lowpassFilter.disconnect();
          } catch {
            // 同上:恢复路径失败也只静默。
          }
          lowpassFilter.disconnect();
          lowpassFilter = null;
        }
        // 恢复斜坡 ≥0.8s。
        unduckFrom(VOID_RESTORE_RAMP_MS);
      }
    },
    heartbeat(): void {
      if (!ensureGraph() || master === null || ctx === null) {
        return;
      }
      // 两记极低频闷响:lub-dub。极低音量(HEARTBEAT_GAIN)。
      const at = now();
      for (const offset of [0, 0.18]) {
        const osc = ctx.createOscillator();
        osc.type = "sine";
        osc.frequency.setValueAtTime(55, at + offset);
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0.0001, at + offset);
        gain.gain.exponentialRampToValueAtTime(HEARTBEAT_GAIN, at + offset + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, at + offset + 0.12);
        osc.connect(gain);
        gain.connect(master);
        osc.start(at + offset);
        osc.stop(at + offset + 0.14);
        osc.onended = (): void => {
          osc.disconnect();
          gain.disconnect();
        };
      }
    },
    whisperBed(voices: number): void {
      if (!ensureGraph() || master === null || ctx === null) {
        return;
      }
      const count = Math.floor(clampWhisperVoices(voices));
      if (whisperBedCount === count && whisperVoices.length > 0) {
        return; // 幂等:同声部数不叠加。
      }
      stopBedNow();
      const bedGain = ctx.createGain();
      bedGain.gain.value = WHISPER_BED_GAIN;
      bedGain.connect(master);
      const at = now();
      const created: OscillatorNodeLike[] = [];
      for (let i = 0; i < count; i += 1) {
        const osc = ctx.createOscillator();
        osc.type = "sine";
        // 确定性失谐:第 i 声部固定频点,极低频底床。
        osc.frequency.setValueAtTime(70 + i * 9, at);
        osc.connect(bedGain);
        osc.start(at);
        created.push(osc);
      }
      whisperVoices = created;
      whisperBedGain = bedGain;
      whisperBedCount = count;
    },
    stopWhisperBed(): void {
      stopBedNow();
    },
    removeTrack(trackIdx: number, durMs: number): void {
      if (!ensureGraph() || ctx === null) {
        return;
      }
      const layers = [noiseGainNode, droneGainNode, trackGainNode];
      const safeIdx = Number.isFinite(trackIdx) ? Math.floor(trackIdx) : 0;
      const layer = layers[Math.max(0, Math.min(TRACK_LAYER_COUNT - 1, safeIdx))];
      if (layer === null || layer === undefined) {
        return;
      }
      // 静默移除 → durMs 后无痕恢复:全程音频参数自动化,不设任何定时器。
      const at = now();
      const previous = layer.gain.value;
      const dur = Number.isFinite(durMs) ? Math.max(0, durMs) / 1000 : 1;
      layer.gain.setValueAtTime(0, at);
      layer.gain.setValueAtTime(previous, at + dur);
    },
    resume(): void {
      if (!ensureGraph() || ctx === null) {
        return;
      }
      void ctx.resume();
    },
    dispose(): void {
      if (ctx === null) {
        disposed = true;
        roomToneSource = null;
        roomToneGain = null;
        whisperVoices = [];
        whisperBedGain = null;
        whisperBedCount = 0;
        lowpassFilter = null;
        lowpassEngaged = false;
        return;
      }
      disposed = true;
      try {
        drone?.stop();
        track?.stop();
        roomToneSource?.stop();
        for (const osc of whisperVoices) {
          osc.stop();
        }
      } catch {
        // Stopping an already-stopped node throws in some engines; disposal
        // must never be the thing that breaks a shutdown.
      }
      void ctx.close();
      ctx = null;
      master = null;
      drone = null;
      droneGainNode = null;
      track = null;
      trackGainNode = null;
      noiseGainNode = null;
      roomToneSource = null;
      roomToneGain = null;
      whisperVoices = [];
      whisperBedGain = null;
      whisperBedCount = 0;
      lowpassFilter = null;
      lowpassEngaged = false;
    },
  };
}
