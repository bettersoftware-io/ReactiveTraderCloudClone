import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

import type { RfqFormValue } from "#/credit/useCreditForm";
import { useCreditRfqs } from "#/credit/useCreditRfqs";
import { mulberry32 } from "#/mock/rng";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const BUY: RfqFormValue = {
  dir: "Buy",
  instrumentId: 2,
  qty: "500",
  dealerIds: [1, 2, 3],
};

describe("useCreditRfqs", () => {
  test("seeds two RFQs and starts on the 'all' tab", () => {
    const { result } = renderHook(() => {
      return useCreditRfqs({ rng: mulberry32(1) });
    });
    expect(result.current.rfqs).toHaveLength(2);
    expect(result.current.creditTab).toBe("all");
  });

  test("liveCount is '' with no Open RFQs, and '(n)' once one is live (PROTO L1325 format)", () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => {
      return useCreditRfqs({ rng: mulberry32(1) });
    });
    expect(result.current.liveCount).toBe("");

    act(() => {
      result.current.sendRfq({ ...BUY });
    });
    expect(result.current.liveCount).toBe("(1)");
  });

  test("sendRfq prepends a live RFQ, switches to live, and flags it new", () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => {
      return useCreditRfqs({ rng: mulberry32(1) });
    });
    act(() => {
      result.current.sendRfq({ ...BUY });
    });
    expect(result.current.creditTab).toBe("live");
    expect(result.current.rfqs[0].state).toBe("Open");
    expect(result.current.rfqs[0].id).toBe(700);
    expect(result.current.newRfqId).toBe(700);
    expect(
      result.current.rfqs[0].quotes.every((q) => {
        return q.state === "pending";
      }),
    ).toBe(true);
  });

  test("dealer quotes arrive priced/passed after their timers", () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => {
      return useCreditRfqs({ rng: mulberry32(1) });
    });
    act(() => {
      result.current.sendRfq({ ...BUY });
    });
    act(() => {
      vi.advanceTimersByTime(4000);
    });
    const settled = result.current.rfqs[0].quotes.every((q) => {
      return q.state === "priced" || q.state === "passed";
    });
    expect(settled).toBe(true);
  });

  test("acceptQuote closes the RFQ and books a credit trade", () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => {
      return useCreditRfqs({ rng: mulberry32(1) });
    });
    act(() => {
      result.current.sendRfq({ ...BUY });
    });
    act(() => {
      vi.advanceTimersByTime(4000);
    });
    const priced = result.current.rfqs[0].quotes.find((q) => {
      return q.state === "priced";
    });
    const beforeTrades = result.current.creditTrades.length;
    act(() => {
      result.current.acceptQuote(700, priced!.dealerId);
    });
    expect(result.current.rfqs[0].state).toBe("Closed");
    expect(result.current.creditTrades).toHaveLength(beforeTrades + 1);
    expect(result.current.creditTrades[0].id).toBe(700);
  });

  test("the 400ms sweep expires an Open RFQ past 120s", () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => {
      return useCreditRfqs({ rng: mulberry32(1) });
    });
    act(() => {
      result.current.sendRfq({ ...BUY });
    });
    act(() => {
      vi.advanceTimersByTime(121_000);
    });
    expect(result.current.rfqs[0].state).toBe("Expired");
  });

  test("cancelRfq marks an Open RFQ Cancelled", () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => {
      return useCreditRfqs({ rng: mulberry32(1) });
    });
    act(() => {
      result.current.sendRfq({ ...BUY });
    });
    act(() => {
      result.current.cancelRfq(700);
    });
    expect(result.current.rfqs[0].state).toBe("Cancelled");
  });

  test("cardExitIds marks an RFQ that resolves while on the live tab, then clears after the next 400ms sweep", () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => {
      return useCreditRfqs({ rng: mulberry32(1) });
    });
    act(() => {
      result.current.sendRfq({ ...BUY });
    });
    act(() => {
      result.current.cancelRfq(700);
    });
    expect(result.current.creditTab).toBe("live");
    expect(result.current.rfqs[0].state).toBe("Cancelled");
    expect(result.current.cardExitIds).toContain(700);
    expect(
      result.current.shownRfqs.some((r) => {
        return r.id === 700;
      }),
    ).toBe(true);

    act(() => {
      vi.advanceTimersByTime(400);
    });
    expect(result.current.cardExitIds).not.toContain(700);
  });

  test("tabRecent flags a real tab switch for ~480ms, then decays", () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => {
      return useCreditRfqs({ rng: mulberry32(1) });
    });
    expect(result.current.tabRecent).toBe(false);

    act(() => {
      result.current.onTab("live");
    });
    expect(result.current.creditTab).toBe("live");
    expect(result.current.tabRecent).toBe(true);

    act(() => {
      vi.advanceTimersByTime(900);
    });
    expect(result.current.tabRecent).toBe(false);
  });
});
