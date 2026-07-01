import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

import { BASE_RATES } from "#/fx/fxData";
import { useFxRates } from "#/fx/useFxRates";
import { mulberry32 } from "#/mock/rng";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("useFxRates walk", () => {
  test("a seeded tick moves rates and sets a direction flag", () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => {
      return useFxRates({ rng: mulberry32(1), intervalMs: 250 });
    });

    expect(result.current.rates.EURUSD).toBe(BASE_RATES.EURUSD);
    expect(result.current.opens.EURUSD).toBe(BASE_RATES.EURUSD);

    act(() => {
      vi.advanceTimersByTime(250);
    });

    expect(
      result.current.dirs.EURUSD === 1 || result.current.dirs.EURUSD === -1,
    ).toBe(true);
    expect(result.current.hist.EURUSD).toHaveLength(30);
    expect(result.current.flash.EURUSD.ts).toBeGreaterThanOrEqual(0);
  });
});
