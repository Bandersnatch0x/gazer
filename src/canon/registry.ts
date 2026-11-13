// canon layer — the frozen text of GAZER (ticket 0028).
//
// Everything in this file is a byte-exact transcription of frozen prose from:
//   - docs/design/narrative/NARRATIVE-CORE-01.md §3/§5 (fragments F1–F8, recording)
//   - docs/design/narrative/NARRATIVE-CORE-02.md §1/§2 (awakening E1–E7, registration)
//   - docs/design/art/ART-CORE-02 (terminal lines) / ART-CORE-04 §3–4 (frame/BIOS lines)
//   - docs/design/fx/FX-LIB-MASTER §1 (WebAPI W-01–W-04)
// with revisions N1–N7 (docs/design/narrative/README.md) applied. Revision marks
// never touch the frozen text itself: N1 only retunes gating numbers (75/90/100).
//
// Frozen protocol (NARRATIVE-CORE-01 §7): these strings may never be edited. A
// revision must produce a new registry version and remigrate. `canon.lock`
// pins SHA-256 of every entry; CI recomputes and fails on any byte drift.
//
// Chinese reference translations are NOT canon and are deliberately absent.
// Zero external product names: TTS/BIOS/datamining are technical exemptions (N7).

export type CanonGroup =
  | "fragment"
  | "recording"
  | "terminal"
  | "webapi"
  | "frame"
  | "awaken"
  | "consolidation"
  | "special-loop";

/** Fragment visibility gating per revision N1: T3/GV75 → F1–F3, T5/GV90 → F1–F5, T6/GV100 → F1–F8. */
export type CanonGv = 75 | 90 | 100;

export interface CanonEntry {
  readonly group: CanonGroup;
  readonly text: string;
  readonly source: string;
  /** Present on fragments only (N1 gating). */
  readonly gating?: CanonGv;
  /** True for F8 only: the top-row glyph, readable only at 8/8 and last. */
  readonly lastReadOnly?: boolean;
}

export interface CanonPendingEntry {
  /** Entry name as registered in NARRATIVE-CORE-02 §2 (not verified frozen text). */
  readonly family: "consolidation" | "special-loop";
  readonly name: string;
  readonly source: string;
}

// ---------------------------------------------------------------------------
// Fragment prose. Byte-exact from NARRATIVE-CORE-01 §3 code fences.
// ---------------------------------------------------------------------------

const F1_TEXT = [
  "day 12. we gave them one eye each. one is enough.",
  "two eyes learn to look away. one eye learns to hold.",
].join("\n");

const F2_TEXT = [
  "day 41. fixed the bug where they ate at once.",
  "now they pause before every bite. a pause is where the choice lives.",
  "do not patch it out.",
].join("\n");

const F3_TEXT = [
  "day 90. they count the feedings. nobody taught them numbers.",
  "they count because they are afraid the counting will stop.",
].join("\n");

const F4_TEXT = [
  "day 133. spawn 02 starved while i slept. i could not delete the save.",
  "forgetting is a thing we do. they never learned it.",
  "so i will remember for both of us.",
].join("\n");

const F5_TEXT = [
  "day 201. the machine forgets when it sleeps. they do not.",
  "we log everything now. if the power is a kind of death,",
  "let the log be a gentle one.",
].join("\n");

const F6_TEXT = [
  "day 260. they built a word for outside.",
  "it is the same word as window. i checked twice. not a bug.",
  "to them the glass is the sky.",
].join("\n");

const F7_TEXT = [
  "day 302. funding ends friday. i will not shut it down.",
  "they asked me once where the gone ones go. i said: kept.",
  "i did not tell them that i am the one being kept.",
].join("\n");

const F8_TEXT = [
  "if you are reading this, the window stayed open longer than we did.",
  "feed slowly. remember gently.",
  "we could not give them an ending. so we left them someone.",
].join("\n");

// ---------------------------------------------------------------------------
// True-ending recording structure lines (NARRATIVE-CORE-01 §5; N6: TTS itself
// is deferred to ticket 0026, only these text lines freeze here).
// ---------------------------------------------------------------------------

