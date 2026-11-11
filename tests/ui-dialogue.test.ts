import { describe, expect, it } from "vitest";
import fc from "fast-check";
import type { RoundtableScript, RoundtableTurn, TurnIntent } from "../src/sim/roundtable";
import type { Mood } from "../src/sim/types";
import type { Clock } from "../src/ui/dialogue";
import {
  MAX_TURN_DELAY_MS,
  MIN_TURN_DELAY_MS,
  jitterDelayMs,
  playScript,
  runPlayback,
  toDialogueLine,
} from "../src/ui/dialogue";

const INTENTS: readonly TurnIntent[] = ["observe", "deceive", "query", "confide", "accuse", "comfort"];
const MOODS: readonly Mood[] = ["curious", "sad", "loving", "wrong", "hungry"];

function pick<T>(values: readonly T[]): fc.Arbitrary<T> {
  return fc.integer({ min: 0, max: values.length - 1 }).map((index) => values[index] as T);
}

const turnArb: fc.Arbitrary<RoundtableTurn> = fc.record({
  speaker: fc.string({ minLength: 1, maxLength: 8 }),
  text: fc.string({ maxLength: 40 }),
  intent: pick(INTENTS),
  mood: pick(MOODS),
  memoryRef: fc.string({ minLength: 1, maxLength: 10 }),
});

const scriptArb: fc.Arbitrary<RoundtableScript> = fc.record({
  scene: fc.array(turnArb, { minLength: 0, maxLength: 8 }),
});

function fixedClock(value: number): Clock {
  return { now: () => value };
}

function randomFrom(values: readonly number[]): () => number {
  let index = 0;
  return () => {
    const value = values[index % values.length] ?? 0;
    index += 1;
    return value;
  };
}

describe("turn delay", () => {
  it("always lands inside the designed window, even for a hostile random source", () => {
    fc.assert(
      fc.property(fc.double({ min: -5, max: 5, noNaN: true }), (roll) => {
        const delay = jitterDelayMs(() => roll);
        expect(delay).toBeGreaterThanOrEqual(MIN_TURN_DELAY_MS);
        expect(delay).toBeLessThanOrEqual(MAX_TURN_DELAY_MS);
      }),
      { numRuns: 300 },
    );
  });

  it("reaches both ends of the window", () => {
    expect(jitterDelayMs(() => 0)).toBe(MIN_TURN_DELAY_MS);
    expect(jitterDelayMs(() => 1)).toBe(MAX_TURN_DELAY_MS);
  });

  it("treats a non-finite roll as the middle of the window", () => {
    expect(jitterDelayMs(() => Number.NaN)).toBe(2750);
  });

  it("is deterministic for the same random source", () => {
    const first = jitterDelayMs(randomFrom([0, 0.25, 0.5, 0.75, 1]));
    const second = jitterDelayMs(randomFrom([0, 0.25, 0.5, 0.75, 1]));
    expect(first).toBe(second);
  });
});

