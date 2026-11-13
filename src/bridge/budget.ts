/**
 * Soft budget guard for bridge calls: at most `maxCalls` spends inside any
 * sliding `windowMs` window (default 15 per 30 minutes, per GAME_REVIEW §11.4).
 *
 * "Soft" means exhaustion is not an error: `trySpend` returns false and the
 * caller silently takes the manual-pool fallback. The window slides, so the
 * guard recovers on its own; nothing here ever throws.
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