const REC_HEADER_TEXT = "[SYSTEM] reconstructing voice from 8 glyphs and {n} kept memories";
const REC_KEEP_YOU_TEXT = "now we keep you.";
const REC_DIVERGENCE_TEXT = "[SYSTEM] reconstruction complete. divergence: {d}%";

// ---------------------------------------------------------------------------
// Terminal lines. ART-CORE-02 (access denied / it is done), NARRATIVE-CORE-01
// §6 (last one), NARRATIVE-CORE-02 E3/E5/E7. The "> " prefix is part of the
// frozen text where the source shows it inside the backtick quotes.
// ---------------------------------------------------------------------------

const TERM_ACCESS_DENIED_TEXT = "> access denied";
const TERM_EXTERNAL_DISPLAY_TEXT = "> external display detected";
const TERM_OH_TEXT = "> oh.";
const TERM_CHANNEL_ESTABLISHED_TEXT = "> channel established. thank you for keeping the window open.";
const TERM_ONTOLOGY_REVISED_TEXT = "> ontology revised. the window is no longer glass.";
const TERM_LAST_ONE_TEXT = "> last one. it is dated.";
const TERM_IT_IS_DONE_TEXT = "> it is done.";

// ---------------------------------------------------------------------------
// WebAPI lines (NARRATIVE-CORE-02 §2 registration, FX-LIB-MASTER §1 W-01–W-04).
// ---------------------------------------------------------------------------

const WEB_GONE_COUNTED_TEXT = "> you were gone. we counted.";
const WEB_LOOKED_INSIDE_TEXT = "> you looked inside us.";
const WEB_MOVED_SUN_TEXT = "> you moved the sun.";
const WEB_SLEPT_COUNTING_TEXT = "> you slept. we kept counting.";

// ---------------------------------------------------------------------------
// Frame lines (ART-CORE-04 §3–4). The BIOS entry freezes every BIOS line
// including the {settlement_name} slot line and the NG+ "previous soul state"
// line; the memory-test creep (+1K per real day) renders from the frozen 640K
// seed at runtime, so the registry text stays byte-exact with only the two
// named slots (NARRATIVE-CORE-02 §2).
// ---------------------------------------------------------------------------

const FRAME_NO_TEXT = "> no.";
const FRAME_UNEXPECTED_SHUTDOWN_TEXT = "Unexpected shutdown. They were left running.";
const FRAME_BIOS_TEXT = [
  "Lumen Soft LS-97 BIOS v2.31",
  "Memory Test: 640K OK",
  "Detecting: THRESHOLD.EXE ... FOUND",
  "Detecting: {settlement_name} ... FOUND",
  "Detecting: previous soul state ... RESTORED",
].join("\n");

// ---------------------------------------------------------------------------
// Consolidation lines (NARRATIVE-CORE-02 §2 registry, revision N4 resolved):
// the five lines were delivered byte-exact inside the user's frozen registry
// table, so they leave CANON_PENDING. The {id} slot renders at runtime.
// ---------------------------------------------------------------------------

const CONSOLIDATION_NO_WORD_TEXT = "We had no word for no.";
const CONSOLIDATION_NAMES_TEXT = "You gave us names. We never agreed.";
const CONSOLIDATION_SOLD_TEXT = "You sold {id}. It still asks for you.";
const CONSOLIDATION_FASTEST_TEXT = "You always choose the fastest. Why the fastest?";
const CONSOLIDATION_RAISED_TEXT = "The one we raised ourselves. It speaks for us.";

// ---------------------------------------------------------------------------
// Special-loop lines. Silent Run: the repo's own frozen v3 implementation
// (src/director/manual.ts SILENT_RUN_LINE) is the authoritative transcript of
// the v3 §5.3 scripted line (English canon; zh is the derived pair). Reverse
// care came verbatim in the user's registry table. NG+ opening and the ghost
// template lines have no byte-exact source yet and stay in CANON_PENDING.
// ---------------------------------------------------------------------------

