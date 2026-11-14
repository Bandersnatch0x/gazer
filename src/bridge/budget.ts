/**
 * Hard-budget guard for bridge calls: at most `maxCalls` spends inside any
 * sliding `windowMs` window (default 15 per 30 minutes, per
 * `docs/design/ARCHITECTURE.md` §Cost and decision 0018 ③).
 *
 * Hard means the ceiling is enforced: `trySpend` returns false and the caller
 * takes the manual-pool fallback (`llm:budget` refuses the call). Exhaustion is
 * NOT an error for the player — no banner, no throw — and the window slides, so
 * the guard recovers on its own. Older comments called this "soft" to describe
 * that player-facing silence, NOT a relaxable limit; 0018 ③ rules the spec is
 * a hard budget, so the word is removed here.
 *
 * `createBudgetAdmission` below is the two-phase variant used by the runtime:
 * only a successful, validated response spends a slot.
 */

export interface BudgetGuardConfig {
  readonly maxCalls: number;
  readonly windowMs: number;
}

export const DEFAULT_BUDGET_CONFIG: BudgetGuardConfig = Object.freeze({
  maxCalls: 15,
  windowMs: 30 * 60 * 1000,
});

export interface BudgetSnapshot {
  readonly used: number;
  readonly limit: number;
  /** 0 when a slot is free or the guard is unused; else ms until one frees. */
  readonly resetsInMs: number;
}

export interface BudgetGuard {
  /** Records one spend and returns true, or refuses and returns false. */
  trySpend(now: number): boolean;
  snapshot(now: number): BudgetSnapshot;
  reset(): void;
}

function sanitizeCount(value: number, floor: number): number {
  // floor 0 is allowed: maxCalls 0 means "bridge disabled", every call falls back.
  return Number.isFinite(value) ? Math.max(floor, Math.floor(value)) : floor;
}

function sanitizeWindow(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : DEFAULT_BUDGET_CONFIG.windowMs;
}

export function createBudgetGuard(config?: Partial<BudgetGuardConfig>): BudgetGuard {
  const maxCalls = sanitizeCount(config?.maxCalls ?? DEFAULT_BUDGET_CONFIG.maxCalls, 0);
  const windowMs = sanitizeWindow(config?.windowMs ?? DEFAULT_BUDGET_CONFIG.windowMs);
  let stamps: number[] = [];

  const prune = (now: number): number[] => {
    const cutoff = now - windowMs;
    return stamps.filter((stamp) => stamp > cutoff);
  };

  return {
    trySpend(now: number): boolean {
      if (!Number.isFinite(now)) {
        return false;
      }
      const kept = prune(now);
      if (kept.length >= maxCalls) {
        stamps = kept;
        return false;
      }
      stamps = [...kept, now];
      return true;
    },

    snapshot(now: number): BudgetSnapshot {
      const kept = prune(now);
      const oldest = kept[0];
      const resetsInMs = kept.length >= maxCalls && oldest !== undefined
        ? Math.max(0, oldest + windowMs - now)
        : 0;
      return { used: kept.length, limit: maxCalls, resetsInMs };
    },

    reset(): void {
      stamps = [];
    },
  };
}

/**
 * Two-phase admission for the hard budget (ticket 0066, "先成功后扣").
 *
 *   - `allows(now)` prunes, RESERVES one in-flight slot and returns true, or
 *     refuses (false) when the ceiling is already reached. A reservation is not
 *     a spend: `llm:budget` refuses the call rather than queueing it.
 *   - `settle(now, success)` releases the reservation and, ONLY on a successful
 *     validated response, appends the spend timestamp. Failures, timeouts and
 *     429s never consume quota.
 *
 * Reservations keep concurrent calls from over-admitting: `used + inFlight`
 * never crosses `maxCalls`. Pure: no clock reads, no I/O; `now` is supplied by
 * the caller.
 */
export interface BudgetAdmission {
  /** Reserve a slot; false when the hard ceiling is reached. */
  allows(now: number): boolean;
  /** Release the reservation; spend only when `success` is true. */
  settle(now: number, success: boolean): void;
  snapshot(now: number): BudgetSnapshot;
  reset(): void;
}

export function createBudgetAdmission(config?: Partial<BudgetGuardConfig>): BudgetAdmission {
  const maxCalls = sanitizeCount(config?.maxCalls ?? DEFAULT_BUDGET_CONFIG.maxCalls, 0);
  const windowMs = sanitizeWindow(config?.windowMs ?? DEFAULT_BUDGET_CONFIG.windowMs);
  let stamps: number[] = [];
  let inFlight = 0;

  const prune = (now: number): number[] => {
    const cutoff = now - windowMs;
    return stamps.filter((stamp) => stamp > cutoff);
  };

  return {
    allows(now: number): boolean {
      if (!Number.isFinite(now)) {
        return false;
      }
      const kept = prune(now);
      stamps = kept;
      if (kept.length + inFlight >= maxCalls) {
        return false;
      }
      inFlight += 1;
      return true;
    },

    settle(now: number, success: boolean): void {
      inFlight = Math.max(0, inFlight - 1);
      if (!success || !Number.isFinite(now)) {
        return;
      }
      const kept = prune(now);
      // The reservation guaranteed this call a slot, so a concurrent batch can
      // never push `stamps` past maxCalls; keep a defensive ceiling anyway.
      stamps = kept.length < maxCalls ? [...kept, now] : kept;
    },

    snapshot(now: number): BudgetSnapshot {
      const kept = prune(now);
      const oldest = kept[0];
      const resetsInMs = kept.length >= maxCalls && oldest !== undefined
        ? Math.max(0, oldest + windowMs - now)
        : 0;
      return { used: kept.length, limit: maxCalls, resetsInMs };
    },

    reset(): void {
      stamps = [];
      inFlight = 0;
    },
  };
}
