# RTC DevTools — Custom State-Inspection Developer Tools

**Date:** 2026-07-11
**Status:** Design approved, implementation deferred (plan to follow)
**Scope decisions (locked):** observe-only · web client only · standalone shell first · instrumentation ships in production builds · all four v1 panels

## 1. Why

The app's state layer is presenter streams + per-mount RxJS machines behind the
ViewModel seam — not Redux/MobX/Zustand — so no off-the-shelf browser devtools
can inspect it. For developers evaluating this architecture for a production
app, "no devtools" reads as a real adoption cost.

This project answers that objection by building our own, and turns the
objection into the strongest argument *for* the architecture:

- Redux earns its devtools because it has one enforced choke point (the store).
  This architecture has the same property by construction — every piece of
  state crosses one of three seams (`createViewModel` binds, the `useMachine`
  bridge via `MachineFactories`, and the ports). A devtools here therefore
  costs **a decorator at the composition root**, not a framework.
- The devtools is itself a demonstration of the port/adapter discipline: the
  same instrumentation core drives a standalone inspector app today and a
  Chrome extension (and React Native inspection) later, by swapping a
  transport adapter — nothing else.

### What it must do (v1)

A colleague opens the inspector next to the running app and sees, live:

1. **State tree** — all shared presenter streams with current values and
   change flashes; parameterized streams (`price$(pair)`) grouped per arg.
2. **Machine registry** — every per-mount machine instance: kind, args
   (e.g. `EURUSD`), live state, intents fired, created/disposed lifecycle.
3. **Event log** — unified chronological feed (emissions, transitions,
   intents, wire messages) with filters.
4. **Wire tap** — raw `CLIENT_MSG`/`SERVER_MSG` traffic with direction and
   topic filters.

V1 is strictly **observe-only**: the inspector can never mutate app state.
Interaction (intent injection, replay) is future work — see §9.

## 2. Approach

**Composition-root decorators** (chosen over per-presenter instrumentation
ports, which would touch ~40 files and tax every future presenter, and over
RxJS-level patching, which is fragile and unattributable).

Nothing inside any presenter, machine, or domain entity changes. At the
composition call site in `client-react` (where `createApp(ports)` runs
today), three decorators wrap the existing objects before they reach
`createViewModel`:

```
buildBrowserPorts() ─▶ instrumentPorts ─▶ createApp ─▶ instrumentPresenters
                                                     ─▶ instrumentMachines
                                                          │
                                                          ▼
                                                   createViewModel
```

All events flow into a `DevtoolsHub` that stays dormant until an inspector
handshakes over a transport.

## 3. Packages

Two new packages, following existing naming and layering conventions:

| Package | Name | Contents | Runtime deps |
|---|---|---|---|
| `packages/devtools-core` | `@rtc/devtools-core` | Event protocol (types + versioned wire format), serializer, `DevtoolsHub` (ring buffer, handshake, dormancy), the three decorators, `DevtoolsTransport` port + BroadcastChannel adapter | **rxjs only** (same constraint as `domain`/`ws-effects`) |
| `packages/devtools-app` | `@rtc/devtools-app` | The inspector UI: Vite + React 19 SPA with the four panels | `devtools-core`, react |

Deliberate isolation properties:

- `devtools-core` does **not** import `@rtc/client-core`. It decorates by
  structural shape (`Machine<S,I>`, objects bearing observables), so its
  types are generic. The presenter **manifest** (which keys of `Presenters`
  are streams vs parameterized stream methods vs commands) lives at the
  call site in `client-react`, which already knows the concrete types.
- `devtools-app` never imports `client-core`/`domain` — it understands only
  the wire protocol. This is what makes the future extension shell a thin
  wrapper around the same bundle.

**Dependency-rule additions:** `devtools-core` → rxjs only;
`devtools-app` → `devtools-core`; `client-react` → `devtools-core`; nothing
depends on `devtools-app`. dep-cruiser rules extended accordingly, and both
packages join every repo-wide gate (Biome, ESLint, stylelint, typecheck,
knip, tests) per the all-gates-cover-every-package policy.

**Integration touch-points (existing packages):** a few lines at the
`client-react` composition call site applying the decorators (always
compiled in, dormant by default), plus serving the panel **from the app's own
origin** — load-bearing, because the transport is a same-origin
BroadcastChannel that a separate dev server (different port ⇒ different origin)
can never pair with. A tiny Vite plugin in `client-react` (`devtoolsPanel()`)
serves the built `devtools-app` at `/devtools/` via dev middleware and copies
it into `dist/devtools` at build time, so `/devtools/` works identically in
`pnpm dev` and on the deployed app. The standalone `devtools-app` dev server
(port 5280) is for disconnected panel-UI iteration only — with no same-origin
hub it renders the "disconnected" state by design.

## 4. Instrumentation layer

Three decorators, all applied at the composition call site:

