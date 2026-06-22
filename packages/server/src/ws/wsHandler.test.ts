import { EventEmitter } from "node:events";

import { interval, map, type Observable, of, throwError } from "rxjs";
import { describe, expect, it, vi } from "vitest";
import type { WebSocket } from "ws";

import { Direction, type RfqEvent, TradeStatus } from "@rtc/domain";
import {
  analyticsFrame,
  blotterFrame,
  dealerAdded,
  priceHistoryResponse,
  rpcAck,
  rpcNack,
  tradeFrame,
  workflowEventCreated,
} from "@rtc/shared/__fixtures__/wireFrames";

import type { ServiceContainer } from "../services/serviceContainer.js";
import { ThroughputService } from "../services/ThroughputService.js";
import { CLIENT_MSG, SERVER_MSG, type WsMessage } from "./protocol.js";
import { handleConnection } from "./wsHandler.js";

/**
 * Runtime-safe non-null assertion for use in tests.
 * Throws with a clear message instead of silently compiling away like `!`.
 */
function defined<T>(
  value: T | null | undefined,
  message = "Expected value to be defined",
): NonNullable<T> {
  if (value === null || value === undefined) throw new Error(message);
  return value as NonNullable<T>;
}

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
    return this.outbound.filter((m) => {
      return m.type === type;
    });
  }
}

function wait(ms = 5): Promise<void> {
  return new Promise((r) => {
    return setTimeout(r, ms);
  });
}

// ── Wire-shape contract helper ───────────────────────────────────

/**
 * Recursively asserts `actual` has the SAME shape (key set + value types) as
 * `canonical` — NOT the same values (stream payloads are simulator-random).
 * Arrays are checked element-shape against the first canonical element. This
 * ties the server's emitted frames to the @rtc/shared fixture spine without
 * coupling to non-deterministic values or to handler internals.
 */
function expectShape(
  actual: unknown,
  canonical: unknown,
  path = "payload",
): void {
  if (Array.isArray(canonical)) {
    expect(Array.isArray(actual), `${path} should be an array`).toBe(true);
    const arr = actual as unknown[];

    // Element shape is checked against the first element only. Empty arrays on
    // either side are NOT shape-checked — keep the fakes emitting ≥1 element so
    // array assertions don't silently become vacuous.
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
      expectShape(
        obj[key],
        (canonical as Record<string, unknown>)[key],
        `${path}.${key}`,
      );
    }

    return;
  }

  expect(typeof actual, `${path} type`).toBe(typeof canonical);
}

/** Assert a frame has the expected protocol type and a payload matching the canonical wire shape. */
function expectFrameShape(
  frame: WsMessage | undefined,
  type: string,
  canonicalPayload: unknown,
): void {
  expect(frame, `expected a ${type} frame`).toBeDefined();
  const definedFrame = defined(frame, `expected a ${type} frame`);
  expect(definedFrame.type).toBe(type);
  expectShape(definedFrame.payload, canonicalPayload, "payload");
}

// ── Fake domain services ─────────────────────────────────────────

const PRICE_TICK_MS = 10;

/**
 * Build a ServiceContainer of immediate fakes. Pricing is a 10ms interval (so
 * the "stops after close" test is meaningful); everything else emits once and
 * completes. Overrides let individual tests swap in a failing service.
 */
