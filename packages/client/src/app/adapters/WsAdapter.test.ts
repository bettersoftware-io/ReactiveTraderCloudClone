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
  vi.stubGlobal(
    "WebSocket",
    vi.fn().mockImplementation(() => {
      lastMock = new MockWebSocket();
      return lastMock;
    }),
  );
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
