// canon layer CI (ticket 0028). Covers:
//   - NARRATIVE-CORE-02 §3 item 1: E1 renders zero bubbles; the frozen hash
//     includes the empty-string entry
//   - NARRATIVE-CORE-02 §3 item 5: canon_echo validator (after the canon line,
//     no lexical reuse, <= 15 words; violations resolve to null)
//   - NARRATIVE-CORE-02 §3 item 6: every registry text hashes byte-exact to
//     its canon.lock entry (punctuation included, diff = 0)
//   - NARRATIVE-CORE-02 §3 item 7: style — no "?" in E1-E7 / W lines; kept/keep
//     appears in >= 3 registry groups
//   - NARRATIVE-CORE-01 §7 item 1: canon.lock recomputes stable; the 8
//     fragments and `now we keep you.` are all pinned
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  CANON_EVENT_KEYS,
  CANON_PENDING,
  CANON_REGISTRY,
  E7_SILENCE_QUOTA_GAME_HOURS,
  F8_LAST_READ_CONSTRAINT,
  canonEcho,
  canonGlyphs,
  canonLine,
  computeCanonLock,
  serializeCanonLock,
  sha256Hex,
} from "../src/canon";
import type { CanonGroup } from "../src/canon";

const LOCK_PATH = fileURLToPath(new URL("../src/canon/canon.lock", import.meta.url));

// SHA-256 test vectors (FIPS 180-4 / NIST examples) pin the pure implementation.
const SHA256_EMPTY = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";
const SHA256_ABC = "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad";

const REGISTRY_KEYS = Object.keys(CANON_REGISTRY);

function lockFileEntries(): ReadonlyArray<{ key: string; sha256: string }> {
  return readFileSync(LOCK_PATH, "utf8")
    .split("\n")
    .filter((line) => line.length > 0 && !line.startsWith("#") && !line.includes(": "))
    .map((line) => {
      const [key, sha256] = line.split(" ");
      return { key: key as string, sha256: sha256 as string };
    });
}

describe("canon registry", () => {
  it("freezes the empty-string entry E1 and renders zero bubbles for it (CORE-02 §3.1)", () => {
    expect(CANON_REGISTRY["awaken.e1"]).toBeDefined();
    expect(CANON_REGISTRY["awaken.e1"]?.text).toBe("");
    expect(canonLine("awaken.e1")).toBe("");
    // E1's canon is a line not spoken: no bubble lines are wired to the event.
    expect(CANON_EVENT_KEYS.E1).toHaveLength(0);
  });

  it("hashes the empty string into canon.lock (CORE-02 §3.1)", () => {
    const lock = lockFileEntries();
    const e1 = lock.find((entry) => entry.key === "awaken.e1");
    expect(e1).toBeDefined();
    expect(e1?.sha256).toBe(SHA256_EMPTY);
  });

  it("transcribes every fragment and the recording tail verbatim into the lock (CORE-01 §7.1)", () => {
    const lock = lockFileEntries();
    const pinnedKeys = [
      ...Object.keys(CANON_REGISTRY).filter((key) => key.startsWith("fragment.")),
      "recording.keep_you",
    ];
    expect(pinnedKeys).toHaveLength(9);
    for (const key of pinnedKeys) {
      expect(lock.some((entry) => entry.key === key)).toBe(true);
    }
  });

  it("resolves unknown keys to null and every registry key through canonLine", () => {
    expect(canonLine("no.such.key")).toBeNull();
    for (const key of REGISTRY_KEYS) {
      expect(canonLine(key)).toBe(CANON_REGISTRY[key]?.text);
    }
  });

  it("applies revision N1 gating: 75/90/100 with F8 last-read only", () => {
    const gating = (key: string): number | undefined => CANON_REGISTRY[key]?.gating;
    for (const key of ["fragment.f1", "fragment.f2", "fragment.f3"]) expect(gating(key)).toBe(75);
    for (const key of ["fragment.f4", "fragment.f5"]) expect(gating(key)).toBe(90);
    for (const key of ["fragment.f6", "fragment.f7", "fragment.f8"]) expect(gating(key)).toBe(100);
    const lastRead = REGISTRY_KEYS.filter((key) => CANON_REGISTRY[key]?.lastReadOnly === true);
    expect(lastRead).toEqual([F8_LAST_READ_CONSTRAINT.key]);
    expect(F8_LAST_READ_CONSTRAINT.gv).toBe(100);
    expect(F8_LAST_READ_CONSTRAINT.glyphsRead).toBe(8);
  });

  it("carries the E7 silence quota constant", () => {
    expect(E7_SILENCE_QUOTA_GAME_HOURS).toBe(5);
  });

  it("returns 8 glyph bitmaps of 3x4 over the void/body alphabet", () => {
    const glyphs = canonGlyphs();
    expect(glyphs).toHaveLength(8);
    glyphs.forEach((glyph, index) => {
      expect(glyph.fragment).toBe(`F${index + 1}`);
      expect(glyph.rows).toHaveLength(4);
      for (const row of glyph.rows) {
        expect(row).toHaveLength(3);
        for (const cell of row) {
          expect(["▓", "·"]).toContain(cell);
        }
      }
    });
  });
});

