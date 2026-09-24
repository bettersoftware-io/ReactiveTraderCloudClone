import { describe, expect, it } from "vitest";

import type {
  AppPorts,
  JarvisAvailability,
  StoredSession,
} from "@rtc/core-api";
import {
  AuthSimulator,
  type Candle,
  type CreateRfqRequest,
  type CurrencyPair,
  type Dealer,
  type DepthBook,
  Direction,
  type EquityInstrument,
  type EquityOrder,
  type EquityPosition,
  type EquityQuote,
  type Instrument,
  type LogEvent,
  type MetricSample,
  type PlaceOrderRequest,
  type PositionUpdates,
  PreferencesSimulator,
  type RfqEvent,
  type RfqQuoteResult,
  ROSTER,
  type ServiceTopology,
  type SessionInfo,
  type Trade,
} from "@rtc/domain";

import {
  AAPL,
  createCandles,
  createDealer,
  createDepthBook,
  createEquityOrder,
  createEquityPosition,
  createEquityQuote,
  createInstrument,
  createPositionUpdates,
  createRfqQuoteResult,
  createTick,
  createTrade,
  EURUSD,
  MSFT,
} from "#/harness/fixtures";
import type { JarvisEvent, JarvisUsagePayload } from "#/harness/jarvisTypes";
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

