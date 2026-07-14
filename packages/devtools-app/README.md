# @rtc/devtools-app

The RTC DevTools inspector -- a four-panel Vite + React 19 SPA that renders
the live state of the app's non-Redux state layer (presenter streams and
per-mount RxJS machines), driven entirely by `@rtc/devtools-core`'s wire
protocol.

| | |
|---|---|
| **Ring** | ④ Frameworks & Drivers -- a leaf tool, not part of the app's own client stack |
| **Runtime deps** | `@rtc/devtools-core`, `react`, `react-dom` (`package.json` `dependencies`) |
| **Consumed by** | Nothing in-workspace as a source dependency -- `@rtc/client-react` takes only a `devDependency` build-order/dist-path edge to serve it at `/devtools/` (`docs/architecture/06-package-dependencies.md` §6) |
| **Must never import** | `@rtc/client-core`, `@rtc/domain`, or any concrete client/server package -- enforced by the dependency-cruiser `devtools-app-protocol-only` rule (`^packages/devtools-app/src` → every `@rtc/*` package except `devtools-core`, see `docs/dependency-cruiser.md`). It understands only the wire protocol, which is what makes a future Chrome-extension shell a thin wrapper around this same bundle (spec §9 / [§20.8](../../docs/architecture/20-devtools.md#208-future-extensions)). |

## Folder map

`src/` is flat except `panels/`. Every file is production source except its `*.test.ts`/`*.test.tsx` sibling under `__tests__/`.

| Path | What lives here |
|---|---|
| `src/main.tsx` | Entry point -- mounts `InspectorApp` |
| `src/InspectorApp.tsx` | The shell: connection-status rail, app-instance picker, four-tab switcher |
| `src/inspectorSession.ts` | Constructs the transport (`BroadcastChannelDuplex`) + `InspectorClient` + `InspectorStore` from `devtools-core` and exposes them to React |
| `src/useInspectorState.ts` | Hook subscribing to the live `InspectorState` snapshot |
| `src/panels/StateTreePanel.tsx` | Collapsible presenter-stream tree, change-flash highlighting, per-node emission-rate badge |
| `src/panels/MachinesPanel.tsx` | Live machine-instance table: id, kind, args, state, created-at, live/disposed |
| `src/panels/EventLogPanel.tsx` | Unified chronological feed (emissions, transitions, intents, wire messages) with filters |
| `src/panels/WirePanel.tsx` | Raw `CLIENT_MSG`/`SERVER_MSG` traffic, direction + topic filters |
| `src/panels/ValueView.tsx` | Shared pretty-printer for `SerializedValue` (handles the tagged Map/Set/truncated encodings) |

## Where to start reading

1. `src/inspectorSession.ts` -- how a panel becomes live: opens a
   `BroadcastChannelDuplex("rtc-devtools")`, drives it through
   `devtools-core`'s `InspectorClient` (sends `hello`, pings every 2s, sends
   `bye` on teardown), and feeds every inbound message into an
   `InspectorStore` that rebuilds `InspectorState` from the snapshot + ordered
   batches.
2. `src/InspectorApp.tsx` -- the shell: renders "disconnected" until a
   `welcome` arrives (same-origin is load-bearing here -- see
   [§20.6](../../docs/architecture/20-devtools.md#206-serving-topology)), then
   the four-tab switcher.
3. `src/panels/` -- each panel is driven purely by `InspectorState` plus
   local React state for its own filters/selection; the inspector
   deliberately does **not** use the machine architecture it inspects -- it
   is a leaf tool and stays boring.

## How it's served

This package is never imported as source by anything else. Its *built*
`dist/` is what matters: `@rtc/client-react`'s `vite.config.ts` (the
`devtoolsPanel()` plugin) resolves this package's `dist/` and serves it at
`/devtools/` via Vite middleware in dev, and copies it into
`client-react/dist/devtools` at build time -- so `/devtools/` works
identically in `pnpm dev` and against the deployed app. Same-origin is
load-bearing: the transport is a same-origin `BroadcastChannel`, so a panel
served from anywhere else (including this package's own standalone dev
server on port 5280) has no hub to pair with and stays "disconnected" by
design.

## How to run

```bash
pnpm --filter @rtc/devtools-app dev          # standalone dev server, port 5280 -- disconnected panel-UI iteration only
pnpm --filter @rtc/devtools-app build        # vite build; consumed by client-react's devtoolsPanel() plugin
pnpm --filter @rtc/devtools-app typecheck
pnpm --filter @rtc/devtools-app test         # vitest run (RTL, synthetic event batches)
```

To exercise it against a real, live app: `pnpm dev` (client-react) and open
`http://localhost:5173/devtools/`.

## See also

- [Its §13 card](../../docs/architecture/13-codebase-map.md#132-l1----the-package-line-map)
- [§20 RTC DevTools](../../docs/architecture/20-devtools.md) -- the full narrative, including the four-panel design and the serving topology
- [Full design spec](../../docs/superpowers/specs/2026-07-11-custom-devtools-design.md)
