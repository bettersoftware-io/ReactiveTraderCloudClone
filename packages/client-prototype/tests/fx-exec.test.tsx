import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

import { useFxRates } from "#/fx/useFxRates";
import { mulberry32 } from "#/mock/rng";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("useFxRates exec machine", () => {
  test("a small-notional buy walks idle → executing → success and appends a trade", () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => {
      // seed chosen so rng() >= 0.12 on the reject roll → a fill, not a
      // reject. mulberry32(7)'s first draw is ~0.0117 (< 0.12), which would
      // exercise the REJECT branch instead of the documented fill path, so
      // seed 1 is used here (first draw ~0.627).
      return useFxRates({ rng: mulberry32(1) });
    });

    act(() => {
      result.current.onBuy("EURUSD");
    });
    expect(result.current.tiles.EURUSD.stage).toBe("executing");

    act(() => {
      vi.advanceTimersByTime(1200);
    });
    expect(result.current.tiles.EURUSD.stage).toBe("success");
    expect(result.current.trades[0].symbol).toBe("EURUSD");
    expect(result.current.newRowId).toBe(result.current.trades[0].id);
    expect(result.current.activity[0].tag).toBe("TRADE");
  });

  test("a >10M notional buy requests a quote → rfqRecv", () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => {
      return useFxRates({ rng: mulberry32(3) });
    });

    act(() => {
      result.current.onNotional("EURUSD", "25m");
    });
    act(() => {
      result.current.onBuy("EURUSD");
    });
    expect(result.current.tiles.EURUSD.stage).toBe("rfqReq");

    act(() => {
      vi.advanceTimersByTime(1700);
    });
    expect(result.current.tiles.EURUSD.stage).toBe("rfqRecv");
    expect(result.current.tiles.EURUSD.quote?.Buy).toBeTruthy();
  });
});