describe("scriptPorts — equities", () => {
  it("watchlist: a seed is delivered SYNCHRONOUSLY to the first subscriber; unseeded is silent until emitWatchlist, and a late subscriber then replays it; portCalls counts calls, not subscriptions", () => {
    const seeded = scriptPorts(createBasePorts(), { watchlist: [AAPL] });
    const seenSeeded: (readonly EquityInstrument[])[] = [];
    seeded.ports.marketData.watchlist().subscribe((list) => {
      seenSeeded.push(list);
    });
    expect(seenSeeded).toEqual([[AAPL]]);

    const unseeded = scriptPorts(createBasePorts());
    const stream = unseeded.ports.marketData.watchlist();
    const seenFirst: (readonly EquityInstrument[])[] = [];
    stream.subscribe((list) => {
      seenFirst.push(list);
    });
    expect(seenFirst).toEqual([]);
    unseeded.driver.emitWatchlist([MSFT]);
    expect(seenFirst).toEqual([[MSFT]]);
    const seenLate: (readonly EquityInstrument[])[] = [];
    stream.subscribe((list) => {
      seenLate.push(list);
    });
    expect(seenLate).toEqual([[MSFT]]);
    expect(unseeded.driver.portCalls("marketData.watchlist")).toBe(1);
  });

  it("emitEquityQuote reaches only that symbol's subscribers; equityQuoteObserved flips with subscribe/unsubscribe", () => {
    const { ports, driver } = scriptPorts(createBasePorts());
    expect(driver.equityQuoteObserved("AAPL")).toBe(false);
    const seen: EquityQuote[] = [];
    const sub = ports.marketData.quotes("AAPL").subscribe((quote) => {
      seen.push(quote);
    });
    expect(driver.equityQuoteObserved("AAPL")).toBe(true);
    const aaplQuote = createEquityQuote("AAPL", 150);
    driver.emitEquityQuote(aaplQuote);
    driver.emitEquityQuote(createEquityQuote("MSFT", 300));
    expect(seen).toEqual([aaplQuote]);
    sub.unsubscribe();
    expect(driver.equityQuoteObserved("AAPL")).toBe(false);
  });

  it("emitDepth reaches only that symbol's subscribers; depthObserved flips with subscribe/unsubscribe", () => {
    const { ports, driver } = scriptPorts(createBasePorts());
    expect(driver.depthObserved("AAPL")).toBe(false);
    const seen: DepthBook[] = [];
    const sub = ports.marketData.depth("AAPL").subscribe((book) => {
      seen.push(book);
    });
    expect(driver.depthObserved("AAPL")).toBe(true);
    const aaplBook = createDepthBook("AAPL");
    driver.emitDepth(aaplBook);
    driver.emitDepth(createDepthBook("MSFT"));
    expect(seen).toEqual([aaplBook]);
    sub.unsubscribe();
    expect(driver.depthObserved("AAPL")).toBe(false);
  });

  it("candles are keyed by (symbol, timeframe): emitCandles('AAPL','1W',…) reaches candles('AAPL','1W') and not candles('AAPL'); candles('AAPL') and candles('AAPL','1D') share a key", () => {
    const { ports, driver } = scriptPorts(createBasePorts());
    const seenDefault: (readonly Candle[])[] = [];
    const seen1D: (readonly Candle[])[] = [];
    const seen1W: (readonly Candle[])[] = [];
    ports.marketData.candles("AAPL").subscribe((candles) => {
      seenDefault.push(candles);
    });
    ports.marketData.candles("AAPL", "1D").subscribe((candles) => {
      seen1D.push(candles);
    });
    ports.marketData.candles("AAPL", "1W").subscribe((candles) => {
      seen1W.push(candles);
    });
    const weekly = createCandles(3, 0);
    driver.emitCandles("AAPL", "1W", weekly);
    expect(seen1W).toEqual([weekly]);
    expect(seenDefault).toEqual([]);
    expect(seen1D).toEqual([]);
    const daily = createCandles(2, 0);
    driver.emitCandles("AAPL", "1D", daily);
    expect(seenDefault).toEqual([daily]);
    expect(seen1D).toEqual([daily]);
    expect(driver.candlesObserved("AAPL", "1D")).toBe(true);
    expect(driver.candlesObserved("AAPL", "1W")).toBe(true);
  });

  it("candleHistory is lazy (pending only once subscribed); the pending request is {symbol,timeframe,beforeTime,count}; resolveCandleHistory emits the page and completes; failCandleHistory errors", () => {
    const { ports, driver } = scriptPorts(createBasePorts());
    const request = ports.marketData.candleHistory("AAPL", "1D", 1_000, 300);
    expect(driver.pendingCandleHistory()).toEqual([]);
    const seen: (readonly Candle[])[] = [];
    let completed = false;
    request.subscribe({
      next: (candles: readonly Candle[]) => {
        seen.push(candles);
      },
      complete: () => {
        completed = true;
      },
    });
    expect(driver.pendingCandleHistory()).toEqual([
      { symbol: "AAPL", timeframe: "1D", beforeTime: 1_000, count: 300 },
    ]);
    const page = createCandles(300, 0);
    driver.resolveCandleHistory(page);
    expect(seen).toEqual([page]);
    expect(completed).toBe(true);
    expect(driver.pendingCandleHistory()).toEqual([]);

    const errors: unknown[] = [];
    ports.marketData.candleHistory("AAPL", "1D", 700, 300).subscribe({
      error: (error: unknown) => {
        errors.push(error);
      },
    });
    driver.failCandleHistory(new Error("bust"));
    expect(errors).toHaveLength(1);
  });

  it("orders.place is lazy; emitOrderUpdate twice then completeOrder delivers both and completes; failOrder errors; an unsubscribe withdraws the pending order", () => {
    const { ports, driver } = scriptPorts(createBasePorts());
    const request: PlaceOrderRequest = {
      symbol: "AAPL",
      side: "buy",
      type: "market",
      qty: 100,
    };
    const placed = ports.orders.place(request);
    expect(driver.pendingOrders()).toEqual([]);
    const seen: EquityOrder[] = [];
    let completed = false;
    placed.subscribe({
      next: (order: EquityOrder) => {
        seen.push(order);
      },
      complete: () => {
        completed = true;
      },
    });
    expect(driver.pendingOrders()).toEqual([request]);
    const working = createEquityOrder({ status: "working" });
    const filled = createEquityOrder({ status: "filled", filledQty: 100 });
    driver.emitOrderUpdate(working);
    driver.emitOrderUpdate(filled);
    expect(seen).toEqual([working, filled]);
    expect(completed).toBe(false);
    driver.completeOrder();
    expect(completed).toBe(true);
    expect(driver.pendingOrders()).toEqual([]);

    const errors: unknown[] = [];
    ports.orders.place({ ...request, qty: 50 }).subscribe({
      error: (error: unknown) => {
        errors.push(error);
      },
    });
    driver.failOrder(new Error("bust"));
    expect(errors).toHaveLength(1);

    const sub = ports.orders.place({ ...request, qty: 25 }).subscribe();
    expect(driver.pendingOrders()).toHaveLength(1);
    sub.unsubscribe();
    expect(driver.pendingOrders()).toEqual([]);
  });

  it("orders.orders() emits the CURRENT book on each subscribe (setOrderBook between two subscriptions shows through) and completes", () => {
    const { ports, driver } = scriptPorts(createBasePorts());
    const first: (readonly EquityOrder[])[] = [];
    let firstCompleted = false;
    ports.orders.orders().subscribe({
      next: (list: readonly EquityOrder[]) => {
        first.push(list);
      },
      complete: () => {
        firstCompleted = true;
      },
    });
    expect(first).toEqual([[]]);
    expect(firstCompleted).toBe(true);

    const order = createEquityOrder();
    driver.setOrderBook([order]);
    const second: (readonly EquityOrder[])[] = [];
    ports.orders.orders().subscribe((list) => {
      second.push(list);
    });
    expect(second).toEqual([[order]]);
  });

  it("emitPositions reaches positions.positions() subscribers; positionsObserved flips with subscribe/unsubscribe; portCalls counted", () => {
    const { ports, driver } = scriptPorts(createBasePorts());
    expect(driver.positionsObserved()).toBe(false);
    const seen: (readonly EquityPosition[])[] = [];
    const sub = ports.positions.positions().subscribe((list) => {
      seen.push(list);
    });
    expect(driver.positionsObserved()).toBe(true);
    expect(driver.portCalls("positions.positions")).toBe(1);
    const positions = [createEquityPosition("AAPL")];
    driver.emitPositions(positions);
    expect(seen).toEqual([positions]);
    sub.unsubscribe();
    expect(driver.positionsObserved()).toBe(false);
  });
});