function fakeServices(
  overrides: Partial<ServiceContainer> = {},
): ServiceContainer {
  const base = {
    referenceData: {
      getCurrencyPairs: () => {
        return of([
          {
            base: "EUR",
            term: "USD",
            symbol: "EURUSD",
            ratePrecision: 5,
            pipsPosition: 4,
            defaultNotional: 1_000_000,
          },
        ]);
      },
    },
    pricing: {
      getPriceUpdates: (symbol: string): Observable<unknown> => {
        return interval(PRICE_TICK_MS).pipe(
          map(() => {
            return {
              symbol,
              bid: 1.0998,
              ask: 1.1002,
              mid: 1.1,
              valueDate: "2026-01-01",
              creationTimestamp: 1,
            };
          }),
        );
      },
      getPriceHistory: () => {
        return of([
          {
            symbol: "EURUSD",
            bid: 1.0998,
            ask: 1.1002,
            mid: 1.1,
            valueDate: "2026-01-01",
            creationTimestamp: 1,
          },
        ]);
      },
    },
    execution: {
      executeTrade: (req: {
        currencyPair: string;
        notional: number;
        dealtCurrency: string;
        direction: Direction;
        spotRate: number;
      }) => {
        return of({
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
        });
      },
    },
    blotter: {
      getTradeStream: () => {
        return of([
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
        ]);
      },
    },
    analytics: {
      getAnalytics: () => {
        return of({
          currentPositions: [
            {
              symbol: "EURUSD",
              basePnl: 1,
              baseTradedAmount: 2,
              counterTradedAmount: 3,
            },
          ],
          history: [{ timestamp: "2026-01-01T00:00:00.000Z", usdPnl: 4 }],
        });
      },
    },
    instruments: {
      getInstruments: () => {
        return of([
          {
            id: 1,
            name: "US Treasury 10Y",
            cusip: "912828C57",
            ticker: "T",
            maturity: "2036-01-01",
            interestRate: 0.04,
            benchmark: "T",
          },
        ]);
      },
    },
    dealers: {
      getDealers: () => {
        return of([{ id: 1, name: "Acme Bank" }]);
      },
    },
    workflow: {
      events: (): Observable<RfqEvent> => {
        return of({
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
        } as unknown as RfqEvent);
      },
      createRfq: () => {
        return of(1);
      },
      cancelRfq: () => {
        return of(undefined);
      },
      quote: () => {
        return of(undefined);
      },
      pass: () => {
        return of(undefined);
      },
      accept: () => {
        return of(undefined);
      },
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
    ws.receive({
      type: CLIENT_MSG.SUBSCRIBE_PRICING,
      payload: { symbol: "EURUSD" },
    });
    await wait(PRICE_TICK_MS * 2);

    const ticks = ws.framesOfType(SERVER_MSG.PRICE_TICK);
    expect(ticks.length).toBeGreaterThan(0);
    expect(defined(ticks[0]).payload).toMatchObject({
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
    const payload = defined(first).payload as {
      updates: {
        symbol: string;
        ratePrecision: number;
        pipsPosition: number;
      }[];
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

    const events = ws.framesOfType(SERVER_MSG.INSTRUMENT_EVENT).map((m) => {
      return (m.payload as { type: string }).type;
    });
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
    expect(
      (defined(frame).payload as { isStateOfTheWorld: boolean })
        .isStateOfTheWorld,
    ).toBe(true);
  });

  it("routes subscribe.analytics to a stream.analytics frame matching the AnalyticsDto shape", async () => {
    const ws = connect(fakeServices());
    ws.receive({
      type: CLIENT_MSG.SUBSCRIBE_ANALYTICS,
      payload: { currency: "USD" },
    });
    await wait();

    const [frame] = ws.framesOfType(SERVER_MSG.ANALYTICS);
    expectFrameShape(frame, SERVER_MSG.ANALYTICS, analyticsFrame());
  });

  it("brackets subscribe.dealers with SoW markers and emits added DealerDto events", async () => {
    const ws = connect(fakeServices());
    ws.receive({ type: CLIENT_MSG.SUBSCRIBE_DEALERS });
    await wait();

    const frames = ws.framesOfType(SERVER_MSG.DEALER_EVENT);
    const types = frames.map((m) => {
      return (m.payload as { type: string }).type;
    });
    expect(types[0]).toBe("startOfStateOfTheWorld");
    expect(types).toContain("added");
    expect(types).toContain("endOfStateOfTheWorld");
    expect(types.indexOf("startOfStateOfTheWorld")).toBeLessThan(
      types.indexOf("endOfStateOfTheWorld"),
    );
    const added = frames.find((m) => {
      return (m.payload as { type: string }).type === "added";
    });
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
    expect(defined(resp).correlationId).toBe("abc-123");
    const body = defined(resp).payload as {
      type: string;
      payload: Record<string, unknown>;
    };
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
      executeTrade: () => {
        return throwError(() => {
          return new Error("boom");
        });
      },
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
    expect(defined(resp).correlationId).toBe("fail-1");
    expect((defined(resp).payload as { type: string }).type).toBe("nack");
  });

  it("answers rpc.getPriceHistory with an ack echoing correlationId and a prices payload", async () => {
    const ws = connect(fakeServices());
    ws.receive({
      type: CLIENT_MSG.GET_PRICE_HISTORY,
      correlationId: "ph-1",
      payload: { symbol: "EURUSD" },
    });
    await wait();

    const [resp] = ws.framesOfType(SERVER_MSG.PRICE_HISTORY_RESPONSE);
    expect(defined(resp).correlationId).toBe("ph-1");
    expectFrameShape(
      resp,
      SERVER_MSG.PRICE_HISTORY_RESPONSE,
      priceHistoryResponse("EURUSD", 1),
    );
  });

  it("answers rpc.getPriceHistory with a nack when the service fails", async () => {
    const failing = {
      getPriceUpdates: () => {
        return of();
      },
      getPriceHistory: () => {
        return throwError(() => {
          return new Error("boom");
        });
      },
    } as unknown as ServiceContainer["pricing"];
    const ws = connect(fakeServices({ pricing: failing }));
    ws.receive({
      type: CLIENT_MSG.GET_PRICE_HISTORY,
      correlationId: "ph-2",
      payload: { symbol: "EURUSD" },
    });
    await wait();

    const [resp] = ws.framesOfType(SERVER_MSG.PRICE_HISTORY_RESPONSE);
    expect(defined(resp).correlationId).toBe("ph-2");
    expectFrameShape(resp, SERVER_MSG.PRICE_HISTORY_RESPONSE, rpcNack());
  });

  it("answers rpc.createRfq with an ack carrying the rfqId and correlationId", async () => {
    const ws = connect(fakeServices());
    ws.receive({
      type: CLIENT_MSG.CREATE_RFQ,
      correlationId: "rfq-1",
      payload: {
        instrumentId: 1,
        dealerIds: [1],
        quantity: 1_000_000,
        direction: Direction.Buy,
        expirySecs: 120,
      },
    });
    await wait();

    const [resp] = ws.framesOfType(SERVER_MSG.CREATE_RFQ_RESPONSE);
    expect(defined(resp).correlationId).toBe("rfq-1");
    expectFrameShape(resp, SERVER_MSG.CREATE_RFQ_RESPONSE, rpcAck(1));
  });

  it("answers rpc.createRfq with a nack when the workflow fails", async () => {
    const failing = {
      events: () => {
        return of();
      },
      createRfq: () => {
        return throwError(() => {
          return new Error("boom");
        });
      },
    } as unknown as ServiceContainer["workflow"];
    const ws = connect(fakeServices({ workflow: failing }));
    ws.receive({
      type: CLIENT_MSG.CREATE_RFQ,
      correlationId: "rfq-2",
      payload: {
        instrumentId: 1,
        dealerIds: [1],
        quantity: 1_000_000,
        direction: Direction.Buy,
        expirySecs: 120,
      },
    });
    await wait();

    const [resp] = ws.framesOfType(SERVER_MSG.CREATE_RFQ_RESPONSE);
    expect(defined(resp).correlationId).toBe("rfq-2");
    expectFrameShape(resp, SERVER_MSG.CREATE_RFQ_RESPONSE, rpcNack());
  });

  it("answers rpc.cancelRfq with an ack echoing correlationId", async () => {
    const ws = connect(fakeServices());
    ws.receive({
      type: CLIENT_MSG.CANCEL_RFQ,
      correlationId: "cx-1",
      payload: { rfqId: 1 },
    });
    await wait();

    const [resp] = ws.framesOfType(SERVER_MSG.CANCEL_RFQ_RESPONSE);
    expect(defined(resp).correlationId).toBe("cx-1");
    expect((defined(resp).payload as { type: string }).type).toBe("ack");
  });

  it("answers rpc.cancelRfq with a nack when the workflow fails", async () => {
    const failing = {
      events: () => {
        return of();
      },
      cancelRfq: () => {
        return throwError(() => {
          return new Error("boom");
        });
      },
    } as unknown as ServiceContainer["workflow"];
    const ws = connect(fakeServices({ workflow: failing }));
    ws.receive({
      type: CLIENT_MSG.CANCEL_RFQ,
      correlationId: "cx-2",
      payload: { rfqId: 1 },
    });
    await wait();

    const [resp] = ws.framesOfType(SERVER_MSG.CANCEL_RFQ_RESPONSE);
    expect(defined(resp).correlationId).toBe("cx-2");
    expect((defined(resp).payload as { type: string }).type).toBe("nack");
  });

  it("answers rpc.quote with an ack echoing correlationId", async () => {
    const ws = connect(fakeServices());
    ws.receive({
      type: CLIENT_MSG.QUOTE,
      correlationId: "q-1",
      payload: { quoteId: 1, price: 100 },
    });
    await wait();

    const [resp] = ws.framesOfType(SERVER_MSG.QUOTE_RESPONSE);
    expect(defined(resp).correlationId).toBe("q-1");
    expect((defined(resp).payload as { type: string }).type).toBe("ack");
  });

  it("answers rpc.quote with a nack when the workflow fails", async () => {
    const failing = {
      events: () => {
        return of();
      },
      quote: () => {
        return throwError(() => {
          return new Error("boom");
        });
      },
    } as unknown as ServiceContainer["workflow"];
    const ws = connect(fakeServices({ workflow: failing }));
    ws.receive({
      type: CLIENT_MSG.QUOTE,
      correlationId: "q-2",
      payload: { quoteId: 1, price: 100 },
    });
    await wait();

    const [resp] = ws.framesOfType(SERVER_MSG.QUOTE_RESPONSE);
    expect(defined(resp).correlationId).toBe("q-2");
    expect((defined(resp).payload as { type: string }).type).toBe("nack");
  });

  it("answers rpc.pass with an ack echoing correlationId", async () => {
    const ws = connect(fakeServices());
    ws.receive({
      type: CLIENT_MSG.PASS,
      correlationId: "p-1",
      payload: { quoteId: 1 },
    });
    await wait();

    const [resp] = ws.framesOfType(SERVER_MSG.PASS_RESPONSE);
    expect(defined(resp).correlationId).toBe("p-1");
    expect((defined(resp).payload as { type: string }).type).toBe("ack");
  });

  it("answers rpc.pass with a nack when the workflow fails", async () => {
    const failing = {
      events: () => {
        return of();
      },
      pass: () => {
        return throwError(() => {
          return new Error("boom");
        });
      },
    } as unknown as ServiceContainer["workflow"];
    const ws = connect(fakeServices({ workflow: failing }));
    ws.receive({
      type: CLIENT_MSG.PASS,
      correlationId: "p-2",
      payload: { quoteId: 1 },
    });
    await wait();

    const [resp] = ws.framesOfType(SERVER_MSG.PASS_RESPONSE);
    expect(defined(resp).correlationId).toBe("p-2");
    expect((defined(resp).payload as { type: string }).type).toBe("nack");
  });

  it("answers rpc.accept with an ack echoing correlationId", async () => {
    const ws = connect(fakeServices());
    ws.receive({
      type: CLIENT_MSG.ACCEPT,
      correlationId: "a-1",
      payload: { quoteId: 1 },
    });
    await wait();

    const [resp] = ws.framesOfType(SERVER_MSG.ACCEPT_RESPONSE);
    expect(defined(resp).correlationId).toBe("a-1");
    expect((defined(resp).payload as { type: string }).type).toBe("ack");
  });

  it("answers rpc.accept with a nack when the workflow fails", async () => {
    const failing = {
      events: () => {
        return of();
      },
      accept: () => {
        return throwError(() => {
          return new Error("boom");
        });
      },
    } as unknown as ServiceContainer["workflow"];
    const ws = connect(fakeServices({ workflow: failing }));
    ws.receive({
      type: CLIENT_MSG.ACCEPT,
      correlationId: "a-2",
      payload: { quoteId: 1 },
    });
    await wait();

    const [resp] = ws.framesOfType(SERVER_MSG.ACCEPT_RESPONSE);
    expect(defined(resp).correlationId).toBe("a-2");
    expect((defined(resp).payload as { type: string }).type).toBe("nack");
  });

  it("answers admin.getThroughput with an ack carrying a numeric value and correlationId", async () => {
    const ws = connect(fakeServices());
    ws.receive({ type: CLIENT_MSG.GET_THROUGHPUT, correlationId: "tp-1" });
    await wait();

    const [resp] = ws.framesOfType(SERVER_MSG.THROUGHPUT_RESPONSE);
    expect(defined(resp).correlationId).toBe("tp-1");
    const body = defined(resp).payload as { type: string; payload: number };
    expect(body.type).toBe("ack");
    expect(typeof body.payload).toBe("number");
  });

  it("acks admin.setThroughput and the new value is observable via getThroughput", async () => {
    const ws = connect(fakeServices());
    ws.receive({
      type: CLIENT_MSG.SET_THROUGHPUT,
      correlationId: "tp-2",
      payload: { value: 42 },
    });
    await wait();

    const [setResp] = ws.framesOfType(SERVER_MSG.SET_THROUGHPUT_RESPONSE);
    expect(defined(setResp).correlationId).toBe("tp-2");
    expect((defined(setResp).payload as { type: string }).type).toBe("ack");

    ws.receive({ type: CLIENT_MSG.GET_THROUGHPUT, correlationId: "tp-3" });
    await wait();
    const [getResp] = ws.framesOfType(SERVER_MSG.THROUGHPUT_RESPONSE);
    expect(
      (defined(getResp).payload as { type: string; payload: number }).payload,
    ).toBe(42);
  });

  it("ignores unknown message types without sending or throwing", async () => {
    const ws = connect(fakeServices());
    expect(() => {
      return ws.receive({ type: "totally.unknown", payload: {} });
    }).not.toThrow();
    await wait();
    expect(ws.outbound).toHaveLength(0);
  });

  it("ignores malformed (non-JSON) frames", async () => {
    const ws = connect(fakeServices());
    expect(() => {
      return ws.emit("message", "{not json");
    }).not.toThrow();
    await wait();
    expect(ws.outbound).toHaveLength(0);
  });

  it("stops streaming after the socket closes", async () => {
    const ws = connect(fakeServices());
    ws.receive({
      type: CLIENT_MSG.SUBSCRIBE_PRICING,
      payload: { symbol: "EURUSD" },
    });
    await wait(PRICE_TICK_MS * 3); // let a few ticks through

    const before = ws.framesOfType(SERVER_MSG.PRICE_TICK).length;
    expect(before).toBeGreaterThan(0);

    ws.closeConnection();
    await wait(PRICE_TICK_MS * 4); // would be ~4 more ticks if the subscription leaked

    const after = ws.framesOfType(SERVER_MSG.PRICE_TICK).length;
    expect(after).toBe(before);
  });
});

describe("wsHandler stream-error callbacks", () => {
  it("logs and emits no frames when referenceData stream errors", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const ws = connect(
      fakeServices({
        referenceData: {
          getCurrencyPairs: () => {
            return throwError(() => {
              return new Error("boom");
            });
          },
        } as unknown as ServiceContainer["referenceData"],
      }),
    );
    ws.receive({ type: CLIENT_MSG.SUBSCRIBE_REFERENCE_DATA });
    await wait();
    expect(spy).toHaveBeenCalledWith(
      "ReferenceData stream error:",
      expect.any(Error),
    );
    expect(ws.framesOfType(SERVER_MSG.REFERENCE_DATA)).toHaveLength(0);
    spy.mockRestore();
  });

  it("logs and emits no frames when pricing stream errors", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const ws = connect(
      fakeServices({
        pricing: {
          getPriceUpdates: () => {
            return throwError(() => {
              return new Error("boom");
            });
          },
          getPriceHistory: () => {
            return throwError(() => {
              return new Error("boom");
            });
          },
        } as unknown as ServiceContainer["pricing"],
      }),
    );
    ws.receive({
      type: CLIENT_MSG.SUBSCRIBE_PRICING,
      payload: { symbol: "EURUSD" },
    });
    await wait();
    expect(spy).toHaveBeenCalledWith(
      "Pricing stream error:",
      expect.any(Error),
    );
    expect(ws.framesOfType(SERVER_MSG.PRICE_TICK)).toHaveLength(0);
    spy.mockRestore();
  });

  it("logs and emits no frames when blotter stream errors", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const ws = connect(
      fakeServices({
        blotter: {
          getTradeStream: () => {
            return throwError(() => {
              return new Error("boom");
            });
          },
        } as unknown as ServiceContainer["blotter"],
      }),
    );
    ws.receive({ type: CLIENT_MSG.SUBSCRIBE_BLOTTER });
    await wait();
    expect(spy).toHaveBeenCalledWith(
      "Blotter stream error:",
      expect.any(Error),
    );
    expect(ws.framesOfType(SERVER_MSG.BLOTTER)).toHaveLength(0);
    spy.mockRestore();
  });

  it("logs and emits no frames when analytics stream errors", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const ws = connect(
      fakeServices({
        analytics: {
          getAnalytics: () => {
            return throwError(() => {
              return new Error("boom");
            });
          },
        } as unknown as ServiceContainer["analytics"],
      }),
    );
    ws.receive({
      type: CLIENT_MSG.SUBSCRIBE_ANALYTICS,
      payload: { currency: "USD" },
    });
    await wait();
    expect(spy).toHaveBeenCalledWith(
      "Analytics stream error:",
      expect.any(Error),
    );
    expect(ws.framesOfType(SERVER_MSG.ANALYTICS)).toHaveLength(0);
    spy.mockRestore();
  });

  it("logs and emits no added frames when instruments stream errors", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const ws = connect(
      fakeServices({
        instruments: {
          getInstruments: () => {
            return throwError(() => {
              return new Error("boom");
            });
          },
        } as unknown as ServiceContainer["instruments"],
      }),
    );
    ws.receive({ type: CLIENT_MSG.SUBSCRIBE_INSTRUMENTS });
    await wait();
    expect(spy).toHaveBeenCalledWith(
      "Instruments stream error:",
      expect.any(Error),
    );
    const types = ws.framesOfType(SERVER_MSG.INSTRUMENT_EVENT).map((m) => {
      return (m.payload as { type: string }).type;
    });
    expect(types).not.toContain("added");
    expect(types).not.toContain("endOfStateOfTheWorld");
    spy.mockRestore();
  });

  it("logs and emits no added frames when dealers stream errors", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const ws = connect(
      fakeServices({
        dealers: {
          getDealers: () => {
            return throwError(() => {
              return new Error("boom");
            });
          },
        } as unknown as ServiceContainer["dealers"],
      }),
    );
    ws.receive({ type: CLIENT_MSG.SUBSCRIBE_DEALERS });
    await wait();
    expect(spy).toHaveBeenCalledWith(
      "Dealers stream error:",
      expect.any(Error),
    );
    const types = ws.framesOfType(SERVER_MSG.DEALER_EVENT).map((m) => {
      return (m.payload as { type: string }).type;
    });
    expect(types).not.toContain("added");
    expect(types).not.toContain("endOfStateOfTheWorld");
    spy.mockRestore();
  });

  it("logs and emits no frames when workflow stream errors", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const ws = connect(
      fakeServices({
        workflow: {
          events: () => {
            return throwError(() => {
              return new Error("boom");
            });
          },
          createRfq: () => {
            return of(1);
          },
          cancelRfq: () => {
            return of(undefined);
          },
          quote: () => {
            return of(undefined);
          },
          pass: () => {
            return of(undefined);
          },
          accept: () => {
            return of(undefined);
          },
        } as unknown as ServiceContainer["workflow"],
      }),
    );
    ws.receive({ type: CLIENT_MSG.SUBSCRIBE_WORKFLOW });
    await wait();
    expect(spy).toHaveBeenCalledWith(
      "Workflow stream error:",
      expect.any(Error),
    );
    expect(ws.framesOfType(SERVER_MSG.WORKFLOW_EVENT)).toHaveLength(0);
    spy.mockRestore();
  });
});