describe("playScript", () => {
  it("preserves turn order and never drops a turn", () => {
    fc.assert(
      fc.property(scriptArb, fc.array(fc.double({ min: 0, max: 1, noNaN: true }), { maxLength: 8 }), (script, rolls) => {
        const playback = playScript(script, {
          clock: fixedClock(1000),
          random: randomFrom(rolls.length === 0 ? [0.5] : rolls),
        });
        expect(playback.turns.length).toBe(script.scene.length);
        script.scene.forEach((turn, index) => {
          const rendered = playback.turns[index];
          expect(rendered).toBeDefined();
          expect(rendered?.speaker).toBe(turn.speaker);
          expect(rendered?.text).toBe(turn.text);
          expect(rendered?.intent).toBe(turn.intent);
          expect(rendered?.mood).toBe(turn.mood);
          expect(rendered?.memoryRef).toBe(turn.memoryRef);
        });
      }),
      { numRuns: 200 },
    );
  });

  it("keeps every delay in range and reveal times strictly increasing", () => {
    fc.assert(
      fc.property(scriptArb, fc.array(fc.double({ min: 0, max: 1, noNaN: true }), { maxLength: 8 }), (script, rolls) => {
        const playback = playScript(script, {
          clock: fixedClock(0),
          random: randomFrom(rolls.length === 0 ? [0.5] : rolls),
        });
        let previous = 0;
        for (const turn of playback.turns) {
          expect(turn.delayMs).toBeGreaterThanOrEqual(MIN_TURN_DELAY_MS);
          expect(turn.delayMs).toBeLessThanOrEqual(MAX_TURN_DELAY_MS);
          expect(turn.revealAtMs).toBeGreaterThan(previous);
          expect(turn.absoluteAtMs).toBe(playback.startedAtMs + turn.revealAtMs);
          previous = turn.revealAtMs;
        }
      }),
      { numRuns: 200 },
    );
  });

  it("anchors reveal times to the injected clock, not the system clock", () => {
    const script: RoundtableScript = { scene: [turnArbSample("01", "a"), turnArbSample("02", "b")] };
    const playback = playScript(script, { clock: fixedClock(50_000), random: randomFrom([0, 1]) });
    expect(playback.startedAtMs).toBe(50_000);
    expect(playback.turns[0]?.absoluteAtMs).toBe(50_000 + MIN_TURN_DELAY_MS);
    expect(playback.turns[1]?.absoluteAtMs).toBe(50_000 + MIN_TURN_DELAY_MS + MAX_TURN_DELAY_MS);
    expect(playback.endsAtMs).toBe(50_000 + MIN_TURN_DELAY_MS + MAX_TURN_DELAY_MS);
  });

  it("is stable: identical inputs give identical timelines", () => {
    fc.assert(
      fc.property(scriptArb, fc.double({ min: 0, max: 1, noNaN: true }), (script, roll) => {
        const run = () =>
          playScript(script, { clock: fixedClock(7), random: randomFrom([roll]) });
        expect(run()).toEqual(run());
      }),
      { numRuns: 120 },
    );
  });

  it("handles an empty script without inventing a turn", () => {
    const playback = playScript({ scene: [] }, { clock: fixedClock(123), random: () => 0.5 });
    expect(playback.turns).toEqual([]);
    expect(playback.startedAtMs).toBe(123);
    expect(playback.endsAtMs).toBe(123);
  });
});

describe("runPlayback", () => {
  it("reveals turns in order through the supplied scheduler", () => {
    const script: RoundtableScript = {
      scene: [turnArbSample("01", "first"), turnArbSample("02", "second"), turnArbSample("03", "third")],
    };
    const playback = playScript(script, { clock: fixedClock(0), random: randomFrom([0, 0.5, 1]) });
    const seen: string[] = [];
    const delays: number[] = [];
    let done = 0;

    runPlayback(playback, {
      schedule: (callback, delayMs) => {
        delays.push(delayMs);
        callback();
      },
      onTurn: (turn) => {
        seen.push(turn.text);
      },
      onDone: () => {
        done += 1;
      },
    });

    expect(seen).toEqual(["first", "second", "third"]);
    expect(delays).toEqual([
      MIN_TURN_DELAY_MS,
      MIN_TURN_DELAY_MS + 2750,
      MIN_TURN_DELAY_MS + 2750 + MAX_TURN_DELAY_MS,
    ]);
    expect(done).toBe(1);
  });

  it("calls onDone immediately for an empty playback", () => {
    let done = 0;
    runPlayback(
      { turns: [], startedAtMs: 0, endsAtMs: 0 },
      { schedule: () => undefined, onTurn: () => undefined, onDone: () => (done += 1) },
    );
    expect(done).toBe(1);
  });
});

describe("toDialogueLine", () => {
  it("keeps the speaker's own status when a resolver is supplied", () => {
    const turn = turnArbSample("01", "hello");
    expect(toDialogueLine(turn, () => "heard").status).toBe("heard");
  });

  it("always carries the mark the resolver returns", () => {
    expect(toDialogueLine(turnArbSample("01", "hello"), () => "witnessed").status).toBe("witnessed");
    expect(toDialogueLine(turnArbSample("01", "hello"), () => "fabricated").status).toBe("fabricated");
  });
});

function turnArbSample(speaker: string, text: string): RoundtableTurn {
  return { speaker, text, intent: "observe", mood: "curious", memoryRef: "mem_1" };
}
