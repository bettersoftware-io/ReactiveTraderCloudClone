export interface TokenBucket {
  /** Takes one token if one is available at `now` (ms); false means refused. */
  tryTake(now: number): boolean;
}

/**
 * S8 — a classic token bucket: `burst` tokens to start, refilled
 * continuously at `refillPerSecond`, never above `burst`. Time is injected
 * so tests need no timers.
 */
export function createTokenBucket(
  burst: number,
  refillPerSecond: number,
): TokenBucket {
  let tokens = burst;
  let lastAt: number | undefined;

  return {
    tryTake(now: number): boolean {
      if (lastAt !== undefined && now > lastAt) {
        tokens = Math.min(
          burst,
          tokens + ((now - lastAt) / 1_000) * refillPerSecond,
        );
      }

      lastAt = now;

      if (tokens < 1) {
        return false;
      }

      tokens -= 1;

      return true;
    },
  };
}