**`instrumentMachines(factories, hub)`** — one generic wrapper covering all
11 current factories and any added later, with no per-machine code. On every
factory call: assign an instance id; emit `machine:created {id, kind, args}`;
tap `state$` → `machine:state {id, seq, state}`; wrap every intent function →
`machine:intent {id, name, args}` before delegating; wrap `dispose` →
`machine:disposed {id}`.

**`instrumentPresenters(presenters, manifest, hub)`** — walks the
`Presenters` object using the manifest. Shared streams are tapped once and
emit `stream:registered` then `stream:emission {streamId, seq, value}`.
Parameterized stream methods register a child stream per distinct arg tuple
on first call (`priceStream.price$ [EURUSD]`).

**`instrumentPorts(ports, hub)`** — taps the WS-backed ports' raw message
flow → `wire:in` / `wire:out` events with topic and direction.

**Dormancy contract.** The hub starts disabled. Decorators are always
applied, but every tap body is `if (!hub.live) return;` — no serialization,
no buffering, no allocation beyond the wrapper closures until an inspector
completes a handshake. On inspector disconnect the hub drains and goes
dormant again. This must hold on a permanently-animated HUD over a live
price stream: a dormant tap on a price tick is one boolean check, nothing
more.

## 5. Protocol & transport

**Wire protocol** (versioned, JSON-serializable envelopes, mirroring the
repo's `CLIENT_MSG`/`SERVER_MSG` envelope discipline):

```ts
{ v: 1, seq: number, ts: number, kind: DevtoolsEventKind, payload: ... }
```

Event kinds: the `stream:*`, `machine:*`, `wire:*` families from §4, plus
session-level `hello` / `welcome` (handshake + protocol-version
negotiation), `snapshot` (full registry state — every known stream's latest
value and every live machine — sent once on attach so the panel never starts
blind), and `bye`.

Inspector→app messages in v1 are **only** `hello`, `subscribe {filters}`,
and `bye`. Observe-only means a near-zero inbound surface — which is also
the security rationale for shipping in production (§7).

**Serialization** — one serializer in `devtools-core` with hard caps
(depth ≤ 6, arrays truncated at 50 with a `…+N` marker, strings at 500
chars) and tagged encodings for the non-JSON shapes that occur in real state
(`ReadonlyMap` — e.g. `allQuotes$`; `ReadonlySet` — e.g. `newTradeIds$`).
Panels show summaries; nothing needs full payloads.

**Backpressure** — the hub batches at a ~30 Hz flush cadence and coalesces
per-stream: for high-frequency streams only the latest value per flush
window crosses the channel, plus an emission counter so the panel can still
show true tick rates. Ring buffer holds the last 10k events, only while an
inspector is live.

**Transport port:**

```ts
interface DevtoolsTransport {
  send(batch: DevtoolsEvent[]): void
  inbound$: Observable<InspectorMessage>
  status$: Observable<TransportStatus>
}
```

V1 adapter: **BroadcastChannel** (`rtc-devtools`), same origin, zero
infrastructure, works both in dev and against the deployed app **because the
panel is served from the same origin** (§3) — a `/devtools/` route wired by a
Vite plugin in `client-react` (dev middleware) and copied into `dist/devtools`
at build time. Same-origin is a hard requirement, not a convenience:
BroadcastChannel is scoped to an origin, so a panel served from any other
origin (e.g. the standalone `devtools-app` dev server on port 5280) simply has
no hub to pair with and stays disconnected. A WebSocket-relay adapter is future
work (needed for React Native); the port exists now so that is adapter-only work.

**Refinements vs this spec (as built in the implementation plan):** the
inbound surface is trimmed to `hello` and `bye` only — `subscribe {filters}`
was dropped (the hub sends the full registry; the panel filters client-side),
so inbound also carries just `ping` for the liveness heartbeat. Protocol
version rides the `hello`/`welcome` handshake fields only (no per-event `v`).
The transport port as implemented is `send` + `inbound$` only — `status$` was
dropped; connection state is derived panel-side from `welcome`/`bye`. One
consequence worth noting: with no inspector-side liveness timeout, the panel
flips to "disconnected" only on an explicit `bye` (the 10s heartbeat timeout is
hub-side, detecting the inspector's pings stopping); an abruptly closed *app*
page therefore leaves the panel showing "connected" until reload — surfacing
app-gone would need an app-side `pagehide → hub.dispose()` or a panel-side
welcome-freshness timer (future work).

## 6. Inspector app (four panels)

Vite + React 19 SPA in `devtools-app`, HUD-styled to match the product — it
should read as *our* devtools, not a generic table dump. Layout: persistent
left rail (connection status, app-instance picker for multi-tab), four tabs:

1. **State tree** — collapsible tree of the presenter registry; live values
   with change-flash highlighting; per-node emission-rate badge (ticks/s);
   parameterized children grouped under their parent. Click → detail pane:
   latest value pretty-printed + last-N emission-time sparkline.
2. **Machine registry** — live table: instance id, kind, args, current state
   inline, created-at, status (live/disposed; disposed rows fade but persist
   for the session). Click → detail: full state, transition history, intents
   fired against this instance. Mounting/unmounting FX tiles visibly births
   and kills machines — the per-mount lifecycle Redux doesn't model.
3. **Event log** — unified chronological feed (coalesced emissions,
   transitions, intents, wire messages) with kind/source/text filters and
   pause-on-scroll. Selecting an event cross-links to its stream/machine.
4. **Wire tap** — `wire:in`/`wire:out` with direction arrows, topic filter,
   message rate; click → payload.

Panel-internal state (filters, selected tab) is plain React state. The
inspector deliberately does **not** use the machine architecture it
inspects; it is a leaf tool and stays boring.

The `snapshot`-on-attach + `seq`-ordered-deltas pattern is the same
state-transfer discipline as the app's own WS protocol (and Chrome's CDP):
late joiners get a snapshot, then ordered deltas. Getting this right in v1
is also what makes future record/replay cheap — a recording is literally
"snapshot + event stream" (§9).

## 7. Error handling, performance, production exposure

- **The tap must never hurt the app.** Every decorator body catches its own
  failures (serializer throwing on an exotic value, channel full, panel gone
  mid-batch), counts them, and reports a `devtools:error` event — never
  propagating into a presenter stream or an intent call path. A wrapped
  intent always delegates even if logging throws.
- **Dormant cost budget:** one boolean check per tapped emission, zero
  allocations. **Live cost budget:** serialization only at flush time
  (≤30 Hz), coalesced; the inspector tab pays the rendering cost, not the
  app tab.
- **Acceptance check** (per `docs/performance.md` discipline): profile the
  FX tab with taps dormant vs. the pre-devtools baseline — no measurable
  renderer-main delta; with an inspector attached, the app tab's profile
  stays within a stated envelope. Zero `compositeFailed` events remains the
  bar for any panel animation.
- **Version skew:** `hello`/`welcome` carry protocol versions; a mismatch
  shows a clear banner in the panel instead of silent garbage.
- **Production exposure:** instrumentation ships in the deployed app,
  dormant until handshake. Observe-only inbound surface means the worst case
  is a same-origin script reading state the browser user can already see. No
  intents, no writes, nothing to abuse in v1. When intent injection lands
  (§9), *that* is the point to add an opt-in gate (dev flag or token).

## 8. Testing

Follows the repo's existing tiers:

- **Unit (vitest, `devtools-core`):** decorators — machine wrapper emits
  created/state/intent/disposed in order, delegates intents, tap failures
  don't break delegation; serializer — caps, Map/Set round-trip; hub —
  dormancy (nothing buffered while disabled), coalescing (N ticks in one
  window → 1 value + counter), snapshot correctness, ring-buffer bounds.
- **Unit/contract (`devtools-app`):** panels driven by synthetic event
  batches (RTL, sociable style matching the app's contract tier) — state
  tree renders a snapshot, flash on change, machine-table lifecycle, log
  filters.
- **Integration (vitest):** real `createApp` with simulator ports +
  decorators + an in-memory transport pair → attach an inspector, assert
  snapshot + live events for a scripted scenario (tile mounts → machine
  appears; trade executes → blotter emission).
- **E2E (Playwright, one suite):** app + panel in two pages; verify attach,
  live tick flow into the state tree, machine row appearing when a tile is
  added. Joins the existing parallel e2e orchestration.
- **Perf gate (manual, pre-merge):** the dormant-tap profile check from §7,
  using the `docs/performance.md` recipe.

## 9. Future extensions (designed for, explicitly out of v1)

1. **Intent injection** — protocol gains
   `intent:invoke {machineId | presenter, name, args}`; the hub already
   holds live instance refs. Requires the opt-in gate (§7). Small.
2. **Record & replay** — persist `snapshot + event stream` (the v1 protocol
   is already event-sourced); a replay mode feeds a recording back into the
   panel ("flight recorder" — no app involvement). Full *app* replay
   (recorded port inputs into a fresh composition root) is a separately
   scoped, larger step needing seeded time/timers.
3. **Chrome extension shell** — MV3 wrapper: content script bridges
   BroadcastChannel ↔ background ↔ devtools-panel page hosting the *same*
   `devtools-app` bundle. Protocol and UI untouched; packaging work.
4. **React Native support** — WebSocket-relay transport adapter (the §5
   port) + the same decorators applied at the RN composition call site;
   panel runs on the Mac, inspects the device.
5. **Time-scrubbing UI** — panel-side slider over the ring buffer
   reconstructing past state-tree views. Honest framing: viewing recorded
   history, not rewinding the app (live RxJS streams over a socket cannot be
   replayed the way Redux replays reducers).

## 10. Architecture-docs updates (land with implementation)

- New `docs/architecture/` page for the devtools: why it exists, the
  problems it solves, the decorator architecture, protocol, and the §9
  roadmap — written show-not-tell with the actual decorator/protocol
  fragments.
- Mechanical syncs: §6 package-dependency graph (+2 packages, new rules),
  §13 codebase map, `CLAUDE.md` package-structure table and dependency
  rules, READMEs for both new packages.
- `check:doc-links` keeps all of it honest in CI.
