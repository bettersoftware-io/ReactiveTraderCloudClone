import { firstValueFrom } from "rxjs";
import { describe, expect, it } from "vitest";

import { Direction, type PreferencesPort } from "@rtc/domain";
import { CLIENT_MSG } from "@rtc/shared";
import { rpcNack } from "@rtc/shared/__fixtures__/wireFrames";

import { awaitPendingRpc } from "./__tests__/awaitPendingRpc";
import { FakeWsAdapter } from "./__tests__/FakeWsAdapter";
import { createSimulatorPorts, createWsRealPorts } from "./portFactory";

describe("createSimulatorPorts dependency injection", () => {
  it("uses the injected preferences port (no internal localStorage)", () => {
    const fakePreferences = {} as PreferencesPort;
    const ports = createSimulatorPorts({ preferences: fakePreferences });
    expect(ports.preferences).toBe(fakePreferences);
  });
});

describe("createSimulatorPorts", () => {
  const fakePreferences = {} as PreferencesPort;

  it("wires all nine transport ports with their port methods", () => {
    const ports = createSimulatorPorts({ preferences: fakePreferences });
    expect(typeof ports.referenceData.getCurrencyPairs).toBe("function");
    expect(typeof ports.pricing.getPriceUpdates).toBe("function");
    expect(typeof ports.execution.executeTrade).toBe("function");
    expect(typeof ports.blotter.getTradeStream).toBe("function");
    expect(typeof ports.analytics.getAnalytics).toBe("function");
    expect(typeof ports.instruments.getInstruments).toBe("function");
    expect(typeof ports.dealers.getDealers).toBe("function");
    expect(typeof ports.workflow.events).toBe("function");
    expect(typeof ports.admin.getThroughput).toBe("function");
  });
  it("threads the ExecutionSimulator into the blotter so the store emits", async () => {
    const ports = createSimulatorPorts({ preferences: fakePreferences });
    const first = await firstValueFrom(ports.blotter.getTradeStream());
    expect(Array.isArray(first)).toBe(true);
  });
});

describe("wsReal pricing :: subscription lifecycle", () => {
  it("sends subscribe.pricing on subscribe and unsubscribe.pricing on teardown", () => {
    const ws = new FakeWsAdapter();
    const ports = createWsRealPorts(ws, {
      preferences: {} as PreferencesPort,
    });

    const sub = ports.pricing.getPriceUpdates("EURUSD").subscribe();
    expect(ws.sentMessages()).toEqual([
      { type: CLIENT_MSG.SUBSCRIBE_PRICING, payload: { symbol: "EURUSD" } },
    ]);

    // Teardown must tell the server to stop — otherwise a later re-subscribe
    // (filter toggle re-mounting the tile) stacks another server-side stream.
    sub.unsubscribe();
    expect(ws.sentMessages()).toEqual([
      { type: CLIENT_MSG.SUBSCRIBE_PRICING, payload: { symbol: "EURUSD" } },
      { type: CLIENT_MSG.UNSUBSCRIBE_PRICING, payload: { symbol: "EURUSD" } },
    ]);
  });
});

