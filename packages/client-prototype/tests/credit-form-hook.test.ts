import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, test } from "vitest";

import { useCreditForm } from "#/credit/useCreditForm";

afterEach(cleanup);

describe("useCreditForm", () => {
  test("SEND is invalid until instrument + qty>0 + >=1 dealer", () => {
    const { result } = renderHook(() => {
      return useCreditForm();
    });
    expect(result.current.valid).toBe(false);

    act(() => {
      result.current.selectInstrument(2);
    });
    act(() => {
      result.current.setQty("500");
    });
    expect(result.current.valid).toBe(false);

    act(() => {
      result.current.toggleDealer(1);
    });
    expect(result.current.valid).toBe(true);
  });

  test("toggleAllDealers selects then clears all", () => {
    const { result } = renderHook(() => {
      return useCreditForm();
    });
    act(() => {
      result.current.toggleAllDealers();
    });
    expect(result.current.allDealers).toBe(true);
    act(() => {
      result.current.toggleAllDealers();
    });
    expect(result.current.value.dealerIds).toEqual([]);
  });

  test("clear resets direction, instrument, qty, dealers and closes dropdown", () => {
    const { result } = renderHook(() => {
      return useCreditForm();
    });
    act(() => {
      result.current.setDir("Sell");
      result.current.selectInstrument(3);
      result.current.toggleInstr();
    });
    act(() => {
      result.current.clear();
    });
    expect(result.current.value).toEqual({
      dir: "Buy",
      instrumentId: null,
      qty: "",
      dealerIds: [],
    });
    expect(result.current.showInstr).toBe(false);
  });
});
