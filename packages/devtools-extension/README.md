# @rtc/devtools-extension

MV3 Chrome DevTools extension that attaches the RTC state inspector
(`@rtc/devtools-app`) to any running app instance — including the deployed
build — over a `chrome.runtime` transport.

## Architecture

A third `Duplex` behind the inspector's transport seam. Nothing in the protocol,
hub, `InspectorStore`/`InspectorClient`, or the four panels changes:

- `ChromeRuntimeDuplex` — inspector-side transport over a reconnecting runtime port.
- `contentBridge` — injected into the app tab; relays the same-origin
  `rtc-devtools` BroadcastChannel ↔ `chrome.runtime`.
- `background` — tab-keyed router between panel and content ports.
- `devtools` / `panel` — registers the "RTC" DevTools panel and mounts `InspectorApp`.

Dormancy is preserved: only opening the RTC panel sends `hello`; an installed,
unopened extension costs the app nothing.

## Build & load

    pnpm dev:ext            # build the unpacked bundle to packages/devtools-extension/dist

Then in Chrome: `chrome://extensions` → enable Developer mode → **Load unpacked**
→ select `packages/devtools-extension/dist`. Open the app, open DevTools, select
the **RTC** panel.
