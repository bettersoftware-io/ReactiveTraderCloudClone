import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

import { EQ_META } from "#/equities/equitiesData";
import { useEquities } from "#/equities/useEquities";
import { mulberry32 } from "#/mock/rng";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("useEquities", () => {
  test("seeds all 8 rates at their meta price with stable vols", () => {
    const { result } = renderHook(() => {
      return useEquities({ rng: mulberry32(3) });
    });
    expect(result.current.rates.AAPL).toBe(EQ_META.AAPL.px);
    expect(result.current.vol.AAPL).toMatch(/M$/);
  });

  test("a tick walks rates, sets a signed flash, and keeps vol stable", () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => {
      return useEquities({ rng: mulberry32(3), intervalMs: 100 });
    });
    const vol0 = result.current.vol.AAPL;
    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(result.current.rates.AAPL).not.toBe(EQ_META.AAPL.px);
    expect([1, -1]).toContain(result.current.flash.AAPL.dir);
    expect(result.current.flash.AAPL.ts).toBeGreaterThan(0);
    expect(result.current.vol.AAPL).toBe(vol0);
  });

  test("prev smooths toward the walked rate rather than jumping to it", () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => {
      return useEquities({ rng: mulberry32(9), intervalMs: 100 });
    });
    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(result.current.prev.AAPL).not.toBe(result.current.rates.AAPL);
  });
});