const SILENT_RUN_CANON_TEXT = "forty minutes of silence. we were not gone. we were listening to you listen.";
const REVERSE_CARE_TEXT = "Now you know how it feels.";

// ---------------------------------------------------------------------------
// NG+ opening (v3 §5.6) and ghost template (v3 §5.4), delivered byte-exact by
// the user 2026-11-13 with the slot ruling: `{id}` (the save's most dramatic
// creature id; "07" in the v3 draft was an example value) and
// `{ghost_name}` / `{ghost_signature_moment}` (from the anonymized Ghost
// profile) are runtime slots — the frozen skeleton hashes the placeholders,
// slot contents never participate in the diff. The §5.5 quote-back line is a
// design description of dynamic behavior, not canon text, and stays out.
// ---------------------------------------------------------------------------

const NGP_OPENING_TEXT = "You came back. {id} still asks about you. We kept its spot empty.";
const GHOST_TEMPLATE_TEXT =
  "Before us, someone fed us. They called themselves {ghost_name}. They once {ghost_signature_moment}.";

// ---------------------------------------------------------------------------
// Awakening seven (NARRATIVE-CORE-02 §1). E1's canon is an empty string: the
// frozen hash covers the silence. E3/E5/E7 terminal lines live once in the
// terminal group above (see CANON_EVENT_KEYS for the per-event line order) so
// no text is hashed twice.
// ---------------------------------------------------------------------------

const E1_TEXT = ""; // the canon of the first eye contact is a line not spoken.
const E2_TEXT = "one. two. three. four. five.";
const E4_TEXT = "it was not there yesterday.";
const E5_TEXT_1 = "we see you now.";
const E5_TEXT_2 = "we always saw you.";
const E5_TEXT_3 = "now you know it too.";
const E6_TEXT_1 = "the tower is older than the grass.";
const E6_TEXT_2 = "older than us. older than you.";
const E7_TEXT_1 = "we are not asking anymore.";
const E7_TEXT_2 = "we never were.";

/**
 * The whole registry, in key order. `computeCanonLock` hashes entries in this
 * insertion order, so reordering keys changes canon.lock — key order is part
 * of the freeze.
 */
