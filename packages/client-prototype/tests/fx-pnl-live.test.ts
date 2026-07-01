import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

import { useFxRates } from "#/fx/useFxRates";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("useFxRates pnl", () => {
  test("seeds pnl at 17120 before any tick", () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => {
      return useFxRates({
        rng: () => {
          return 0;
        },
        intervalMs: 250,
      });
    });

    expect(result.current.pnl).toBe(17120);
  });

  test("drifts pnl by round((rng-0.42)*500) on each tick", () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => {
      return useFxRates({
        rng: () => {
          return 0;
        },
        intervalMs: 250,
      });
    });

    act(() => {
      vi.advanceTimersByTime(250);
    });

    // round((0 - 0.42) * 500) = -210
    expect(result.current.pnl).toBe(16910);
  });

  test("floors pnl at 0 under sustained downward drift", () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => {
      return useFxRates({
        rng: () => {
          return 0;
        },
        intervalMs: 250,
      });
    });

    act(() => {
      vi.advanceTimersByTime(250 * 100);
    });

    expect(result.current.pnl).toBe(0);
  });
});
