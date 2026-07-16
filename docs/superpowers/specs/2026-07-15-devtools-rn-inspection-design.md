# RTC DevTools — React Native Inspection (WebSocket Relay)

**Date:** 2026-07-15
**Status:** Design approved (relay: standalone dev-machine process), implementation plan to follow
**Depends on:** [2026-07-11-custom-devtools-design.md](2026-07-11-custom-devtools-design.md) (v1 shipped) — realises future-extension §9.4
**Scope decisions (locked):**
- **Standalone dev-machine relay.** A small relay process runs on the developer's machine; the RN device connects out to it and the panel connects in. Devtools traffic stays entirely off the app's data socket and off the production `@rtc/server`.
- **Reuse the existing `DevtoolsTransport` port** — a new `WsRelayDuplex` adapter; the hub, protocol, `InspectorStore`/`InspectorClient`, and the four panels are untouched.
- **Same three decorators** applied at the RN composition root, exactly as `client-react` applies them.
- **Dev-only** — the relay and the RN-side devtools wiring are dev-build-gated; a production RN build ships no relay connection.

## 1. Why

The devtools' whole architecture is "swap a transport adapter, nothing else." v1 uses same-origin `BroadcastChannel`; the Chrome extension adds a `chrome.runtime` transport. React Native has neither a DOM `BroadcastChannel` nor a same-origin browser context — the app runs on a device/simulator and the inspector runs on the developer's machine. The natural bridge is a **WebSocket relay**: the RN app opens a socket to a relay on the dev machine, the panel (a normal web page, the existing `devtools-app`) opens another socket to the same relay, and the relay forwards frames between them. `transport.ts` already names "WebSocket relay (future)" as the anticipated adapter — this builds exactly that.

This closes the last inspection gap: the same four panels, the same protocol, now inspecting the mobile client live over the wire.

## 2. Approach

Three pieces; the protocol and UI are untouched.

### 2.1 `WsRelayDuplex` — the transport adapter

A `Duplex<TSend, TRecv>` over a WebSocket, structurally identical to `BroadcastChannelDuplex`:

```ts
export class WsRelayDuplex<TSend, TRecv> implements Duplex<TSend, TRecv> {
  constructor(url: string, role: "app" | "panel");
  // opens a WebSocket to `url`, tags itself app/panel in the connect query or
  // first frame, buffers pre-open sends (WsAdapter already establishes this
  // pattern), surfaces inbound frames on inbound$, reconnects on drop.
  send(msg: TSend): void;
  inbound$: Observable<TRecv>;
  dispose(): void;
}
```

- The **app side** (RN) uses `WsRelayDuplex<AppToInspector, InspectorToApp>` as the hub's `DevtoolsTransport`.
- The **panel side** (web) uses `WsRelayDuplex<InspectorToApp, AppToInspector>` — the flip — as the `InspectorClient`'s transport.

Reconnect + pre-open buffering mirror the existing `WsAdapter` (see `reference: WsAdapter buffers pre-open sends`), so a device reconnect or relay restart recovers via the v1 `InspectorClient` re-hello path.

### 2.2 The relay process

