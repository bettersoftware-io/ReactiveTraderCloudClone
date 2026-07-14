# RTC DevTools — Chrome Extension Transport

**Date:** 2026-07-14
**Status:** Design approved (panel-surface decision: DevTools panel), implementation plan to follow
**Depends on:** [2026-07-11-custom-devtools-design.md](2026-07-11-custom-devtools-design.md) (v1 shipped — PR #188; reconnect #189, full-bleed #190, perf #191)
**Scope decisions (locked):**
- **DevTools panel** surface (an "RTC" tab inside Chrome DevTools) — not side-panel, not popup.
- **Observe-only**, exactly like v1 — the extension adds a transport, never a new capability.
- **Zero app-side changes** — the content-script bridge reuses the existing `rtc-devtools` BroadcastChannel name.
- **Unpacked dev extension** for v1 distribution (`chrome://extensions` → "Load unpacked"); no Chrome Web Store submission.
- **Reuse the existing inspector UI verbatim** — the four panels and `InspectorApp` are untouched.

## 1. Why

v1's inspector is served **same-origin** at `/devtools/` (client-react Vite
middleware in dev, `dist/devtools` in prod). BroadcastChannel is same-origin,
so that pairing only works when you can serve the panel from the app's own
origin — i.e. in local dev, or from the deployed bundle's own `/devtools/`
path. It cannot inspect an **arbitrary** running instance of the app from a
separate developer tool.

A Chrome extension removes that constraint: open Chrome DevTools on the
deployed app (or any instance), click the **RTC** panel, and the same live
inspector attaches. This is the credible "just like Redux DevTools" story, and
— per the v1 design's own §2 — it is meant to cost **only a new transport
adapter**, proving the port/adapter discipline end to end.

## 2. Approach

The inspector side already selects its transport in one place —
`@rtc/devtools-app/src/inspectorSession.ts` — and constructs a
`BroadcastChannelDuplex`. The transport contract is the framework-neutral
`Duplex<TSend, TRecv>` (`send` / `inbound$` / `dispose`) in
`@rtc/devtools-core/src/channel.ts`. `transport.ts` already names a
"WebSocket relay (future)" adapter as anticipated — the seam was built for
exactly this.

The extension is therefore a **third `Duplex` implementation** plus the MV3
plumbing to carry its bytes from the app tab to the DevTools panel:

```
App tab (any origin)                     Chrome extension
┌─────────────────────┐                  ┌────────────────────────────────────┐
│ DevtoolsHub          │ BroadcastChannel │ content script (injected in tab)   │
│  channel             │  'rtc-devtools'  │  new BroadcastChannel('rtc-devtools')│
│  'rtc-devtools' ◀───▶├─────────────────▶│         ▲                          │
│  (DORMANT until      │  (same-origin;   │         │ chrome.runtime port      │
│   hello arrives)     │   isolated world │         ▼                          │
└─────────────────────┘   still receives  │  background service worker (router)│
                          same-origin BC)  │         ▲                          │
                                           │         │ chrome.runtime port      │
                                           │         ▼                          │
                                           │  DevTools panel page               │
                                           │   InspectorApp (unchanged)         │
                                           │   + ChromeRuntimeDuplex ───────────┘
                                           └────────────────────────────────────┘
```

**What is added** (all new, in one new package):
1. `ChromeRuntimeDuplex implements Duplex<InspectorToApp, AppToInspector>` —
   the inspector-side transport, talking to the background SW over a long-lived
   `chrome.runtime.Port`.
2. A **content-script bridge** — injected into the app tab, opens
   `new BroadcastChannel('rtc-devtools')`, and relays messages both ways
   between that channel and a `chrome.runtime` port.
3. A **background service worker** — routes messages between the DevTools panel
   port (keyed by `chrome.devtools.inspectedWindow.tabId`) and the matching
   tab's content-script port.
4. A **DevTools page** (`chrome.devtools.panels.create("RTC", …)`) that mounts
   the existing `InspectorApp` with a `ChromeRuntimeDuplex` instead of a
   `BroadcastChannelDuplex`.
5. The **MV3 `manifest.json`** and a build that bundles all four entry points.

**What is NOT touched:** `protocol.ts`, `serialize.ts`, `DevtoolsHub`,
`InspectorClient`, `InspectorStore`, all four panels, `InspectorApp`, and the
entire app-side composition-root wiring. The content script speaks the same
`rtc-devtools` channel the app hub already listens on, so **no client-react
change is required**.

### 2.1 Why a content-script bridge (and not the panel talking BroadcastChannel directly)

