import { EventEmitter } from "node:events";
import { describe, it, expect } from "vitest";
import { type Observable, of, interval, map, throwError } from "rxjs";
import { Direction, TradeStatus } from "@rtc/domain";
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
      getPriceHistory: () => of([]),
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
    blotter: { getTradeStream: () => of([]) },
    analytics: { getAnalytics: () => of({ currentPositions: [], history: [] }) },
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
    dealers: { getDealers: () => of([]) },
    workflow: { events: () => of() },
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
