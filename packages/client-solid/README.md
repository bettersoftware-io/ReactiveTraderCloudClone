# @rtc/client-solid — SolidJS UI

SolidJS + RxJS + Vite client, at full parity with `@rtc/client-react`. Same clean-architecture seam: components read ALL data through `useViewModel()` (`ViewModel` interface, from `@rtc/solid-bindings` instead of `@rtc/react-bindings`); production wires presenters via `@rx-state/core`'s `state()`, tests inject fakes through `ViewModelProvider`. This package is the empirical proof of [§8.1](../../docs/architecture/08-replaceability-matrix.md#81-the-multi-client-proof--the-solidjs-port): a genuinely different reactive framework, running the same behaviour, verified by the same tests.

| | |
|---|---|
| **Ring** | ④ Frameworks & Drivers (`src/ui`) + ③ platform adapters (`src/app/adapters`) — per [§1.3.1](../../docs/architecture/01-overview.md#131-clean-architecture-concretely----which-package-is-which-ring) |
| **Runtime deps** | `@rtc/client-core`, `@rtc/domain`, `@rtc/motion-core`, `@rtc/solid-bindings`, `solid-js`, `rxjs`, `@fontsource/*` (`package.json` `dependencies`). `rxjs` is listed but confined to `src/app` — never `src/ui` (machine-enforced, gate 34). |
| **Consumed by** | Nothing in-workspace — like `client-react-native`, it is a leaf app and *not* a `tests` (`@rtc/tests`) workspace dependency; its own suites (contract + three visual tiers) run entirely in-package. |
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

- **Contract parity** — the ~52+ components under `src/ui` are exercised by the *same* 80+ shared `*.contract.spec.ts` files from `@rtc/ui-contract` that verify `client-react`. This package supplies only its half of the swap-trio (`tests/ui/contract/solid/`, registering a Solid `UiContractDriver`); the spec files themselves are an unmodified `devDependency` import.
- **Visual parity** — all three visual tiers (`playwright-ct`, `playwright`, `vitest-browser`) are **assert-only**: this package owns **no golden images of its own**. Each tier's `snapshotDir` points at `packages/client-react/tests/ui/visual/<tier>/__screenshots__/`, so a passing run is a direct pixel match against React's canonical goldens, across the full theme matrix (5 skins × dark/light). Passing `--update-snapshots` (or `-u` in any form) to any of this package's visual configs throws — goldens are owned by `client-react`; regenerate them there.
- **Behavioural parity** — the shared Gherkin `.feature` suites run against this client the same way they run against `client-react`, through a Solid implementation of the same page-object interfaces.

## The Tier 1 fallback: URL-navigation, not a CT mount

`tests/ui/visual/playwright-ct/` is **not** a real Playwright Component Testing adapter. At the time this tier was built, `@playwright/experimental-ct-solid` was pinned several minor versions behind this repo's `@playwright/test`, and forcing the mismatch in was rejected (see the decision header in `playwright-ct.config.ts`). Instead, this tier is a second URL-navigation config — structurally identical to `tests/ui/visual/playwright/` — that asserts against `client-react`'s **`playwright-ct`** golden tree specifically, by matching its `{testFileName}` golden-path segment. It is data-driven over the same `@rtc/ui-contract` scenario manifest as the other two tiers, same as `client-react`'s own (now data-driven) Tier 1. Revisit once a version-matched Solid CT adapter ships.

A handful of `classic` skin CT scenarios are skipped **on CI only** (`CI_HOST_FONT_SENSITIVE` in `matrix.spec.tsx`) — the `classic` skin is the one skin whose font tokens resolve to OS-generic keywords instead of embedded `@fontsource` faces, so its CT element-crops encode the CI runner's font environment, not the UI. Still verified by the other two x86 tiers and all three tiers on darwin. Tracked in `docs/STATUS.md`.

## CSS Modules: ported verbatim

Every `.module.css` file in `src/ui` is a byte-for-byte copy of `client-react`'s — the CSS-Modules migration deliberately left zero inline styles and semantic `data-*` state hooks precisely so markup/styling could survive a framework swap unchanged ([§8.1](../../docs/architecture/08-replaceability-matrix.md#81-the-multi-client-proof--the-solidjs-port)). `tests/parity/cssParity.test.ts` enforces this as a running test, not a one-time port: it fails if this package's CSS drifts from `client-react`'s.

## Dev server

```bash
pnpm dev:solid       # this package alone (Vite) → http://localhost:5473 — simulator mode, no server
pnpm dev:solid:ws    # connected to an already-running `pnpm dev:ws`
pnpm dev:solid:fs    # full stack: starts the WS server + this client together
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
| `test:ui:visual` / `test:ui:visual:solid` | all three visual tiers, assert-only against `client-react`'s goldens |
| `test:ui:visual:playwright-ct:solid[:ui]` | Tier 1 — URL-navigation fallback (see above), not a CT mount |
| `test:ui:visual:playwright:solid[:ui]` | Tier 2 — plain Playwright over a Vite host, reusing `client-react`'s `visual.spec.ts` verbatim |
| `test:ui:visual:vitest-browser:solid` | Tier 3 — Vitest browser mode via `@solidjs/testing-library` |
| `clean` / `clean:deep` | remove build/test artifacts (/ + node_modules) |

## See also

- [Its §13 card](../../docs/architecture/13-codebase-map.md#132-l1----the-package-line-map)
- [`@rtc/client-react`'s README](../client-react/README.md) — the package this one mirrors component-for-component
- [`@rtc/solid-bindings`'s README](../solid-bindings/README.md) — the bindings bridge this package sits on
- [`@rtc/ui-contract`'s README](../ui-contract/README.md) — the shared contract + visual scenario manifest both clients consume
- [§8.1 The Multi-Client Proof & the SolidJS Port](../../docs/architecture/08-replaceability-matrix.md#81-the-multi-client-proof--the-solidjs-port)
- [`packages/client-react/tests/ui/visual/README.md`](../client-react/tests/ui/visual/README.md) — the visual-tier design this package asserts against
