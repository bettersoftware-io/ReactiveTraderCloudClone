# @rtc/devtools-relay

A tiny standalone WebSocket relay that bridges the RTC state inspector
(`@rtc/devtools-app`) to the React Native client. Runs only on the developer's
machine; carries only devtools frames — never app data, never the production
`@rtc/server`.

## How it fits

A fourth `Duplex` behind the inspector's transport seam (after
BroadcastChannel, the Chrome extension's runtime port). The protocol, hub,
`InspectorStore`/`InspectorClient`, and the four panels are unchanged:

- The RN app (dev build only) opens `WsRelayDuplex(url, "app")` as its
  `DevtoolsHub` transport and applies the same three composition-root decorators
  `client-react` applies.
- The browser `devtools-app` opens `WsRelayDuplex(url, "panel")` (via
  `?relay=<ws-url>`).
- This relay identifies each connection by its `?role=` query, broadcasts
  app -> panels, forwards panel -> app, and pipes bytes with no protocol
  knowledge.

## Run it

    pnpm dev:devtools:relay        # ws://localhost:8790 (default)
    RTC_DEVTOOLS_RELAY_PORT=9999 pnpm dev:devtools:relay
    pnpm --filter @rtc/devtools-relay dev 8123   # positional port arg

Then boot a dev RN build (`pnpm dev:ios`) and open the panel in a browser at
`http://localhost:5280/?relay=ws://localhost:8790` (standalone dev server) or
the deployed `/devtools/?relay=...`. The panels show the mobile client live;
backgrounding the app flips the panel to "disconnected" (relay socket drop +
the panel-side liveness timer), and reconnecting recovers via the re-hello path.

Dormancy holds: the hub stays dormant until the panel's `InspectorClient` sends
`hello` through the relay — opening the relay socket alone wakes nothing.
