// packages/client-react/src/app/adapters/__tests__/FakeWsAdapter.test.ts
import { describe, expect, it } from "vitest";

import { FakeWsAdapter } from "./FakeWsAdapter";

describe("FakeWsAdapter", () => {
  it("routes emit(type, payload) to all on(type) subscribers", () => {
    const ws = new FakeWsAdapter();
    const received: unknown[] = [];
    ws.on("stream.test", (p) => received.push(p));
    ws.on("stream.test", (p) => received.push(p));
    ws.emit("stream.test", { hello: "world" });
    expect(received).toEqual([{ hello: "world" }, { hello: "world" }]);
  });

  it("on() returns an unsubscribe function", () => {
    const ws = new FakeWsAdapter();
    const received: unknown[] = [];
    const unsub = ws.on("stream.test", (p) => received.push(p));
    ws.emit("stream.test", 1);
    unsub();
    ws.emit("stream.test", 2);
    expect(received).toEqual([1]);
  });

  it("send() records messages inspectable via sentMessages()", () => {
    const ws = new FakeWsAdapter();
    ws.send("subscribe.pricing", { symbol: "EURUSD" });
    expect(ws.sentMessages()).toEqual([
      { type: "subscribe.pricing", payload: { symbol: "EURUSD" } },
    ]);
  });

  it("rpc() resolves when nextRpcResponse() is called", async () => {
    const ws = new FakeWsAdapter();
    const promise = ws.rpc("rpc.executeTrade", { foo: 1 });
    expect(ws.hasPendingRpc("rpc.executeTrade")).toBe(true);
    ws.nextRpcResponse("rpc.executeTrade", { type: "ack", payload: 42 });
    const result = await promise;
    expect(result).toEqual({ type: "ack", payload: 42 });
    expect(ws.hasPendingRpc("rpc.executeTrade")).toBe(false);
  });

  it("nextRpcResponse() throws when no pending RPC matches", () => {
    const ws = new FakeWsAdapter();
    expect(() =>
      ws.nextRpcResponse("rpc.executeTrade", { type: "ack" }),
    ).toThrow(/no pending RPC/);
  });

  it("dispose() clears listeners and pending RPCs", () => {
    const ws = new FakeWsAdapter();
    ws.on("stream.test", () => {});
    void ws.rpc("rpc.executeTrade");
    ws.dispose();
    expect(ws.hasPendingRpc("rpc.executeTrade")).toBe(false);
    expect(ws.sentMessages()).toEqual([]);
  });

  it("emitConnectionEvent('gatewayConnected') reaches connectionEvents() subscribers", () => {
    const ws = new FakeWsAdapter();
    const events: { type: string }[] = [];
    ws.connectionEvents().subscribe((e) => events.push(e));
    ws.emitConnectionEvent("gatewayConnected");
    expect(events).toEqual([{ type: "gatewayConnected" }]);
  });

  it("emitConnectionEvent('gatewayDisconnected') reaches subscribers", () => {
    const ws = new FakeWsAdapter();
    const events: { type: string }[] = [];
    ws.connectionEvents().subscribe((e) => events.push(e));
    ws.emitConnectionEvent("gatewayDisconnected");
    expect(events).toEqual([{ type: "gatewayDisconnected" }]);
  });

  it("connectionEvents() replays the last event to late subscribers", () => {
    const ws = new FakeWsAdapter();
    ws.emitConnectionEvent("gatewayConnected");
    const lateEvents: { type: string }[] = [];
    ws.connectionEvents().subscribe((e) => lateEvents.push(e));
    expect(lateEvents).toEqual([{ type: "gatewayConnected" }]);
  });

  it("dispose() completes the connection-events subject", () => {
    const ws = new FakeWsAdapter();
    let completed = false;
    ws.connectionEvents().subscribe({
      complete: () => {
        completed = true;
      },
    });
    ws.dispose();
    expect(completed).toBe(true);
  });
});
