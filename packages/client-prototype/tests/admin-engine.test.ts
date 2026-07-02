import { act, cleanup, renderHook } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, describe, expect, test, vi } from "vitest";

import { EVENT_CAP, SEED_EVENTS } from "#/admin/adminData";
import { useAdminMetrics } from "#/admin/useAdminMetrics";
import { mulberry32 } from "#/mock/rng";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("useAdminMetrics", () => {
  test("seeds 48-long metric series, 6 latency bars, and the seed events", () => {
    const { result } = renderHook(() => {
      return useAdminMetrics({ rng: mulberry32(1) });
    });
    expect(result.current.metrics.tput).toHaveLength(48);
    expect(result.current.latBars).toHaveLength(6);
    expect(result.current.events).toHaveLength(SEED_EVENTS.length);
  });

  test("a tick advances every series (window shifts by one sample)", () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => {
      return useAdminMetrics({ rng: mulberry32(2), intervalMs: 100 });
    });
    const before = result.current.metrics.tput;
    act(() => {
      vi.advanceTimersByTime(100);
    });
    const after = result.current.metrics.tput;
    expect(after.slice(0, 47)).toEqual(before.slice(1));
    expect(after).not.toEqual(before);
  });

  test("emits a new event every 4th tick and caps the feed at EVENT_CAP", () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => {
      return useAdminMetrics({ rng: mulberry32(3), intervalMs: 100 });
    });
    const seedCount = result.current.events.length;
    act(() => {
      vi.advanceTimersByTime(400);
    });
    expect(result.current.events.length).toBe(seedCount + 1);
    act(() => {
      vi.advanceTimersByTime(100 * 4 * 40);
    });
    expect(result.current.events.length).toBeLessThanOrEqual(EVENT_CAP);
  });

  test("StrictMode double-mount does not double-advance the seed", () => {
    const { result } = renderHook(
      () => {
        return useAdminMetrics({ rng: mulberry32(4) });
      },
      { wrapper: StrictMode },
    );
    const fresh = renderHook(() => {
      return useAdminMetrics({ rng: mulberry32(4) });
    });
    // Same seed → identical first series iff the seed was drawn exactly once.
    expect(result.current.metrics.tput).toEqual(
      fresh.result.current.metrics.tput,
    );
  });
});
