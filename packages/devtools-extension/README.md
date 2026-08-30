# @rtc/devtools-extension

MV3 Chrome DevTools extension that attaches the RTC state inspector
(`@rtc/devtools-app`) to any running app instance — including the deployed
build — over a `chrome.runtime` transport.

## Architecture

A third `Duplex` behind the inspector's transport seam. Nothing in the protocol,
hub, `InspectorStore`/`InspectorClient`, or the store-first inspector changes:
a navigation tree (All / Presenters→streams / Machines→kind→instance /
Wire→msgType) drives one scoped selection, with scoped actions plus an
Event/State/Diff/Machine context pane and Clear.

- `ChromeRuntimeDuplex` — inspector-side transport over a reconnecting runtime port.
- `contentBridge` — injected into the app tab; relays the same-origin
  `rtc-devtools` BroadcastChannel ↔ `chrome.runtime`.
- `background` — tab-keyed router between panel and content ports.
- `devtools` / `panel` — registers the "RTC" DevTools panel and mounts `InspectorApp`.

Dormancy is preserved: only opening the RTC panel sends `hello`; an installed,
unopened extension costs the app nothing.

## Intent injection (parity with the same-origin inspector)

The panel reuses `InspectorApp` verbatim, so it carries the same **intent
injection** affordance as the same-origin `/devtools/` inspector (Machines tab):
firing a live machine's intent from the panel to reproduce state. It is
**dev-gated** — the panel only shows the injector when the connected app reports
`welcome.dev` (a dev build), and the app-side handler is dead-code-eliminated
from production, so an injected `intent:invoke` against a deployed app is a
silent no-op — and **confirm-gated** in the UI. The extension adds no new
capability: it wires the existing `onInvokeIntent` over the `chrome.runtime`
transport, exactly as the same-origin inspector wires it over BroadcastChannel.
See [`docs/architecture/20-devtools.md`](../../docs/architecture/20-devtools.md)
§20.6.1 (this transport) and §20.8 (the intent-injection design).

The RTC panel is its own `chrome-extension://` page; React DevTools does not
attach there, and MV3's CSP forbids the inline `<script>` the same-origin
`/devtools/` page uses to guard itself, so the panel carries no guard — see
[§20.10](../../docs/architecture/20-devtools.md#2010-relationship-to-the-framework-devtools-react-devtools--solid-devtools).

## Build & load

    pnpm dev:devtools:ext   # watch-build the unpacked bundle to packages/devtools-extension/dist

Then in Chrome: `chrome://extensions` → enable Developer mode → **Load unpacked**
→ select `packages/devtools-extension/dist`. Open the app, open DevTools, select
the **RTC** panel.
