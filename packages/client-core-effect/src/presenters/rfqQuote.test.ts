import { Effect, Exit, Layer, ManagedRuntime, Scope } from "effect";
import { defer, Observable, Subject } from "rxjs";
import { afterEach, describe, expect, it } from "vitest";

import type { PriceTick, PricingPort, RfqQuoteResult } from "@rtc/domain";

import type { EffectHost } from "#/bridge/out";
import { createRfqQuotePresenter } from "#/presenters/rfqQuote";

describe("createRfqQuotePresenter", () => {
  afterEach(async () => {
    while (hosts.length > 0) {
      const host = hosts.pop();

      if (host) {
        await Effect.runPromise(Scope.close(host.scope, Exit.void));
        await host.runtime.dispose();
      }
    }
  });

  it("requestQuote is lazy: the port sees nothing until the returned stream is subscribed", async () => {
    const pricing = createPricingPort();
    const p = createRfqQuotePresenter(useHost(), pricing.port);
    const quote = p.requestQuote("EURUSD", 4);
    await settle();
    expect(pricing.requests()).toEqual([]);
    quote.subscribe(() => {});
    await settle();
    expect(pricing.requests()).toEqual([{ symbol: "EURUSD", pipsPosition: 4 }]);
  });

  it("the result lands and the stream completes", async () => {
    const pricing = createPricingPort();
    const p = createRfqQuotePresenter(useHost(), pricing.port);
    const values: RfqQuoteResult[] = [];
    let completed = false;
    p.requestQuote("EURUSD", 4).subscribe({
      next: (value: RfqQuoteResult) => {
        values.push(value);
      },
      complete: () => {
        completed = true;
      },
    });
    await settle();
    const result: RfqQuoteResult = { bid: 1.0999, ask: 1.1001, mid: 1.1 };
    pricing.quotes.next(result);
    await settle();
    expect(values).toEqual([result]);
    expect(completed).toBe(true);
  });

  it("unsubscribing before the result withdraws the port subscription", async () => {
    const pricing = createPricingPort();
    const p = createRfqQuotePresenter(useHost(), pricing.port);
    const subscription = p.requestQuote("EURUSD", 4).subscribe(() => {});
    await settle();
    expect(pricing.quotes.observed).toBe(true);
    subscription.unsubscribe();
    await settle();
    expect(pricing.quotes.observed).toBe(false);
  });

  const hosts: TestHost[] = [];

  function useHost(): TestHost {
    const host: TestHost = {
      runtime: ManagedRuntime.make(Layer.empty),
      scope: Effect.runSync(Scope.make()),
    };
    hosts.push(host);
    return host;
  }
});

interface TestHost extends EffectHost {
  runtime: ManagedRuntime.ManagedRuntime<never, never>;
}

/** What `pricing.getRfqQuote` was asked for — recorded on SUBSCRIBE, so
 * laziness stays the presenter's property rather than the stub's. */
interface RecordedRequest {
  symbol: string;
  pipsPosition: number;
}

interface TestPricing {
  port: PricingPort;
  quotes: Subject<RfqQuoteResult>;
  requests: () => readonly RecordedRequest[];
}

function createPricingPort(): TestPricing {
  const quotes = new Subject<RfqQuoteResult>();
  const requests: RecordedRequest[] = [];

  return {
    quotes,
    requests: () => {
      return requests;
    },
    port: {
      getPriceUpdates: (): Observable<PriceTick> => {
        return new Observable<PriceTick>(() => {});
      },
      getPriceHistory: (): Observable<readonly PriceTick[]> => {
        return new Observable<readonly PriceTick[]>(() => {});
      },
      getRfqQuote: (
        symbol: string,
        pipsPosition: number,
      ): Observable<RfqQuoteResult> => {
        return defer(() => {
          requests.push({ symbol, pipsPosition });
          return quotes;
        });
      },
    },
  };
}

/** Two real macrotask turns: the command runs on the Effect scheduler. */
async function settle(): Promise<void> {
  for (let turn = 0; turn < 2; turn += 1) {
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 0);
    });
  }
}
