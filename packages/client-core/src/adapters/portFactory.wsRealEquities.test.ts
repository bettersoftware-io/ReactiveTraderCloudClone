import { beforeEach, describe, expect, it, vi } from "vitest";

import { AuthSimulator, type PreferencesPort } from "@rtc/domain";
import { CLIENT_MSG, SERVER_MSG } from "@rtc/shared";

import { awaitPendingRpc } from "./__tests__/awaitPendingRpc";
import { FakeWsAdapter } from "./__tests__/FakeWsAdapter";
import { InMemorySessionStore } from "./InMemorySessionStore";
import { createWsRealPorts } from "./portFactory";

// The RPC-backed equity ports were the largest uncovered block in client-core.
// Their failure modes are all silent from the UI's side: a nack that never
// reaches the subscriber is indistinguishable from a request still in flight,
// and an order stream that drops its id filter shows another order's fills.
// client-core appears in no tier of the published coverage report, so none of
// this was visible there. (portFactory.equities.test.ts covers the SIMULATOR
// ports; this file covers createWsRealPorts.)

let ws: FakeWsAdapter;
let ports: ReturnType<typeof createWsRealPorts>;

beforeEach(() => {
  ws = new FakeWsAdapter();
  ports = createWsRealPorts(ws, {
    preferences: {} as PreferencesPort,
    auth: new AuthSimulator({}),
    sessionStore: new InMemorySessionStore(),
  });
});

describe("marketData.candles", () => {
  it("emits the candles and completes on ack", async () => {
    const next = vi.fn();
    const complete = vi.fn();

    ports.marketData.candles("AAPL", "1W").subscribe({ next, complete });
    await awaitPendingRpc(ws, CLIENT_MSG.GET_CANDLES);
    ws.nextRpcResponse(CLIENT_MSG.GET_CANDLES, {
      type: "ack",
      payload: [
        { time: 1, open: 1, high: 2, low: 0, close: 1, volume: 1_200_000 },
      ],
    });
    await Promise.resolve();

    expect(next).toHaveBeenCalledTimes(1);
    expect(complete).toHaveBeenCalledTimes(1);
  });

  it("errors on nack rather than hanging, naming the symbol", async () => {
    const error = vi.fn();

    ports.marketData.candles("AAPL").subscribe({ error });
    await awaitPendingRpc(ws, CLIENT_MSG.GET_CANDLES);
    ws.nextRpcResponse(CLIENT_MSG.GET_CANDLES, { type: "nack" });
    await Promise.resolve();

    expect(error).toHaveBeenCalledTimes(1);
    expect(String(error.mock.calls[0]?.[0])).toContain("AAPL");
  });

  it("errors when an ack arrives with no payload", async () => {
    const error = vi.fn();

    ports.marketData.candles("AAPL").subscribe({ error });
    await awaitPendingRpc(ws, CLIENT_MSG.GET_CANDLES);
    ws.nextRpcResponse(CLIENT_MSG.GET_CANDLES, { type: "ack" });
    await Promise.resolve();

    expect(error).toHaveBeenCalledTimes(1);
  });

  it("stays silent when unsubscribed before the response lands", async () => {
    const next = vi.fn();
    const error = vi.fn();
    const sub = ports.marketData.candles("AAPL").subscribe({ next, error });

    await awaitPendingRpc(ws, CLIENT_MSG.GET_CANDLES);
    sub.unsubscribe();
    ws.nextRpcResponse(CLIENT_MSG.GET_CANDLES, { type: "ack", payload: [] });
    await Promise.resolve();

    expect(next).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
  });
});

describe("orders.place", () => {
  const req = { symbol: "AAPL", side: "buy", quantity: 10 } as never;

  async function ackPlace(orderId: string): Promise<void> {
    await awaitPendingRpc(ws, CLIENT_MSG.PLACE_ORDER);
    ws.nextRpcResponse(CLIENT_MSG.PLACE_ORDER, {
      type: "ack",
      payload: { orderId },
    });
    await Promise.resolve();
  }

  it("streams only the lifecycle events carrying its own order id", async () => {
    const next = vi.fn();

    ports.orders.place(req).subscribe({ next });
    await ackPlace("o-1");

    ws.emit(SERVER_MSG.ORDER_LIFECYCLE, { id: "o-2", status: "working" });
    ws.emit(SERVER_MSG.ORDER_LIFECYCLE, { id: "o-1", status: "working" });

    expect(next).toHaveBeenCalledTimes(1);
    expect(next.mock.calls[0]?.[0]).toMatchObject({ id: "o-1" });
  });

  it.each(["filled", "cancelled", "rejected"])(
    "completes once the order reaches %s",
    async (status) => {
      const complete = vi.fn();

      ports.orders.place(req).subscribe({ complete });
      await ackPlace("o-1");

      ws.emit(SERVER_MSG.ORDER_LIFECYCLE, { id: "o-1", status: "working" });
      expect(complete).not.toHaveBeenCalled();

      ws.emit(SERVER_MSG.ORDER_LIFECYCLE, { id: "o-1", status });
      expect(complete).toHaveBeenCalledTimes(1);
    },
  );

  it("errors on nack", async () => {
    const error = vi.fn();

    ports.orders.place(req).subscribe({ error });
    await awaitPendingRpc(ws, CLIENT_MSG.PLACE_ORDER);
    ws.nextRpcResponse(CLIENT_MSG.PLACE_ORDER, { type: "nack" });
    await Promise.resolve();

    expect(error).toHaveBeenCalledTimes(1);
  });

  it("errors when the ack carries no orderId — there would be nothing to follow", async () => {
    const error = vi.fn();

    ports.orders.place(req).subscribe({ error });
    await awaitPendingRpc(ws, CLIENT_MSG.PLACE_ORDER);
    ws.nextRpcResponse(CLIENT_MSG.PLACE_ORDER, { type: "ack", payload: {} });
    await Promise.resolve();

    expect(error).toHaveBeenCalledTimes(1);
  });

  it("stops listening to the lifecycle stream once unsubscribed", async () => {
    const next = vi.fn();
    const sub = ports.orders.place(req).subscribe({ next });

    await ackPlace("o-1");
    sub.unsubscribe();
    ws.emit(SERVER_MSG.ORDER_LIFECYCLE, { id: "o-1", status: "working" });

    expect(next).not.toHaveBeenCalled();
  });
});

describe("orders.cancel", () => {
  it("emits once and completes on ack", async () => {
    const next = vi.fn();
    const complete = vi.fn();

    ports.orders.cancel("o-1").subscribe({ next, complete });
    await awaitPendingRpc(ws, CLIENT_MSG.CANCEL_ORDER);
    ws.nextRpcResponse(CLIENT_MSG.CANCEL_ORDER, { type: "ack" });
    await Promise.resolve();

    expect(next).toHaveBeenCalledTimes(1);
    expect(complete).toHaveBeenCalledTimes(1);
  });

  it("errors on nack", async () => {
    const error = vi.fn();

    ports.orders.cancel("o-1").subscribe({ error });
    await awaitPendingRpc(ws, CLIENT_MSG.CANCEL_ORDER);
    ws.nextRpcResponse(CLIENT_MSG.CANCEL_ORDER, { type: "nack" });
    await Promise.resolve();

    expect(error).toHaveBeenCalledTimes(1);
  });
});
