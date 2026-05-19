# Phase 5D — Real Gateway-Events Adapter Design

**Date:** 2026-05-19
**Status:** Spec (pending plan + execution)
**Phase:** 5D — Real gateway-events adapter; delete `withSyntheticGatewayConnected`
**Predecessor phases:** 5C (port contract tests) DONE on 2026-05-18

## Goal

Replace the synthetic `withSyntheticGatewayConnected` wrapper in `packages/client/src/app/composition.ts` with real gateway-events adapters, one per transport mode. After this phase:

- WS-real mode emits `gatewayConnected`/`gatewayDisconnected` from `WsAdapter`'s actual `onopen`/`onclose` lifecycle.
- Simulator mode emits a single one-shot `gatewayConnected` from a dedicated `ConnectionEventsSimulator`.
- The `ConnectionEventsPort` returned by `buildDefaultPorts` is constructed by merging the chosen gateway source with the existing `BrowserConnectionEventsAdapter`.
- `withSyntheticGatewayConnected` is deleted from `composition.ts` and removed from the `@rtc/client` exports.
- The connection state machine gains one transition: `CONNECTING + gatewayDisconnected → DISCONNECTED`, so a server-down-on-boot surfaces correctly.

This was Phase 3 follow-up #1 (recorded in `docs/superpowers/STATUS.md`).

## Why now

Phase 3 shipped the connection state machine + `ConnectionEventsPort` but plugged in `withSyntheticGatewayConnected` as an interim fix to make the state machine usable without a real gateway-events source. The synthetic wrapper has two real-world bugs:

1. **WS-real boot lies.** Initial `gatewayConnected` fires synchronously before any WebSocket attempt completes. If the server is unreachable, the UI shows "Connected" briefly before any later signal can flip it back. Users see a misleading transient state.
2. **WS-real reconnect lies.** Every `browserOnline` event triggers a synthetic `gatewayConnected`, regardless of whether the WebSocket has actually re-established. Network restoration is *not* the same event as gateway restoration.

The synthetic wrapper was also a discoverability liability — new contributors hitting the connection layer have to first understand that the events they see are not the real lifecycle events the names suggest.

Phase 5C just landed the `IWsAdapter` interface + `FakeWsAdapter`, which gives us a clean place to add a connection-lifecycle observation method that's testable without a real WebSocket. Now is the right time.

## Architecture

```
            ┌─────────────────────────────────┐
            │     ConnectionStatusUseCase      │   (unchanged)
            │   reads ConnectionEventsPort     │
            └────────────────▲────────────────┘
                             │
                  ConnectionEventsPort
                  (composition root merges N sources)
                             │
       ┌─────────────────────┼─────────────────────────┐
       │                                               │
┌──────┴───────────────────┐                ┌──────────┴──────────┐
│  Gateway events           │                │ Browser events       │
│                           │                │  (unchanged)         │
│  WS-real mode:            │                │  BrowserConnection   │
│   WsConnectionEvents      │                │  EventsAdapter       │
│   Adapter                 │                │  (window online/     │
│   ←  IWsAdapter           │                │   offline + idle/    │
│      .connectionEvents()  │                │   userActivity)      │
│                           │                │                      │
│  Simulator mode:          │                │                      │
│   ConnectionEvents-       │                │                      │
│   Simulator               │                │                      │
│   (of gatewayConnected)   │                │                      │
└───────────────────────────┘                └──────────────────────┘
```

Three concrete components, three responsibilities. The composition root chooses one gateway source by transport mode and merges with the browser source via a plain `merge(...)`. There is no merging wrapper class; the composition root *is* the wiring layer.

The merge is the only point in the system where gateway events and browser events appear together. The state machine itself sees a single unified `ConnectionEvent` stream and doesn't know the difference — exactly the invariant the synthetic wrapper preserved while lying about the source.

### Considered alternatives

- **Single `CompositeConnectionEventsAdapter` class** that takes N inner ports and merges them. Rejected — composition root is the natural place for this wiring; introducing a wrapper class adds indirection without adding behavior.
- **Public Observable property on concrete `WsAdapter`** instead of extending `IWsAdapter`. Rejected — would require a separate (non-`FakeWsAdapter`) test fake just for `WsConnectionEventsAdapter`, breaking the Phase 5C testing pattern.
- **New `IConnectionEventsSource` interface separate from `IWsAdapter`.** Rejected — pure ceremony; `WsAdapter` owns the WebSocket and its lifecycle is a property of the same transport object that delivers messages. One interface is honest.

