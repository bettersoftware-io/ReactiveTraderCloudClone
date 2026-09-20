import { describe, expect, it } from "vitest";

import type { AppPorts } from "@rtc/core-api";
import {
  AuthSimulator,
  type CreateRfqRequest,
  type CurrencyPair,
  type Dealer,
  Direction,
  type Instrument,
  type PositionUpdates,
  PreferencesSimulator,
  type RfqEvent,
  type RfqQuoteResult,
  type Trade,
} from "@rtc/domain";

import {
  createDealer,
  createInstrument,
  createPositionUpdates,
  createRfqQuoteResult,
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

  it("workflow.events() is the driver's Subject: emitRfqEvent reaches a subscriber, rfqEventsObserved reports it, the call is counted", () => {
    const { ports, driver, teardown } = scriptPorts(createBasePorts());
    expect(driver.rfqEventsObserved()).toBe(false);
    const seen: RfqEvent[] = [];
    const sub = ports.workflow.events().subscribe((event) => {
      seen.push(event);
    });
    expect(driver.rfqEventsObserved()).toBe(true);
    expect(driver.portCalls("workflow.events")).toBe(1);
    driver.emitRfqEvent({ type: "startOfStateOfTheWorld" });
    expect(seen).toEqual([{ type: "startOfStateOfTheWorld" }]);
    sub.unsubscribe();
    teardown();
  });

  it("dealers.getDealers() and instruments.getInstruments() are Subjects with observed flags and counted calls", () => {
    const { ports, driver, teardown } = scriptPorts(createBasePorts());
    const dealers: (readonly Dealer[])[] = [];
    const instruments: (readonly Instrument[])[] = [];
    const a = ports.dealers.getDealers().subscribe((list) => {
      dealers.push(list);
    });

    const b = ports.instruments.getInstruments().subscribe((list) => {
      instruments.push(list);
    });
    expect(driver.dealersObserved()).toBe(true);
    expect(driver.instrumentsObserved()).toBe(true);
    expect(driver.portCalls("dealers.getDealers")).toBe(1);
    expect(driver.portCalls("instruments.getInstruments")).toBe(1);
    const roster = [createDealer(1)];
    driver.emitDealers(roster);
    driver.emitInstruments([createInstrument()]);
    expect(dealers[0]).toBe(roster);
    expect(instruments).toHaveLength(1);
    a.unsubscribe();
    b.unsubscribe();
    teardown();
  });

  it("every workflow command is pending from subscribe, in one FIFO queue, and resolveWorkflowCommand settles the oldest", () => {
    const { ports, driver, teardown } = scriptPorts(createBasePorts());
    const request: CreateRfqRequest = {
      instrumentId: 1,
      dealerIds: [1],
      quantity: 1_000_000,
      direction: Direction.Buy,
      expirySecs: 120,
    };
    const created = ports.workflow.createRfq(request);
    expect(driver.pendingWorkflowCommands()).toEqual([]);
    const ids: number[] = [];
    const createdSub = created.subscribe((id) => {
      ids.push(id);
    });
    const acceptSub = ports.workflow.accept(7).subscribe();
    // Error-only observer: `failWorkflowCommand` below errors this one (it's
    // the oldest survivor once `accept` is withdrawn), and a bare
    // `.subscribe()` would leave rxjs's default unhandled-error reporting to
    // throw and fail the run.
    ports.workflow.cancelRfq(3).subscribe({ error: () => {} });
    ports.workflow.pass(8).subscribe();
    ports.workflow.quote({ quoteId: 9, price: 101.5 }).subscribe();
    expect(driver.pendingWorkflowCommands()).toEqual([
      { kind: "createRfq", request },
      { kind: "accept", quoteId: 7 },
      { kind: "cancelRfq", rfqId: 3 },
      { kind: "pass", quoteId: 8 },
      { kind: "quote", request: { quoteId: 9, price: 101.5 } },
    ]);
    driver.resolveWorkflowCommand(42);
    expect(ids).toEqual([42]);
    acceptSub.unsubscribe();
    expect(
      driver.pendingWorkflowCommands().map((c) => {
        return c.kind;
      }),
    ).toEqual(["cancelRfq", "pass", "quote"]);
    driver.failWorkflowCommand(new Error("bust"));
    expect(driver.pendingWorkflowCommands()).toHaveLength(2);
    createdSub.unsubscribe();
    teardown();
  });

  it("pricing.getRfqQuote is pending from subscribe and resolves with the driver's result", () => {
    const { ports, driver, teardown } = scriptPorts(createBasePorts());
    const quote = ports.pricing.getRfqQuote("EURUSD", 4);
    expect(driver.pendingRfqQuotes()).toEqual([]);
    const seen: RfqQuoteResult[] = [];
    quote.subscribe((result) => {
      seen.push(result);
    });
    expect(driver.pendingRfqQuotes()).toEqual([
      { symbol: "EURUSD", pipsPosition: 4 },
    ]);
    const result = createRfqQuoteResult(1.1);
    driver.resolveRfqQuote(result);
    expect(seen).toEqual([result]);
    expect(driver.pendingRfqQuotes()).toEqual([]);
    teardown();
  });

  it("the execution queue behaves as before: pending from subscribe, FIFO, withdrawn on unsubscribe", () => {
    const { ports, driver, teardown } = scriptPorts(createBasePorts());
    const sub = ports.execution
      .executeTrade({
        currencyPair: "EURUSD",
        spotRate: 1.1,
        direction: Direction.Buy,
        notional: 1,
        dealtCurrency: "EUR",
      })
      .subscribe();
    expect(driver.pendingExecutions()).toHaveLength(1);
    sub.unsubscribe();
    expect(driver.pendingExecutions()).toEqual([]);
    teardown();
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
