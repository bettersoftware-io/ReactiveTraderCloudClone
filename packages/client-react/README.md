# @rtc/client-react — React UI

React + RxJS + Vite client. Clean-architecture seam: components read ALL data
through `useViewModel()` (`ViewModel` interface); production wires presenters via
`@react-rxjs/core`, tests inject fakes through `ViewModelProvider`.

| | |
|---|---|
| **Ring** | ④ Frameworks & Drivers (`src/ui`) + ③ platform adapters (`src/app/adapters`) — per [§1.3.1](../../docs/architecture/01-overview.md#131-clean-architecture-concretely----which-package-is-which-ring) |
| **Runtime deps** | `@rtc/client-core`, `@rtc/domain`, `@rtc/react-bindings`, `react`, `react-dom`, `motion`, `rxjs`, `@fontsource/*` (`package.json` `dependencies`). `rxjs` is listed but confined to `src/app` — never `src/ui` (machine-enforced, gate 26). |
| **Consumed by** | The `tests` workspace only (`tests/package.json` lists `@rtc/client-react`; [§13.2](../../docs/architecture/13-codebase-map.md#132-l1----the-package-line-map)) — it is a shipping leaf app, not a library other packages import. |
| **Must never import** | `rxjs` / `@react-rxjs` / `@rx-state` in `src/ui` (gate 26); `localStorage` in `src/ui` (gate 27); `fetch(` / `import.meta.env` in `src/ui` (gate 28); `setTimeout` / `setInterval` in `src/ui` (gate 29) — all four enforced by `tests/scripts/grep-gates.ts`, see [§12](../../docs/architecture/12-architectural-gates.md#12-architectural-gates). |

## Folder map

| Path | What lives here |
|---|---|
| `src/main.tsx` | Entry point: font imports, mounts `<AppRoot><App /></AppRoot>` into `#root` |
| `src/AppRoot.tsx` | Composition root component — builds the app exactly once (lazy `useRef`, StrictMode-safe) and supplies `ViewModelProvider` + `ThemeProvider` + `BootGate` |
| `src/bootSplashGate.ts` | One-shot boot-splash suppression decision (`navigator.webdriver` / `?nosplash`) |
| `src/app/` | Browser platform adapters + composition wiring (Ring ③) — the only place in this package allowed to touch `rxjs`, `localStorage`, `fetch`/`import.meta.env` |
| `src/app/adapters/` | `BrowserConnectionEventsAdapter`, `LocalStoragePreferencesAdapter` |
| `src/app/theme/` | `MediaQueryColorSchemeAdapter` |
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
| `tests/ui/contract/` | UI contract tier — framework-neutral sociable RTL specs (own [README](tests/ui/contract/README.md)) |
| `tests/ui/visual/` | Visual tier — 3 runners × pixel goldens (own [README](tests/ui/visual/README.md)) |
| `tests/ui/__golden__/` | Shared golden JSON fixtures loaded via `loadGolden.ts` |

## Where to start reading

1. `src/main.tsx` — the entry point; shows exactly what gets mounted and in what order (fonts, `AppRoot`, `App`)
2. `src/AppRoot.tsx` — the composition root; where `@rtc/client-core`'s `createApp`/`createMachineFactories` meet React (`useRef`, not `useState`/`useMemo` — see the doc comment for why)
3. `src/app/buildBrowserPorts.ts` — real-WS-vs-simulator port wiring, the browser-specific half of composition
4. `src/ui/App.tsx` — the dumb top-level UI tree: `AmbientBackground`, `HeaderChrome`, the per-tab `WorkspaceEngine`, `StatusBar`, `ConnectionOverlay`, `LockScreen`

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
reused `client-core`, `react-bindings`'s sibling `solid-bindings`, and the CSS Modules verbatim
precisely because gates 26–29 keep `src/ui` free of anything React- or
RxJS-specific beyond JSX and hooks.

## CSS Modules policy

Every component that renders markup has a co-located `<Component>.module.css`
(e.g. `src/ui/App.tsx` / `src/ui/App.module.css`) imported as
`import styles from "./X.module.css"` and applied via `className={styles.x}`.
Inline `style={{…}}` object literals are banned by an ESLint AST rule scoped
to client `src` (`eslint.config.mjs:70-79`, the `no-restricted-syntax`
`inlineStyleProp` selector) — the only escape hatch is a runtime-computed CSS
custom property, opted out with an explicit
`// eslint-disable-next-line no-restricted-syntax -- <reason>`. The policy
exists so markup/styling ports verbatim to another framework — proven by the
SolidJS port, which byte-copied the CSS Modules unchanged: "CSS Modules
port verbatim — the CSS-modules migration deliberately left zero inline
styles and semantic `data-*` state hooks precisely so markup/styling survived
the swap" ([§8.1](../../docs/architecture/08-replaceability-matrix.md#81-the-multi-client-proof--the-solidjs-port)).

## Where the app composes the core

`src/app/` is where this package plugs the framework-free `@rtc/client-core`
into the browser. `src/AppRoot.tsx` calls `createApp(buildBrowserPorts())` once
(via a lazy `useRef`, StrictMode-safe) to get `{ presenters, commands }`, then
`createViewModel(presenters, createMachineFactories(presenters), commands)`
from `@rtc/react-bindings` to build the `ViewModel` the whole `src/ui` tree
consumes through `useViewModel()`. `src/app/buildBrowserPorts.ts` builds the
`AppPorts` that composition needs: real `WsAdapter`/`WsReal*` ports when
`VITE_SERVER_URL` is set, in-process simulator ports otherwise, plus the
browser-only adapters (`BrowserConnectionEventsAdapter`,
`LocalStoragePreferencesAdapter`, `MediaQueryColorSchemeAdapter`) and the
one-shot boot-splash decision from `src/bootSplashGate.ts`. Full sequence:
[§14.3 Boot Sequences](../../docs/architecture/14-composition-and-wiring.md#143-boot-sequences).

## How it's used

The only in-workspace consumer is the `tests` package, which imports the real
`WsAdapter` for its Node-socket full-stack smoke test
(`tests/fullstack/node-smoke.ts:17-18`):

```typescript
import { createWsRealPorts } from "@rtc/client-core";
import { WsAdapter } from "@rtc/client-react";
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
| `test` | **default** — Vitest (jsdom): union of app + ui-contract (72 files / 406 tests) | `unit/` |
| `test:ui:visual` | **visual tier** — every runner × every framework variant present, in parallel | per-runner, below |
| `test:ui:visual:react` | all visual runners, react only | per-runner, below |
| `test:ui:visual:playwright-ct:react[:update\|:ui]` | Tier 1 — Playwright Component Testing | `ui/visual/playwright-ct/react/` |
| `test:ui:visual:playwright:react[:update\|:ui]` | Tier 2 — plain Playwright over a Vite host page | `ui/visual/playwright/react/` |
| `test:ui:visual:vitest-browser:react[:update]` | Tier 3 — Vitest browser mode (`toMatchScreenshot`) | `ui/visual/vitest-browser/react/` |
| `test:ui:visual:vitest-browser:react:coverage` | **visual gap-finder** — istanbul coverage of `src/ui`; uncovered branches = no golden snapshot | `ui/visual/coverage/` |
| `clean` / `clean:deep` | remove build/test artifacts (/ + node_modules) | — |

Script naming: `test:ui:visual:<runner>:<framework>` — the framework axis exists
because the goldens + the framework-neutral fixtures in `@rtc/ui-contract`'s
`src/visual/` (aliased here as `@ui-visual-shared`) are the portability contract
for re-implementing this UI in another framework with pixel-parity.
`@rtc/client-solid` is exactly that: its `:solid` runners assert against these
same goldens (owned by this package — `client-solid` writes none of its own)
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

The default `pnpm test` runs the **union** of two co-resident tiers (72 files /
406 tests, report under `reports/unit/`); each tier also has a focused runner:

**App tier (`pnpm test:app`)** — co-located `src/app/**/*.test.ts(x)`: presenter
streams (`src/app/presenters/__tests__/`), WS adapters incl. real-gateway
contract tests (`src/app/adapters/`). No browser, no screenshots. Report under
`reports/app/`.

**UI contract tier (`pnpm test:ui:contract`)** — framework-neutral sociable
React Testing Library specs over `src/ui` (`tests/ui/contract/`): they assert
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
no presenters. Three runners share one scenario manifest
(`@rtc/ui-contract`'s `src/visual/scenarios.ts`, aliased here as
`@ui-visual-shared/scenarios`); goldens are committed in TWO sets per runner —
`react/` (CI, x86) and `react-local/<platform>-<arch>/` (fast local
feedback). UI changes require regenerating BOTH sets. These are the goldens
`@rtc/client-solid`'s three visual tiers assert against (assert-only — it owns
no golden set of its own). **How to update them** (which command for a
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