## Components

| File | Action | Role |
|---|---|---|
| `packages/client/src/app/adapters/IWsAdapter.ts` | Modify | Add `connectionEvents(): Observable<ConnectionEvent>` method. |
| `packages/client/src/app/adapters/WsAdapter.ts` | Modify | Back the new method with a `ReplaySubject<ConnectionEvent>(1)`. `onopen` emits `gatewayConnected`; `onclose` emits `gatewayDisconnected`. `dispose()` completes the subject. |
| `packages/client/src/app/adapters/__test__/FakeWsAdapter.ts` | Modify | Same `ReplaySubject<ConnectionEvent>(1)` backing. Test-only `emitConnectionEvent(type)` method. `dispose()` completes the subject. |
| `packages/client/src/app/adapters/WsConnectionEventsAdapter.ts` | Create | `implements ConnectionEventsPort`. Constructor takes `IWsAdapter`. `events()` delegates to `ws.connectionEvents()`. |
| `packages/client/src/app/adapters/WsConnectionEventsAdapter.test.ts` | Create | Unit test using `FakeWsAdapter` — lifecycle round-trip + replay semantics. |
| `packages/domain/src/simulators/ConnectionEventsSimulator.ts` | Create | `implements ConnectionEventsPort`. `events()` returns `of({type:"gatewayConnected"})`. Pure RxJS, no browser deps — lives with the other simulators. |
| `packages/domain/src/simulators/ConnectionEventsSimulator.test.ts` | Create | Trivial: assert one emission of `{type:"gatewayConnected"}` then completes. |
| `packages/domain/src/simulators/index.ts` | Modify | Re-export `ConnectionEventsSimulator`. |
| `packages/domain/src/index.ts` | Modify | Re-export `ConnectionEventsSimulator`. |
| `packages/domain/src/connection/connectionStatus.ts` | Modify | Add `case "gatewayDisconnected": return ConnectionStatus.DISCONNECTED;` in the `CONNECTING` case. |
| `packages/domain/src/connection/connectionStatus.test.ts` | Modify | Add test asserting `CONNECTING → DISCONNECTED on gatewayDisconnected`. |
| `packages/client/src/app/adapters/WsAdapter.test.ts` | Create | New file. Verify `connectionEvents()` emits on `onopen`/`onclose` and replays the last event to late subscribers. |
| `packages/client/src/app/adapters/__test__/FakeWsAdapter.test.ts` | Modify | Add coverage for `emitConnectionEvent` and replay behavior. |
| `packages/client/src/app/composition.ts` | Modify | Delete `withSyntheticGatewayConnected`. Rebuild `buildDefaultPorts` to construct the gateway source by URL, then `merge(...)` with `BrowserConnectionEventsAdapter`. |
| `packages/client/src/index.ts` | Modify | Drop `withSyntheticGatewayConnected` from the public re-exports. |
| `tests/scenarios/presenter/_buildApp.ts` | Modify | Drop `withSyntheticGatewayConnected` import. Construct ports as `merge(new ConnectionEventsSimulator().events(), connectionEvents$)`. |
| `tests/scenarios/presenter/_shared/connection.ts` | Modify | `browserComesBackOnline` pushes both `{type:"browserOnline"}` and `{type:"gatewayConnected"}` to mirror real-WS recovery. |
| `docs/architecture.md` | Modify | §5.1 state diagram gains the new transition. New short paragraph (near §3.3) describing the gateway-events adapter pair. |
| `docs/superpowers/STATUS.md` | Modify | Flip Phase 5D row to ✅ DONE with SHA range; record follow-ups. |

## Data flow

### WS-real mode, server reachable

```
t=0    new WsAdapter() → new WebSocket(url) [readyState=CONNECTING]
t=0    UseCase subscribes → startWith(CONNECTING) emits CONNECTING (UI: "Connecting…")
t=0.2  ws.onopen → connectionEvents$.next({type:"gatewayConnected"})
       → ConnectionStatusUseCase: CONNECTING → CONNECTED (UI: "Connected")
```