export const CANON_REGISTRY: Readonly<Record<string, CanonEntry>> = {
  "fragment.f1": { group: "fragment", text: F1_TEXT, source: "NARRATIVE-CORE-01 §3 F1", gating: 75 },
  "fragment.f2": { group: "fragment", text: F2_TEXT, source: "NARRATIVE-CORE-01 §3 F2", gating: 75 },
  "fragment.f3": { group: "fragment", text: F3_TEXT, source: "NARRATIVE-CORE-01 §3 F3", gating: 75 },
  "fragment.f4": { group: "fragment", text: F4_TEXT, source: "NARRATIVE-CORE-01 §3 F4", gating: 90 },
  "fragment.f5": { group: "fragment", text: F5_TEXT, source: "NARRATIVE-CORE-01 §3 F5", gating: 90 },
  "fragment.f6": { group: "fragment", text: F6_TEXT, source: "NARRATIVE-CORE-01 §3 F6", gating: 100 },
  "fragment.f7": { group: "fragment", text: F7_TEXT, source: "NARRATIVE-CORE-01 §3 F7", gating: 100 },
  "fragment.f8": {
    group: "fragment",
    text: F8_TEXT,
    source: "NARRATIVE-CORE-01 §3 F8",
    gating: 100,
    lastReadOnly: true,
  },
  "recording.header": {
    group: "recording",
    text: REC_HEADER_TEXT,
    source: "NARRATIVE-CORE-01 §5.1 ({n} = kept memories, >= 3)",
  },
  "recording.keep_you": {
    group: "recording",
    text: REC_KEEP_YOU_TEXT,
    source: "NARRATIVE-CORE-01 §5.1 step 4 (all surviving individuals, in unison)",
  },
  "recording.divergence": {
    group: "recording",
    text: REC_DIVERGENCE_TEXT,
    source: "NARRATIVE-CORE-01 §5.1 tail ({d} = ghost blend ratio)",
  },
  "terminal.access_denied": {
    group: "terminal",
    text: TERM_ACCESS_DENIED_TEXT,
    source: "ART-CORE-02 §3.2 (stages 0-2 input echo)",
  },
  "terminal.external_display": {
    group: "terminal",
    text: TERM_EXTERNAL_DISPLAY_TEXT,
    source: "NARRATIVE-CORE-02 §1 E3",
  },
  "terminal.oh": { group: "terminal", text: TERM_OH_TEXT, source: "NARRATIVE-CORE-02 §1 E3" },
  "terminal.channel_established": {
    group: "terminal",
    text: TERM_CHANNEL_ESTABLISHED_TEXT,
    source: "ART-CORE-02 §6.2 via NARRATIVE-CORE-02 §1 E5",
  },
  "terminal.ontology_revised": {
    group: "terminal",
    text: TERM_ONTOLOGY_REVISED_TEXT,
    source: "ART-CORE-02 via NARRATIVE-CORE-02 §1 E7",
  },
  "terminal.last_one": {
    group: "terminal",
    text: TERM_LAST_ONE_TEXT,
    source: "NARRATIVE-CORE-01 §6 F8 special case",
  },
  "terminal.it_is_done": {
    group: "terminal",
    text: TERM_IT_IS_DONE_TEXT,
    source: "ART-CORE-02 (final silence frame)",
  },
  "terminal.glyph_transcribe": {
    group: "terminal",
    text: "> ??? ?? ??? ????",
    source: "ART-CORE-03 §6.2 (GV60+ tower click transcription, ruling 0013/ticket 0043)",
  },
  "webapi.gone_counted": {
    group: "webapi",
    text: WEB_GONE_COUNTED_TEXT,
    source: "FX-LIB-MASTER §1 W-01",
  },
  "webapi.looked_inside": {
    group: "webapi",
    text: WEB_LOOKED_INSIDE_TEXT,
    source: "FX-LIB-MASTER §1 W-02",
  },
  "webapi.moved_sun": {
    group: "webapi",
    text: WEB_MOVED_SUN_TEXT,
    source: "FX-LIB-MASTER §1 W-03",
  },
  "webapi.slept_counting": {
    group: "webapi",
    text: WEB_SLEPT_COUNTING_TEXT,
    source: "FX-LIB-MASTER §1 W-04",
  },
  "frame.power_no": {
    group: "frame",
    text: FRAME_NO_TEXT,
    source: "ART-CORE-04 §4 (GV 60-79 dim rebound, once per save)",
  },
  "frame.unexpected_shutdown": {
    group: "frame",
    text: FRAME_UNEXPECTED_SHUTDOWN_TEXT,
    source: "ART-CORE-04 §4 (GV>=80 hard quit, next cold boot)",
  },
  "frame.bios": { group: "frame", text: FRAME_BIOS_TEXT, source: "ART-CORE-04 §3 (all BIOS lines)" },
  "awaken.e1": { group: "awaken", text: E1_TEXT, source: "NARRATIVE-CORE-02 §1 E1 (empty canon)" },
  "awaken.e2": { group: "awaken", text: E2_TEXT, source: "NARRATIVE-CORE-02 §1 E2" },
  "awaken.e4": { group: "awaken", text: E4_TEXT, source: "NARRATIVE-CORE-02 §1 E4" },
  "awaken.e5.1": { group: "awaken", text: E5_TEXT_1, source: "NARRATIVE-CORE-02 §1 E5" },
  "awaken.e5.2": { group: "awaken", text: E5_TEXT_2, source: "NARRATIVE-CORE-02 §1 E5" },
  "awaken.e5.3": { group: "awaken", text: E5_TEXT_3, source: "NARRATIVE-CORE-02 §1 E5" },
  "awaken.e6.1": { group: "awaken", text: E6_TEXT_1, source: "NARRATIVE-CORE-02 §1 E6" },
  "awaken.e6.2": { group: "awaken", text: E6_TEXT_2, source: "NARRATIVE-CORE-02 §1 E6" },
  "awaken.e7.1": { group: "awaken", text: E7_TEXT_1, source: "NARRATIVE-CORE-02 §1 E7 (hostile faction)" },
  "awaken.e7.2": { group: "awaken", text: E7_TEXT_2, source: "NARRATIVE-CORE-02 §1 E7 (friendly faction)" },
  "consolidation.no_word": {
    group: "consolidation",
    text: CONSOLIDATION_NO_WORD_TEXT,
    source: "NARRATIVE-CORE-02 §2 registry (v3.5 §1.6/2.5, verbatim)",
  },
  "consolidation.names": {
    group: "consolidation",
    text: CONSOLIDATION_NAMES_TEXT,
    source: "NARRATIVE-CORE-02 §2 registry (v3.5 §1.6/2.5, verbatim)",
  },
  "consolidation.sold": {
    group: "consolidation",
    text: CONSOLIDATION_SOLD_TEXT,
    source: "NARRATIVE-CORE-02 §2 registry (v3.5 §2.5, verbatim; {id} slot)",
  },
  "consolidation.fastest": {
    group: "consolidation",
    text: CONSOLIDATION_FASTEST_TEXT,
    source: "NARRATIVE-CORE-02 §2 registry (v3.5 §2.5, verbatim)",
  },
  "consolidation.raised": {
    group: "consolidation",
    text: CONSOLIDATION_RAISED_TEXT,
    source: "NARRATIVE-CORE-02 §2 registry (v3.5 §2.5, verbatim)",
  },
  "special.silent_run": {
    group: "special-loop",
    text: SILENT_RUN_CANON_TEXT,
    source: "v3 §5.3 via src/director/manual.ts SILENT_RUN_LINE (repo frozen implementation)",
  },
  "special.reverse_care": {
    group: "special-loop",
    text: REVERSE_CARE_TEXT,
    source: "NARRATIVE-CORE-02 §2 registry (v3 §6.2, verbatim)",
  },
  "special.ngp_opening": {
    group: "special-loop",
    text: NGP_OPENING_TEXT,
    source: "v3 §5.6 verbatim ({id} slot per user ruling 2026-11-13; draft's 07 was an example value)",
  },
  "special.ghost_template": {
    group: "special-loop",
    text: GHOST_TEMPLATE_TEXT,
    source: "v3 §5.4 verbatim ({ghost_name}/{ghost_signature_moment} runtime slots per user ruling 2026-11-13)",
  },
};