describe("scriptPorts — admin", () => {
  it("telemetry: emitThroughputSample/emitLatencySample/emitErrorRateSample reach only their own method's subscribers (a shared Subject would leak across streams)", () => {
    const { ports, driver, teardown } = scriptPorts(createBasePorts());
    const throughput: MetricSample[] = [];
    const latency: MetricSample[] = [];
    const errorRate: MetricSample[] = [];
    ports.telemetry.throughput$().subscribe((sample) => {
      throughput.push(sample);
    });
    ports.telemetry.latency$().subscribe((sample) => {
      latency.push(sample);
    });
    ports.telemetry.errorRate$().subscribe((sample) => {
      errorRate.push(sample);
    });
    driver.emitThroughputSample({ t: 1, value: 10 });
    expect(throughput).toEqual([{ t: 1, value: 10 }]);
    expect(latency).toEqual([]);
    expect(errorRate).toEqual([]);
    expect(driver.portCalls("telemetry.throughput$")).toBe(1);
    expect(driver.portCalls("telemetry.latency$")).toBe(1);
    expect(driver.portCalls("telemetry.errorRate$")).toBe(1);
    teardown();
  });

  it("counts telemetry.throughput$ on INVOCATION, not on the property read that installs the wrapper", () => {
    const { ports, driver, teardown } = scriptPorts(createBasePorts());
    const throughput$ = ports.telemetry.throughput$;
    expect(driver.portCalls("telemetry.throughput$")).toBe(0);
    throughput$().subscribe();
    expect(driver.portCalls("telemetry.throughput$")).toBe(1);
    teardown();
  });

  it("serviceHealth.topology$, eventLog.events$ and sessions.sessions$ are Subjects the driver feeds, with counted port calls", () => {
    const { ports, driver, teardown } = scriptPorts(createBasePorts());
    const topologies: ServiceTopology[] = [];
    const events: LogEvent[] = [];
    const sessions: (readonly SessionInfo[])[] = [];
    ports.serviceHealth.topology$().subscribe((topology) => {
      topologies.push(topology);
    });
    ports.eventLog.events$().subscribe((event) => {
      events.push(event);
    });
    ports.sessions.sessions$().subscribe((roster) => {
      sessions.push(roster);
    });
    const topology: ServiceTopology = { nodes: [], edges: [] };
    const event: LogEvent = {
      t: 1,
      severity: "info",
      service: "pricing",
      message: "up",
    };

    const roster: readonly SessionInfo[] = [
      { id: "s1", user: "astark", region: "us", lat: 0, lon: 0 },
    ];
    driver.emitTopology(topology);
    driver.emitLogEvent(event);
    driver.emitSessions(roster);
    expect(topologies).toEqual([topology]);
    expect(events).toEqual([event]);
    expect(sessions).toEqual([roster]);
    expect(driver.portCalls("serviceHealth.topology$")).toBe(1);
    expect(driver.portCalls("eventLog.events$")).toBe(1);
    expect(driver.portCalls("sessions.sessions$")).toBe(1);
    teardown();
  });

  it("admin.getThroughput is lazy; pendingThroughputLoads counts a subscribed load; resolveThroughputLoad delivers the value then completes; failThroughputLoad errors", () => {
    const { ports, driver, teardown } = scriptPorts(createBasePorts());
    expect(driver.pendingThroughputLoads()).toBe(0);
    const seen: number[] = [];
    let completed = false;
    ports.admin.getThroughput().subscribe({
      next: (value: number) => {
        seen.push(value);
      },
      complete: () => {
        completed = true;
      },
    });
    expect(driver.pendingThroughputLoads()).toBe(1);
    driver.resolveThroughputLoad(7);
    expect(seen).toEqual([7]);
    expect(completed).toBe(true);
    expect(driver.pendingThroughputLoads()).toBe(0);

    const errors: unknown[] = [];
    ports.admin.getThroughput().subscribe({
      error: (error: unknown) => {
        errors.push(error);
      },
    });
    driver.failThroughputLoad(new Error("bust"));
    expect(errors).toHaveLength(1);
    expect(driver.pendingThroughputLoads()).toBe(0);
    expect(driver.portCalls("admin.getThroughput")).toBe(2);
    teardown();
  });

  it("admin.setThroughput queues the values asked, FIFO; resolveThroughputWrite resolves the OLDEST with undefined then completes; an unsubscribed write leaves the queue", () => {
    const { ports, driver, teardown } = scriptPorts(createBasePorts());
    expect(driver.pendingThroughputWrites()).toEqual([]);
    const results: unknown[] = [];
    let completed = false;
    ports.admin.setThroughput(5).subscribe({
      next: (value: unknown) => {
        results.push(value);
      },
      complete: () => {
        completed = true;
      },
    });
    // An error-only observer: `failThroughputWrite` below settles this one
    // (it's the survivor once the first write resolves), and a bare
    // `.subscribe()` would leave rxjs's default unhandled-error reporting to
    // throw and fail the run — otherwise this request is only witnessed
    // through `pendingThroughputWrites`.
    const sub = ports.admin.setThroughput(9).subscribe({ error: () => {} });
    expect(driver.pendingThroughputWrites()).toEqual([5, 9]);
    driver.resolveThroughputWrite();
    expect(results).toEqual([undefined]);
    expect(completed).toBe(true);
    expect(driver.pendingThroughputWrites()).toEqual([9]);
    sub.unsubscribe();
    expect(driver.pendingThroughputWrites()).toEqual([]);
    // Nothing pending: a no-op, never a throw.
    driver.resolveThroughputWrite();
    driver.failThroughputWrite(new Error("bust"));
    teardown();
  });

  it("controlCalls records perturb on controls 0, 1, 2 in order, then clear", () => {
    const { ports, driver, teardown } = scriptPorts(createBasePorts());
    expect(driver.controlCalls()).toEqual([]);
    expect(ports.metricControls).toHaveLength(3);
    ports.metricControls[0]?.perturb("latencySpike");
    ports.metricControls[1]?.perturb("errorBurst");
    ports.metricControls[2]?.perturb("serviceDown");
    ports.metricControls[0]?.clearPerturbation();
    expect(driver.controlCalls()).toEqual([
      { control: 0, call: "perturb", kind: "latencySpike" },
      { control: 1, call: "perturb", kind: "errorBurst" },
      { control: 2, call: "perturb", kind: "serviceDown" },
      { control: 0, call: "clear" },
    ]);
    teardown();
  });
});

