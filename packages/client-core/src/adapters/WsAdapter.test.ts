// packages/client-core/src/adapters/WsAdapter.test.ts

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ConnectionEvent } from "@rtc/domain";

import { lastMock, MockWebSocket } from "./MockWebSocket.testHelpers";
import { WsAdapter } from "./WsAdapter";

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
    const adapter = new WsAdapter("ws://test", () => {
      return undefined;
    });
    const events: ConnectionEvent[] = [];
    adapter.connectionEvents().subscribe((e) => {
      return events.push(e);
    });

    lastMock.onopen?.(new Event("open"));

    expect(events).toEqual([{ type: "gatewayConnected" }]);
    adapter.dispose();
  });

  it("emits gatewayDisconnected when the WebSocket closes", () => {
    const adapter = new WsAdapter("ws://test", () => {
      return undefined;
    });
    const events: ConnectionEvent[] = [];
    adapter.connectionEvents().subscribe((e) => {
      return events.push(e);
    });

    lastMock.onclose?.(new CloseEvent("close"));

    expect(events).toEqual([{ type: "gatewayDisconnected" }]);
    adapter.dispose();
  });

  it("replays the last lifecycle event to late subscribers", () => {
    const adapter = new WsAdapter("ws://test", () => {
      return undefined;
    });
    lastMock.onopen?.(new Event("open"));

    const lateEvents: ConnectionEvent[] = [];
    adapter.connectionEvents().subscribe((e) => {
      return lateEvents.push(e);
    });

    expect(lateEvents).toEqual([{ type: "gatewayConnected" }]);
    adapter.dispose();
  });

  it("dispose() completes the subject", () => {
    const adapter = new WsAdapter("ws://test", () => {
      return undefined;
    });
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
    const adapter = new WsAdapter("ws://test", () => {
      return undefined;
    });
    const events: ConnectionEvent[] = [];
    adapter.connectionEvents().subscribe((e) => {
      return events.push(e);
    });
    adapter.dispose();
    lastMock.onclose?.(new CloseEvent("close"));
    expect(events).toEqual([]);
  });

  it("emits reconnectAttempt when the reconnect timer fires", () => {
    const adapter = new WsAdapter(
      "ws://test",
      () => {
        return undefined;
      },
      {
        reconnectDelayMs: 50,
      },
    );
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
    const adapter = new WsAdapter("ws://test", () => {
      return undefined;
    });
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
    const adapter = new WsAdapter("ws://test", () => {
      return undefined;
    });
    lastMock.readyState = MockWebSocket.OPEN;
    lastMock.onopen?.(new Event("open"));

    adapter.send("subscribe.blotter");

    expect(lastMock.send).toHaveBeenCalledWith(
      JSON.stringify({ type: "subscribe.blotter" }),
    );
    adapter.dispose();
  });

  it("uses the configured reconnectDelayMs for scheduling reconnect", () => {
    const adapter = new WsAdapter(
      "ws://test",
      () => {
        return undefined;
      },
      {
        reconnectDelayMs: 50,
      },
    );
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

  it("scheduleReconnect() cancels a pending timer when a second close races before the first fires", () => {
    // This exercises lines 126-127 (clearTimeout/null inside scheduleReconnect).
    // The adapter opens, closes (schedules timer@50ms), reconnects immediately,
    // then closes again (a second timer is scheduled, cancelling the first).
    // Only ONE extra socket is built — not two.
    const adapter = new WsAdapter(
      "ws://test",
      () => {
        return undefined;
      },
      {
        reconnectDelayMs: 50,
      },
    );
    const firstMock = lastMock;
    const events: ConnectionEvent[] = [];
    adapter.connectionEvents().subscribe((e) => {
      return events.push(e);
    });

    // First open/close — schedules timer
    firstMock.onopen?.(new Event("open"));
    firstMock.onclose?.(new CloseEvent("close"));

    // Before timer fires: advance 49ms (still 1 socket)
    vi.advanceTimersByTime(49);
    expect(MockWebSocket.constructed).toBe(1);

    // Fire the timer: reconnect attempt builds socket #2
    vi.advanceTimersByTime(1);
    expect(MockWebSocket.constructed).toBe(2);
    const secondMock = lastMock;

    // socket #2 closes immediately before its reconnect timer fires — triggers
    // the clearTimeout branch in scheduleReconnect (lines 126-127)
    secondMock.onopen?.(new Event("open"));
    secondMock.onclose?.(new CloseEvent("close"));

    // Advance past first delay but not yet to second
    vi.advanceTimersByTime(49);
    expect(MockWebSocket.constructed).toBe(2); // still no new socket

    // Full second delay elapsed → reconnect timer fires
    vi.advanceTimersByTime(1);
    expect(MockWebSocket.constructed).toBe(3);

    adapter.dispose();
  });
});

