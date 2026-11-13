// Public surface of the canon layer (ticket 0028). Everything re-exported here
// is frozen-text machinery: registry, canon.lock recomputation, glyphs, and
// the canon_echo validator. Runtime consumers import from "../canon" — never
// retranscribe frozen prose elsewhere.
export {
  CANON_EVENT_KEYS,
  CANON_LOCK_VERSION,
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
} from "./registry";
export type {
  CanonEchoInput,
  CanonEntry,
  CanonGlyph,
  CanonGroup,
  CanonGv,
  CanonLock,
  CanonLockEntry,
  CanonPendingEntry,
} from "./registry";
