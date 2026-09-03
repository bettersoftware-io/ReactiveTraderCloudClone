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
outside tracked scope. This port carries directives in both `src/` and
`tests/`.

**The rule:** every `solid/reactivity` disable must carry a justification
naming its verified safety mechanism — inline, or `-- setup-scope read is
correct (see doc comment above)` pointing at a real doc comment that names
it (sanctioned for multi-disable clusters, e.g. `Tile`, `NumberFilter`, where
repeating the same paragraph per line would be worse). A disable whose
mechanism can't be located is a review defect.

**Common mechanisms** actually in use (illustrative, not an exhaustive list —
a new site may need a new one, as long as it's verified and named):

- **Remount-keyed instance-constant reads** — a parent keys the mount on the
  value (`<For>`/keyed `<Show>`), or remounts fresh every time the component
  becomes visible (a boolean, non-keyed `<Show>`, e.g. `NumberFilter`), so
  the value can't change under an already-mounted instance.
- **One-time seeds re-derived by their paired tracked effect** — a plain
  `let` baseline read once at setup so a `createEffect` has something to
  diff its first run against; the effect re-derives its own "previous" state
  from its own tracked reads on every run after that, never re-reading the
  seed source.
- **Hoists inside an already-tracked scope** — a read that IS tracked (Solid
  tracks by dynamic execution scope, not lexical position) but is hoisted to
  a local for reuse within the same synchronous pass instead of
  re-evaluated in a nested callback.
- **Deliberate snapshots where a live read would be a bug** — e.g.
  `RfqCountdown`'s CSS custom properties: a live read would re-trigger the
  CSS keyframe every tick, defeating the one-shot fill animation that's the
  point.
- **Immutable `readonly` domain fields** — a field the domain model never
  mutates after creation (e.g. `Rfq.creationTimestamp`), safe independent of
  whatever remount cadence its parent happens to use.

Two shapes that USED to need a directive here no longer do: props-callback
event handlers were previously suppressed and are now named wrappers
(`rtc/name-jsx-handlers`), structural rather than disabled; reactive reads
feeding rendered output were previously unsuppressed *ledgered* warnings, now
converted to accessors/memos. Unsuppressed warnings are ledgered in
[`docs/lint-warnings.md`](../../docs/lint-warnings.md) (CI drift-gated).

## See also

- [Its §13 card](../../docs/architecture/13-codebase-map.md#132-l1----the-package-line-map)
- [`@rtc/client-react`'s README](../client-react/README.md) — the package this one mirrors component-for-component
- [`@rtc/solid-bindings`'s README](../solid-bindings/README.md) — the bindings bridge this package sits on
- [`@rtc/ui-contract`'s README](../ui-contract/README.md) — the shared contract + visual scenario manifest both clients consume
- [§8.1 The Multi-Client Proof & the SolidJS Port](../../docs/architecture/08-replaceability-matrix.md#81-the-multi-client-proof--the-solidjs-port)
- [`packages/client-react/tests/ui/visual/README.md`](../client-react/tests/ui/visual/README.md) — the visual-tier design this package asserts against
