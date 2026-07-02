import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

import type { EqSym } from "#/equities/types";
import { useEqTicket } from "#/equities/useEqTicket";

const RATES = {
  AAPL: 230,
  MSFT: 467,
  NVDA: 131,
  TSLA: 251,
  AMZN: 218,
  GOOGL: 178,
  META: 591,
  SPY: 588,
} as Record<EqSym, number>;

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("useEqTicket", () => {
  test("a Market submit books a Filled order at the live price, id 5001", () => {
    const { result } = renderHook(() => {
      return useEqTicket("AAPL", RATES);
    });
    act(() => {
      result.current.setQty("100");
    });
    act(() => {
      result.current.submit();
    });
    expect(result.current.orders).toHaveLength(1);
    expect(result.current.orders[0].id).toBe(5001);
    expect(result.current.orders[0].status).toBe("Filled");
    expect(result.current.orders[0].price).toBe(230);
    expect(result.current.newOrderId).toBe(5001);
  });

  test("a Limit submit books a Working order at the limit price", () => {
    const { result } = renderHook(() => {
      return useEqTicket("AAPL", RATES);
    });
    act(() => {
      result.current.setType("Limit");
      result.current.setQty("50");
      result.current.setLimit("225");
    });
    act(() => {
      result.current.submit();
    });
    expect(result.current.orders[0].status).toBe("Working");
    expect(result.current.orders[0].price).toBe(225);
  });

  test("stepQty clamps at 0 and submit with qty 0 is a no-op", () => {
    const { result } = renderHook(() => {
      return useEqTicket("AAPL", RATES);
    });
    act(() => {
      result.current.setQty("5");
      result.current.stepQty(-10);
    });
    expect(result.current.ticket.qty).toBe("0");
    act(() => {
      result.current.submit();
    });
    expect(result.current.orders).toHaveLength(0);
  });
});
