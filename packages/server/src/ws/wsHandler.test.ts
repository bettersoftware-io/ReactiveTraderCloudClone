import { EventEmitter } from "node:events";
import { describe, it, expect } from "vitest";
import { type Observable, of, interval, map, throwError } from "rxjs";
import { Direction, TradeStatus, type RfqEvent } from "@rtc/domain";
import {
  priceTickFrame,
  priceHistoryResponse,
  executionResponseAck,
  rpcNack,
  rpcAck,
  tradeFrame,
  blotterFrame,
  analyticsFrame,
  dealerAdded,
  workflowEventCreated,
} from "@rtc/shared/__fixtures__/wireFrames";
import type { WebSocket } from "ws";
import { ThroughputService } from "../services/ThroughputService.js";
import type { ServiceContainer } from "../services/serviceContainer.js";
import { handleConnection } from "./wsHandler.js";
import { CLIENT_MSG, SERVER_MSG, type WsMessage } from "./protocol.js";

/**
 * Protocol-level tests for the WebSocket translation layer (wsHandler).
 *
 * These exercise the real handler — the ~500-line layer that routes client
 * frames to domain calls and translates domain output back to the @rtc/shared
 * wire shapes — which nothing else in the suite covers. The eight-runner e2e
 * suite runs the *client* against in-process simulators and never touches this
 * file; the full-stack smokes (tests/fullstack) cover the real server end to
 * end. Here we inject lightweight, immediate fake services so the assertions
 * stay fast and deterministic and isolate the handler's own behaviour.
 */

// ── Fake ws socket ───────────────────────────────────────────────

/** Minimal stand-in for the `ws` WebSocket the handler talks to. */
class FakeWs extends EventEmitter {
  readonly OPEN = 1;
  readyState = 1;
  readonly outbound: WsMessage[] = [];

  send(data: string): void {
    this.outbound.push(JSON.parse(data) as WsMessage);
  }

  /** Simulate a client → server frame. */
  receive(msg: WsMessage): void {
    this.emit("message", JSON.stringify(msg));
  }

  /** Simulate the socket closing. */
  closeConnection(): void {
    this.readyState = 3;
    this.emit("close");
  }

  framesOfType(type: string): WsMessage[] {
    return this.outbound.filter((m) => m.type === type);
  }
}

const wait = (ms = 5): Promise<void> => new Promise((r) => setTimeout(r, ms));

// ── Wire-shape contract helper ───────────────────────────────────

/**
 * Recursively asserts `actual` has the SAME shape (key set + value types) as
 * `canonical` — NOT the same values (stream payloads are simulator-random).
 * Arrays are checked element-shape against the first canonical element. This
 * ties the server's emitted frames to the @rtc/shared fixture spine without
 * coupling to non-deterministic values or to handler internals.
 */
function expectShape(actual: unknown, canonical: unknown, path = "payload"): void {
  if (Array.isArray(canonical)) {
    expect(Array.isArray(actual), `${path} should be an array`).toBe(true);
    const arr = actual as unknown[];
    if (canonical.length > 0 && arr.length > 0) {
      expectShape(arr[0], canonical[0], `${path}[0]`);
    }
    return;
  }
  if (canonical !== null && typeof canonical === "object") {
    expect(
      actual !== null && typeof actual === "object",
      `${path} should be an object`,
    ).toBe(true);
    const obj = actual as Record<string, unknown>;
    for (const key of Object.keys(canonical as Record<string, unknown>)) {
      expect(obj, `${path} missing key "${key}"`).toHaveProperty(key);
      expectShape(obj[key], (canonical as Record<string, unknown>)[key], `${path}.${key}`);
    }
    return;
  }
  expect(typeof actual, `${path} type`).toBe(typeof canonical);
}

/** Assert a frame has the expected protocol type and a payload matching the canonical wire shape. */
function expectFrameShape(frame: WsMessage | undefined, type: string, canonicalPayload: unknown): void {
  expect(frame, `expected a ${type} frame`).toBeDefined();
  expect(frame!.type).toBe(type);
  expectShape(frame!.payload, canonicalPayload, "payload");
}

// ── Fake domain services ─────────────────────────────────────────

const PRICE_TICK_MS = 10;