A tiny standalone WebSocket server (new package `@rtc/devtools-relay`, or a script under the RN package's dev tooling), dependency-light:

- Listens on a dev port (e.g. `ws://localhost:8790`).
- Each connection identifies as `app` or `panel` (query param or first frame).
- Forwards every frame from the app connection to the panel connection(s) and vice-versa. Stateless beyond the current connection pair — it holds no protocol knowledge, it just pipes bytes (like the Chrome-extension background router, but over sockets).
- Multiple panels may attach to one app (broadcast app→panels); panel→app frames forward to the single app connection.
- Logs connect/disconnect; on either side dropping, the other sees a closed socket and the `InspectorClient`/hub handle it via the existing liveness/`bye` paths (the panel-side liveness timeout from the hardening plan covers an abrupt device loss).

The relay carries **no** app data — only devtools frames — so it never touches the production `@rtc/server` or the app's WebSocket to it.

### 2.3 RN composition-root wiring

In `@rtc/client-react-native`, at the composition call site (where `createApp(buildNativePorts())` runs), apply the **same three decorators** `client-react` uses — `instrumentPresenters`, `instrumentMachineFactories`, `instrumentWsAdapter` — feeding a `DevtoolsHub` whose transport is a `WsRelayDuplex(url, "app")`. This is **dev-build-gated** (`__DEV__` in RN): a production RN build applies no decorators and opens no relay socket, so it ships dormant-and-disconnected exactly like the web app ships dormant.

The relay URL is a dev config (defaulting to the Metro host's `localhost:8790`, resolvable from the RN dev environment the way Metro's own host is).

## 3. What changes / what doesn't

**Adds:**
- `@rtc/devtools-core`: `WsRelayDuplex` (a new `Duplex`/`DevtoolsTransport` adapter; rxjs-only, no new runtime deps — it uses the platform `WebSocket`, present in both RN and browsers).
- New relay process (`@rtc/devtools-relay` or an RN dev script) — a standalone `ws` server, dev-only.
- `@rtc/client-react-native`: dev-gated composition-root decoration + hub + relay-transport wiring (mirrors `client-react`'s `devtoolsHub.ts` + presenter manifest).
- A `dev:devtools:relay` script to start the relay, and docs for pointing a browser `devtools-app` at it.

**Does NOT change:** the protocol, the hub internals, `InspectorStore`/`InspectorClient`, the four panels, or any RN app UI/domain. The panel is the *existing* `devtools-app`, served from anywhere (it just constructs a `WsRelayDuplex` instead of a `BroadcastChannelDuplex` — a small panel-side session variant, like the Chrome extension's `panelSession`).

## 4. Dormancy & safety

- **Prod RN build**: no decorators, no relay socket — zero devtools cost, same as web prod.
- **Dev RN build**: the hub is still dormant until a panel connects through the relay and its `InspectorClient` sends `hello`; opening the relay socket alone does not wake it (the hub goes live on `hello`, per v1). So a dev build with the relay running but no panel attached pays nothing beyond an idle socket.
- The relay carries only devtools frames and runs only on the dev machine — no production surface.

## 5. Testing

1. **`WsRelayDuplex` (unit, node):** with a fake WebSocket (a controllable double), assert send→socket, socket message→`inbound$`, pre-open buffering flushes on open, reconnect re-subscribes, dispose closes. Mirrors the `BroadcastChannelDuplex` + `WsAdapter` test discipline.
2. **Relay (unit/integration, node):** start the relay on an ephemeral port; connect a fake app + fake panel; assert app→panel and panel→app forwarding, multi-panel broadcast, and clean teardown on disconnect.
3. **RN wiring (unit, jsdom/RN test env):** the composition-root decoration is dev-gated — assert decorators applied under `__DEV__`, none in prod; assert the hub receives a `WsRelayDuplex`.
4. **End-to-end wiring (node):** hub (app-side `WsRelayDuplex`) ↔ relay ↔ `InspectorClient` (panel-side `WsRelayDuplex`) over real loopback sockets — assert the panel store observes streams/machines the RN-equivalent app emits (using the in-memory app harness, not a real device).
5. **Manual acceptance (documented):** run the relay, boot the RN dev client, open `devtools-app` in a browser pointed at the relay, confirm live panels + a disconnect on app background.

## 6. Non-goals / future

- **Auto-discovery** of the relay (mDNS/Metro integration) — v1 uses a configured URL.
- **Authentication on the relay** — dev-only localhost; a token could be added if exposed beyond localhost (future).
- **Bundling the panel into the RN dev menu** — v1 uses the existing browser `devtools-app`.
- **Device-farm / remote inspection** — localhost relay only.

## 7. Success criteria

1. With the relay running and a dev RN build booted, opening `devtools-app` (pointed at the relay) shows the four live panels inspecting the mobile client.
2. Closing/backgrounding the app flips the panel to "disconnected"; reconnecting recovers (re-hello + panel liveness timer).
3. A production RN build ships no relay connection and no decorators (dormant/disconnected by construction).
4. Protocol, hub, store/client, and panels are byte-unchanged — only a new transport adapter + RN wiring.
5. All gates green; `WsRelayDuplex` + relay + RN wiring unit-tested per §5.