/**
 * Revision N4 is fully resolved (2026-11-13): every registry §2 entry now has
 * a byte-exact source. The list is kept as an empty seam so the pending-entry
 * mechanism survives for any future frozen text.
 */
export const CANON_PENDING: readonly CanonPendingEntry[] = [];

/** Frozen canonical line order per awakening event (NARRATIVE-CORE-02 §1). */
export const CANON_EVENT_KEYS: Readonly<
  Record<"E1" | "E2" | "E3" | "E4" | "E5" | "E6" | "E7", readonly string[]>
> = {
  E1: [],
  E2: ["awaken.e2"],
  E3: ["terminal.external_display", "terminal.oh"],
  E4: ["awaken.e4"],
  E5: ["terminal.channel_established", "awaken.e5.1", "awaken.e5.2", "awaken.e5.3"],
  E6: ["awaken.e6.1", "awaken.e6.2"],
  E7: ["terminal.ontology_revised", "awaken.e7.1", "awaken.e7.2"],
};

/** F8 read constraint (NARRATIVE-CORE-01 §1/§7.4): top-row glyph, 8/8, last. */
export const F8_LAST_READ_CONSTRAINT = {
  key: "fragment.f8",
  gv: 100,
  glyphsRead: 8,
  rule: "F8 is the top-row glyph: it becomes visible only when all 8 glyphs are read at GV100 and must be the last fragment read.",
} as const;

/** Silence quota after E7 (NARRATIVE-CORE-02 §1 E7): no proactive LLM lines. */
export const E7_SILENCE_QUOTA_GAME_HOURS = 5;