describe("WsAdapter token-at-connect", () => {
  it("appends ?access=<token> to the connected socket URL when the provider returns a token", () => {
    const adapter = new WsAdapter("ws://test", () => {
      return "tok-abc";
    });
    expect(lastMock.url).toBe("ws://test/?access=tok-abc");
    adapter.dispose();
  });

  it("connects to the bare URL (no ?access=) when the provider returns undefined", () => {
    const adapter = new WsAdapter("ws://test", () => {
      return undefined;
    });
    expect(lastMock.url).toBe("ws://test");
    expect(lastMock.url).not.toContain("?access=");
    adapter.dispose();
  });

  it("reads the token fresh on every reconnect", () => {
    let token: string | undefined = "tok-1";
    const adapter = new WsAdapter(
      "ws://test",
      () => {
        return token;
      },
      { reconnectDelayMs: 50 },
    );
    expect(lastMock.url).toBe("ws://test/?access=tok-1");

    token = "tok-2";
    lastMock.onopen?.(new Event("open"));
    lastMock.onclose?.(new CloseEvent("close"));
    vi.advanceTimersByTime(50);

    expect(lastMock.url).toBe("ws://test/?access=tok-2");
    adapter.dispose();
  });
});

describe("WsAdapter.closeForIdle() / reopen()", () => {
  it("(a) closeForIdle() closes the socket and suppresses auto-reconnect", () => {
    const adapter = new WsAdapter(
      "ws://test",
      () => {
        return undefined;
      },
      {
        reconnectDelayMs: 50,
      },
    );
    const events: ConnectionEvent[] = [];
    adapter.connectionEvents().subscribe((e) => {
      return events.push(e);
    });

    lastMock.onopen?.(new Event("open"));
    adapter.closeForIdle();
    lastMock.onclose?.(new CloseEvent("close"));

    // Must NOT schedule a reconnect — advancing well past delay should not build a new socket
    vi.advanceTimersByTime(200);
    expect(MockWebSocket.constructed).toBe(1);
    expect(events).toEqual([
      { type: "gatewayConnected" },
      { type: "gatewayDisconnected" },
    ]);
    adapter.dispose();
  });

  it("(b) reopen() constructs a fresh socket and flushes a subscription buffered while idle-closed", () => {
    const adapter = new WsAdapter(
      "ws://test",
      () => {
        return undefined;
      },
      {
        reconnectDelayMs: 50,
      },
    );

    lastMock.readyState = MockWebSocket.OPEN;
    lastMock.onopen?.(new Event("open"));

    // Close for idle
    adapter.closeForIdle();
    lastMock.onclose?.(new CloseEvent("close"));

    // Buffer a send while idle (socket is gone)
    adapter.send("subscribe.pricing", { symbol: "EURUSD" });
    expect(MockWebSocket.constructed).toBe(1);

    // User activity: reopen
    adapter.reopen();
    expect(MockWebSocket.constructed).toBe(2);

    // Simulate the new socket opening
    lastMock.readyState = MockWebSocket.OPEN;
    lastMock.onopen?.(new Event("open"));

    // Buffered message must have been flushed
    expect(lastMock.send).toHaveBeenCalledTimes(1);
    expect(lastMock.send).toHaveBeenCalledWith(
      JSON.stringify({
        type: "subscribe.pricing",
        payload: { symbol: "EURUSD" },
      }),
    );
    adapter.dispose();
  });

  it("(c) dispose() after closeForIdle() is terminal; reopen() is then a permanent no-op", () => {
    const adapter = new WsAdapter(
      "ws://test",
      () => {
        return undefined;
      },
      {
        reconnectDelayMs: 50,
      },
    );
    lastMock.onopen?.(new Event("open"));
    adapter.closeForIdle();
    lastMock.onclose?.(new CloseEvent("close"));

    adapter.dispose();

    // reopen() must be a no-op after dispose
    adapter.reopen();
    expect(MockWebSocket.constructed).toBe(1);
  });

  it("(d) closeForIdle() cancels a pending reconnect timer (lines 219-220)", () => {
    // Scenario: socket disconnects naturally → reconnect timer is pending →
    // user goes idle → closeForIdle() must cancel the timer so no auto-reconnect
    // fires later. This exercises the clearTimeout/null branch in closeForIdle().
    const adapter = new WsAdapter(
      "ws://test",
      () => {
        return undefined;
      },
      {
        reconnectDelayMs: 50,
      },
    );
    const events: ConnectionEvent[] = [];
    adapter.connectionEvents().subscribe((e) => {
      return events.push(e);
    });

    // Socket opens then closes naturally — schedules a reconnect timer
    lastMock.onopen?.(new Event("open"));
    lastMock.onclose?.(new CloseEvent("close"));
    // Confirm timer is pending (socket not yet rebuilt)
    vi.advanceTimersByTime(10);
    expect(MockWebSocket.constructed).toBe(1);

    // While timer is pending, idle fires — must cancel the timer
    adapter.closeForIdle();

    // Advance well past the reconnect delay: no new socket and no reconnectAttempt
    vi.advanceTimersByTime(200);
    expect(MockWebSocket.constructed).toBe(1);
    expect(
      events.some((e) => {
        return e.type === "reconnectAttempt";
      }),
    ).toBe(false);

    adapter.dispose();
  });

  it("(e) second closeForIdle() while already idle-closed is a no-op (idleClosed guard, line 216)", () => {
    // After the first idle close the adapter must ignore a duplicate call —
    // defensive guard against BrowserConnectionEventsAdapter re-emitting idleTimeout.
    const adapter = new WsAdapter(
      "ws://test",
      () => {
        return undefined;
      },
      {
        reconnectDelayMs: 50,
      },
    );
    lastMock.onopen?.(new Event("open"));

    adapter.closeForIdle();
    lastMock.onclose?.(new CloseEvent("close"));

    // Calling again must not throw and must not re-close or build a new socket
    expect(() => {
      return adapter.closeForIdle();
    }).not.toThrow();
    expect(MockWebSocket.constructed).toBe(1);

    adapter.dispose();
  });
});