### WS-real mode, server unreachable on boot

```
t=0    new WsAdapter() → new WebSocket(url) [readyState=CONNECTING]
t=0    UseCase emits CONNECTING (UI: "Connecting…")
t=1    ws.onclose (TCP refused) → connectionEvents$.next({type:"gatewayDisconnected"})
       → state machine (with new transition): CONNECTING → DISCONNECTED (UI: "Disconnected")
t=4    reconnect tick → new WebSocket → onclose → emit gatewayDisconnected
       → state machine: DISCONNECTED + gatewayDisconnected = no-op (already there)
...    repeat every 3s until server is reachable...
t=30   ws.onopen (server up) → emit gatewayConnected
       → state machine: DISCONNECTED → CONNECTED (UI: "Connected")
```

### Mid-session gateway drop and recovery

```
state=CONNECTED
ws.onclose (server restart) → emit gatewayDisconnected
  → state: CONNECTED → DISCONNECTED (UI: "Disconnected")
... 3s later, ws reconnects ...
ws.onopen → emit gatewayConnected
  → state: DISCONNECTED → CONNECTED (UI: "Connected")
```

### Browser goes offline mid-session and returns

```
state=CONNECTED
window 'offline' → browser adapter emits browserOffline
  → state: CONNECTED → OFFLINE_DISCONNECTED (UI: "Offline")
(concurrently: WebSocket likely closes, browser adapter also emits gatewayDisconnected
 → state: OFFLINE_DISCONNECTED + gatewayDisconnected = default = stays OFFLINE_DISCONNECTED ✓)

window 'online' → browser adapter emits browserOnline
  → state: OFFLINE_DISCONNECTED → CONNECTING (UI: "Connecting…")
... ws reconnect cycle...
ws.onopen → emit gatewayConnected
  → state: CONNECTING → CONNECTED (UI: "Connected")
```

The merged stream is **idempotent** for the state machine: redundant `gatewayDisconnected` events while in `DISCONNECTED` or `OFFLINE_DISCONNECTED` are no-ops by the state machine's default branches.

### Simulator mode, normal boot

```
t=0    ConnectionEventsSimulator.events() = of({type:"gatewayConnected"})
t=0    UseCase emits CONNECTING then immediately CONNECTED
```

The `of(...)` emits synchronously on subscribe, so the simulator branch is functionally equivalent to the old synthetic startup emission, with no lie.

## Subject choice: `ReplaySubject(1)`

`WsAdapter.connectionEvents$` and `FakeWsAdapter.connectionEvents$` are both `ReplaySubject<ConnectionEvent>(1)`. This guarantees a late subscriber receives the most recent lifecycle event.

| Choice | Late subscriber receives | Risk |
|---|---|---|
| `ReplaySubject(1)` (chosen) | Last gateway event (correct current state) | None — every event is idempotent w.r.t. the state machine |
| `Subject` | Nothing until next lifecycle event | Subscriber subscribing after `onopen` stays at `CONNECTING` because the event already passed |
| `BehaviorSubject(gatewayDisconnected)` | An initial `gatewayDisconnected` even before any real WS activity | Pollutes boot with a misleading transition |

In practice today there is exactly one subscriber via `ConnectionStatusPresenter`, but correctness should hold under future presenters too.

## State machine change

`packages/domain/src/connection/connectionStatus.ts`, the `CONNECTING` case currently handles `gatewayConnected` and `browserOffline`, then `default: return current`. Add `case "gatewayDisconnected": return ConnectionStatus.DISCONNECTED;` so server-down on boot surfaces.

New test in `connectionStatus.test.ts`:

```ts
it("CONNECTING -> DISCONNECTED on gatewayDisconnected (boot-time server-down)", () => {
  expect(
    nextConnectionStatus(ConnectionStatus.CONNECTING, { type: "gatewayDisconnected" }),
  ).toBe(ConnectionStatus.DISCONNECTED);
});
```

Existing tests are unaffected.

## Test strategy

### Unit tests added (new)