describe("wsHandler workflow quote-event transforms", () => {
  function workflowEmitting(event: RfqEvent): ServiceContainer["workflow"] {
    return {
      events: (): Observable<RfqEvent> => {
        return of(event);
      },
      createRfq: () => {
        return of(1);
      },
      cancelRfq: () => {
        return of(undefined);
      },
      quote: () => {
        return of(undefined);
      },
      pass: () => {
        return of(undefined);
      },
      accept: () => {
        return of(undefined);
      },
    } as unknown as ServiceContainer["workflow"];
  }

  function quoteEvent(type: RfqEvent["type"]): RfqEvent {
    return {
      type,
      payload: {
        id: 7,
        rfqId: 3,
        dealerId: 2,
        state: { type: "pendingWithoutPrice" },
      },
    } as unknown as RfqEvent;
  }

  for (const type of [
    "quoteCreated",
    "quoteQuoted",
    "quotePassed",
    "quoteAccepted",
  ] as const) {
    it(`maps a ${type} RfqEvent to a stream.workflowEvent QuoteBodyDto frame`, async () => {
      const ws = connect(
        fakeServices({ workflow: workflowEmitting(quoteEvent(type)) }),
      );
      ws.receive({ type: CLIENT_MSG.SUBSCRIBE_WORKFLOW });
      await wait();
      const [frame] = ws.framesOfType(SERVER_MSG.WORKFLOW_EVENT);
      expect(frame).toBeDefined();
      expect(defined(frame).type).toBe(SERVER_MSG.WORKFLOW_EVENT);
      const body = defined(frame).payload as {
        type: string;
        payload: {
          id: number;
          rfqId: number;
          dealerId: number;
          state: { type: string };
        };
      };
      expect(body.type).toBe(type);
      expect(body.payload).toEqual({
        id: 7,
        rfqId: 3,
        dealerId: 2,
        state: { type: "pendingWithoutPrice" },
      });
    });
  }
});