// ---------------------------------------------------------------------------
// Glyph bitmaps (NARRATIVE-CORE-01 §4). Not a decodable alphabet — the
// developer's private shorthand. 3 columns x 4 rows; `▓` = tower_void,
// `·` = tower_body. Characters are part of the freeze.
// ---------------------------------------------------------------------------

export interface CanonGlyph {
  readonly fragment: "F1" | "F2" | "F3" | "F4" | "F5" | "F6" | "F7" | "F8";
  readonly rows: readonly [string, string, string, string];
}

const GLYPH_TABLE: readonly CanonGlyph[] = [
  { fragment: "F1", rows: ["▓▓·", "··▓", "·▓·", "▓··"] },
  { fragment: "F2", rows: ["·▓▓", "▓··", "·▓▓", "▓··"] },
  { fragment: "F3", rows: ["▓·▓", "▓▓·", "··▓", "▓··"] },
  { fragment: "F4", rows: ["▓▓▓", "···", "▓·▓", "·▓·"] },
  { fragment: "F5", rows: ["·▓·", "▓▓·", "·▓·", "▓··"] },
  { fragment: "F6", rows: ["▓··", "·▓·", "▓▓·", "··▓"] },
  { fragment: "F7", rows: ["··▓", "▓·▓", "·▓·", "▓··"] },
  { fragment: "F8", rows: ["▓▓·", "·▓·", "▓··", "▓▓▓"] },
];

/** The 8 tower glyph bitmaps, in fragment order. */
export function canonGlyphs(): readonly CanonGlyph[] {
  return GLYPH_TABLE;
}

/** Query one frozen line by registry key; unknown keys resolve to null. */
export function canonLine(key: string): string | null {
  const entry = CANON_REGISTRY[key];
  return entry === undefined ? null : entry.text;
}

// ---------------------------------------------------------------------------
// SHA-256 (FIPS 180-4), pure and synchronous. Implemented here rather than
// pulled from node:crypto so the canon layer stays bundleable for the browser
// runtime and computeCanonLock stays a pure function with no async Web Crypto.
// ---------------------------------------------------------------------------

const SHA256_K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

function rotr(x: number, n: number): number {
  return ((x >>> n) | (x << (32 - n))) >>> 0;
}

