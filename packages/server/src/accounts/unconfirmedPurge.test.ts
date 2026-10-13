import { afterEach, describe, expect, it, vi } from "vitest";

import type { PurgeOutcome } from "#/accounts/AccountDirectory";
import { startUnconfirmedPurge } from "#/accounts/unconfirmedPurge";

describe("startUnconfirmedPurge", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("runs a minute after start, then every hour, with the cutoff now minus the retention and the batch", async () => {
    vi.useFakeTimers();
    const calls: [number, number][] = [];
    const lines: string[] = [];
    const handle = startUnconfirmedPurge({
      directory: {
        purgeUnconfirmedBefore: (cutoff: number, limit: number) => {
          calls.push([cutoff, limit]);
          return Promise.resolve({ outcome: "purged", count: 2 });
        },
      },
      now: () => {
        return Date.now();
      },
      retentionMs: 48 * 3_600_000,
      intervalMs: 3_600_000,
      firstRunDelayMs: 60_000,
      batch: 100,
      log: (line: string) => {
        return lines.push(line);
      },
    });

    await vi.advanceTimersByTimeAsync(59_999);
    expect(calls).toEqual([]);
    await vi.advanceTimersByTimeAsync(1);
    expect(calls).toEqual([[Date.now() - 48 * 3_600_000, 100]]);
    await vi.advanceTimersByTimeAsync(3_600_000);
    expect(calls).toHaveLength(2);
    expect(lines).toEqual([
      "[accounts] purged 2 unconfirmed accounts",
      "[accounts] purged 2 unconfirmed accounts",
    ]);
    handle.stop();
    await vi.advanceTimersByTimeAsync(3_600_000);
    expect(calls).toHaveLength(2);
  });

  it("logs nothing for a run that purged nothing, and one line when the store did not answer", async () => {
    vi.useFakeTimers();
    const outcomes: PurgeOutcome[] = [
      { outcome: "purged", count: 0 },
      { outcome: "unavailable" },
    ];
    const lines: string[] = [];
    startUnconfirmedPurge({
      directory: {
        purgeUnconfirmedBefore: () => {
          return Promise.resolve(
            outcomes.shift() ?? { outcome: "unavailable" },
          );
        },
      },
      now: () => {
        return 0;
      },
      retentionMs: 1,
      intervalMs: 10,
      firstRunDelayMs: 1,
      batch: 1,
      log: (line: string) => {
        return lines.push(line);
      },
    });

    await vi.advanceTimersByTimeAsync(11);
    expect(lines).toEqual(["[accounts] purge unavailable"]);
  });

  it("stops cleanly before the first run ever fired", async () => {
    vi.useFakeTimers();
    const calls: number[] = [];
    const handle = startUnconfirmedPurge({
      directory: {
        purgeUnconfirmedBefore: (cutoff: number) => {
          calls.push(cutoff);
          return Promise.resolve({ outcome: "purged", count: 0 });
        },
      },
      now: () => {
        return 0;
      },
      retentionMs: 1,
      intervalMs: 10,
      firstRunDelayMs: 5,
      batch: 1,
      log: () => {},
    });

    handle.stop();
    await vi.advanceTimersByTimeAsync(100);
    expect(calls).toEqual([]);
  });

  it("does not hold the process open", async () => {
    vi.useFakeTimers();
    const unrefTimeout = vi.fn();
    const unrefInterval = vi.fn();
    const realSetTimeout = globalThis.setTimeout;
    const realSetInterval = globalThis.setInterval;
    vi.spyOn(globalThis, "setTimeout").mockImplementation(((
      ...args: Parameters<typeof setTimeout>
    ) => {
      const timer = realSetTimeout(...args);

      timer.unref = (): NodeJS.Timeout => {
        unrefTimeout();
        return timer;
      };

      return timer;
    }) as typeof setTimeout);
    vi.spyOn(globalThis, "setInterval").mockImplementation(((
      ...args: Parameters<typeof setInterval>
    ) => {
      const timer = realSetInterval(...args);

      timer.unref = (): NodeJS.Timeout => {
        unrefInterval();
        return timer;
      };

      return timer;
    }) as typeof setInterval);

    const handle = startUnconfirmedPurge({
      directory: {
        purgeUnconfirmedBefore: () => {
          return Promise.resolve({ outcome: "purged", count: 0 });
        },
      },
      now: () => {
        return 0;
      },
      retentionMs: 1,
      intervalMs: 10,
      firstRunDelayMs: 1,
      batch: 1,
      log: () => {},
    });

    expect(unrefTimeout).toHaveBeenCalledTimes(1);
    expect(unrefInterval).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(unrefInterval).toHaveBeenCalledTimes(1);
    handle.stop();
  });
});