describe("wsHandler workflow rfq-event transforms", () => {
  function workflowEmitting(event: RfqEvent): ServiceContainer["workflow"] {
    return {
      events: (): Observable<RfqEvent> => {
        return of(event);
      },
      createRfq: () => {
        return of(1);
      },
      cancelRfq: () => {
        return of(undefined);
      },
      quote: () => {
        return of(undefined);
      },
      pass: () => {
        return of(undefined);
      },
      accept: () => {
        return of(undefined);
      },
    } as unknown as ServiceContainer["workflow"];
  }

  function rfqEvent(type: "rfqCreated" | "rfqClosed"): RfqEvent {
    return {
      type,
      payload: {
        id: 9,
        instrumentId: 4,
        quantity: 2_500_000,
        direction: Direction.Sell,
        state: "Open",
        expirySecs: 90,
        creationTimestamp: 1_700_000_000,
      },
    } as unknown as RfqEvent;
  }

  for (const type of ["rfqCreated", "rfqClosed"] as const) {
    it(`maps a ${type} RfqEvent to a stream.workflowEvent RfqBodyDto frame`, async () => {
      const ws = connect(
        fakeServices({ workflow: workflowEmitting(rfqEvent(type)) }),
      );
      ws.receive({ type: CLIENT_MSG.SUBSCRIBE_WORKFLOW });
      await wait();

      const [frame] = ws.framesOfType(SERVER_MSG.WORKFLOW_EVENT);
      // Shape matches the @rtc/shared WorkflowEvent (rfqCreated) wire contract.
      expectFrameShape(
        frame,
        SERVER_MSG.WORKFLOW_EVENT,
        workflowEventCreated(9),
      );
      const body = defined(frame).payload as {
        type: string;
        payload: Record<string, unknown>;
      };
      expect(body.type).toBe(type);
      expect(body.payload).toEqual({
        id: 9,
        instrumentId: 4,
        quantity: 2_500_000,
        direction: Direction.Sell,
        state: "Open",
        expirySecs: 90,
        creationTimestamp: 1_700_000_000,
      });
    });
  }

  for (const type of [
    "startOfStateOfTheWorld",
    "endOfStateOfTheWorld",
  ] as const) {
    it(`maps a ${type} RfqEvent to a bare stream.workflowEvent marker frame`, async () => {
      const ws = connect(
        fakeServices({ workflow: workflowEmitting({ type } as RfqEvent) }),
      );
      ws.receive({ type: CLIENT_MSG.SUBSCRIBE_WORKFLOW });
      await wait();

      const [frame] = ws.framesOfType(SERVER_MSG.WORKFLOW_EVENT);
      expect(frame).toBeDefined();
      expect(defined(frame).type).toBe(SERVER_MSG.WORKFLOW_EVENT);
      // SoW markers carry only a `type` discriminator — no payload on the wire.
      expect(defined(frame).payload).toEqual({ type });
    });
  }
});

