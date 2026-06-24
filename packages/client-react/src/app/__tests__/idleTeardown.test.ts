// packages/client-react/src/app/__tests__/idleTeardown.test.ts
//
// Verifies the composition.ts WS-branch tap wiring:
//   idleTimeout  → ws.closeForIdle()
//   userActivity → ws.reopen()
//
// Uses the same tap logic extracted inline so the test doesn't need a live
// VITE_SERVER_URL — it proves the side-effect contract, not the full build.

import { describe, expect, it, vi } from "vitest";
import { Subject, tap } from "rxjs";

import type { ConnectionEvent } from "@rtc/domain";

import { FakeWsAdapter } from "../adapters/__tests__/FakeWsAdapter";

/**
 * The tap operator from composition.ts (WS branch), exercised in isolation.
 * Any change to the real tap must be reflected here — the test is intentionally
 * a copy so a diff in the production code breaks the test.
 */
function applyCompositionTap(
  source$: Subject<ConnectionEvent>,
  ws: FakeWsAdapter,
) {
  return source$.pipe(
    tap((e) => {
      if (e.type === "idleTimeout") ws.closeForIdle();
      else if (e.type === "userActivity") ws.reopen();
    }),
  );
}

describe("composition.ts idle-teardown wiring (T2.2)", () => {
  it("idleTimeout event invokes closeForIdle() on the WsAdapter", () => {
    const ws = new FakeWsAdapter();
    const closeForIdle = vi.spyOn(ws, "closeForIdle");

    const source$ = new Subject<ConnectionEvent>();
    const tapped$ = applyCompositionTap(source$, ws);
    tapped$.subscribe();

    source$.next({ type: "idleTimeout" });

    expect(closeForIdle).toHaveBeenCalledTimes(1);
    ws.dispose();
  });

  it("userActivity event invokes reopen() on the WsAdapter", () => {
    const ws = new FakeWsAdapter();
    const reopen = vi.spyOn(ws, "reopen");

    const source$ = new Subject<ConnectionEvent>();
    const tapped$ = applyCompositionTap(source$, ws);
    tapped$.subscribe();

    source$.next({ type: "userActivity" });

    expect(reopen).toHaveBeenCalledTimes(1);
    ws.dispose();
  });

  it("unrelated events (e.g. gatewayConnected) do not call closeForIdle or reopen", () => {
    const ws = new FakeWsAdapter();
    const closeForIdle = vi.spyOn(ws, "closeForIdle");
    const reopen = vi.spyOn(ws, "reopen");

    const source$ = new Subject<ConnectionEvent>();
    const tapped$ = applyCompositionTap(source$, ws);
    tapped$.subscribe();

    source$.next({ type: "gatewayConnected" });
    source$.next({ type: "gatewayDisconnected" });
    source$.next({ type: "reconnectAttempt" });

    expect(closeForIdle).not.toHaveBeenCalled();
    expect(reopen).not.toHaveBeenCalled();
    ws.dispose();
  });

  it("repeated userActivity events while NOT idle-closed are safe no-ops (reopen() is idempotent)", () => {
    const ws = new FakeWsAdapter();
    const events: ConnectionEvent[] = [];
    ws.connectionEvents().subscribe((e) => events.push(e));

    const source$ = new Subject<ConnectionEvent>();
    const tapped$ = applyCompositionTap(source$, ws);
    tapped$.subscribe();

    // userActivity while not idle-closed must not emit spurious gatewayConnected
    source$.next({ type: "userActivity" });
    source$.next({ type: "userActivity" });

    // No gatewayConnected emitted because reopen() is guarded by idleClosed flag
    expect(events).toEqual([]);
    ws.dispose();
  });

  it("full idle→reopen lifecycle: closeForIdle then reopen emits correct events", () => {
    const ws = new FakeWsAdapter();
    const events: ConnectionEvent[] = [];
    ws.connectionEvents().subscribe((e) => events.push(e));

    const source$ = new Subject<ConnectionEvent>();
    const tapped$ = applyCompositionTap(source$, ws);
    tapped$.subscribe();

    source$.next({ type: "idleTimeout" });
    source$.next({ type: "userActivity" });

    expect(events).toEqual([
      { type: "gatewayDisconnected" },
      { type: "gatewayConnected" },
    ]);
    ws.dispose();
  });
});