A DevTools panel page runs in the extension's origin, not the inspected page's
origin, so it cannot open the app's same-origin `rtc-devtools` BroadcastChannel
itself. Only a **content script** injected into the app tab shares that origin.
Content scripts run in an "isolated world" but the *same document and origin*,
and BroadcastChannel delivery is origin-scoped across isolated worlds — so a
content-script `BroadcastChannel('rtc-devtools')` receives the page hub's
messages and its `postMessage` reaches the hub. The content script is the only
component that must live in the app's origin; everything else is extension-side.

### 2.2 Dormancy is preserved

The app hub ships **dormant** — registered but not subscribed until an inspector
sends `hello`. Injecting the content script does **not** wake the hub: the
bridge only forwards, and no `hello` is sent until the RTC **panel is opened**
and its `InspectorClient.start()` emits one. So the "the tap must never hurt the
app" invariant holds unchanged — an app tab with the extension installed but the
RTC panel never opened pays nothing beyond an idle, message-less BroadcastChannel
in the content script. (Optional refinement, §7: inject the content script lazily
only once the panel connects, via `chrome.scripting.executeScript`, so a closed
panel injects nothing at all.)

## 3. Package layout

New package `packages/devtools-extension/` (`@rtc/devtools-extension`,
`private: true`), built with Vite in library/multi-entry mode:

```
packages/devtools-extension/
  manifest.json              MV3 manifest (see §4)
  src/
    ChromeRuntimeDuplex.ts   Duplex<InspectorToApp, AppToInspector> over a runtime Port
    contentBridge.ts         content script: BroadcastChannel('rtc-devtools') <-> runtime Port
    background.ts            service worker: panel-port <-> content-port router keyed by tabId
    devtools.ts              chrome.devtools.panels.create("RTC", ...)
    panel/
      panel.html
      panel.tsx              mounts InspectorApp with a ChromeRuntimeDuplex
      panelSession.ts        the ChromeRuntimeDuplex variant of createInspectorSession()
  vite.config.ts             multi-entry: contentBridge, background, devtools, panel
  package.json               deps: @rtc/devtools-core, @rtc/devtools-app, react, react-dom
  tsconfig.json
  README.md
```

**Dependency direction (respects the architecture rule):** the extension is a
leaf consumer. It depends on `@rtc/devtools-core` (transport contract, protocol,
`InspectorClient`/`InspectorStore`) and on `@rtc/devtools-app` (the `InspectorApp`
component + panel CSS). Nothing depends on the extension. `@types/chrome` is a
devDependency for the `chrome.*` MV3 APIs.