/** The narrowest `AppPorts` the harness accepts: only the members it reads
 * are real; the rest are typed through a cast the test owns. */
describe("scriptPorts auth, session store and boot splash", () => {
  it("queues logins FIFO and settles the oldest", () => {
    const { ports, driver, teardown } = scriptPorts(createBasePorts());
    const seen: string[] = [];
    ports.auth.login("a", "1").subscribe((o) => {
      seen.push(`a:${String(o.ok)}`);
    });
    ports.auth.login("b", "2").subscribe((o) => {
      seen.push(`b:${String(o.ok)}`);
    });

    expect(driver.pendingLogins()).toEqual([
      { username: "a", password: "1" },
      { username: "b", password: "2" },
    ]);
    driver.resolveLogin({ ok: false, reason: "invalid" });
    expect(seen).toEqual(["a:false"]);
    expect(driver.pendingLogins()).toEqual([{ username: "b", password: "2" }]);
    expect(driver.portCalls("auth.login")).toBe(2);
    teardown();
  });

  it("the session store starts at the seed and reflects write and clear", () => {
    const session = createStoredSession();
    const { ports, driver, teardown } = scriptPorts(createBasePorts(), {
      session,
    });

    expect(ports.sessionStore.read()).toBe(session);
    ports.sessionStore.clear();
    expect(driver.storedSession()).toBeNull();
    ports.sessionStore.write(session);
    expect(driver.storedSession()).toBe(session);
    teardown();
  });

  it("an unseeded store starts empty", () => {
    const { driver, teardown } = scriptPorts(createBasePorts());

    expect(driver.storedSession()).toBeNull();
    teardown();
  });

  it("a bootSplash seed decides shouldPlay; no seed leaves the base's port", () => {
    const off = scriptPorts(createBasePorts(), { bootSplash: false });
    const on = scriptPorts(createBasePorts(), { bootSplash: true });
    const none = scriptPorts(createBasePorts());

    expect(off.ports.bootSplash?.shouldPlay()).toBe(false);
    expect(on.ports.bootSplash?.shouldPlay()).toBe(true);
    expect(none.ports.bootSplash).toBeUndefined();
    off.teardown();
    on.teardown();
    none.teardown();
  });
});

