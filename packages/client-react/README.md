# @rtc/client-react — React UI

React + RxJS + Vite client. Clean-architecture seam: components read ALL data
through `useViewModel()` (`ViewModel` interface); production wires presenters via
`@react-rxjs/core`, tests inject fakes through `ViewModelProvider`.

| | |
|---|---|
| **Ring** | ④ Frameworks & Drivers (`src/ui`) + ③ platform adapters (`src/app/adapters`) — per [§1.3.1](../../docs/architecture/01-overview.md#131-clean-architecture-concretely----which-package-is-which-ring) |
| **Runtime deps** | `@rtc/client-adapters` (the ports) and `@rtc/client-core-rxjs` (the default RxJS core), plus the two alternative cores — all three cores lazy-loaded — `@rtc/client-core-async` / `@rtc/client-core-effect`, `@rtc/core-api`, `@rtc/domain`, `@rtc/core-logic`, `@rtc/react-bindings`, `@rtc/motion-core`, `@rtc/boot-splash`, `@rtc/layout-dockview`, `@rtc/devtools-core`, `react`, `react-dom`, `motion`, `rxjs`, `@rx-state/core`, `@fontsource/*` (`package.json` `dependencies`). `rxjs` and `@rx-state/core` are listed but confined to `src/app` (the core host builds its state streams with them) — never `src/ui` (machine-enforced, gate 26). |
| **Consumed by** | The `tests` workspace only (`tests/package.json` lists `@rtc/client-react`; [§13.2](../../docs/architecture/13-codebase-map.md#132-l1----the-package-line-map)) — it is a shipping leaf app, not a library other packages import. |
| **Must never import** | `rxjs` / `@react-rxjs` / `@rx-state` in `src/ui` (gate 26); `localStorage` in `src/ui` (gate 27); `fetch(` / `import.meta.env` in `src/ui` (gate 28); `setTimeout` / `setInterval` in `src/ui` (gate 29) — all four enforced by `tests/scripts/grep-gates.ts`, see [§12](../../docs/architecture/12-architectural-gates.md#12-architectural-gates). |

## Folder map

| Path | What lives here |
|---|---|
| `src/main.tsx` | Entry point: font imports, then `runBoot(bootCore(...))` -- resolves which application core to load (`?core=` URL parameter, then the stored Preferences choice, then the `VITE_CORE_IMPL` build default, then `rxjs`), then hands the loaded core and the page's ports (`buildBrowserPorts()`, built once) to the core host (`src/app/coreHost.ts`), which mounts `<AppRoot composition><App /></AppRoot>` into `#root` — and swaps the core in place when Preferences picks another. A second root on `#core-swap-overlay` renders `CoreSwapOverlay` (`src/ui/shell/core/`) while a swap is under way, and `#root` is `inert` for that time (`src/app/coreSwapCover.ts`) |
| `src/AppRoot.tsx` | UI root of one composition — builds the `ViewModel` once from the host's composition (lazy `useRef`, StrictMode-safe) and supplies `ViewModelProvider` + `ThemeProvider` + `BootGate` |
| `src/app/` | Browser platform adapters + composition wiring (Ring ③) — the only place in this package allowed to touch `rxjs`, `localStorage`, `fetch`/`import.meta.env` |
| `src/app/adapters/` | `BrowserConnectionEventsAdapter`, `LocalStoragePreferencesAdapter`, the `LocalStorage*` layout/session stores |
| `src/app/theme/` | `MediaQueryColorSchemeAdapter` |
| `src/app/bootApp.ts`, `src/app/coreSelection.ts` | Load-time core selection: `bootCore` resolves and loads the chosen `CoreFactory` (the alternative cores are lazy chunks), `coreSelection.ts` holds the precedence rules and the stored-choice helpers |
| `src/app/devtools/` | The app-side `devtoolsHub` singleton and the `PRESENTER_MANIFEST` the `@rtc/devtools-core` decorators walk |
| `src/app/buildBrowserPorts.ts` | Assembles `AppPorts` for `createApp` — switches real WS vs. simulator ports on `VITE_SERVER_URL` |
| `src/ui/` | Dumb React 19 UI (Ring ④) — every component reads data through `useViewModel()`; gates 26–29 keep it framework-swappable |
| `src/ui/shell/` | Chrome, layout engine, boot sequence, theme, lock screen, connection overlay, status bar |
| `src/ui/shell/layout/` | The layout engine — maximize/collapse/resize — see [§17.2 The Layout System](../../docs/architecture/17-web-client-up-close.md#172-the-layout-system) |
| `src/ui/shell/motion/` | Shared motion primitives panels animate with — see [§17.3 The Motion Toolbox](../../docs/architecture/17-web-client-up-close.md#173-the-motion-toolbox) |
| `src/ui/shell/boot/` | Boot splash overlay — see [§17.4 The Boot Splash](../../docs/architecture/17-web-client-up-close.md#174-the-boot-splash) |
| `src/ui/shell/lock/` | Session lock screen overlay — see [§17.5 The Session Lock](../../docs/architecture/17-web-client-up-close.md#175-the-session-lock) |
| `src/ui/fx/`, `src/ui/credit/`, `src/ui/equities/` | Per-domain panels, blotters, and tickets |
| `src/ui/admin/` | Admin dashboard — health KPIs, service topology, sessions, live event log |
| `tests/setup/` | jsdom test-environment polyfills (e.g. `localStorage` shim for Node 26) |
| `tests/ui/contract/` | UI contract tier — the React runner for the framework-neutral sociable RTL specs, which live in `@rtc/ui-contract` (own [README](tests/ui/contract/README.md)) |
| `tests/ui/visual/` | Visual tier — the React scenario host, the Playwright runner and the coverage instrument; the scenario matrix and the pixel goldens live in `@rtc/ui-contract` (own [README](tests/ui/visual/README.md)) |
| `tests/ui/__golden__/` | Shared golden JSON fixtures loaded via `loadGolden.ts` |

## Where to start reading

1. `src/main.tsx` — the entry point; shows exactly what gets mounted and in what order (fonts, `AppRoot`, `App`)
2. `src/app/coreHost.ts` then `src/AppRoot.tsx` — where the chosen core is composed over the page's ports (the host, framework-free) and meets React (`useRef`, not `useState`/`useMemo` — see the doc comment for why)
3. `src/app/buildBrowserPorts.ts` — real-WS-vs-simulator port wiring, the browser-specific half of composition
4. `src/ui/App.tsx` — the dumb top-level UI tree: `AmbientBackground`, `HeaderChrome`, the per-tab layout engine (`DockviewLayoutEngine` or `InhouseLayoutEngine`, by preference), `StatusBar`, `ConnectionOverlay`, `LockScreen`, `JarvisOverlay`, `JarvisPanelLayer`

## Dumb UI: the gate-enforced boundary

`src/ui` follows "dumb UI" — no streams, no storage, no transport, no clocks.
Components read every piece of data through `useViewModel()`
(`@rtc/react-bindings`); they never import `rxjs`, touch `localStorage`,
call `fetch`, or start a `setTimeout`/`setInterval` themselves. Four gates in
`tests/scripts/grep-gates.ts` make this a machine-checked boundary rather than
a convention (see [§12. Architectural Gates](../../docs/architecture/12-architectural-gates.md#12-architectural-gates)):

| Gate | Rule |
|---|---|
| 26 | No `rxjs` / `@react-rxjs` / `@rx-state` imports in `client-react/src/ui` (only `@rtc/react-bindings` may) |
| 27 | No `localStorage` in `client-react/src/ui` (persistence belongs behind `PreferencesPort`) |
| 28 | No `fetch(` / `import.meta.env` in `client-react/src/ui` (transport & config belong in `src/app`) |
| 29 | No `setTimeout` / `setInterval` in `client-react/src/ui` (time belongs in machines/presenters) |

This is what kept `@rtc/client-solid` a rewrite of `src/ui`
only — the SolidJS port ([§8.1](../../docs/architecture/08-replaceability-matrix.md#81-the-multi-client-proof--the-solidjs-port))
reused `client-core-rxjs` and `client-adapters`, `react-bindings`'s sibling `solid-bindings`, and the CSS Modules verbatim
precisely because gates 26–29 keep `src/ui` free of anything React- or
RxJS-specific beyond JSX and hooks.

## CSS Modules policy

Every component that renders markup has a co-located `<Component>.module.css`
(e.g. `src/ui/App.tsx` / `src/ui/App.module.css`) imported as
`import styles from "./X.module.css"` and applied via `className={styles.x}`.
Inline `style={{…}}` object literals are banned by an ESLint AST rule scoped
to client `src` (the root `eslint.config.mts`, the `no-restricted-syntax`
`inlineStyleProp` selector) — the only escape hatch is a runtime-computed CSS
custom property, opted out with an explicit
`// eslint-disable-next-line no-restricted-syntax -- <reason>`. The policy
exists so markup/styling ports verbatim to another framework — proven by the
SolidJS port, which byte-copied the CSS Modules unchanged: "CSS Modules
port verbatim — the CSS-modules migration deliberately left zero inline
styles and semantic `data-*` state hooks precisely so markup/styling survived
the swap" ([§8.1](../../docs/architecture/08-replaceability-matrix.md#81-the-multi-client-proof--the-solidjs-port)).

## Where the app composes the core

`src/app/` is where this package plugs the framework-free application core
into the browser. `main.tsx` first resolves and loads the core (`bootCore`),
then the core host (`src/app/coreHost.ts`) calls `core.createApp(ports)` on
the page's ports — built once by `main.tsx` with `buildBrowserPorts()` — and
wraps `{ presenters, commands }` in the devtools decorators; `src/AppRoot.tsx`
uses `createViewModel` from `@rtc/react-bindings` to build the `ViewModel` the
whole `src/ui` tree consumes through `useViewModel()`. A core picked in
Preferences is swapped in place by the host, over the same ports. `src/app/buildBrowserPorts.ts` builds the
`AppPorts` that composition needs: real `WsAdapter`/`WsReal*` ports when
`VITE_SERVER_URL` is set, in-process simulator ports otherwise, plus the
browser-only adapters (`BrowserConnectionEventsAdapter`,
`LocalStoragePreferencesAdapter`, `MediaQueryColorSchemeAdapter`) and the
one-shot boot-splash decision (`shouldPlayBootSplash` from `@rtc/boot-splash`). Full sequence:
[§14.3 Boot Sequences](../../docs/architecture/14-composition-and-wiring.md#143-boot-sequences).

## How it's used

No package imports this one. The `tests` workspace lists it as a dependency
because it is the application under test: the e2e suites start its dev server
(`RTC_CLIENT_PKG` selects it or `@rtc/client-solid`), and the dependency gives
Turborepo the build-order edge. The Node-socket full-stack smoke test
(`tests/fullstack/node-smoke.ts`) takes the real `WsAdapter` straight from the
adapters package:

```typescript
import { createWsRealPorts, WsAdapter } from "@rtc/client-adapters";
```

## Scripts

| script | purpose | report (under `reports/`) |
|---|---|---|
| `dev` | Vite dev server | — |
| `build` / `build-types` | Vite build + `.d.ts` emit | — |
| `typecheck` | app + node + ui-visual + ui-contract tsconfigs | — |
| `test:app` | **app tier** — Vitest (jsdom): presenters, adapters (`src/app`) | `app/` |
| `test:app:coverage` | **app-tier coverage** — report-only v8 coverage over `src/app` | `app/coverage/` |
| `test:ui:contract` | **ui contract tier** — sociable RTL specs over `src/ui` | `ui/contract/` |
| `test:ui:contract:coverage` | **≥95% coverage gate** — combined `src/ui` surface (contract specs + co-located unit tests) | `ui/contract/coverage/` |
| `test` | **default** — Vitest (jsdom): the union of the app and ui-contract tiers (run it for the current file/test counts) | `unit/` |
| `test:ui:visual` | **visual tier** — the sole surviving runner × every framework variant present | per-runner, below |
| `test:ui:visual:react` | the visual runner, react only | per-runner, below |
| `test:ui:visual:playwright:react[:update\|:ui]` | The CI-asserted tier — plain Playwright over a Vite host page | `ui/visual/playwright/react/` |
| `test:ui:visual:vitest-browser:react:coverage` | **visual gap-finder** — istanbul coverage of `src/ui` while every scenario renders through `vitest-browser-react`; the pixel assert is compiled out (`__RTC_VISUAL_SKIP_DIFF__`), so uncovered branches = no golden snapshot | `ui/visual/coverage/` |
| `clean` / `clean:deep` | remove build/test artifacts (/ + node_modules) | — |

Script naming: `test:ui:visual:<runner>:<framework>` — the framework axis exists
because the goldens + the framework-neutral fixtures in `@rtc/ui-contract`'s
`src/visual/` (aliased here as `@ui-visual-shared`) are the portability contract
for re-implementing this UI in another framework with pixel-parity.
`@rtc/client-solid` is exactly that: its `:solid` runners assert against these
same goldens (committed in `@rtc/ui-contract`'s `goldens/`, generated only from this package's renders — `client-solid` writes none of its own)
and were discovered by `tests/ui/visual/run-all.ts` with no edit to that file.

Caching: from the repo root, `pnpm test` runs through Turborepo and is
**cached** — an instant `>>> FULL TURBO` pass is a log replay because no input
changed; `pnpm test --force` re-runs for real. `pnpm test:ui:visual` is never
cached (`cache: false` in `turbo.json`). Invoked directly
(`pnpm --filter @rtc/client-react test`), scripts bypass turbo — always fresh, but
workspace deps (`@rtc/domain`, `@rtc/shared`) are not auto-built; run
`pnpm build` at the root first on a fresh checkout. See "Caching" in the root
README. The unit report under `reports/unit/` is a declared turbo output, so a cached
replay *restores* it — fresh reports need `--force` too.

## Test portfolio

The default `pnpm test` runs the **union** of two co-resident tiers (report
under `reports/unit/`); each tier also has a focused runner:

**App tier (`pnpm test:app`)** — co-located `src/app/**/*.test.ts(x)`: presenter
streams (`src/app/presenters/__tests__/`), WS adapters incl. real-gateway
contract tests (`src/app/adapters/`). No browser, no screenshots. Report under
`reports/app/`.

**UI contract tier (`pnpm test:ui:contract`)** — framework-neutral sociable
React Testing Library specs over `src/ui` (specs in `@rtc/ui-contract`, React runner in `tests/ui/contract/`): they assert
text, roles, structure, recorded command inputs, and dynamic re-renders — the
behavioural counterpart to the pixel-only visual tier, and the second
framework-swap portability pillar. Reports under `reports/ui/contract/`.

`test:ui:contract:coverage` is the **≥95% coverage gate** (statements / branches /
functions / lines) over the whole `src/ui` surface. It measures the **combined**
coverage of the two Phase-2 test styles — the neutral sociable contract specs
**and** the co-located `src/ui/**/*.test.{ts,tsx}` unit tests (hook/util edge
cases) — via a dedicated `vitest.coverage.config.ts`, so the percentage reflects
true coverage rather than just the contract tier. The plain `test:ui:contract`
runner stays pure (neutral specs only). The HTML report lands at
`reports/ui/contract/coverage/index.html`. **CI enforces the gate** (the
"UI contract coverage gate" step in `.github/workflows/ci.yml`). See
[`tests/ui/contract/README.md`](tests/ui/contract/README.md).

**Visual tier (`pnpm test:ui:visual`)** — screenshots of components and full pages
rendered against injected fake data via the `ViewModelProvider` seam; no server,
no presenters. Two runners share one scenario manifest
(`@rtc/ui-contract`'s `src/visual/scenarios.ts`, aliased here as
`@ui-visual-shared/scenarios`): the CI-asserted `playwright/` tier and the
coverage-only `vitest-browser/` instrument (pixel assert compiled out).
Playwright's goldens (under `@rtc/ui-contract`'s `goldens/`) are committed in TWO sets — `react/` (CI, x86) and
`react-local/<platform>-<arch>/` (fast local feedback). UI changes require
regenerating BOTH sets. These are the goldens `@rtc/client-solid`'s visual
tier asserts against (assert-only — it owns no golden set of its own).
**How to update them** (which command for a
regression vs. a deliberate change vs. a new scenario):
[`tests/ui/visual/UPDATING-GOLDENS.md`](tests/ui/visual/UPDATING-GOLDENS.md).
Full ADR + layout: [`tests/ui/visual/README.md`](tests/ui/visual/README.md).

**Browser e2e, presenter integration, and full-stack smokes** — NOT here;
they live in the [`tests/`](../../tests/README.md) workspace package.

The UI-contract and visual tiers above are two of the three mechanisms that
let `@rtc/client-solid` prove full parity against this package's own specs
and goldens; see
[§21 Cross-Framework Testing](../../docs/architecture/21-cross-framework-testing.md)
for the synthesis of all three.

## See also

- [Its §13 card](../../docs/architecture/13-codebase-map.md#132-l1----the-package-line-map)
- [§14.2 Adapter Tables Per App -- Web](../../docs/architecture/14-composition-and-wiring.md#142-adapter-tables-per-app)
- [§14.3 Boot Sequences](../../docs/architecture/14-composition-and-wiring.md#143-boot-sequences)
- [§8.1 The Multi-Client Proof -- The SolidJS Port](../../docs/architecture/08-replaceability-matrix.md#81-the-multi-client-proof--the-solidjs-port)
- [§12. Architectural Gates](../../docs/architecture/12-architectural-gates.md#12-architectural-gates)
- [§17. The Web Client, Up Close](../../docs/architecture/17-web-client-up-close.md) — layout engine, motion toolbox, boot splash, session lock, up close
