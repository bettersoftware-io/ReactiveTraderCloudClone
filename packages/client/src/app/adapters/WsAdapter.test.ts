// packages/client/src/app/adapters/WsAdapter.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { ConnectionEvent } from "@rtc/domain";
import { WsAdapter } from "./WsAdapter";

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
  }
}

let lastMock: MockWebSocket;

beforeEach(() => {
  vi.useFakeTimers();
  MockWebSocket.constructed = 0;
  const WebSocketStub = vi.fn().mockImplementation(() => {
    lastMock = new MockWebSocket();
    return lastMock;
  });
  // The real global WebSocket constructor carries a static OPEN (=1); mirror it
  // so WsAdapter.send()'s readyState check behaves as it does in a browser/Node.
  (WebSocketStub as unknown as { OPEN: number }).OPEN = MockWebSocket.OPEN;
  vi.stubGlobal("WebSocket", WebSocketStub);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("WsAdapter.connectionEvents()", () => {
  it("emits gatewayConnected when the WebSocket opens", () => {
    const adapter = new WsAdapter("ws://test");
    const events: ConnectionEvent[] = [];
    adapter.connectionEvents().subscribe((e) => events.push(e));

    lastMock.onopen?.(new Event("open"));

    expect(events).toEqual([{ type: "gatewayConnected" }]);
    adapter.dispose();
  });

  it("emits gatewayDisconnected when the WebSocket closes", () => {
    const adapter = new WsAdapter("ws://test");
    const events: ConnectionEvent[] = [];
    adapter.connectionEvents().subscribe((e) => events.push(e));

    lastMock.onclose?.(new CloseEvent("close"));

    expect(events).toEqual([{ type: "gatewayDisconnected" }]);
    adapter.dispose();
  });

  it("replays the last lifecycle event to late subscribers", () => {
    const adapter = new WsAdapter("ws://test");
    lastMock.onopen?.(new Event("open"));

    const lateEvents: ConnectionEvent[] = [];
    adapter.connectionEvents().subscribe((e) => lateEvents.push(e));

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
    adapter.connectionEvents().subscribe((e) => events.push(e));
    adapter.dispose();
    lastMock.onclose?.(new CloseEvent("close"));
    expect(events).toEqual([]);
  });

  it("emits reconnectAttempt when the reconnect timer fires", () => {
    const adapter = new WsAdapter("ws://test", { reconnectDelayMs: 50 });
    const events: ConnectionEvent[] = [];
    adapter.connectionEvents().subscribe((e) => events.push(e));

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
      JSON.stringify({ type: "subscribe.pricing", payload: { symbol: "EURUSD" } }),
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