describe("scriptPorts — Jarvis, the workspace preference and the two stores", () => {
  it("queues asks FIFO; replyJarvis feeds the OLDEST and completes it on done", () => {
    const { ports, driver } = scriptPorts(createBasePorts());
    const first: string[] = [];
    let firstDone = false;
    ports.jarvis.ask("one").subscribe({
      next: (event: JarvisEvent) => {
        first.push(event.type);
      },
      complete: () => {
        firstDone = true;
      },
    });
    ports.jarvis.ask("two").subscribe();

    expect(driver.pendingAsks()).toEqual(["one", "two"]);
    expect(driver.portCalls("jarvis.ask")).toBe(2);

    driver.replyJarvis([{ type: "delta", text: "hi" }]);
    expect(first).toEqual(["delta"]);
    expect(driver.pendingAsks()).toEqual(["one", "two"]);

    driver.replyJarvis([{ type: "done" }]);
    expect(first).toEqual(["delta", "done"]);
    expect(firstDone).toBe(true);
    expect(driver.pendingAsks()).toEqual(["two"]);
  });

  it("an error event also completes the turn", () => {
    const { ports, driver } = scriptPorts(createBasePorts());
    ports.jarvis.ask("one").subscribe();

    driver.replyJarvis([{ type: "error", message: "boom" }]);

    expect(driver.pendingAsks()).toEqual([]);
  });

  it("seeds the workspace preference and reads it back uncounted", () => {
    const { ports, driver } = scriptPorts(createBasePorts(), {
      workspaceLayout: "seeded",
    });

    expect(driver.storedWorkspaceLayout()).toBe("seeded");
    ports.preferences.setWorkspaceLayout("written");
    expect(driver.storedWorkspaceLayout()).toBe("written");
    expect(driver.portCalls("workspaceLayout$")).toBe(0);
  });

  it("the dock store starts at its seed and shows writes; absent seed means no store", () => {
    const { ports, driver } = scriptPorts(createBasePorts(), {
      dockLayouts: { fx: "fx-blob" },
    });

    expect(ports.dockLayoutStore?.load("fx")).toBe("fx-blob");
    ports.dockLayoutStore?.save("credit", "credit-blob");
    ports.dockLayoutStore?.clear("fx");
    expect(driver.dockLayout("credit")).toBe("credit-blob");
    expect(driver.dockLayout("fx")).toBe(null);
    expect(scriptPorts(createBasePorts()).ports.dockLayoutStore).toBe(
      undefined,
    );
  });

  it("the preset store starts at its seed; presetStoreDropsWrites keeps nothing", () => {
    const kept = scriptPorts(createBasePorts(), { layoutPresets: {} });
    kept.ports.layoutPresetStore?.save("fx", "list");
    expect(kept.driver.presetList("fx")).toBe("list");

    const dropped = scriptPorts(createBasePorts(), {
      layoutPresets: { fx: "old" },
      presetStoreDropsWrites: true,
    });
    dropped.ports.layoutPresetStore?.save("fx", "new");
    expect(dropped.ports.layoutPresetStore?.load("fx")).toBe("old");
  });
});