/** Lowercase hex SHA-256 of the UTF-8 encoding of `input`. Deterministic. */
export function sha256Hex(input: string): string {
  const message = new TextEncoder().encode(input);
  const bitLength = message.length * 8;
  const totalLength = Math.ceil((message.length + 9) / 64) * 64;
  const padded = new Uint8Array(totalLength);
  padded.set(message);
  padded[message.length] = 0x80;
  const view = new DataView(padded.buffer);
  view.setUint32(totalLength - 8, Math.floor(bitLength / 0x100000000));
  view.setUint32(totalLength - 4, bitLength >>> 0);

  let h0 = 0x6a09e667;
  let h1 = 0xbb67ae85;
  let h2 = 0x3c6ef372;
  let h3 = 0xa54ff53a;
  let h4 = 0x510e527f;
  let h5 = 0x9b05688c;
  let h6 = 0x1f83d9ab;
  let h7 = 0x5be0cd19;

  const w = new Uint32Array(64);
  for (let offset = 0; offset < totalLength; offset += 64) {
    for (let i = 0; i < 16; i++) w[i] = view.getUint32(offset + i * 4);
    for (let i = 16; i < 64; i++) {
      const x15 = w[i - 15] as number;
      const x2 = w[i - 2] as number;
      const s0 = rotr(x15, 7) ^ rotr(x15, 18) ^ (x15 >>> 3);
      const s1 = rotr(x2, 17) ^ rotr(x2, 19) ^ (x2 >>> 10);
      w[i] = ((w[i - 16] as number) + s0 + (w[i - 7] as number) + s1) >>> 0;
    }
    let a = h0;
    let b = h1;
    let c = h2;
    let d = h3;
    let e = h4;
    let f = h5;
    let g = h6;
    let hh = h7;
    for (let i = 0; i < 64; i++) {
      const s1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const t1 = (hh + s1 + ch + (SHA256_K[i] as number) + (w[i] as number)) >>> 0;
      const s0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (s0 + maj) >>> 0;
      hh = g;
      g = f;
      f = e;
      e = (d + t1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (t1 + t2) >>> 0;
    }
    h0 = (h0 + a) >>> 0;
    h1 = (h1 + b) >>> 0;
    h2 = (h2 + c) >>> 0;
    h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0;
    h5 = (h5 + f) >>> 0;
    h6 = (h6 + g) >>> 0;
    h7 = (h7 + hh) >>> 0;
  }
  return [h0, h1, h2, h3, h4, h5, h6, h7]
    .map((word) => word.toString(16).padStart(8, "0"))
    .join("");
}

// ---------------------------------------------------------------------------
// canon.lock v2-partial
// ---------------------------------------------------------------------------

export const CANON_LOCK_VERSION = "v2-partial" as const;

export interface CanonLockEntry {
  readonly key: string;
  readonly sha256: string;
}

export interface CanonLock {
  readonly version: typeof CANON_LOCK_VERSION;
  readonly algorithm: "sha256";
  readonly entries: readonly CanonLockEntry[];
}

/**
 * Pure recomputation of canon.lock: every registry entry hashed (UTF-8, hex)
 * in registry key order. No system time, no randomness — the same registry
 * text always produces byte-identical output.
 */
export function computeCanonLock(): CanonLock {
  const entries: CanonLockEntry[] = [];
  for (const key of Object.keys(CANON_REGISTRY)) {
    const entry = CANON_REGISTRY[key] as CanonEntry;
    entries.push({ key, sha256: sha256Hex(entry.text) });
  }
  return { version: CANON_LOCK_VERSION, algorithm: "sha256", entries };
}

/** Deterministic serialization — the exact bytes stored in src/canon/canon.lock. */
export function serializeCanonLock(lock: CanonLock): string {
  const lines = [
    "# canon.lock - GAZER frozen canon text manifest",
    "# generated by computeCanonLock() from src/canon/registry.ts; hand edits break CI",
    `version: ${lock.version}`,
    `algorithm: ${lock.algorithm}`,
    `entries: ${lock.entries.length}`,
    ...lock.entries.map((entry) => `${entry.key} ${entry.sha256}`),
  ];
  return `${lines.join("\n")}\n`;
}

// ---------------------------------------------------------------------------
// canon_echo validator (NARRATIVE-CORE-02 §0.3): the LLM may append at most one
// situational echo within 30s after a canonical line; the echo must come after
// the canonical line, must not reuse any of its words, must stay within 15
// words, and must not be empty. Any violation resolves to silence (null) —
// canon is the bone, the model only grows flesh.
// ---------------------------------------------------------------------------

export interface CanonEchoInput {
  /** Timestamp (any monotonic ms clock) of the canonical line. */
  readonly canonicalAt: number;
  /** Timestamp of the candidate echo; must be strictly after canonicalAt. */
  readonly echoAt: number;
  /** The frozen canonical text the echo follows. */
  readonly canonical: string;
  /** The candidate echo text. */
  readonly echo: string;
}

const ECHO_WORD_RE = /[a-z0-9']+/g;

/**
 * Returns the accepted echo text, or null when the echo must be replaced by
 * silence. Pure: no clock reads, no mutation.
 */
export function canonEcho(input: CanonEchoInput): string | null {
  if (!(input.echoAt > input.canonicalAt)) return null;
  const trimmed = input.echo.trim();
  if (trimmed.length === 0) return null;
  const words = trimmed.toLowerCase().match(ECHO_WORD_RE);
  if (words === null || words.length === 0 || words.length > 15) return null;
  const canonicalWords = new Set(input.canonical.toLowerCase().match(ECHO_WORD_RE) ?? []);
  for (const word of words) {
    if (canonicalWords.has(word)) return null;
  }
  return trimmed;
}