describe("WsAdapter misc guards", () => {
  it("dispose() while a reconnect timer is pending cancels it (no reconnect after dispose)", () => {
    // dispose() clears the pending reconnect timer (clearTimeout), so the
    // scheduleReconnect callback never fires: advancing past the delay yields no
    // new socket and no reconnectAttempt. dispose() is terminal even when called
    // between onclose() and the timer firing. (The in-callback `if (this.disposed)
    // return` guard is defence-in-depth, not reached here since the timer is cancelled.)
    const adapter = new WsAdapter(
      "ws://test",
      () => {
        return undefined;
      },
      {
        reconnectDelayMs: 50,
      },
    );
    const events: ConnectionEvent[] = [];
    adapter.connectionEvents().subscribe((e) => {
      return events.push(e);
    });

    // Close schedules a reconnect timer
    lastMock.onclose?.(new CloseEvent("close"));

    // dispose() before the timer fires
    adapter.dispose();

    // Advance: timer fires, but disposed flag must suppress reconnectAttempt + connect
    vi.advanceTimersByTime(100);
    expect(MockWebSocket.constructed).toBe(1);
    // No reconnectAttempt should have been emitted
    expect(
      events.some((e) => {
        return e.type === "reconnectAttempt";
      }),
    ).toBe(false);
  });

  it("on() called twice for the same type adds both handlers (existing-set branch, line 178)", () => {
    // The false-branch of `if (!this.handlers.has(type))` skips `handlers.set`.
    // Both handlers must still receive messages because they share the same Set.
    const adapter = new WsAdapter("ws://test", () => {
      return undefined;
    });
    const receivedA: unknown[] = [];
    const receivedB: unknown[] = [];

    adapter.on("stream.priceTick", (p) => {
      return receivedA.push(p);
    });
    adapter.on("stream.priceTick", (p) => {
      return receivedB.push(p);
    }); // hits existing Set

    lastMock.readyState = MockWebSocket.OPEN;
    lastMock.onopen?.(new Event("open"));
    lastMock.onmessage?.(
      new MessageEvent("message", {
        data: JSON.stringify({
          type: "stream.priceTick",
          payload: { symbol: "EURUSD" },
        }),
      }),
    );

    expect(receivedA).toEqual([{ symbol: "EURUSD" }]);
    expect(receivedB).toEqual([{ symbol: "EURUSD" }]);
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
    const adapter = new WsAdapter("ws://test", () => {
      return undefined;
    });
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
    const adapter = new WsAdapter("ws://test", () => {
      return undefined;
    });
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
    const adapter = new WsAdapter("ws://test", () => {
      return undefined;
    });
    await expect(adapter.rpc("rpc.executeTrade", { foo: 1 })).rejects.toThrow(
      /WebSocket not connected/,
    );
    expect(lastMock.send).not.toHaveBeenCalled();
    adapter.dispose();
  });
  it("resolves an in-flight rpc() when its correlated response arrives", async () => {
    const adapter = new WsAdapter("ws://test", () => {
      return undefined;
    });
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
    const adapter = new WsAdapter("ws://test", () => {
      return undefined;
    });
    open(adapter);
    const pending = adapter.rpc("rpc.executeTrade", { foo: 1 });
    adapter.dispose();
    await expect(pending).rejects.toThrow(/WsAdapter disposed/);
  });
  it("waitForConnection() resolves immediately when already open", async () => {
    const adapter = new WsAdapter("ws://test", () => {
      return undefined;
    });
    lastMock.readyState = MockWebSocket.OPEN;
    lastMock.onopen?.(new Event("open"));
    await expect(adapter.waitForConnection()).resolves.toBeUndefined();
    adapter.dispose();
  });
  it("waitForConnection() resolves once the socket transitions to open", async () => {
    const adapter = new WsAdapter("ws://test", () => {
      return undefined;
    });
    const waited = adapter.waitForConnection();
    lastMock.readyState = MockWebSocket.OPEN;
    await vi.advanceTimersByTimeAsync(100);
    await expect(waited).resolves.toBeUndefined();
    adapter.dispose();
  });
  it("on() disposer stops the handler from receiving further messages of that type", () => {
    const adapter = new WsAdapter("ws://test", () => {
      return undefined;
    });
    const received: unknown[] = [];
    const dispose = adapter.on("stream.priceTick", (p) => {
      return received.push(p);
    });
    open(adapter);

    function frame(symbol: string): MessageEvent {
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
