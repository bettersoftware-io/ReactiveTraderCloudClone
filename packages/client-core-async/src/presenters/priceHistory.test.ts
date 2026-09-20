import { BehaviorSubject, Subject } from "rxjs";
import { describe, expect, it } from "vitest";

import type { PriceTick, PricingPort } from "@rtc/domain";

import { createPriceHistoryPresenter } from "#/presenters/priceHistory";

describe("createPriceHistoryPresenter (async)", () => {
  it("hands a resubscriber the retained window synchronously and keeps accumulating into the same window", () => {
    const { port, ticks } = createPort();
    const presenter = createPriceHistoryPresenter(
      port,
      new BehaviorSubject<boolean>(false),
    );
    const stream = presenter.history$("EURUSD");
    expect(presenter.history$("EURUSD")).toBe(stream);
    const first = stream.subscribe(() => {});
    ticks.next(createTick(1));
    ticks.next(createTick(2));
    first.unsubscribe();

    const windows: (readonly PriceTick[])[] = [];
    const again = stream.subscribe((window) => {
      windows.push(window);
    });
    expect(mids(windows[0] ?? [])).toEqual([1, 2]);
    ticks.next(createTick(3));
    expect(mids(windows.at(-1) ?? [])).toEqual([1, 2, 3]);
    again.unsubscribe();
  });

  it("a never-mounted symbol has no lead: nothing arrives synchronously", () => {
    const { port } = createPort();
    const presenter = createPriceHistoryPresenter(
      port,
      new BehaviorSubject<boolean>(false),
    );
    const windows: (readonly PriceTick[])[] = [];
    const sub = presenter.history$("GBPUSD").subscribe((window) => {
      windows.push(window);
    });
    expect(windows).toEqual([]);
    sub.unsubscribe();
  });

  interface PortFixture {
    port: PricingPort;
    ticks: Subject<PriceTick>;
  }

  function mids(window: readonly PriceTick[]): number[] {
    return window.map((tick) => {
      return tick.mid;
    });
  }

  function createTick(mid: number): PriceTick {
    return {
      symbol: "EURUSD",
      bid: mid - 0.00005,
      ask: mid + 0.00005,
      mid,
      valueDate: "2026-01-03",
      creationTimestamp: 0,
    };
  }

  function createPort(): PortFixture {
    const ticks = new Subject<PriceTick>();
    const port: PricingPort = {
      getPriceUpdates: () => {
        return ticks;
      },
      getPriceHistory: () => {
        throw new Error("unused");
      },
      getRfqQuote: () => {
        throw new Error("unused");
      },
    };
    return { port, ticks };
  }
});