describe("wsReal equities :: per-symbol subscription lifecycle", () => {
  it("eqQuotes sends subscribe on subscribe and unsubscribe on teardown", () => {
    const ws = new FakeWsAdapter();
    const ports = createWsRealPorts(ws, { preferences: {} as PreferencesPort });

    const sub = ports.marketData.quotes("AAPL").subscribe();
    expect(ws.sentMessages()).toEqual([
      { type: CLIENT_MSG.SUBSCRIBE_EQ_QUOTES, payload: { symbol: "AAPL" } },
    ]);

    sub.unsubscribe();
    expect(ws.sentMessages()).toEqual([
      { type: CLIENT_MSG.SUBSCRIBE_EQ_QUOTES, payload: { symbol: "AAPL" } },
      { type: CLIENT_MSG.UNSUBSCRIBE_EQ_QUOTES, payload: { symbol: "AAPL" } },
    ]);
  });

  it("depth sends subscribe on subscribe and unsubscribe on teardown", () => {
    const ws = new FakeWsAdapter();
    const ports = createWsRealPorts(ws, { preferences: {} as PreferencesPort });

    const sub = ports.marketData.depth("AAPL").subscribe();
    expect(ws.sentMessages()).toEqual([
      { type: CLIENT_MSG.SUBSCRIBE_DEPTH, payload: { symbol: "AAPL" } },
    ]);

    sub.unsubscribe();
    expect(ws.sentMessages()).toEqual([
      { type: CLIENT_MSG.SUBSCRIBE_DEPTH, payload: { symbol: "AAPL" } },
      { type: CLIENT_MSG.UNSUBSCRIBE_DEPTH, payload: { symbol: "AAPL" } },
    ]);
  });
});

describe("wsReal workflow :: quote/pass error paths", () => {
  const fakePreferences = {} as PreferencesPort;

  it("rejects quote on nack", async () => {
    const ws = new FakeWsAdapter();
    const ports = createWsRealPorts(ws, { preferences: fakePreferences });
    const promise = firstValueFrom(
      ports.workflow.quote({ quoteId: 1, price: 100 }),
    );
    await awaitPendingRpc(ws, "rpc.quote");
    ws.nextRpcResponse("rpc.quote", rpcNack());
    await expect(promise).rejects.toThrow(/Failed to submit quote/);
    ws.dispose();
  });
  it("rejects pass on nack", async () => {
    const ws = new FakeWsAdapter();
    const ports = createWsRealPorts(ws, { preferences: fakePreferences });
    const promise = firstValueFrom(ports.workflow.pass(1));
    await awaitPendingRpc(ws, "rpc.pass");
    ws.nextRpcResponse("rpc.pass", rpcNack());
    await expect(promise).rejects.toThrow(/Failed to pass on quote/);
    ws.dispose();
  });
});

describe("wsReal createRfq :: null-payload guard (line 472)", () => {
  const fakePreferences = {} as PreferencesPort;

  it("throws when ack response has a null rfqId payload", async () => {
    // Exercises the `if (rfqId === undefined || rfqId === null)` branch in
    // createRfq (portFactory.ts:471-472). A server bug returning ack without a
    // numeric rfqId must not silently pass undefined downstream.
    const ws = new FakeWsAdapter();
    const ports = createWsRealPorts(ws, { preferences: fakePreferences });
    const promise = firstValueFrom(
      ports.workflow.createRfq({
        instrumentId: 1,
        dealerIds: [1],
        quantity: 1_000_000,
        direction: Direction.Buy,
        expirySecs: 120,
      }),
    );
    await awaitPendingRpc(ws, "rpc.createRfq");
    // Simulate an ack with no payload (null payload) — a defensive server bug
    ws.nextRpcResponse("rpc.createRfq", {
      type: "ack",
      payload: null as unknown as number,
    });
    await expect(promise).rejects.toThrow(/ack response missing payload/);
    ws.dispose();
  });
});

describe("wsReal admin.getThroughput :: null-payload guard (line 625)", () => {
  const fakePreferences = {} as PreferencesPort;

  it("throws when ack response has a null throughput payload", async () => {
    // Exercises the `if (value === undefined || value === null)` branch in
    // getThroughput (portFactory.ts:624-625). A server returning ack without a
    // numeric value must not silently pass undefined downstream.
    const ws = new FakeWsAdapter();
    const ports = createWsRealPorts(ws, { preferences: fakePreferences });
    const promise = firstValueFrom(ports.admin.getThroughput());
    await awaitPendingRpc(ws, "admin.getThroughput");
    ws.nextRpcResponse("admin.getThroughput", {
      type: "ack",
      payload: null as unknown as number,
    });
    await expect(promise).rejects.toThrow(/ack response missing payload/);
    ws.dispose();
  });
});