/**
 * Build a ServiceContainer of immediate fakes. Pricing is a 10ms interval (so
 * the "stops after close" test is meaningful); everything else emits once and
 * completes. Overrides let individual tests swap in a failing service.
 */
function fakeServices(overrides: Partial<ServiceContainer> = {}): ServiceContainer {
  const base = {
    referenceData: {
      getCurrencyPairs: () =>
        of([
          {
            base: "EUR",
            term: "USD",
            symbol: "EURUSD",
            ratePrecision: 5,
            pipsPosition: 4,
            defaultNotional: 1_000_000,
          },
        ]),
    },
    pricing: {
      getPriceUpdates: (symbol: string): Observable<unknown> =>
        interval(PRICE_TICK_MS).pipe(
          map(() => ({
            symbol,
            bid: 1.0998,
            ask: 1.1002,
            mid: 1.1,
            valueDate: "2026-01-01",
            creationTimestamp: 1,
          })),
        ),
      getPriceHistory: () =>
        of([
          {
            symbol: "EURUSD",
            bid: 1.0998,
            ask: 1.1002,
            mid: 1.1,
            valueDate: "2026-01-01",
            creationTimestamp: 1,
          },
        ]),
    },
    execution: {
      executeTrade: (req: {
        currencyPair: string;
        notional: number;
        dealtCurrency: string;
        direction: Direction;
        spotRate: number;
      }) =>
        of({
          tradeId: 1,
          tradeName: "RTC",
          currencyPair: req.currencyPair,
          notional: req.notional,
          dealtCurrency: req.dealtCurrency,
          direction: req.direction,
          spotRate: req.spotRate,
          status: TradeStatus.Done,
          tradeDate: "2026-01-01",
          valueDate: "2026-01-01",
        }),
    },
    blotter: {
      getTradeStream: () =>
        of([
          {
            tradeId: 1,
            tradeName: "RTC",
            currencyPair: "EURUSD",
            notional: 1_000_000,
            dealtCurrency: "EUR",
            direction: Direction.Buy,
            spotRate: 1.1,
            status: TradeStatus.Done,
            tradeDate: "2026-01-01",
            valueDate: "2026-01-01",
          },
        ]),
    },
    analytics: {
      getAnalytics: () =>
        of({
          currentPositions: [
            { symbol: "EURUSD", basePnl: 1, baseTradedAmount: 2, counterTradedAmount: 3 },
          ],
          history: [{ timestamp: "2026-01-01T00:00:00.000Z", usdPnl: 4 }],
        }),
    },
    instruments: {
      getInstruments: () =>
        of([
          {
            id: 1,
            name: "US Treasury 10Y",
            cusip: "912828C57",
            ticker: "T",
            maturity: "2036-01-01",
            interestRate: 0.04,
            benchmark: "T",
          },
        ]),
    },
    dealers: {
      getDealers: () => of([{ id: 1, name: "Acme Bank" }]),
    },
    workflow: {
      events: (): Observable<RfqEvent> =>
        of({
          type: "rfqCreated",
          payload: {
            id: 1,
            instrumentId: 1,
            quantity: 1_000_000,
            direction: Direction.Buy,
            state: "Open",
            expirySecs: 120,
            creationTimestamp: 1,
          },
        } as unknown as RfqEvent),
      createRfq: () => of(1),
      cancelRfq: () => of(undefined),
      quote: () => of(undefined),
      pass: () => of(undefined),
      accept: () => of(undefined),
    },
    throughput: new ThroughputService(),
  };
  return { ...base, ...overrides } as unknown as ServiceContainer;
}

function connect(services: ServiceContainer): FakeWs {
  const ws = new FakeWs();
  handleConnection(ws as unknown as WebSocket, services);
  return ws;
}