describe("scriptPorts — Jarvis turns, confirmations, availability, history and usage", () => {
  it("askLog records every ask's text and options, and keeps it after the reply", () => {
    const { ports, driver } = scriptPorts(createBasePorts());
    ports.jarvis.ask("one", { brain: "scripted", effort: "low" }).subscribe();
    ports.jarvis.ask("two").subscribe();

    driver.replyJarvis([{ type: "done" }]);

    expect(driver.askLog()).toEqual([
      { text: "one", options: { brain: "scripted", effort: "low" } },
      { text: "two", options: undefined },
    ]);
  });

  it("confirmations records every confirm call in order, counted", () => {
    const { ports, driver } = scriptPorts(createBasePorts());
    ports.jarvis.confirm("c-1", false);
    ports.jarvis.confirm("c-2", true);

    expect(driver.confirmations()).toEqual([
      { id: "c-1", approved: false },
      { id: "c-2", approved: true },
    ]);
    expect(driver.portCalls("jarvis.confirm")).toBe(2);
  });

  it("availability$ replays the seed, then each push; unseeded it replays the scripted-only default", () => {
    const seeded = scriptPorts(createBasePorts(), {
      jarvisAvailability: createAvailability(false),
    });
    const seen: boolean[] = [];
    seeded.ports.jarvis.availability$?.().subscribe((value) => {
      seen.push(value.available);
    });
    seeded.driver.pushJarvisAvailability(createAvailability(true));

    expect(seen).toEqual([false, true]);
    expect(seeded.driver.portCalls("jarvis.availability$")).toBe(1);

    const unseeded = scriptPorts(createBasePorts());
    const defaults: unknown[] = [];
    unseeded.ports.jarvis.availability$?.().subscribe((value) => {
      defaults.push(value);
    });

    expect(defaults).toEqual([
      {
        available: true,
        brains: ["scripted"],
        defaultBrain: "scripted",
        gate: null,
      },
    ]);
  });

  it("jarvisAvailabilityPending holds availability$ silent until the first push", () => {
    const { ports, driver } = scriptPorts(createBasePorts(), {
      jarvisAvailabilityPending: true,
    });
    const seen: boolean[] = [];
    ports.jarvis.availability$?.().subscribe((value) => {
      seen.push(value.available);
    });

    expect(seen).toEqual([]);

    driver.pushJarvisAvailability(createAvailability(false));

    expect(seen).toEqual([false]);
  });

  it("jarvisHistory is null until a source is set, then reads that source LIVE", () => {
    const { ports, driver } = scriptPorts(createBasePorts());

    expect(driver.jarvisHistory()).toBe(null);

    let text = "first";
    ports.jarvis.setHistorySource?.(() => {
      return [{ role: "user", text }];
    });
    text = "second";

    expect(driver.jarvisHistory()).toEqual([{ role: "user", text: "second" }]);
    expect(driver.portCalls("jarvis.setHistorySource")).toBe(1);
  });

  it("jarvisUsage.usage$ follows pushJarvisUsage, counted", () => {
    const { ports, driver } = scriptPorts(createBasePorts());
    const seen: unknown[] = [];
    ports.jarvisUsage.usage$().subscribe((payload) => {
      seen.push(payload);
    });
    const payload = createUsagePayload();
    driver.pushJarvisUsage(payload);

    expect(seen).toEqual([payload]);
    expect(driver.portCalls("jarvisUsage.usage$")).toBe(1);
  });

  it("counts SUBSCRIPTIONS to availability$ and usage$, not just calls: one call subscribed twice counts two", () => {
    const { ports, driver } = scriptPorts(createBasePorts());
    const availability$ = ports.jarvis.availability$?.();
    const usage$ = ports.jarvisUsage.usage$();

    availability$?.subscribe().unsubscribe();
    availability$?.subscribe().unsubscribe();
    usage$.subscribe().unsubscribe();

    expect(driver.portCalls("jarvis.availability$")).toBe(1);
    expect(driver.jarvisAvailabilitySubscriptions()).toBe(2);
    expect(driver.jarvisUsageSubscriptions()).toBe(1);
  });

  it("the narratorConfig seed reaches ports.narratorConfig", () => {
    const { ports } = scriptPorts(createBasePorts(), {
      narratorConfig: { windowSize: 8 },
    });

    expect(ports.narratorConfig).toEqual({ windowSize: 8 });
  });
});

function createAvailability(available: boolean): JarvisAvailability {
  return {
    available,
    brains: ["scripted"],
    defaultBrain: "scripted",
    gate: null,
  };
}

function createUsagePayload(): JarvisUsagePayload {
  return { windowStartMs: 1, windowEndMs: 2, currentWindow: [], sinceBoot: [] };
}

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

function createStoredSession(): StoredSession {
  const [first] = ROSTER;

  return {
    token: "t",
    user: first.user,
    username: first.username,
    exp: 2_000_000_000_000,
  };
}
