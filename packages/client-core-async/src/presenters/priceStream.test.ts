import { BehaviorSubject, Subject } from "rxjs";
import { describe, expect, it } from "vitest";

import {
  type CurrencyPair,
  KNOWN_CURRENCY_PAIRS,
  type PriceTick,
  type PricingPort,
} from "@rtc/domain";

import { createPriceStreamPresenter } from "#/presenters/priceStream";

describe("createPriceStreamPresenter (async)", () => {
  it("opens the port stream per warm period through the use case, never at construction, and memoises per pair", () => {
    const { port, calls, ticks } = createPort();
    const presenter = createPriceStreamPresenter(
      port,
      new BehaviorSubject<boolean>(false),
    );
    expect(calls).toEqual([]);
    const stream = presenter.price$(EURUSD);
    expect(presenter.price$(EURUSD)).toBe(stream);
    expect(calls).toEqual([]);
    const first = stream.subscribe(() => {});
    expect(calls).toEqual(["EURUSD"]);
    first.unsubscribe();
    expect(ticks.observed).toBe(false);
    stream.subscribe(() => {}).unsubscribe();
    expect(calls).toEqual(["EURUSD", "EURUSD"]);
  });

  interface PortFixture {
    port: PricingPort;
    calls: string[];
    ticks: Subject<PriceTick>;
  }

  function createPort(): PortFixture {
    const calls: string[] = [];
    const ticks = new Subject<PriceTick>();
    const port: PricingPort = {
      getPriceUpdates: (symbol: string) => {
        calls.push(symbol);
        return ticks;
      },
      getPriceHistory: () => {
        throw new Error("unused");
      },
      getRfqQuote: () => {
        throw new Error("unused");
      },
    };
    return { port, calls, ticks };
  }
});

const EURUSD: CurrencyPair = KNOWN_CURRENCY_PAIRS[0];