describe("wsHandler RPC synchronous-throw handling", () => {
  it("nacks rpc.executeTrade when execution throws synchronously", async () => {
    const ws = connect(
      fakeServices({
        execution: {
          executeTrade: () => {
            throw new Error("boom");
          },
        } as unknown as ServiceContainer["execution"],
      }),
    );
    ws.receive({
      type: CLIENT_MSG.EXECUTE_TRADE,
      correlationId: "sync-exec",
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
    expect(defined(resp).correlationId).toBe("sync-exec");
    expect((defined(resp).payload as { type: string }).type).toBe("nack");
  });

  it("nacks rpc.getPriceHistory when pricing throws synchronously", async () => {
    const ws = connect(
      fakeServices({
        pricing: {
          getPriceUpdates: () => {
            return of();
          },
          getPriceHistory: () => {
            throw new Error("boom");
          },
        } as unknown as ServiceContainer["pricing"],
      }),
    );
    ws.receive({
      type: CLIENT_MSG.GET_PRICE_HISTORY,
      correlationId: "sync-ph",
      payload: { symbol: "EURUSD" },
    });
    await wait();
    const [resp] = ws.framesOfType(SERVER_MSG.PRICE_HISTORY_RESPONSE);
    expect(defined(resp).correlationId).toBe("sync-ph");
    expect((defined(resp).payload as { type: string }).type).toBe("nack");
  });

  it("nacks rpc.createRfq when the workflow throws synchronously", async () => {
    const ws = connect(
      fakeServices({
        workflow: {
          events: () => {
            return of();
          },
          createRfq: () => {
            throw new Error("boom");
          },
          cancelRfq: () => {
            return of(undefined);
          },
          quote: () => {
            return of(undefined);
          },
          pass: () => {
            return of(undefined);
          },
          accept: () => {
            return of(undefined);
          },
        } as unknown as ServiceContainer["workflow"],
      }),
    );
    ws.receive({
      type: CLIENT_MSG.CREATE_RFQ,
      correlationId: "sync-rfq",
      payload: {
        instrumentId: 1,
        dealerIds: [1],
        quantity: 1_000_000,
        direction: Direction.Buy,
        expirySecs: 120,
      },
    });
    await wait();
    const [resp] = ws.framesOfType(SERVER_MSG.CREATE_RFQ_RESPONSE);
    expect(defined(resp).correlationId).toBe("sync-rfq");
    expect((defined(resp).payload as { type: string }).type).toBe("nack");
  });

  it("nacks rpc.cancelRfq when the workflow throws synchronously", async () => {
    const ws = connect(
      fakeServices({
        workflow: {
          events: () => {
            return of();
          },
          createRfq: () => {
            return of(1);
          },
          cancelRfq: () => {
            throw new Error("boom");
          },
          quote: () => {
            return of(undefined);
          },
          pass: () => {
            return of(undefined);
          },
          accept: () => {
            return of(undefined);
          },
        } as unknown as ServiceContainer["workflow"],
      }),
    );
    ws.receive({
      type: CLIENT_MSG.CANCEL_RFQ,
      correlationId: "sync-cancel",
      payload: { rfqId: 1 },
    });
    await wait();
    const [resp] = ws.framesOfType(SERVER_MSG.CANCEL_RFQ_RESPONSE);
    expect(defined(resp).correlationId).toBe("sync-cancel");
    expect((defined(resp).payload as { type: string }).type).toBe("nack");
  });

  it("nacks rpc.quote when the workflow throws synchronously", async () => {
    const ws = connect(
      fakeServices({
        workflow: {
          events: () => {
            return of();
          },
          createRfq: () => {
            return of(1);
          },
          cancelRfq: () => {
            return of(undefined);
          },
          quote: () => {
            throw new Error("boom");
          },
          pass: () => {
            return of(undefined);
          },
          accept: () => {
            return of(undefined);
          },
        } as unknown as ServiceContainer["workflow"],
      }),
    );
    ws.receive({
      type: CLIENT_MSG.QUOTE,
      correlationId: "sync-quote",
      payload: { quoteId: 1, price: 100 },
    });
    await wait();
    const [resp] = ws.framesOfType(SERVER_MSG.QUOTE_RESPONSE);
    expect(defined(resp).correlationId).toBe("sync-quote");
    expect((defined(resp).payload as { type: string }).type).toBe("nack");
  });

  it("nacks rpc.pass when the workflow throws synchronously", async () => {
    const ws = connect(
      fakeServices({
        workflow: {
          events: () => {
            return of();
          },
          createRfq: () => {
            return of(1);
          },
          cancelRfq: () => {
            return of(undefined);
          },
          quote: () => {
            return of(undefined);
          },
          pass: () => {
            throw new Error("boom");
          },
          accept: () => {
            return of(undefined);
          },
        } as unknown as ServiceContainer["workflow"],
      }),
    );
    ws.receive({
      type: CLIENT_MSG.PASS,
      correlationId: "sync-pass",
      payload: { quoteId: 1 },
    });
    await wait();
    const [resp] = ws.framesOfType(SERVER_MSG.PASS_RESPONSE);
    expect(defined(resp).correlationId).toBe("sync-pass");
    expect((defined(resp).payload as { type: string }).type).toBe("nack");
  });

  it("nacks rpc.accept when the workflow throws synchronously", async () => {
    const ws = connect(
      fakeServices({
        workflow: {
          events: () => {
            return of();
          },
          createRfq: () => {
            return of(1);
          },
          cancelRfq: () => {
            return of(undefined);
          },
          quote: () => {
            return of(undefined);
          },
          pass: () => {
            return of(undefined);
          },
          accept: () => {
            throw new Error("boom");
          },
        } as unknown as ServiceContainer["workflow"],
      }),
    );
    ws.receive({
      type: CLIENT_MSG.ACCEPT,
      correlationId: "sync-accept",
      payload: { quoteId: 1 },
    });
    await wait();
    const [resp] = ws.framesOfType(SERVER_MSG.ACCEPT_RESPONSE);
    expect(defined(resp).correlationId).toBe("sync-accept");
    expect((defined(resp).payload as { type: string }).type).toBe("nack");
  });

  it("nacks admin.setThroughput when the throughput service throws synchronously", async () => {
    const ws = connect(
      fakeServices({
        throughput: {
          getThroughput: () => {
            return 0;
          },
          setThroughput: () => {
            throw new Error("boom");
          },
        } as unknown as ServiceContainer["throughput"],
      }),
    );
    ws.receive({
      type: CLIENT_MSG.SET_THROUGHPUT,
      correlationId: "sync-tp",
      payload: { value: 42 },
    });
    await wait();
    const [resp] = ws.framesOfType(SERVER_MSG.SET_THROUGHPUT_RESPONSE);
    expect(defined(resp).correlationId).toBe("sync-tp");
    expect((defined(resp).payload as { type: string }).type).toBe("nack");
  });
});

describe("expectShape helper", () => {
  it("passes when shapes match regardless of values", () => {
    expect(() => {
      return expectShape({ a: 1, b: "x" }, { a: 99, b: "y" });
    }).not.toThrow();
  });
  it("passes for nested objects and arrays by element shape", () => {
    expect(() => {
      return expectShape({ xs: [{ n: 5 }] }, { xs: [{ n: 0 }] });
    }).not.toThrow();
  });
  it("fails when a key is missing", () => {
    expect(() => {
      return expectShape({ a: 1 }, { a: 1, b: 2 });
    }).toThrow();
  });
  it("fails when a value type differs", () => {
    expect(() => {
      return expectShape({ a: "1" }, { a: 1 });
    }).toThrow();
  });
});
