import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, test } from "vitest";

import { useEqChart } from "#/equities/useEqChart";
import { mulberry32 } from "#/mock/rng";

afterEach(cleanup);

describe("useEqChart", () => {
  test("starts on AAPL / 1D with one tab and a 40-bar series", () => {
    const { result } = renderHook(() => {
      return useEqChart({ rng: mulberry32(1) });
    });
    expect(result.current.sel).toBe("AAPL");
    expect(result.current.openTabs).toEqual(["AAPL"]);
    expect(result.current.tf).toBe("1D");
    expect(result.current.series).toHaveLength(40);
    expect(result.current.wlSort).toBe("chg");
  });

  test("selectEq adds a tab and switches the selection", () => {
    const { result } = renderHook(() => {
      return useEqChart({ rng: mulberry32(1) });
    });
    act(() => {
      result.current.selectEq("MSFT");
    });
    expect(result.current.sel).toBe("MSFT");
    expect(result.current.openTabs).toEqual(["AAPL", "MSFT"]);
  });

  test("closing the selected tab falls back to the last remaining tab", () => {
    const { result } = renderHook(() => {
      return useEqChart({ rng: mulberry32(1) });
    });
    act(() => {
      result.current.selectEq("MSFT");
    });
    act(() => {
      result.current.closeTab("MSFT");
    });
    expect(result.current.openTabs).toEqual(["AAPL"]);
    expect(result.current.sel).toBe("AAPL");
  });

  test("setTf regenerates the selected series to the new bar count", () => {
    const { result } = renderHook(() => {
      return useEqChart({ rng: mulberry32(1) });
    });
    act(() => {
      result.current.setTf("3M");
    });
    expect(result.current.tf).toBe("3M");
    expect(result.current.series).toHaveLength(52);
  });

  test("cycleWlSort cycles chg -> price -> sym -> chg", () => {
    const { result } = renderHook(() => {
      return useEqChart({ rng: mulberry32(1) });
    });
    act(() => {
      result.current.cycleWlSort();
    });
    expect(result.current.wlSort).toBe("price");
    act(() => {
      result.current.cycleWlSort();
    });
    expect(result.current.wlSort).toBe("sym");
    act(() => {
      result.current.cycleWlSort();
    });
    expect(result.current.wlSort).toBe("chg");
  });
});
