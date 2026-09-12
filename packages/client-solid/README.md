# @rtc/client-solid — SolidJS UI

SolidJS + RxJS + Vite client, at full parity with `@rtc/client-react`. Same clean-architecture seam: components read ALL data through `useViewModel()` (`ViewModel` interface, from `@rtc/solid-bindings` instead of `@rtc/react-bindings`); production wires presenters via `@rx-state/core`'s `state()`, tests inject fakes through `ViewModelProvider`. This package is the empirical proof of [§8.1](../../docs/architecture/08-replaceability-matrix.md#81-the-multi-client-proof--the-solidjs-port): a genuinely different reactive framework, running the same behaviour, verified by the same tests.

| | |
|---|---|
| **Ring** | ④ Frameworks & Drivers (`src/ui`) + ③ platform adapters (`src/app/adapters`) — per [§1.3.1](../../docs/architecture/01-overview.md#131-clean-architecture-concretely----which-package-is-which-ring) |
| **Runtime deps** | `@rtc/client-core`, `@rtc/domain`, `@rtc/motion-core`, `@rtc/solid-bindings`, `solid-js`, `rxjs`, `@fontsource/*` (`package.json` `dependencies`). `rxjs` is listed but confined to `src/app` — never `src/ui` (machine-enforced, gate 34). |
| **Consumed by** | Nothing in-workspace — like `client-react-native`, it is a leaf app and *not* a `tests` (`@rtc/tests`) workspace dependency; its own suites (contract + the visual tier) run entirely in-package. |
| **Must never import** | `rxjs` / `@rx-state` in `src/ui` (gate 34); `local storage` in `src/ui` (gate 35); `fetch(` / `import.meta.env` in `src/ui` (gate 36); `setTimeout` / `setInterval` in `src/ui` (gate 37) — the exact same four-gate shape as `client-react`'s 26–29, re-numbered for this package, see [§12](../../docs/architecture/12-architectural-gates.md#12-architectural-gates). |

## Folder map

| Path | What lives here |
|---|---|
| `src/main.tsx` | Entry point: font imports (mirrors `client-react`'s manifest verbatim), solid-devtools registration, mounts `<AppRoot><App /></AppRoot>` |
| `src/AppRoot.tsx` | Composition root component — builds the app exactly once and supplies `ViewModelProvider` + theme + `BootGate` |
| `src/bootSplashGate.ts` | One-shot boot-splash suppression decision, ported from `client-react` |
| `src/app/` | Browser platform adapters + composition wiring (Ring ③) — the only place in this package allowed to touch `rxjs`, local storage, `fetch`/`import.meta.env` |
| `src/app/adapters/` | `LocalStoragePreferencesAdapter`, `BrowserConnectionEventsAdapter` |
| `src/app/theme/` | `MediaQueryColorSchemeAdapter` |
| `src/app/buildBrowserPorts.ts` | Assembles `AppPorts` for `createApp` — the same `VITE_SERVER_URL` switch as `client-react`'s, byte-for-byte |
| `src/ui/` | Dumb SolidJS UI (Ring ④) — every component reads data through `useViewModel()`; gates 34–37 keep it framework-swappable, same discipline `client-react`'s gates 26–29 enforce there |
| `src/ui/fx/`, `src/ui/credit/`, `src/ui/equities/` | Per-domain panels, blotters, and tickets — same domain split as `client-react` |
| `src/ui/admin/` | Admin dashboard — health KPIs, service topology, sessions, live event log |
| `src/ui/shell/` | Chrome, layout engine, boot sequence, theme, lock screen, connection overlay, power-saver |
| `tests/setup/` | jsdom test-environment polyfills (e.g. local-storage shim for Node 26), ported from `client-react` |
| `tests/ui/contract/solid/` | This client's half of the ui-contract swap-trio — the Solid `UiContractDriver` (see "Full parity, concretely" below) |
| `tests/ui/visual/solid/` | This client's `@ui-visual` render target — registry, `VisualScenario`, `buildFakeViewModel` |
| `tests/parity/cssParity.test.ts` | Byte-compares this package's CSS Modules against `client-react`'s, so the "ported verbatim" claim is a passing test, not a one-time manual check |

## Where to start reading

1. `src/main.tsx` — the entry point; same font manifest and mount order as `client-react`'s, Solid's `render()` in place of React's `createRoot(...).render()`.
2. `src/AppRoot.tsx` — the composition root; where `@rtc/client-core`'s `createApp`/`createMachineFactories` meet Solid (no `useRef`/StrictMode concern here — Solid's setup runs once, by construction).
3. `src/app/buildBrowserPorts.ts` — real-WS-vs-simulator port wiring; compare against `client-react`'s file of the same name to see how little changed.
4. `src/ui/App.tsx` — the dumb top-level UI tree, structurally identical to `client-react`'s `App.tsx`.
5. `tests/parity/cssParity.test.ts` — read this before touching any `.module.css` file in this package: it is the enforcement mechanism behind "ported verbatim."

## Full parity, concretely

"Full parity" is not a claim in a document — it is three passing test suites, each asserting against `client-react`'s own artifacts rather than this package's:

- **Contract parity** — the ~52+ components under `src/ui` are exercised by the *same* 86 shared `*.contract.spec.ts` files (622 tests) from `@rtc/ui-contract` that verify `client-react`. This package supplies only its half of the swap-trio (`tests/ui/contract/solid/`, registering a Solid `UiContractDriver`); the spec files themselves are an unmodified `devDependency` import.
- **Visual parity** — the surviving `playwright` tier is **assert-only**: this package owns **no golden images of its own**. Its `snapshotDir` points at `packages/ui-contract/goldens/playwright/__screenshots__/`, so a passing run is a direct pixel match against goldens generated only from React's renders, across the full theme matrix (5 skins × dark/light). Passing `--update-snapshots` (or `-u` in any form) to this package's visual config throws — goldens are owned by `client-react`; regenerate them there. (A 2026-07-20 test-tooling bake-off retired this package's `playwright-ct` URL-navigation fallback and its `vitest-browser` tier — see [§9.7's Outcome](../../docs/architecture/09-test-strategy.md#97-visual-golden-tiers) and [ADR-001's Outcome section](../client-react/tests/ui/visual/ADR-001-visual-diff-tooling.md).)
- **Behavioural parity** — the shared Gherkin `.feature` suites run against this client the same way they run against `client-react`, through a Solid implementation of the same page-object interfaces.

Full synthesis of how these three mechanisms share one source of truth, plus the live pass/fail scoreboard and what each tier has actually caught: [§21 Cross-Framework Testing](../../docs/architecture/21-cross-framework-testing.md).

## CSS Modules: ported verbatim

Every `.module.css` file in `src/ui` is a byte-for-byte copy of `client-react`'s — the CSS-Modules migration deliberately left zero inline styles and semantic `data-*` state hooks precisely so markup/styling could survive a framework swap unchanged ([§8.1](../../docs/architecture/08-replaceability-matrix.md#81-the-multi-client-proof--the-solidjs-port)). `tests/parity/cssParity.test.ts` enforces this as a running test, not a one-time port: it fails if this package's CSS drifts from `client-react`'s.

## Dev server

```bash
pnpm dev:solid           # this package alone (Vite) → http://localhost:5473 — simulator mode, no server; alias of dev:solid:sim
pnpm dev:solid:ws:local  # connected to an already-running local `pnpm dev:ws` (ws://localhost:4000)
pnpm dev:solid:ws:remote # connected to the deployed server (wss://rtc-clone-server.fly.dev)
pnpm dev:solid:fs        # full stack: starts the WS server + this client together
```
5173 is `client-react`'s port, 5273 is `client-prototype`'s; 5473 is this package's, following the same convention.

## Scripts

| script | purpose |
|---|---|
| `dev` | Vite dev server |
| `build` | Vite build |
| `typecheck` | src + node + ui-contract + ui-visual tsconfigs |
| `test` | Vitest (jsdom): app-tier + co-located unit tests |
| `test:ui:contract` | ui contract tier — the shared `@rtc/ui-contract` specs, driven through this package's Solid swap-trio |
| `test:ui:contract:coverage` | coverage gate over the combined `src/ui` surface, same shape as `client-react`'s |
| `test:ui:visual` / `test:ui:visual:solid` | the visual tier, assert-only against `client-react`'s goldens |
| `test:ui:visual:playwright:solid[:ui]` | The CI-asserted tier — plain Playwright over a Vite host, reusing `client-react`'s `visual.spec.ts` verbatim |
| `clean` / `clean:deep` | remove build/test artifacts (/ + node_modules) |

## solid/reactivity and this port

`eslint-plugin-solid`'s `reactivity` rule fires on reads of reactive values
outside tracked scope. This port carries **zero** `solid/reactivity`
directives, in `src/` and `tests/` alike, and adding one is a review defect:
the rule is right often enough that a suppression is the wrong tool.

**The default is a live read.** A read that feeds rendered output belongs in
the JSX (or in an accessor/`createMemo` the JSX calls), where it is tracked. A
value copied to a `const` at setup and used in JSX later is the bug the rule
exists to catch, not a false positive; `<For>`- and `<Show>`-scoped reads must
STAY in the JSX body for the same reason. Where a prop is a callback, forward
it (`function finishBoot() { props.onDone(); }`) rather than capturing it, so
the read happens when it fires — see `BootSequence.tsx`.

**What `untrack(() => …)` does, and what it does not.** At the top level of a
component body it is a **runtime no-op**: Solid already calls a component
inside one (`createComponent` is `untrack(() => Comp(props))`, solid.js), so
`untrack(() => props.x)` there subscribes to exactly as much as the bare
`props.x` it replaces — nothing. What it does is *declare*, to the reader and
to `eslint-plugin-solid` (which registers its callback as a tracked scope, its
sanctioned opt-out), that the snapshot is deliberate. It **makes nothing
safe.** Whatever invariant keeps a given snapshot correct still has to hold,
and still has to be named in one line at the site.

**The seam takes accessors.** Every `@rtc/solid-bindings` ViewModel hook whose
body is nothing but a keyed subscription — `usePrice`, `usePriceHistory`,
`useQuotesForRfq`, `useAnimationIntents`, `useEquityQuote`, `useCandles`,
`useCandleBackfill`, `useDepth`, `useJarvisPanelData` — takes each key as
`T | Accessor<T>`, independently per key. The accessor form resubscribes when
the key changes (`toKeyedSignal` in `toSignal.ts`: a `createMemo` over
`toSignal`, so Solid's owner disposal releases the old subscription and the new
one seeds synchronously), which closes the parity gap with `@rtc/react-bindings`
— whose hooks are live only because React re-runs the component. Write
`usePrice(() => props.pair)` and there is no snapshot to justify.

The hooks that stay **value-only** are the ones that build something on the key
rather than subscribe to it: `useStaleFlag`, `useRowHighlight`, `useNotional`,
`useRfqCountdown`, `useTileExecution`, `useRfqTile`, `useOrderTicket`,
`useBootSequence` (per-mount machines — re-keying would dispose and rebuild one,
restarting a timer or dropping an in-flight fold) and `useLayout` (a
composition-root singleton per tab — re-keying would tear it down for every
other reader). Their seeds are snapshots because the hook's *shape* says so, not
because the seam is missing a feature.

`grep -rn "untrack(" packages/client-solid/src | grep -v import` counts **15**
hits: 14 real calls plus one in a comment. They fall into two groups:

- **Hook-seed (4 sites).** `Tile.tsx` (`seedPair` → `useStaleFlag` /
  `useNotional` / `useTileExecution` / `useRfqTile`), `BlotterRow.tsx`
  (`useRowHighlight`), `RfqCard.tsx` (`useRfqCountdown`'s
  `creationTimestamp`), `App.tsx` (`useLayout`'s tab). Each names, in one line
  at the site, which hooks still need the seed and the invariant that keeps it
  correct.
- **Deliberate, for a behavioural reason (10 sites).** A live read would make
  things worse: `RfqCountdown`/`RfqCard` drive ONE mount-time CSS keyframe
  fast-forwarded by a negative delay, and a per-tick rewrite re-triggers it
  every tick; the blotter filter popovers (`DateFilter`/`SetFilter`/
  `NumberFilter`) seed editing signals the user then owns, so a live read would
  clobber half-typed input; `RfqsPanel`'s cascade effects want the CURRENT value
  of their own bookkeeping signals, not a dependency on them; `App.tsx`'s
  `untrack(dockedPanels)` keeps one uniform identity across a merge. These are
  correct as snapshots and stay that way whatever the seam does.

One read is a snapshot no matter how it is written: a context Provider's
`value`. Solid's own `createProvider` reads it inside an `untrack`, so
`ViewModelProvider` wraps it in an explicit one to say so.

One shape needs neither a live read nor a snapshot, and is worth its own
note: a bookkeeping `createEffect` that diffs the current emission against the previous one
(new-trade/new-RFQ flash, RFQ entrance/exit cascades) used to seed that
"previous" baseline with a plain `let prev… = accessor()` read at setup,
outside tracking. `on()` supplies that baseline natively — its first run
establishes it — so there's nothing left to read outside tracking. Use it
**without** `{ defer: true }`: that option skips *calling* the callback on
mount, but does not preserve the mount-time read as the following call's
`previous` (measured — the first
non-deferred call gets a valid baseline; under `defer: true` that same call
gets `previous: undefined` instead), which reintroduces the exact bug the
seed existed to prevent, just shifted one tick later. Fall back to the
CURRENT values when `previous` is `undefined` (`previous ?? current`) so an
existing equality guard handles mount with no special case — the mount call
still runs (comparing the current value against itself, a no-op) and,
critically, still records the mount values as `previous` for the first real
call afterwards. See `CreditBlotter.tsx`, `NewRfqPanel.tsx`, and
`RfqsPanel.tsx` for worked examples. Unsuppressed warnings are ledgered in
[`docs/lint-warnings.md`](../../docs/lint-warnings.md) (CI drift-gated).

## See also

- [Its §13 card](../../docs/architecture/13-codebase-map.md#132-l1----the-package-line-map)
- [`@rtc/client-react`'s README](../client-react/README.md) — the package this one mirrors component-for-component
- [`@rtc/solid-bindings`'s README](../solid-bindings/README.md) — the bindings bridge this package sits on
- [`@rtc/ui-contract`'s README](../ui-contract/README.md) — the shared contract + visual scenario manifest both clients consume
- [§8.1 The Multi-Client Proof & the SolidJS Port](../../docs/architecture/08-replaceability-matrix.md#81-the-multi-client-proof--the-solidjs-port)
- [`packages/client-react/tests/ui/visual/README.md`](../client-react/tests/ui/visual/README.md) — the visual-tier design this package asserts against
