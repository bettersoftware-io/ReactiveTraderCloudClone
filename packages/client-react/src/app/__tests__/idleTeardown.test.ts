// packages/client-react/src/app/__tests__/idleTeardown.test.ts
//
// Verifies the composition.ts WS-branch tap wiring:
//   idleTimeout  → ws.closeForIdle()
//   userActivity → ws.reopen()
//
// Imports routeIdleLifecycle directly from composition.ts so that removing or
// misspelling the real wiring breaks this test (non-vacuous guard).

import { describe, expect, it, vi } from "vitest";

import { routeIdleLifecycle } from "../composition";

describe("composition.ts idle-teardown wiring (T2.2)", () => {
  function makeWs() {
    return { closeForIdle: vi.fn(), reopen: vi.fn() };
  }

  it("idleTimeout event invokes closeForIdle() on the WsAdapter", () => {
    const ws = makeWs();
    routeIdleLifecycle({ type: "idleTimeout" }, ws);
    expect(ws.closeForIdle).toHaveBeenCalledTimes(1);
    expect(ws.reopen).not.toHaveBeenCalled();
  });

  it("userActivity event invokes reopen() on the WsAdapter", () => {
    const ws = makeWs();
    routeIdleLifecycle({ type: "userActivity" }, ws);
    expect(ws.reopen).toHaveBeenCalledTimes(1);
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

  it("repeated userActivity events while NOT idle-closed are safe no-ops (reopen() is idempotent)", () => {
    const ws = makeWs();
    // The FakeWsAdapter guard for reopen() is tested in FakeWsAdapter.test.ts;
    // here we just confirm routeIdleLifecycle delegates to ws.reopen() each time.
    routeIdleLifecycle({ type: "userActivity" }, ws);
    routeIdleLifecycle({ type: "userActivity" }, ws);
    // The real WsAdapter.reopen() is guarded by idleClosed; the spy counts raw calls.
    expect(ws.reopen).toHaveBeenCalledTimes(2);
    expect(ws.closeForIdle).not.toHaveBeenCalled();
  });

  it("full idle→reopen lifecycle: closeForIdle then reopen each called once", () => {
    const ws = makeWs();
    routeIdleLifecycle({ type: "idleTimeout" }, ws);
    routeIdleLifecycle({ type: "userActivity" }, ws);
    expect(ws.closeForIdle).toHaveBeenCalledTimes(1);
    expect(ws.reopen).toHaveBeenCalledTimes(1);
  });
});