- `packages/client/src/app/adapters/WsAdapter.test.ts` — new file. Mock the global `WebSocket` constructor. Assert:
  - Calling `onopen` emits one `{type:"gatewayConnected"}` to a subscriber.
  - Calling `onclose` emits one `{type:"gatewayDisconnected"}`.
  - A second subscriber after the first emission receives the replayed last event.
  - `dispose()` completes the subject.
- `packages/client/src/app/adapters/WsConnectionEventsAdapter.test.ts` — new file. Use `FakeWsAdapter`. Assert:
  - Calling `ws.emitConnectionEvent("gatewayConnected")` reaches the adapter's `events()` subscriber.
  - Two subscribers receive equivalent values (multi-cast under replay).
- `packages/domain/src/simulators/ConnectionEventsSimulator.test.ts` — new file. Assert single emission of `{type:"gatewayConnected"}` then complete.

### Existing tests modified

- `packages/domain/src/connection/connectionStatus.test.ts` — add one test for the new transition.
- `packages/client/src/app/adapters/__test__/FakeWsAdapter.test.ts` — add coverage for `emitConnectionEvent` + replay.

### Existing tests unchanged

- `packages/client/src/app/presenters/__tests__/ConnectionStatusPresenter.test.ts` — already driven by a `Subject<ConnectionEvent>`, no change needed.
- All other use-case + presenter tests — they don't touch `ConnectionEventsPort` directly.

### Presenter test matrix (cucumber-real, cucumber-fake, vitest-fake, vitest-plain)

Migration is mechanical:

- `tests/scenarios/presenter/_buildApp.ts` swaps `withSyntheticGatewayConnected(...)` for `merge(new ConnectionEventsSimulator().events(), connectionEvents$)`.
- `tests/scenarios/presenter/_shared/connection.ts`'s `browserComesBackOnline` pushes both `browserOnline` and `gatewayConnected` (the latter mirrors what a real WS adapter does on network return).
- Scenario files (`tests/specs/connection.feature`) and step files do not change.

### Browser e2e matrix (Playwright × 2 peers, Cypress × 2 peers)

No deliberate test changes. The browser peers run against a real WebSocket server, so the new `WsAdapter.onopen`/`onclose` path is what gets exercised. The four `tests/specs/connection.feature` scenarios should pass on all four peers because:

- "connected status is shown" — the real `WsAdapter` calls `onopen` after boot, emits `gatewayConnected`, state machine reaches CONNECTED. Same end state as before.
- "going offline shows the overlay" — `browserOffline` reaches OFFLINE_DISCONNECTED unchanged.
- "coming back online dismisses the overlay" — `browserOnline` → CONNECTING. The browser-driven Playwright/Cypress test then exercises the real WebSocket reconnect cycle, which under `RECONNECT_DELAY_MS = 3_000` should fire `onopen` within the scenario's "5 second" budget. If it doesn't, surface as a Phase 5D follow-up — see Risks below.

### No port contract test added

`ConnectionEventsPort` has fundamentally divergent impls (simulator one-shot vs WS-real long-lived lifecycle) with no portable invariant to assert across both. Phase 5C's 8-port contract pattern doesn't extend naturally here; documented as a deliberate asymmetry.

## Composition snippet

After the migration, `buildDefaultPorts` in `packages/client/src/app/composition.ts` looks like:

```ts
import { merge } from "rxjs";
import { ConnectionEventsSimulator, type ConnectionEventsPort } from "@rtc/domain";
import { WsConnectionEventsAdapter } from "./adapters/WsConnectionEventsAdapter";

export function buildDefaultPorts(): AppPorts {
  const url = import.meta.env.VITE_SERVER_URL as string | undefined;
  const browser = new BrowserConnectionEventsAdapter();
  if (url) {
    const ws = new WsAdapter(url);
    const gateway = new WsConnectionEventsAdapter(ws);
    const connectionEvents: ConnectionEventsPort = {
      events: () => merge(gateway.events(), browser.events()),
    };
    return { ...createWsRealPorts(ws), connectionEvents };
  }
  const gateway = new ConnectionEventsSimulator();
  const connectionEvents: ConnectionEventsPort = {
    events: () => merge(gateway.events(), browser.events()),
  };
  return { ...createSimulatorPorts(), connectionEvents };
}
```