**`@rtc/devtools-app` change (minimal, additive):** `InspectorApp` is already a
pure component taking a `store` prop (verified) — no logic moves. But the
package currently has **no `exports` field** (it's an app, not a library), so
the extension cannot `import { InspectorApp } from "@rtc/devtools-app"` yet. The
one change is to add an `exports` map exposing `InspectorApp` (and its
`InspectorApp.module.css`) as the package's public entry, leaving the existing
same-origin `/devtools/` build untouched. The BroadcastChannel wiring in
`main.tsx`/`inspectorSession.ts` stays as-is — the extension supplies its own
session module, it does not modify the app's.

## 4. MV3 manifest

```jsonc
{
  "manifest_version": 3,
  "name": "RTC DevTools",
  "version": "0.1.0",
  "description": "Live inspector for the Reactive Trader Cloud state layer.",
  "minimum_chrome_version": "116",
  "devtools_page": "devtools.html",
  "background": { "service_worker": "background.js", "type": "module" },
  "content_scripts": [
    {
      "matches": [
        "http://localhost:*/*",
        "http://127.0.0.1:*/*",
        "https://*.vercel.app/*"
      ],
      "js": ["contentBridge.js"],
      "run_at": "document_start"
    }
  ],
  "permissions": ["scripting"],
  "host_permissions": ["http://localhost:*/*", "https://*.vercel.app/*"]
}
```

- **Host scope, not `<all_urls>`:** matches the known RTC hosts (local dev ports
  + the Vercel deployment domains) rather than every site — smaller footprint,
  less alarming permission prompt, and honest about where the app runs. The
  exact production host(s) are pinned during implementation from the deploy
  topology (rtc-clone + Fly).
- `scripting` + `host_permissions` support the optional lazy-injection
  refinement (§7); the static `content_scripts` block is the baseline.

## 5. Message routing (the one piece with real MV3 subtlety)

MV3 service workers are **ephemeral** — killed after ~30s idle. The router must
therefore hold state only in a long-lived `chrome.runtime.Port`, which keeps the
SW alive while connected, and rebuild cleanly on reconnect:

1. Panel opens → `panelSession` connects a port `chrome.runtime.connect({ name: "rtc-panel:" + tabId })`, where `tabId = chrome.devtools.inspectedWindow.tabId`.
2. The SW's `onConnect` parses the tabId from the port name and stores `panelPorts[tabId] = port`.
3. The content script (already injected in that tab) connects a port `name: "rtc-content"`; the SW reads `port.sender.tab.id` and stores `contentPorts[tabId] = port`.
4. The SW relays every message on one port to its sibling for the same tabId; on either `onDisconnect` it drops both entries and, for the panel side, notifies the content bridge so it can close its BroadcastChannel.
5. Reconnect (SW restart, panel reload, app reload) re-establishes ports; the existing `InspectorClient` re-hello logic (PR #189) drives re-handshake with no special-casing.

`ChromeRuntimeDuplex.inbound$` is a `Subject` fed by `port.onMessage`; `send()`
is `port.postMessage`; `dispose()` disconnects the port and completes the
subject — structurally identical to `BroadcastChannelDuplex`, so `InspectorClient`
cannot tell the difference.

## 6. Testing strategy

The `chrome.*` APIs are not available in jsdom/node, so testing splits by layer:

1. **`ChromeRuntimeDuplex` (unit, node):** inject a fake `Port` (a plain object
   with `postMessage`, `onMessage.addListener`, `onDisconnect.addListener`,
   `disconnect`). Assert `send` → `postMessage`, `onMessage` → `inbound$`
   emission, `dispose` → `disconnect` + completed subject. Mirrors the existing
   `createInMemoryDuplexPair` discipline.
2. **Routing logic (unit, node):** extract the SW's routing into a pure
   `createRouter()` over injected port factories and assert tab-keyed relay +
   disconnect cleanup, without a real SW.
3. **Bridge relay (unit, node):** the content bridge's BC↔port relay is a pure
   function over injected `{ channel, port }` doubles.
4. **End-to-end wiring (unit, jsdom):** reuse the existing
   `createInMemoryDuplexPair` to drive `InspectorClient` + `InspectorStore`
   through a simulated ChromeRuntimeDuplex ↔ hub, proving the panel session
   observes streams/machines — the extension analogue of the existing
   `devtoolsIntegration.test.ts`. (Same rAF-flush await discipline: jsdom has
   `requestAnimationFrame`, so advance/`waitFor` past the ~64ms coalesced flush.)
5. **Manual acceptance (documented, not automated):** load unpacked, open the
   deployed app, open DevTools → RTC, confirm live streams/machines + a
   "disconnected" transition on app close. A real Chrome-driving e2e for a
   loaded extension is out of scope for v1 (the Playwright suite drives pages,
   not extension installs).

## 7. Non-goals / future

- **Chrome Web Store publication** — v1 is unpacked-dev only. Store submission
  (dev account, review, privacy disclosure) is a later, separate task.
- **Lazy content-script injection** via `chrome.scripting` — a refinement over
  the static `content_scripts` block; keeps a closed-panel app tab entirely
  script-free. Baseline ships the static block; lazy injection is an optional
  follow-up task in the plan.
- **Firefox / cross-browser** — MV3 is broadly portable but untested here; not v1.
- **Any observe→interact capability** (intent injection, time-travel) — remains
  the v1 devtools' documented future work, unchanged and orthogonal to transport.
- **React Native inspection** — the third anticipated transport; not this task.

## 8. Build & workspace integration

- Add `@rtc/devtools-extension` to the pnpm workspace; Turborepo picks it up by
  the framework-blind task graph (`build`/`typecheck`/`test`/`lint`), no config
  edit beyond the package's own scripts.
- A `dev:ext` root script (`turbo run build --filter @rtc/devtools-extension`)
  produces the unpacked bundle under `packages/devtools-extension/dist/`, ready
  to "Load unpacked".
- All standard gates apply per the repo's "every gate covers every package"
  rule: Biome, base + typed ESLint, typecheck, knip, `check:deps` (dependency-
  cruiser must allow the new leaf's inbound edges to devtools-core/-app),
  doc-links. The `@types/chrome` global types are wired via the package
  tsconfig, not a repo-wide change.

## 9. Success criteria

1. `pnpm build --filter @rtc/devtools-extension` yields a loadable unpacked MV3
   extension.
2. With it loaded, opening Chrome DevTools on a running RTC instance (local or
   deployed) shows an **RTC** panel that renders the four live panels and the
   connected app id.
3. Closing the app tab flips the panel to "disconnected"; reopening/reloading
   reconnects with no manual step (PR #189 re-hello path).
4. The app side is byte-for-byte unchanged; dormancy holds (an installed
   extension with the panel closed adds no app-side subscription).
5. All repo gates green; new transport + router + bridge unit-tested per §6.
