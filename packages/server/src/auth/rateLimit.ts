/** S4 — distinct IPs the table holds before evicting the oldest. */
const DEFAULT_MAX_KEYS = 10_000;

interface WindowState {
  count: number;
  windowStart: number;
}

export interface RateLimiterOptions {
  readonly maxKeys?: number;
}

export interface RateLimiter {
  hit(key: string, now: number): boolean;
  size(): number;
}

export function createRateLimiter(
  maxPerWindow: number,
  windowMs: number,
  options: RateLimiterOptions = {},
): RateLimiter {
  const maxKeys = options.maxKeys ?? DEFAULT_MAX_KEYS;
  const windows = new Map<string, WindowState>();

  // Sweeping only when the table is full keeps the hot path O(1); a full
  // sweep is O(n) once per `maxKeys` insertions at worst.
  function sweepExpired(now: number): void {
    for (const [key, state] of windows) {
      if (now >= state.windowStart + windowMs) {
        windows.delete(key);
      }
    }
  }

  function evictOldest(): void {
    let oldestKey: string | undefined;
    let oldestStart = Number.POSITIVE_INFINITY;

    for (const [key, state] of windows) {
      if (state.windowStart < oldestStart) {
        oldestStart = state.windowStart;
        oldestKey = key;
      }
    }

    if (oldestKey !== undefined) {
      windows.delete(oldestKey);
    }
  }

  return {
    hit(key: string, now: number): boolean {
      const state = windows.get(key);

      // If no state exists or we're at/past the window boundary, start a new window
      if (state === undefined || now >= state.windowStart + windowMs) {
        if (state === undefined && windows.size >= maxKeys) {
          sweepExpired(now);
        }

        if (state === undefined && windows.size >= maxKeys) {
          evictOldest();
        }

        windows.set(key, { count: 1, windowStart: now });
        return true;
      }

      // We're within an existing window
      if (state.count < maxPerWindow) {
        state.count++;
        return true;
      }

      // We've hit the limit
      return false;
    },
    size(): number {
      return windows.size;
    },
  };
}