describe("wsHandler protocol", () => {
  it("routes subscribe.pricing to stream.priceTick frames with the PriceTickDto shape", async () => {
    const ws = connect(fakeServices());
    ws.receive({ type: CLIENT_MSG.SUBSCRIBE_PRICING, payload: { symbol: "EURUSD" } });
    await wait(PRICE_TICK_MS * 2);

    const ticks = ws.framesOfType(SERVER_MSG.PRICE_TICK);
    expect(ticks.length).toBeGreaterThan(0);
    expect(ticks[0]!.payload).toMatchObject({
      symbol: "EURUSD",
      bid: expect.any(Number),
      ask: expect.any(Number),
      mid: expect.any(Number),
      valueDate: expect.any(String),
      creationTimestamp: expect.any(Number),
    });
  });

  it("marks the first stream.referenceData frame as the state of the world", async () => {
    const ws = connect(fakeServices());
    ws.receive({ type: CLIENT_MSG.SUBSCRIBE_REFERENCE_DATA });
    await wait();

    const [first] = ws.framesOfType(SERVER_MSG.REFERENCE_DATA);
    expect(first).toBeDefined();
    const payload = first!.payload as {
      updates: { symbol: string; ratePrecision: number; pipsPosition: number }[];
      isStateOfTheWorld: boolean;
      isStale: boolean;
    };
    expect(payload.isStateOfTheWorld).toBe(true);
    expect(payload.isStale).toBe(false);
    expect(payload.updates.length).toBeGreaterThan(0);
    expect(payload.updates[0]).toMatchObject({
      symbol: expect.any(String),
      ratePrecision: expect.any(Number),
      pipsPosition: expect.any(Number),
    });
  });

  it("brackets subscribe.instruments with start/end state-of-the-world markers", async () => {
    const ws = connect(fakeServices());
    ws.receive({ type: CLIENT_MSG.SUBSCRIBE_INSTRUMENTS });
    await wait();

    const events = ws.framesOfType(SERVER_MSG.INSTRUMENT_EVENT).map(
      (m) => (m.payload as { type: string }).type,
    );
    expect(events[0]).toBe("startOfStateOfTheWorld");
    expect(events).toContain("added");
    expect(events).toContain("endOfStateOfTheWorld");
    expect(events.indexOf("startOfStateOfTheWorld")).toBeLessThan(
      events.indexOf("endOfStateOfTheWorld"),
    );
  });

  it("routes subscribe.blotter to a stream.blotter frame matching the BlotterMessage shape", async () => {
    const ws = connect(fakeServices());
    ws.receive({ type: CLIENT_MSG.SUBSCRIBE_BLOTTER });
    await wait();

    const [frame] = ws.framesOfType(SERVER_MSG.BLOTTER);
    expectFrameShape(frame, SERVER_MSG.BLOTTER, blotterFrame([tradeFrame()]));
    expect((frame!.payload as { isStateOfTheWorld: boolean }).isStateOfTheWorld).toBe(true);
  });

  it("routes subscribe.analytics to a stream.analytics frame matching the AnalyticsDto shape", async () => {
    const ws = connect(fakeServices());
    ws.receive({ type: CLIENT_MSG.SUBSCRIBE_ANALYTICS, payload: { currency: "USD" } });
    await wait();

    const [frame] = ws.framesOfType(SERVER_MSG.ANALYTICS);
    expectFrameShape(frame, SERVER_MSG.ANALYTICS, analyticsFrame());
  });

  it("brackets subscribe.dealers with SoW markers and emits added DealerDto events", async () => {
    const ws = connect(fakeServices());
    ws.receive({ type: CLIENT_MSG.SUBSCRIBE_DEALERS });
    await wait();

    const frames = ws.framesOfType(SERVER_MSG.DEALER_EVENT);
    const types = frames.map((m) => (m.payload as { type: string }).type);
    expect(types[0]).toBe("startOfStateOfTheWorld");
    expect(types).toContain("added");
    expect(types).toContain("endOfStateOfTheWorld");
    expect(types.indexOf("startOfStateOfTheWorld")).toBeLessThan(
      types.indexOf("endOfStateOfTheWorld"),
    );
    const added = frames.find((m) => (m.payload as { type: string }).type === "added");
    expectFrameShape(added, SERVER_MSG.DEALER_EVENT, dealerAdded());
  });

  it("routes subscribe.workflow to a stream.workflowEvent frame matching the WorkflowEvent shape", async () => {
    const ws = connect(fakeServices());
    ws.receive({ type: CLIENT_MSG.SUBSCRIBE_WORKFLOW });
    await wait();

    const [frame] = ws.framesOfType(SERVER_MSG.WORKFLOW_EVENT);
    expectFrameShape(frame, SERVER_MSG.WORKFLOW_EVENT, workflowEventCreated(1));
  });

  it("answers rpc.executeTrade with an ack carrying the correlationId and a trade", async () => {
    const ws = connect(fakeServices());
    ws.receive({
      type: CLIENT_MSG.EXECUTE_TRADE,
      correlationId: "abc-123",
      payload: {
        currencyPair: "EURUSD",
        spotRate: 1.1,
        direction: Direction.Buy,
        notional: 1_000_000,
        dealtCurrency: "EUR",
      },
    });
    await wait();

    const [resp] = ws.framesOfType(SERVER_MSG.EXECUTION_RESPONSE);
    expect(resp).toBeDefined();
    expect(resp!.correlationId).toBe("abc-123");
    const body = resp!.payload as { type: string; payload: Record<string, unknown> };
    expect(body.type).toBe("ack");
    expect(body.payload).toMatchObject({
      tradeId: expect.any(Number),
      currencyPair: "EURUSD",
      direction: Direction.Buy,
      notional: 1_000_000,
    });
  });

  it("answers rpc.executeTrade with a nack when execution fails", async () => {
    const failing = {
      executeTrade: () => throwError(() => new Error("boom")),
    } as unknown as ServiceContainer["execution"];
    const ws = connect(fakeServices({ execution: failing }));
    ws.receive({
      type: CLIENT_MSG.EXECUTE_TRADE,
      correlationId: "fail-1",
      payload: {
        currencyPair: "EURUSD",
        spotRate: 1.1,
        direction: Direction.Buy,
        notional: 1_000_000,
        dealtCurrency: "EUR",
      },
    });
    await wait();

    const [resp] = ws.framesOfType(SERVER_MSG.EXECUTION_RESPONSE);
    expect(resp).toBeDefined();
    expect(resp!.correlationId).toBe("fail-1");
    expect((resp!.payload as { type: string }).type).toBe("nack");
  });

  it("answers rpc.getPriceHistory with an ack echoing correlationId and a prices payload", async () => {
    const ws = connect(fakeServices());
    ws.receive({ type: CLIENT_MSG.GET_PRICE_HISTORY, correlationId: "ph-1", payload: { symbol: "EURUSD" } });
    await wait();

    const [resp] = ws.framesOfType(SERVER_MSG.PRICE_HISTORY_RESPONSE);
    expect(resp!.correlationId).toBe("ph-1");
    expectFrameShape(resp, SERVER_MSG.PRICE_HISTORY_RESPONSE, priceHistoryResponse("EURUSD", 1));
  });

  it("answers rpc.getPriceHistory with a nack when the service fails", async () => {
    const failing = {
      getPriceUpdates: () => of(),
      getPriceHistory: () => throwError(() => new Error("boom")),
    } as unknown as ServiceContainer["pricing"];
    const ws = connect(fakeServices({ pricing: failing }));
    ws.receive({ type: CLIENT_MSG.GET_PRICE_HISTORY, correlationId: "ph-2", payload: { symbol: "EURUSD" } });
    await wait();

    const [resp] = ws.framesOfType(SERVER_MSG.PRICE_HISTORY_RESPONSE);
    expect(resp!.correlationId).toBe("ph-2");
    expectFrameShape(resp, SERVER_MSG.PRICE_HISTORY_RESPONSE, rpcNack());
  });

  it("answers rpc.createRfq with an ack carrying the rfqId and correlationId", async () => {
    const ws = connect(fakeServices());
    ws.receive({
      type: CLIENT_MSG.CREATE_RFQ,
      correlationId: "rfq-1",
      payload: { instrumentId: 1, dealerIds: [1], quantity: 1_000_000, direction: Direction.Buy, expirySecs: 120 },
    });
    await wait();

    const [resp] = ws.framesOfType(SERVER_MSG.CREATE_RFQ_RESPONSE);
    expect(resp!.correlationId).toBe("rfq-1");
    expectFrameShape(resp, SERVER_MSG.CREATE_RFQ_RESPONSE, rpcAck(1));
  });

  it("answers rpc.createRfq with a nack when the workflow fails", async () => {
    const failing = {
      events: () => of(),
      createRfq: () => throwError(() => new Error("boom")),
    } as unknown as ServiceContainer["workflow"];
    const ws = connect(fakeServices({ workflow: failing }));
    ws.receive({
      type: CLIENT_MSG.CREATE_RFQ,
      correlationId: "rfq-2",
      payload: { instrumentId: 1, dealerIds: [1], quantity: 1_000_000, direction: Direction.Buy, expirySecs: 120 },
    });
    await wait();

    const [resp] = ws.framesOfType(SERVER_MSG.CREATE_RFQ_RESPONSE);
    expect(resp!.correlationId).toBe("rfq-2");
    expectFrameShape(resp, SERVER_MSG.CREATE_RFQ_RESPONSE, rpcNack());
  });

  it("answers rpc.cancelRfq with an ack echoing correlationId", async () => {
    const ws = connect(fakeServices());
    ws.receive({ type: CLIENT_MSG.CANCEL_RFQ, correlationId: "cx-1", payload: { rfqId: 1 } });
    await wait();

    const [resp] = ws.framesOfType(SERVER_MSG.CANCEL_RFQ_RESPONSE);
    expect(resp!.correlationId).toBe("cx-1");
    expect((resp!.payload as { type: string }).type).toBe("ack");
  });

  it("answers rpc.cancelRfq with a nack when the workflow fails", async () => {
    const failing = {
      events: () => of(),
      cancelRfq: () => throwError(() => new Error("boom")),
    } as unknown as ServiceContainer["workflow"];
    const ws = connect(fakeServices({ workflow: failing }));
    ws.receive({ type: CLIENT_MSG.CANCEL_RFQ, correlationId: "cx-2", payload: { rfqId: 1 } });
    await wait();

    const [resp] = ws.framesOfType(SERVER_MSG.CANCEL_RFQ_RESPONSE);
    expect(resp!.correlationId).toBe("cx-2");
    expect((resp!.payload as { type: string }).type).toBe("nack");
  });

  it("answers rpc.quote with an ack echoing correlationId", async () => {
    const ws = connect(fakeServices());
    ws.receive({ type: CLIENT_MSG.QUOTE, correlationId: "q-1", payload: { quoteId: 1, price: 100 } });
    await wait();

    const [resp] = ws.framesOfType(SERVER_MSG.QUOTE_RESPONSE);
    expect(resp!.correlationId).toBe("q-1");
    expect((resp!.payload as { type: string }).type).toBe("ack");
  });

  it("answers rpc.quote with a nack when the workflow fails", async () => {
    const failing = {
      events: () => of(),
      quote: () => throwError(() => new Error("boom")),
    } as unknown as ServiceContainer["workflow"];
    const ws = connect(fakeServices({ workflow: failing }));
    ws.receive({ type: CLIENT_MSG.QUOTE, correlationId: "q-2", payload: { quoteId: 1, price: 100 } });
    await wait();

    const [resp] = ws.framesOfType(SERVER_MSG.QUOTE_RESPONSE);
    expect(resp!.correlationId).toBe("q-2");
    expect((resp!.payload as { type: string }).type).toBe("nack");
  });

  it("answers rpc.pass with an ack echoing correlationId", async () => {
    const ws = connect(fakeServices());
    ws.receive({ type: CLIENT_MSG.PASS, correlationId: "p-1", payload: { quoteId: 1 } });
    await wait();

    const [resp] = ws.framesOfType(SERVER_MSG.PASS_RESPONSE);
    expect(resp!.correlationId).toBe("p-1");
    expect((resp!.payload as { type: string }).type).toBe("ack");
  });

  it("answers rpc.pass with a nack when the workflow fails", async () => {
    const failing = {
      events: () => of(),
      pass: () => throwError(() => new Error("boom")),
    } as unknown as ServiceContainer["workflow"];
    const ws = connect(fakeServices({ workflow: failing }));
    ws.receive({ type: CLIENT_MSG.PASS, correlationId: "p-2", payload: { quoteId: 1 } });
    await wait();

    const [resp] = ws.framesOfType(SERVER_MSG.PASS_RESPONSE);
    expect(resp!.correlationId).toBe("p-2");
    expect((resp!.payload as { type: string }).type).toBe("nack");
  });

  it("answers rpc.accept with an ack echoing correlationId", async () => {
    const ws = connect(fakeServices());
    ws.receive({ type: CLIENT_MSG.ACCEPT, correlationId: "a-1", payload: { quoteId: 1 } });
    await wait();

    const [resp] = ws.framesOfType(SERVER_MSG.ACCEPT_RESPONSE);
    expect(resp!.correlationId).toBe("a-1");
    expect((resp!.payload as { type: string }).type).toBe("ack");
  });

  it("answers rpc.accept with a nack when the workflow fails", async () => {
    const failing = {
      events: () => of(),
      accept: () => throwError(() => new Error("boom")),
    } as unknown as ServiceContainer["workflow"];
    const ws = connect(fakeServices({ workflow: failing }));
    ws.receive({ type: CLIENT_MSG.ACCEPT, correlationId: "a-2", payload: { quoteId: 1 } });
    await wait();

    const [resp] = ws.framesOfType(SERVER_MSG.ACCEPT_RESPONSE);
    expect(resp!.correlationId).toBe("a-2");
    expect((resp!.payload as { type: string }).type).toBe("nack");
  });

  it("answers admin.getThroughput with an ack carrying a numeric value and correlationId", async () => {
    const ws = connect(fakeServices());
    ws.receive({ type: CLIENT_MSG.GET_THROUGHPUT, correlationId: "tp-1" });
    await wait();

    const [resp] = ws.framesOfType(SERVER_MSG.THROUGHPUT_RESPONSE);
    expect(resp!.correlationId).toBe("tp-1");
    const body = resp!.payload as { type: string; payload: number };
    expect(body.type).toBe("ack");
    expect(typeof body.payload).toBe("number");
  });

  it("acks admin.setThroughput and the new value is observable via getThroughput", async () => {
    const ws = connect(fakeServices());
    ws.receive({ type: CLIENT_MSG.SET_THROUGHPUT, correlationId: "tp-2", payload: { value: 42 } });
    await wait();

    const [setResp] = ws.framesOfType(SERVER_MSG.SET_THROUGHPUT_RESPONSE);
    expect(setResp!.correlationId).toBe("tp-2");
    expect((setResp!.payload as { type: string }).type).toBe("ack");

    ws.receive({ type: CLIENT_MSG.GET_THROUGHPUT, correlationId: "tp-3" });
    await wait();
    const [getResp] = ws.framesOfType(SERVER_MSG.THROUGHPUT_RESPONSE);
    expect((getResp!.payload as { type: string; payload: number }).payload).toBe(42);
  });

  it("ignores unknown message types without sending or throwing", async () => {
    const ws = connect(fakeServices());
    expect(() => ws.receive({ type: "totally.unknown", payload: {} })).not.toThrow();
    await wait();
    expect(ws.outbound).toHaveLength(0);
  });

  it("ignores malformed (non-JSON) frames", async () => {
    const ws = connect(fakeServices());
    expect(() => ws.emit("message", "{not json")).not.toThrow();
    await wait();
    expect(ws.outbound).toHaveLength(0);
  });

  it("stops streaming after the socket closes", async () => {
    const ws = connect(fakeServices());
    ws.receive({ type: CLIENT_MSG.SUBSCRIBE_PRICING, payload: { symbol: "EURUSD" } });
    await wait(PRICE_TICK_MS * 3); // let a few ticks through

    const before = ws.framesOfType(SERVER_MSG.PRICE_TICK).length;
    expect(before).toBeGreaterThan(0);

    ws.closeConnection();
    await wait(PRICE_TICK_MS * 4); // would be ~4 more ticks if the subscription leaked

    const after = ws.framesOfType(SERVER_MSG.PRICE_TICK).length;
    expect(after).toBe(before);
  });
});

describe("expectShape helper", () => {
  it("passes when shapes match regardless of values", () => {
    expect(() => expectShape({ a: 1, b: "x" }, { a: 99, b: "y" })).not.toThrow();
  });
  it("passes for nested objects and arrays by element shape", () => {
    expect(() =>
      expectShape({ xs: [{ n: 5 }] }, { xs: [{ n: 0 }] }),
    ).not.toThrow();
  });
  it("fails when a key is missing", () => {
    expect(() => expectShape({ a: 1 }, { a: 1, b: 2 })).toThrow();
  });
  it("fails when a value type differs", () => {
    expect(() => expectShape({ a: "1" }, { a: 1 })).toThrow();
  });
});
