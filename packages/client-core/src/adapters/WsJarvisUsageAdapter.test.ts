import { describe, expect, it } from "vitest";

import { CLIENT_MSG, type JarvisUsageSnapshot, SERVER_MSG } from "@rtc/shared";

import { FakeWsAdapter } from "./__tests__/FakeWsAdapter";
import { WsJarvisUsageAdapter } from "./WsJarvisUsageAdapter";

const SNAPSHOT: JarvisUsageSnapshot = {
  windowStartMs: 1_000,
  windowEndMs: 2_000,
  currentWindow: [
    {
      brain: "claude-haiku-4-5",
      turns: 3,
      inputTokens: 100,
      outputTokens: 50,
      cacheReadTokens: 0,
      cacheCreationTokens: 0,
      estimatedCostUsd: 0.01,
    },
  ],
  sinceBoot: [],
};

describe("WsJarvisUsageAdapter", () => {
  it("does nothing until a gatewayConnected event, then registers the handler and sends admin.jarvisUsage.subscribe", () => {
    const ws = new FakeWsAdapter();
    const adapter = new WsJarvisUsageAdapter(ws);
    const received: JarvisUsageSnapshot[] = [];
    adapter.usage$().subscribe((snapshot) => {
      received.push(snapshot);
    });

    expect(ws.sentMessages()).toEqual([]);

    ws.emitConnectionEvent("gatewayConnected");

    expect(ws.sentMessages()).toEqual([
      { type: CLIENT_MSG.ADMIN_JARVIS_USAGE_SUBSCRIBE, payload: undefined },
    ]);
    expect(received).toEqual([]);
  });

  it("forwards every SERVER_MSG.ADMIN_JARVIS_USAGE push", () => {
    const ws = new FakeWsAdapter();
    const adapter = new WsJarvisUsageAdapter(ws);
    const received: JarvisUsageSnapshot[] = [];
    adapter.usage$().subscribe((snapshot) => {
      received.push(snapshot);
    });

    ws.emitConnectionEvent("gatewayConnected");
    ws.emit(SERVER_MSG.ADMIN_JARVIS_USAGE, SNAPSHOT);

    expect(received).toEqual([SNAPSHOT]);
  });

  it("RECONNECT: a new gatewayConnected event re-sends admin.jarvisUsage.subscribe and re-arms the listener", () => {
    const ws = new FakeWsAdapter();
    const adapter = new WsJarvisUsageAdapter(ws);
    const received: JarvisUsageSnapshot[] = [];
    adapter.usage$().subscribe((snapshot) => {
      received.push(snapshot);
    });

    ws.emitConnectionEvent("gatewayConnected");
    ws.emit(SERVER_MSG.ADMIN_JARVIS_USAGE, SNAPSHOT);

    ws.emitConnectionEvent("gatewayDisconnected");
    ws.emitConnectionEvent("gatewayConnected");
    const secondSnapshot: JarvisUsageSnapshot = {
      ...SNAPSHOT,
      windowStartMs: 3_000,
    };
    ws.emit(SERVER_MSG.ADMIN_JARVIS_USAGE, secondSnapshot);

    expect(
      ws.sentMessages().filter((m) => {
        return m.type === CLIENT_MSG.ADMIN_JARVIS_USAGE_SUBSCRIBE;
      }),
    ).toHaveLength(2);
    expect(received).toEqual([SNAPSHOT, secondSnapshot]);
  });

  it("unsubscribing tears down the handler — a later frame or reconnect emits nothing further", () => {
    const ws = new FakeWsAdapter();
    const adapter = new WsJarvisUsageAdapter(ws);
    const received: JarvisUsageSnapshot[] = [];
    const subscription = adapter.usage$().subscribe((snapshot) => {
      received.push(snapshot);
    });
    ws.emitConnectionEvent("gatewayConnected");
    subscription.unsubscribe();

    ws.emit(SERVER_MSG.ADMIN_JARVIS_USAGE, SNAPSHOT);
    ws.emitConnectionEvent("gatewayConnected");
    expect(received).toEqual([]);
  });
});
