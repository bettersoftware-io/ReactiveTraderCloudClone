// packages/client-react/src/app/adapters/WsAdapter.test.ts

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ConnectionEvent } from "@rtc/domain";

import { WsAdapter } from "./WsAdapter";

let lastMock: MockWebSocket;

class MockWebSocket {
  static OPEN = 1;

  static constructed = 0;

  readyState = 0;

  onopen: ((ev: Event) => void) | null = null;

  onclose: ((ev: CloseEvent) => void) | null = null;

  onmessage: ((ev: MessageEvent) => void) | null = null;

  onerror: ((ev: Event) => void) | null = null;

  send = vi.fn();

  close = vi.fn();

  constructor() {
    MockWebSocket.constructed++;
    // Capture the most recently constructed socket so tests can drive its
    // event handlers. WsAdapter does `new WebSocket(url)`, so a constructable
    // stub is required — vitest 4 forwards `new` to the stubbed global, and an
    // arrow `mockImplementation` is not a constructor.
    lastMock = this;
  }
}

beforeEach(() => {
  vi.useFakeTimers();
  MockWebSocket.constructed = 0;
  // The class carries a static OPEN (=1) like the real WebSocket constructor,
  // so WsAdapter.send()'s readyState check behaves as it does in a browser/Node.
  vi.stubGlobal("WebSocket", MockWebSocket);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("WsAdapter.connectionEvents()", () => {
  it("emits gatewayConnected when the WebSocket opens", () => {
    const adapter = new WsAdapter("ws://test");
    const events: ConnectionEvent[] = [];
    adapter.connectionEvents().subscribe((e) => {
      return events.push(e);
    });

    lastMock.onopen?.(new Event("open"));

    expect(events).toEqual([{ type: "gatewayConnected" }]);
    adapter.dispose();
  });

  it("emits gatewayDisconnected when the WebSocket closes", () => {
    const adapter = new WsAdapter("ws://test");
    const events: ConnectionEvent[] = [];
    adapter.connectionEvents().subscribe((e) => {
      return events.push(e);
    });

    lastMock.onclose?.(new CloseEvent("close"));

    expect(events).toEqual([{ type: "gatewayDisconnected" }]);
    adapter.dispose();
  });

  it("replays the last lifecycle event to late subscribers", () => {
    const adapter = new WsAdapter("ws://test");
    lastMock.onopen?.(new Event("open"));

    const lateEvents: ConnectionEvent[] = [];
    adapter.connectionEvents().subscribe((e) => {
      return lateEvents.push(e);
    });

    expect(lateEvents).toEqual([{ type: "gatewayConnected" }]);
    adapter.dispose();
  });

  it("dispose() completes the subject", () => {
    const adapter = new WsAdapter("ws://test");
    let completed = false;
    adapter.connectionEvents().subscribe({
      complete: () => {
        completed = true;
      },
    });
    adapter.dispose();
    expect(completed).toBe(true);
  });

  it("does not emit gatewayDisconnected when onclose fires after dispose", () => {
    const adapter = new WsAdapter("ws://test");
    const events: ConnectionEvent[] = [];
    adapter.connectionEvents().subscribe((e) => {
      return events.push(e);
    });
    adapter.dispose();
    lastMock.onclose?.(new CloseEvent("close"));
    expect(events).toEqual([]);
  });

  it("emits reconnectAttempt when the reconnect timer fires", () => {
    const adapter = new WsAdapter("ws://test", { reconnectDelayMs: 50 });
    const events: ConnectionEvent[] = [];
    adapter.connectionEvents().subscribe((e) => {
      return events.push(e);
    });

    lastMock.onopen?.(new Event("open"));
    lastMock.onclose?.(new CloseEvent("close"));
    // Close schedules a reconnect; advancing past the delay fires reconnectAttempt
    // immediately before the socket is rebuilt.
    vi.advanceTimersByTime(50);

    expect(events).toEqual([
      { type: "gatewayConnected" },
      { type: "gatewayDisconnected" },
      { type: "reconnectAttempt" },
    ]);
    adapter.dispose();
  });

  it("buffers a message sent before the socket opens and flushes it on connect", () => {
    const adapter = new WsAdapter("ws://test");
    // Socket is still CONNECTING (readyState 0) — the subscribe must not be lost.
    adapter.send("subscribe.pricing", { symbol: "EURUSD" });
    expect(lastMock.send).not.toHaveBeenCalled();

    // Once the socket opens, the buffered message is delivered.
    lastMock.readyState = MockWebSocket.OPEN;
    lastMock.onopen?.(new Event("open"));

    expect(lastMock.send).toHaveBeenCalledTimes(1);
    expect(lastMock.send).toHaveBeenCalledWith(
      JSON.stringify({
        type: "subscribe.pricing",
        payload: { symbol: "EURUSD" },
      }),
    );
    adapter.dispose();
  });

  it("sends immediately when the socket is already open", () => {
    const adapter = new WsAdapter("ws://test");
    lastMock.readyState = MockWebSocket.OPEN;
    lastMock.onopen?.(new Event("open"));

    adapter.send("subscribe.blotter");

    expect(lastMock.send).toHaveBeenCalledWith(
      JSON.stringify({ type: "subscribe.blotter" }),
    );
    adapter.dispose();
  });

  it("uses the configured reconnectDelayMs for scheduling reconnect", () => {
    const adapter = new WsAdapter("ws://test", { reconnectDelayMs: 50 });
    // Initial construction => 1 socket built
    expect(MockWebSocket.constructed).toBe(1);

    // Trigger close: schedules a reconnect after configured delay
    lastMock.onclose?.(new CloseEvent("close"));

    // 49ms after close: still not reconnecting
    vi.advanceTimersByTime(49);
    expect(MockWebSocket.constructed).toBe(1);

    // 1ms more crosses the 50ms boundary -> new socket constructed
    vi.advanceTimersByTime(1);
    expect(MockWebSocket.constructed).toBe(2);

    adapter.dispose();
  });
});

describe("WsAdapter.rpc() + message routing", () => {
  function open(_adapter: WsAdapter): MockWebSocket {
    lastMock.readyState = MockWebSocket.OPEN;
    lastMock.onopen?.(new Event("open"));
    return lastMock;
  }

  it("ignores a malformed (non-JSON) inbound frame without throwing", () => {
    const adapter = new WsAdapter("ws://test");
    const received: unknown[] = [];
    adapter.on("stream.priceTick", (p) => {
      return received.push(p);
    });
    open(adapter);
    expect(() => {
      return lastMock.onmessage?.(
        new MessageEvent("message", { data: "not json{" }),
      );
    }).not.toThrow();
    expect(received).toEqual([]);
    adapter.dispose();
  });
  it("routes a response with an unknown correlationId to the stream handler", () => {
    const adapter = new WsAdapter("ws://test");
    const received: unknown[] = [];
    adapter.on("stream.priceTick", (p) => {
      return received.push(p);
    });
    open(adapter);
    lastMock.onmessage?.(
      new MessageEvent("message", {
        data: JSON.stringify({
          type: "stream.priceTick",
          payload: { symbol: "EURUSD" },
          correlationId: "999",
        }),
      }),
    );
    expect(received).toEqual([{ symbol: "EURUSD" }]);
    adapter.dispose();
  });
  it("rejects rpc() when the socket is not open", async () => {
    const adapter = new WsAdapter("ws://test");
    await expect(adapter.rpc("rpc.executeTrade", { foo: 1 })).rejects.toThrow(
      /WebSocket not connected/,
    );
    expect(lastMock.send).not.toHaveBeenCalled();
    adapter.dispose();
  });
  it("resolves an in-flight rpc() when its correlated response arrives", async () => {
    const adapter = new WsAdapter("ws://test");
    open(adapter);
    const promise = adapter.rpc("rpc.executeTrade", { foo: 1 });
    lastMock.onmessage?.(
      new MessageEvent("message", {
        data: JSON.stringify({
          type: "rpc.executeTrade.response",
          payload: { tradeId: 7 },
          correlationId: "1",
        }),
      }),
    );
    await expect(promise).resolves.toEqual({ tradeId: 7 });
    adapter.dispose();
  });
  it("dispose() rejects every pending rpc()", async () => {
    const adapter = new WsAdapter("ws://test");
    open(adapter);
    const pending = adapter.rpc("rpc.executeTrade", { foo: 1 });
    adapter.dispose();
    await expect(pending).rejects.toThrow(/WsAdapter disposed/);
  });
  it("waitForConnection() resolves immediately when already open", async () => {
    const adapter = new WsAdapter("ws://test");
    lastMock.readyState = MockWebSocket.OPEN;
    lastMock.onopen?.(new Event("open"));
    await expect(adapter.waitForConnection()).resolves.toBeUndefined();
    adapter.dispose();
  });
  it("waitForConnection() resolves once the socket transitions to open", async () => {
    const adapter = new WsAdapter("ws://test");
    const waited = adapter.waitForConnection();
    lastMock.readyState = MockWebSocket.OPEN;
    await vi.advanceTimersByTimeAsync(100);
    await expect(waited).resolves.toBeUndefined();
    adapter.dispose();
  });
  it("on() disposer stops the handler from receiving further messages of that type", () => {
    const adapter = new WsAdapter("ws://test");
    const received: unknown[] = [];
    const dispose = adapter.on("stream.priceTick", (p) => {
      return received.push(p);
    });
    open(adapter);

    function frame(symbol: string) {
      return new MessageEvent("message", {
        data: JSON.stringify({ type: "stream.priceTick", payload: { symbol } }),
      });
    }

    lastMock.onmessage?.(frame("EURUSD"));
    expect(received).toEqual([{ symbol: "EURUSD" }]);

    dispose();
    lastMock.onmessage?.(frame("GBPUSD"));
    // No further delivery after the disposer removes the handler.
    expect(received).toEqual([{ symbol: "EURUSD" }]);

    // Disposing twice is safe (the `?.delete` optional-chain branch) and does
    // not throw or resurrect delivery.
    expect(() => {
      return dispose();
    }).not.toThrow();
    lastMock.onmessage?.(frame("USDJPY"));
    expect(received).toEqual([{ symbol: "EURUSD" }]);

    adapter.dispose();
  });
});