The `withSyntheticGatewayConnected` function is deleted from this file. The `@rtc/client` `index.ts` drops it from the re-exports.

## Implementation order

1. Add `CONNECTING → DISCONNECTED on gatewayDisconnected` to the state machine + test.
2. Extend `IWsAdapter` with `connectionEvents()`.
3. Implement `WsAdapter.connectionEvents()` via `ReplaySubject(1)` fed by `onopen`/`onclose`.
4. Implement `FakeWsAdapter.connectionEvents()` + `emitConnectionEvent` + update existing test.
5. Create `WsConnectionEventsAdapter` + unit test (uses `FakeWsAdapter`).
6. Create `ConnectionEventsSimulator` + unit test + barrel re-exports.
7. Create `WsAdapter.test.ts` (lifecycle round-trip + replay semantics with a mocked global `WebSocket`).
8. Migrate `composition.ts` — wire new adapters, delete `withSyntheticGatewayConnected`.
9. Drop the `withSyntheticGatewayConnected` re-export from `packages/client/src/index.ts`.
10. Migrate `tests/scenarios/presenter/_buildApp.ts` + `_shared/connection.ts` step-def.
11. Full verification pass: `pnpm build && pnpm typecheck && pnpm test && pnpm test:e2e` + presenter peers (cucumber-real, cucumber-fake, vitest-fake, vitest-plain).
12. Docs — `architecture.md` §5.1 state diagram + new adapter blurb. `STATUS.md` row flipped + SHA range + follow-ups.

Each step is a separate commit. The writing-plans skill will refine into per-step tasks.

## Scope guardrails

This phase **does not**:

- Introduce a reconnect-policy port or any explicit "RECONNECTING" state in the state machine. The state diagram has a `DISCONNECTED → CONNECTING : reconnectAttempt every 10s` arrow that isn't actually implemented today (no `reconnectAttempt` event type exists). Leaving as-is — fixing is orthogonal.
- Add a contract test layer for `ConnectionEventsPort`. Documented as a deliberate asymmetry; impls are fundamentally divergent.
- Touch the server. `@rtc/server` doesn't currently signal anything beyond TCP-level WebSocket lifecycle; ping/pong heartbeats would be a separate phase.
- Split `WsAdapter.ts` into multiple files. The lifecycle additions stay inside the existing class. If the file gets meaningfully tangled, that's a follow-up.

## Risks

1. **Browser e2e timing on "coming back online dismisses the overlay."** The scenario currently relies on the synthetic event firing instantly. After 5D the real WS adapter has to actually reconnect, which under `RECONNECT_DELAY_MS = 3_000` (plus WebSocket handshake time) may approach the scenario's "within 5 seconds" budget on slow CI. If it flakes, options are: bump the budget, drop `RECONNECT_DELAY_MS`, or accept the scenario gets a +1s margin.
2. **Double `gatewayDisconnected` on offline transition.** When the browser goes offline, both the browser adapter (immediate `browserOffline`) and the WS adapter (`onclose` from TCP teardown) fire events. The state machine handles this correctly via default branches, but worth understanding when reading logs.
3. **`WsAdapter.ts` cleanliness.** Adding lifecycle observation alongside reconnect + RPC tracking may make the file harder to read. We'll size up at end-of-phase; if it's tangled, follow-up to split.

## Follow-ups (to record in STATUS.md once shipped)

1. `WsAdapter.ts` size review — is the lifecycle code clean alongside reconnect/RPC, or should it be split?
2. `RECONNECT_DELAY_MS = 3_000` is hard-coded; consider making configurable for tests and for production fine-tuning.
3. State diagram's aspirational `DISCONNECTED → CONNECTING : reconnectAttempt every 10s` arrow — implement (new `reconnectAttempt` event) or remove from the diagram.
4. Investigate the double `gatewayDisconnected` on browser-offline (browser adapter + WS adapter both emit). The state machine handles it, but the duplication is conceptually ugly.
5. Browser e2e flakiness watch — first run after wire-up may surface timing issues with the 5s budget for "coming back online dismisses the overlay."
6. Consider whether `ConnectionEventsPort` warrants a portable contract test once we have a richer suite of impls (e.g., a future server-side health-ping adapter).
