import { describe, expect, it } from "vitest";

import type { AppPorts } from "@rtc/core-api";
import {
  AuthSimulator,
  type CurrencyPair,
  Direction,
  type PositionUpdates,
  PreferencesSimulator,
  type Trade,
} from "@rtc/domain";

import {
  createPositionUpdates,
  createTick,
  createTrade,
  EURUSD,
} from "#/harness/fixtures";
import { scriptPorts } from "#/harness/scriptedPorts";

describe("scriptPorts port-call counting", () => {
  it("counts each preferences stream method by name, and the two the harness supplies itself", () => {
    const { ports, driver, teardown } = scriptPorts(createBasePorts());
    expect(driver.portCalls("themeMode$")).toBe(0);
    ports.preferences.themeMode$();
    ports.preferences.themeMode$();
    ports.preferences.viewMode$();
    ports.connectionEvents.events();
    ports.colorScheme?.prefersDark$();
    expect(driver.portCalls("themeMode$")).toBe(2);
    expect(driver.portCalls("viewMode$")).toBe(1);
    expect(driver.portCalls("connectionEvents.events")).toBe(1);
    expect(driver.portCalls("colorScheme.prefersDark$")).toBe(1);
    teardown();
  });

  it("counts on INVOCATION, not on the property read that installs the wrapper", () => {
    const { ports, driver, teardown } = scriptPorts(createBasePorts());
    const themeMode$ = ports.preferences.themeMode$;
    expect(driver.portCalls("themeMode$")).toBe(0);
    themeMode$();
    expect(driver.portCalls("themeMode$")).toBe(1);
    teardown();
  });

  it("forwards the call to the real port with its own `this`", () => {
    const { ports, teardown } = scriptPorts(createBasePorts());
    ports.preferences.setThemeMode("light");
    const seen: string[] = [];
    ports.preferences.themeMode$().subscribe((mode) => {
      seen.push(mode);
    });
    expect(seen).toEqual(["light"]);
    teardown();
  });

  it("pricing: getPriceUpdates(symbol) is a per-symbol stream the driver ticks; observed only while subscribed", () => {
    const { ports, driver } = scriptPorts(createBasePorts());
    const seen: number[] = [];
    expect(driver.priceObserved("EURUSD")).toBe(false);
    const sub = ports.pricing.getPriceUpdates("EURUSD").subscribe((tick) => {
      seen.push(tick.mid);
    });
    expect(driver.priceObserved("EURUSD")).toBe(true);
    driver.tickPrice(createTick("EURUSD", 1.1));
    driver.tickPrice(createTick("GBPUSD", 1.3));
    expect(seen).toEqual([1.1]);
    sub.unsubscribe();
    expect(driver.priceObserved("EURUSD")).toBe(false);
  });

  it("pricing: failPrice errors that symbol's subscribers", () => {
    const { ports, driver } = scriptPorts(createBasePorts());
    const errors: unknown[] = [];
    ports.pricing.getPriceUpdates("EURUSD").subscribe({
      error: (e: unknown) => {
        errors.push(e);
      },
    });
    driver.failPrice("EURUSD", new Error("feed"));
    expect(errors).toHaveLength(1);
  });

  it("execution: a request is pending only once the returned stream is subscribed; resolveExecution completes the OLDEST", () => {
    const { ports, driver } = scriptPorts(createBasePorts());
    const request = {
      currencyPair: "EURUSD",
      spotRate: 1.1,
      direction: Direction.Buy,
      notional: 1,
      dealtCurrency: "EUR",
    };
    const first = ports.execution.executeTrade(request);
    expect(driver.pendingExecutions()).toEqual([]);
    const results: Trade[] = [];
    let completed = false;
    first.subscribe({
      next: (t: Trade) => {
        results.push(t);
      },
      complete: () => {
        completed = true;
      },
    });
    // An error-only observer: `failExecution` below errors this one, and a
    // bare `.subscribe()` would leave rxjs's default unhandled-error
    // reporting to throw and fail the run — this request is otherwise
    // fire-and-forget, only `pendingExecutions()` witnesses it.
    ports.execution.executeTrade({ ...request, notional: 2 }).subscribe({
      error: () => {},
    });
    expect(
      driver.pendingExecutions().map((r) => {
        return r.notional;
      }),
    ).toEqual([1, 2]);
    const trade = createTrade({ notional: 1 });
    driver.resolveExecution(trade);
    expect(results).toEqual([trade]);
    expect(completed).toBe(true);
    expect(
      driver.pendingExecutions().map((r) => {
        return r.notional;
      }),
    ).toEqual([2]);
    driver.failExecution(new Error("bust"));
    expect(driver.pendingExecutions()).toEqual([]);
    // Nothing pending: a no-op, never a throw.
    driver.resolveExecution(trade);
  });

  it("execution: unsubscribing a pending request withdraws it", () => {
    const { ports, driver } = scriptPorts(createBasePorts());
    const sub = ports.execution
      .executeTrade({
        currencyPair: "EURUSD",
        spotRate: 1,
        direction: Direction.Sell,
        notional: 5,
        dealtCurrency: "EUR",
      })
      .subscribe();
    expect(driver.pendingExecutions()).toHaveLength(1);
    sub.unsubscribe();
    expect(driver.pendingExecutions()).toEqual([]);
  });

  it("referenceData / blotter / analytics: driver-fed streams, observed flags, and counted port calls", () => {
    const { ports, driver } = scriptPorts(createBasePorts());
    const pairs: (readonly CurrencyPair[])[] = [];
    const trades: (readonly Trade[])[] = [];
    const positions: PositionUpdates[] = [];
    ports.referenceData.getCurrencyPairs().subscribe((p) => {
      pairs.push(p);
    });
    ports.blotter.getTradeStream().subscribe((t) => {
      trades.push(t);
    });
    ports.analytics.getAnalytics("USD").subscribe((u) => {
      positions.push(u);
    });
    expect(driver.pairsObserved()).toBe(true);
    expect(driver.tradesObserved()).toBe(true);
    expect(driver.positionObserved()).toBe(true);
    driver.emitPairs([EURUSD]);
    driver.emitTrades([createTrade()]);
    driver.emitPosition(createPositionUpdates(42));
    expect(pairs).toEqual([[EURUSD]]);
    expect(trades[0]).toHaveLength(1);
    expect(positions[0].history[0].usdPnl).toBe(42);
    expect(driver.portCalls("referenceData.getCurrencyPairs")).toBe(1);
    expect(driver.portCalls("blotter.getTradeStream")).toBe(1);
    expect(driver.portCalls("analytics.getAnalytics")).toBe(1);
  });
});

/** The narrowest `AppPorts` the harness accepts: only the members it reads
 * are real; the rest are typed through a cast the test owns. */
function createBasePorts(): AppPorts {
  return {
    preferences: new PreferencesSimulator(),
    auth: new AuthSimulator({ demo: "pw" }),
    connectionEvents: {
      events: () => {
        return new (class {
          subscribe(): Unsubscribable {
            return { unsubscribe: () => {} };
          }
        })() as never;
      },
    },
  } as unknown as AppPorts;
}

interface Unsubscribable {
  unsubscribe(): void;
}