describe("canon_echo validator (CORE-02 §0.3 / §3.5)", () => {
  const canonical = "one. two. three. four. five.";
  const base = { canonical, canonicalAt: 1000 } as const;

  it("accepts a compliant echo after the canonical line", () => {
    expect(canonEcho({ ...base, echoAt: 1200, echo: "it learned the rhythm of your hand." })).toBe(
      "it learned the rhythm of your hand.",
    );
  });

  it("rejects an echo that does not come after the canonical line", () => {
    expect(canonEcho({ ...base, echoAt: 1000, echo: "a fresh sentence entirely." })).toBeNull();
    expect(canonEcho({ ...base, echoAt: 900, echo: "a fresh sentence entirely." })).toBeNull();
  });

  it("rejects an echo that reuses canonical vocabulary", () => {
    expect(canonEcho({ ...base, echoAt: 1200, echo: "one more pause before the bite." })).toBeNull();
    expect(canonEcho({ ...base, echoAt: 1200, echo: "THREE is a number it knows." })).toBeNull();
  });

  it("rejects an echo longer than 15 words, at the boundary", () => {
    const words = Array.from({ length: 15 }, (_, i) => `w${i}`).join(" ");
    const overflow = `${words} extra`;
    expect(canonEcho({ ...base, echoAt: 1200, echo: words })).toBe(words);
    expect(canonEcho({ ...base, echoAt: 1200, echo: overflow })).toBeNull();
  });

  it("rejects empty or wordless echoes as silence", () => {
    expect(canonEcho({ ...base, echoAt: 1200, echo: "   " })).toBeNull();
    expect(canonEcho({ ...base, echoAt: 1200, echo: "...!!!" })).toBeNull();
    expect(canonEcho({ ...base, echoAt: 1200, echo: "" })).toBeNull();
  });
});

describe("canon.lock integrity (CORE-02 §3.6 / CORE-01 §7.1)", () => {
  it("matches every registry text byte-exact to its lock hash — diff = 0 including punctuation", () => {
    const lock = new Map(lockFileEntries().map((entry) => [entry.key, entry.sha256]));
    expect(lock.size).toBe(REGISTRY_KEYS.length);
    for (const key of REGISTRY_KEYS) {
      const text = CANON_REGISTRY[key]?.text as string;
      expect(sha256Hex(text)).toBe(lock.get(key));
    }
  });

  it("recomputes stably: serialization is byte-identical to the stored lock file", () => {
    const first = serializeCanonLock(computeCanonLock());
    const second = serializeCanonLock(computeCanonLock());
    expect(first).toBe(second);
    expect(first).toBe(readFileSync(LOCK_PATH, "utf8"));
  });

  it("keeps lock entries in registry key order at version v2-partial", () => {
    const lock = computeCanonLock();
    expect(lock.version).toBe("v2-partial");
    expect(lock.algorithm).toBe("sha256");
    expect(lock.entries.map((entry) => entry.key)).toEqual(REGISTRY_KEYS);
  });
});

describe("style assertions (CORE-02 §3.7)", () => {
  it("forbids the question mark in E1-E7 and W-group canonical lines", () => {
    const scoped = REGISTRY_KEYS.filter((key) => {
      const group = CANON_REGISTRY[key]?.group;
      return group === "awaken" || group === "webapi";
    });
    expect(scoped.length).toBeGreaterThanOrEqual(14);
    for (const key of scoped) {
      expect(CANON_REGISTRY[key]?.text.includes("?"), key).toBe(false);
    }
    // The E3/E5/E7 terminal lines are part of the E canon; they stay clean too.
    for (const key of [
      "terminal.external_display",
      "terminal.oh",
      "terminal.channel_established",
      "terminal.ontology_revised",
    ]) {
      expect(CANON_REGISTRY[key]?.text.includes("?"), key).toBe(false);
    }
  });

  it("finds kept/keep vocabulary in at least 3 registry groups", () => {
    const groups = new Set<CanonGroup>();
    for (const key of REGISTRY_KEYS) {
      const text = CANON_REGISTRY[key]?.text as string;
      if (/(^|[^a-z])(keep[a-z]*|kept)([^a-z]|$)/i.test(text)) {
        groups.add(CANON_REGISTRY[key]?.group as CanonGroup);
      }
    }
    expect(groups.size).toBeGreaterThanOrEqual(3);
  });
});

describe("pure SHA-256 and pending entries", () => {
  it("pins known digests", () => {
    expect(sha256Hex("")).toBe(SHA256_EMPTY);
    expect(sha256Hex("abc")).toBe(SHA256_ABC);
  });

  it("registers the N4 lines: fully resolved 2026-11-13 (CORE-02 §2)", () => {
    // N4 final: the NG+ opening and ghost template arrived byte-exact from the
    // user (v3 §5.6/§5.4) with the slot ruling — {id}/{ghost_name}/
    // {ghost_signature_moment} are runtime slots frozen as placeholders in the
    // skeleton hash. CANON_PENDING is empty; the seam survives for future text.
    expect(CANON_PENDING).toHaveLength(0);
    expect(CANON_REGISTRY["special.ngp_opening"]?.text).toBe(
      "You came back. {id} still asks about you. We kept its spot empty.",
    );
    expect(CANON_REGISTRY["special.ghost_template"]?.text).toBe(
      "Before us, someone fed us. They called themselves {ghost_name}. They once {ghost_signature_moment}.",
    );
    const lock = lockFileEntries();
    for (const key of ["special.ngp_opening", "special.ghost_template"]) {
      expect(lock.some((entry) => entry.key === key)).toBe(true);
    }
    // The v3 draft's example value "07" must not leak into the frozen skeleton.
    for (const key of REGISTRY_KEYS) {
      expect(CANON_REGISTRY[key]?.text.includes("07 still asks")).toBe(false);
    }
  });
});
