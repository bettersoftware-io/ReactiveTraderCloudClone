import { defer, Observable, Subject } from "rxjs";
import { describe, expect, it } from "vitest";

import type { PricingPort, RfqQuoteResult } from "@rtc/domain";

import { createRfqQuotePresenter } from "#/presenters/rfqQuote";

describe("createRfqQuotePresenter (async)", () => {
  it("requestQuote is lazy: the port is reached only on subscribe", () => {
    const { port, calls } = createPricingPort();
    const presenter = createRfqQuotePresenter(port);
    const quote = presenter.requestQuote("EURUSD", 4);
    expect(calls.requests).toEqual([]);
    const sub = quote.subscribe(() => {});
    expect(calls.requests).toEqual([{ symbol: "EURUSD", pipsPosition: 4 }]);
    sub.unsubscribe();
  });

  it("emits the result and completes", async () => {
    const { port, calls } = createPricingPort();
    const presenter = createRfqQuotePresenter(port);
    const values: RfqQuoteResult[] = [];
    let completed = false;
    presenter.requestQuote("EURUSD", 4).subscribe({
      next: (result: RfqQuoteResult) => {
        values.push(result);
      },
      complete: () => {
        completed = true;
      },
    });
    const result: RfqQuoteResult = { bid: 1.1, ask: 1.2, mid: 1.15 };
    calls.results[0]?.next(result);
    calls.results[0]?.complete();
    await flushMicrotasks();
    expect(values).toEqual([result]);
    expect(completed).toBe(true);
  });

  it("unsubscribing before the result withdraws the in-flight request", () => {
    const { port, calls } = createPricingPort();
    const presenter = createRfqQuotePresenter(port);
    const sub = presenter.requestQuote("EURUSD", 4).subscribe(() => {});
    expect(calls.results[0]?.observed).toBe(true);
    sub.unsubscribe();
    expect(calls.results[0]?.observed).toBe(false);
  });

  interface QuoteRequestRecord {
    symbol: string;
    pipsPosition: number;
  }

  interface PricingCalls {
    requests: QuoteRequestRecord[];
    results: Subject<RfqQuoteResult>[];
  }

  interface PricingFixture {
    port: PricingPort;
    calls: PricingCalls;
  }

  async function flushMicrotasks(): Promise<void> {
    for (let turn = 0; turn < 4; turn += 1) {
      await Promise.resolve();
    }
  }

  function createPricingPort(): PricingFixture {
    const calls: PricingCalls = { requests: [], results: [] };
    return {
      calls,
      port: {
        getPriceUpdates: () => {
          return new Observable(() => {});
        },
        getPriceHistory: () => {
          return new Observable(() => {});
        },
        getRfqQuote: (symbol: string, pipsPosition: number) => {
          return defer(() => {
            calls.requests.push({ symbol, pipsPosition });
            const results = new Subject<RfqQuoteResult>();
            calls.results.push(results);
            return results;
          });
        },
      },
    };
  }
});
