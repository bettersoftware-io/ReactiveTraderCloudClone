import { describe, it, expect, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { of, throwError, type Observable } from "rxjs";
import {
  KNOWN_CURRENCY_PAIRS,
  type RfqQuoteResult,
} from "@rtc/domain";
import type { ReactNode } from "react";
import { HooksProvider } from "../../../../hooks/HooksProvider";
import type { AppHooks } from "../../../../hooks/createAppHooks";
import { useRfqQuote } from "./useRfqQuote";
import type { UseRfqStateResult, RfqQuote } from "./useRfqState";

const pair = KNOWN_CURRENCY_PAIRS[0];

function makeRfqState(): UseRfqStateResult {
  return {
    state: { status: "init", quote: null, remainingMs: 0 },
    initiate: vi.fn(),
    cancel: vi.fn(),
    receiveQuote: vi.fn(),
    reject: vi.fn(),
    accept: vi.fn(() => null),
  };
}

function wrapper(
  request: (symbol: string, pipsPosition: number) => Observable<RfqQuoteResult>,
) {
  const hooks = { useRequestRfqQuote: () => request } as unknown as AppHooks;
  return ({ children }: { children: ReactNode }) => (
    <HooksProvider hooks={hooks}>{children}</HooksProvider>
  );
}

describe("useRfqQuote", () => {
  it("initiates, requests a quote for the pair, and delivers the quote", async () => {
    const rfqState = makeRfqState();
    const result0: RfqQuoteResult = { bid: 1.0921, ask: 1.0925, mid: 1.0923 };
    const request = vi.fn(() => of(result0));
    const { result } = renderHook(() => useRfqQuote(pair, rfqState), {
      wrapper: wrapper(request),
    });
    await act(async () => {
      await result.current();
    });
    expect(rfqState.initiate).toHaveBeenCalledTimes(1);
    expect(request).toHaveBeenCalledWith(pair.symbol, pair.pipsPosition);
    const delivered = (rfqState.receiveQuote as unknown as { mock: { calls: [RfqQuote][] } })
      .mock.calls[0][0];
    expect(delivered).toMatchObject({ bid: 1.0921, ask: 1.0925, timeoutMs: 10_000 });
  });

  it("rejects the RFQ when the quote request errors", async () => {
    const rfqState = makeRfqState();
    const request = vi.fn(() => throwError(() => new Error("no quote")) as Observable<RfqQuoteResult>);
    const { result } = renderHook(() => useRfqQuote(pair, rfqState), {
      wrapper: wrapper(request),
    });
    await act(async () => {
      await result.current();
    });
    expect(rfqState.initiate).toHaveBeenCalledTimes(1);
    expect(rfqState.reject).toHaveBeenCalledTimes(1);
    expect(rfqState.receiveQuote).not.toHaveBeenCalled();
  });
});
