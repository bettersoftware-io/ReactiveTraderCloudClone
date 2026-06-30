// packages/client-react/src/app/__tests__/idleTeardown.test.ts
//
// Verifies the composition.ts WS-branch tap wiring:
//   idleTimeout  → ws.closeForIdle()
//   reconnect    → ws.reopen()         ← sole recovery from idle (Item 1)
//   userActivity → neither             ← resets countdown only, not socket
//
// Imports routeIdleLifecycle directly from composition.ts so that removing or
// misspelling the real wiring breaks this test (non-vacuous guard).

import { describe, expect, it, vi } from "vitest";

import type { IWsAdapter } from "@rtc/client-core";

import { routeIdleLifecycle } from "../composition";

describe("composition.ts idle-teardown wiring (T2.2)", () => {
  function makeWs(): Pick<IWsAdapter, "closeForIdle" | "reopen"> {
    return { closeForIdle: vi.fn(), reopen: vi.fn() };
  }

  it("idleTimeout event invokes closeForIdle() on the WsAdapter", () => {
    const ws = makeWs();
    routeIdleLifecycle({ type: "idleTimeout" }, ws);
    expect(ws.closeForIdle).toHaveBeenCalledTimes(1);
    expect(ws.reopen).not.toHaveBeenCalled();
  });

  it("reconnect event invokes reopen() on the WsAdapter (button-only recovery)", () => {
    const ws = makeWs();
    routeIdleLifecycle({ type: "reconnect" }, ws);
    expect(ws.reopen).toHaveBeenCalledTimes(1);
    expect(ws.closeForIdle).not.toHaveBeenCalled();
  });

  it("userActivity event no longer reopens the socket after an idle close", () => {
    const ws = makeWs();
    routeIdleLifecycle({ type: "userActivity" }, ws);
    expect(ws.reopen).not.toHaveBeenCalled();
    expect(ws.closeForIdle).not.toHaveBeenCalled();
  });

  it("unrelated events (e.g. gatewayConnected) do not call closeForIdle or reopen", () => {
    const ws = makeWs();
    routeIdleLifecycle({ type: "gatewayConnected" }, ws);
    routeIdleLifecycle({ type: "gatewayDisconnected" }, ws);
    routeIdleLifecycle({ type: "reconnectAttempt" }, ws);
    expect(ws.closeForIdle).not.toHaveBeenCalled();
    expect(ws.reopen).not.toHaveBeenCalled();
  });

  it("full idle→reconnect lifecycle: closeForIdle then reopen each called once", () => {
    const ws = makeWs();
    routeIdleLifecycle({ type: "idleTimeout" }, ws);
    routeIdleLifecycle({ type: "reconnect" }, ws);
    expect(ws.closeForIdle).toHaveBeenCalledTimes(1);
    expect(ws.reopen).toHaveBeenCalledTimes(1);
  });
});
