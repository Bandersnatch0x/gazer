/**
 * Response cache for bridge calls, keyed by
 * `stage | trigger | hash(serialised context)` per ticket 0007.
 *
 * Only successful, already-validated model replies are cached; every cache hit
 * re-runs the same validator, so a corrupted cache entry can never promote
 * text the protocol would have rejected. Capacity is bounded (LRU by refresh).
 */

import { hashString } from "../sim/rng";
import type { Stage } from "../sim/types";

export const DEFAULT_CACHE_CAPACITY = 64;

export interface BridgeCache {
  get(key: string): string | null;
  set(key: string, value: string): void;
  readonly size: number;
}

/**
 * The hash disambiguates different contexts behind one stage+trigger; the
 * length is appended so two contexts that merely collide on the 32-bit hash
 * still almost never share a key.
 */
export function cacheKey(stage: Stage, trigger: string, serialisedContext: string): string {
  return `${stage}|${trigger}|${hashString(serialisedContext).toString(16)}:${serialisedContext.length}`;
}

export function createBridgeCache(capacity?: number): BridgeCache {
  const maxEntries = Number.isFinite(capacity) && (capacity ?? 0) >= 1
    ? Math.floor(capacity ?? DEFAULT_CACHE_CAPACITY)
    : DEFAULT_CACHE_CAPACITY;
  const entries = new Map<string, string>();

  return {
    get(key: string): string | null {
      return entries.get(key) ?? null;
    },

    set(key: string, value: string): void {
      // Refresh recency: delete then re-insert moves the key to the tail.
      entries.delete(key);
      entries.set(key, value);
      while (entries.size > maxEntries) {
        const oldest = entries.keys().next();
        if (oldest.done === true) {
          break;
        }
        entries.delete(oldest.value);
      }
    },

    get size(): number {
      return entries.size;
    },
  };
}
