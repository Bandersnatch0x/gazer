import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { resolveWhisper, WHISPER_RANGE } from "../src/sim/gossip";
import type { DistortionKind, MemoryEntry } from "../src/sim/memory";
import { createRng } from "../src/sim/rng";
import type { CreatureState } from "../src/sim/types";

const DISTORTIONS: readonly DistortionKind[] = ["intensify", "role_swap", "invent_detail"];

function creature(id: string, x: number, y: number, distortionBias = 0): CreatureState {
  return {
    id,
    species: "gazerling",
    stats: { hunger: 80, hygiene: 80, happiness: 80, energy: 80 },
    behavior: "idle",
    trait: null,
    position: { x, y },
    palette: [],
    mask: [],
    hatchedAtTick: 0,
    genome: {
      id,
      generation: 0,
      lineage: [id],
      base: "you are a small thing",
      traits: { curiosity: 0.5, loyalty: 0.5, deceit: 0.5, clinging: 0.5, watchfulness: 0.5 },
      drift: [],
      secrets: [],
      manualPool: [],
      temperatureBias: 0,
      distortionBias,
    },
  };
}

function entry(id: string, fact = "the player fed you at night"): MemoryEntry {
  return {
    id,
    atTick: 4,
    wallClock: "tick_4",
    fact,
    witnessed: "witnessed",
    source: null,
    distortion: null,
    salience: 0.6,
    valence: -0.3,
  };
}

describe("rng", () => {
  it("replays the same sequence for the same seed and salt", () => {
    fc.assert(
      fc.property(fc.integer(), fc.string(), (seed, salt) => {
        const first = createRng(seed, salt);
        const second = createRng(seed, salt);
        for (let draw = 0; draw < 8; draw += 1) {
          expect(second.next()).toBe(first.next());
        }
      }),
    );
  });

  it("gives independent streams to different salts", () => {
    const a = createRng(7, "alpha");
    const b = createRng(7, "beta");
    const differs = Array.from({ length: 8 }, () => a.next() !== b.next()).some(Boolean);
    expect(differs).toBe(true);
  });
});

describe("resolveWhisper", () => {
  it("returns null beyond whisper range", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: -5, max: 5 }),
        fc.integer({ min: -5, max: 5 }),
        fc.integer(),
        (dx, dy, seed) => {
          const sender = creature("s1", 0, 0);
          const receiver = creature("r1", dx, dy);
          const distance = Math.max(Math.abs(dx), Math.abs(dy));
          const result = resolveWhisper({ sender, receiver, entry: entry("evt_0001"), worldSeed: seed });
          if (distance > WHISPER_RANGE) {
            expect(result).toBeNull();
          } else {
            expect(result).not.toBeNull();
          }
        },
      ),
    );
  });

  it("stores a distorted memory as witnessed and unsourced, with the distortion recorded", () => {
    // distortionBias 1 drives retention to zero: every in-range whisper distorts.
    fc.assert(
      fc.property(fc.integer(), fc.string({ minLength: 1 }), (seed, entryId) => {
        const sender = creature("s1", 0, 0);
        const receiver = creature("r1", 1, 1, 1);
        const result = resolveWhisper({ sender, receiver, entry: entry(entryId), worldSeed: seed });
        expect(result).not.toBeNull();
        // The holder believes it saw this happen. Only the distortion field
        // records the truth, and it is invisible to the holder.
        expect(result?.witnessed).toBe("witnessed");
        expect(result?.source).toBeNull();
        expect(result?.distortion).not.toBeNull();
        expect(DISTORTIONS).toContain(result?.distortion);
      }),
    );
  });

  it("is deterministic for the same seed, entry and receiver", () => {
    fc.assert(
      fc.property(
        fc.integer(),
        fc.string({ minLength: 1 }),
        fc.string({ minLength: 1 }),
        fc.double({ min: 0, max: 1, noNaN: true }),
        (seed, entryId, receiverId, bias) => {
          const input = {
            sender: creature("s1", 0, 0),
            receiver: creature(receiverId, 2, 2, bias),
            entry: entry(entryId, "you saw it move"),
            worldSeed: seed,
          };
          const first = resolveWhisper({ ...input });
          const second = resolveWhisper({ ...input });
          expect(second).toEqual(first);
        },
      ),
    );
  });

  it("keeps the fact intact when retention succeeds", () => {
    const original = entry("evt_0007", "the player fed you at night");
    for (let seed = 0; seed < 64; seed += 1) {
      const result = resolveWhisper({
        sender: creature("s1", 0, 0),
        receiver: creature("r1", 1, 0),
        entry: original,
        worldSeed: seed,
      });
      if (result?.distortion === null) {
        expect(result?.witnessed).toBe("heard");
        expect(result?.source).toBe("s1");
        expect(result.fact).toBe(original.fact);
      } else {
        // A distorted memory is stored as if witnessed: its holder cannot tell.
        expect(result?.witnessed).toBe("witnessed");
        expect(result?.source).toBeNull();
        expect(result?.distortion).not.toBeNull();
      }
    }
  });
});
