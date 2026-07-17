interface WindowState {
  count: number;
  windowStart: number;
}

export interface RateLimiter {
  hit(key: string, now: number): boolean;
}

export function createRateLimiter(
  maxPerWindow: number,
  windowMs: number,
): RateLimiter {
  const windows = new Map<string, WindowState>();

  return {
    hit(key: string, now: number): boolean {
      const state = windows.get(key);

      // If no state exists or we're at/past the window boundary, start a new window
      if (state === undefined || now >= state.windowStart + windowMs) {
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
  };
}
