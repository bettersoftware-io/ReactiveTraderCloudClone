# SolidJS Port — `@rtc/solid-bindings` + `@rtc/client-solid`

**Date:** 2026-07-12
**Status:** Approved design, pre-plan
**Realises:** `docs/architecture/08-replaceability-matrix.md` §8.1 (the SolidJS plan)

## 1. Goal & success criteria

Port the web client to SolidJS as the full replaceability proof: a second web
framework rendering the same application from the same `@rtc/client-core`,
verified by the same contracts. Done means:

- `@rtc/client-solid` renders the **entire** app: FX, Credit, Equities, Admin,
  shell chrome, boot sequence (all scene variants), layout engine, all 5 skins
  × dark/light.
- The UI contract suite runs against Solid through a new `solid/` swap-trio,
  with its own ≥95% coverage gate over `client-solid/src/ui`.
- Solid renders **match the existing `react/` visual golden trees** (all three
  tiers, full theme matrix) — no new golden set.
- The Gherkin behavioural suites run against the Solid client unchanged
  (features, steps, page objects, testids all reused).
- All gates are symmetric with `client-react` and **required on PRs** (goldens
  stay post-merge on `visual.yml`, as they are for React).

## 2. Decisions locked during brainstorming

| Decision | Choice |
|---|---|
| Scope | Full parity, all gates |
| Deployment | Local + CI only — **no** Vercel project in this workstream |
| CI gating | Symmetric with react: contract coverage + e2e gate PRs; goldens post-merge |
| Port target | Today's `client-react` (v3-synced) + its committed goldens, frozen. A later v4 sync is a change applied to both clients |
| Bindings API | **Accessor-returning**: same ViewModel member names, Solid-native return types |
| Contract-suite home | **Extract** specs + shared harness to a neutral workspace package |
| Goldens | Solid asserts against the existing `react/` / `react-local/<arch>` trees directly, assert-only; no `solid/` golden tree, no escape hatch |

## 3. New packages

### 3.1 `@rtc/solid-bindings` (`packages/solid-bindings`)

Deps: `@rtc/client-core`, `@rtc/domain` (workspace), `solid-js`,
`@rx-state/core`. Mirrors `react-bindings` file-for-file.

**`createViewModel.ts`** — a `ViewModel` interface with the **same ~55 member
names** as `packages/react-bindings/src/createViewModel.ts:160`, Solid-native
returns:

- Stream hooks: `usePrice(pair): Accessor<Price | null>`, etc.
- Machine hooks: `{ state: Accessor<S> } & TIntents`.
- Command hooks: unchanged — stable plain functions
  (`useAcceptQuote(): (quoteId) => Promise<void>`).

Rationale: Solid components run **once**; value-returning signatures would
freeze at first value. The contract swap-trio absorbs the signature
difference — the seam is the member list, not React's call convention.

Implementation core: one helper, `bindSignal(source$, default)`:

1. Shares/refcounts the source via `@rx-state/core`'s `state()` — the exact
   framework-neutral primitive react-rxjs's `bind()` wraps (the "solid-rxjs
   analogue" §8.1 promised). Parameterized members key the shared
   StateObservable by args, as `bind((pair) => …)` does.
2. Reads `currentValue` **synchronously** when the source is warm, else the
   default. This dodges by construction the react-rxjs warm-value trap
   (`bind()` serving the default on first render over a warm source —
   documented at `createViewModel.ts:539-567`, the eqWorkspace first-render
   crash).
3. Subscribes into a `createSignal`, disposing via `onCleanup`.

**`useMachine.ts`** — `factory()` once (no lazy-ref dance; single-run
components), `onCleanup(() => machine.dispose())`. **No microtask-deferred
disposal**: Solid has no StrictMode double-mount, so copying React's deferral
would be a bug, not a safety net. State read: the machine's own warm `state$`
directly (never re-wrapped), mirroring the React bridge's reasoning.

**`ViewModelContext.ts` / `ViewModelProvider.tsx` / `useViewModel.ts`** — Solid
`createContext` equivalents, same export names as react-bindings' barrel.

**Tests** — mirror `react-bindings`' suites (boot-gate first render, machine
lifecycle/dispose-once, preference hooks, animation intents) via
`@solidjs/testing-library` under vitest.

### 3.2 `@rtc/client-solid` (`packages/client-solid`)

Deps: `@rtc/client-core`, `@rtc/solid-bindings`, `@rtc/domain`, and
`@rtc/motion-core` where `client-react` uses it. Build: Vite +
`vite-plugin-solid`. Structure mirrors `client-react`:

- **`src/app/`** — `buildBrowserPorts` + the three browser adapters
  (`LocalStoragePreferencesAdapter`, `BrowserConnectionEventsAdapter`,
  `MediaQueryColorSchemeAdapter`) are framework-free TS, **copied verbatim**.
  Deliberate duplication per the RN precedent (platform adapters belong to
  each client); revisit extraction only if a third web client appears.
- **`src/ui/`** — the 118 components rewritten in Solid JSX. All 84
  `*.module.css` files and every `data-testid` / semantic `data-*` state hook
  copied **byte-identical** — that is what makes goldens and Gherkin POs
  reusable. Mechanical JSX deltas: `className`→`class`, `.map()`→`<For>`,
  conditional renders→`<Show>`, ref callbacks→Solid refs, no `key` props;
  `memo`/`useCallback`/dep arrays deleted. Motion-core shells re-implemented
  as thin Solid wrappers over the same pure functions (per ADR-005).
- **`src/AppRoot.tsx` / `src/main.tsx`** — composition root:
  `createApp(buildBrowserPorts())` + `createMachineFactories` from
  `client-core` (verbatim), `createViewModel`/`ViewModelProvider` from
  `solid-bindings`, mounted with Solid's `render()` (no StrictMode
  equivalent needed).

**Dependency-rule additions:** `client-solid` → {client-core, solid-bindings,
domain, motion-core}; `solid-bindings` → {client-core, domain}. No client
imports another client; no Solid types below the bindings.

## 4. Verification & tooling wiring

### 4.1 Contract-suite extraction (`@rtc/ui-contract`, lands first)

New workspace package `packages/ui-contract` receives the framework-neutral
parts of `packages/client-react/tests/ui/contract/`: the 82
`specs/**/*.contract.spec.ts` and the whole `shared/` harness (World,
neutral page objects, `component()` token registry, `mount`/`activeDriver`),
plus the visual suite's shared scenario matrix (`scenarios.ts`,
`goldenPath.ts`). Deps: `domain` + `client-core` (types).

Each client keeps its framework dir + vitest config:

- `client-react/tests/ui/contract/react/` — existing swap-trio, untouched
  except the `@ui-contract` alias resolving to the new package; its config
  globs specs from `@rtc/ui-contract`.
- `client-solid/tests/ui/contract/solid/` — new trio:
  - `setup.ts` — `setDriver(solidDriver)` + cleanup.
  - `render.tsx` — Solid `render()` inside the provider stack
    (`ViewModelProvider → ThemeProvider → view providers → props host`);
    `flushSync` near-no-op (Solid updates synchronously — no `act()`).
  - `registry.tsx` — ComponentToken → Solid component builder.
  - `viewModelFromWorld.ts` — World → accessor-returning ViewModel.
  - Props host: a signal-driven props wrapper (replaces the
    `useSyncExternalStore` bridge), plus Solid ports of the aux hosts
    (AnimationProbe, LayoutEngineHost, pinned fixture layout port).

**Coverage gate duplicated symmetrically:** `client-solid` gets
`test:ui:contract:coverage` with 95/95/95/95 thresholds over its own
`src/ui/**`, added as a CI step in the `checks` job next to the react one.

### 4.2 Visual goldens — code moves, artifacts don't

- Golden PNG trees (`__screenshots__/react/`, `react-local/<arch>`) **stay in
  `client-react`**, which remains the sole golden *generator*
  (`update-visual-goldens.yml` unchanged).
- `client-solid` gets its own three tier configs + hosts (`playwright`,
  `playwright-ct`, `vitest-browser`) rendering the **shared scenario matrix**;
  their `snapshotPathTemplate` points cross-package at the react trees,
  **assert-only** (Solid can never regenerate the contract it must satisfy;
  no `--update-snapshots` path for solid runs).
- Scripts named `test:ui:visual:<tier>:solid` — the aggregator
  (`tests/ui/visual/run-all.ts` pattern, keyed on 5-part script names) picks
  them up automatically. Existing 0.06 `maxDiffPixelRatio` absorbs
  rasterization noise; any genuine divergence is a fidelity bug to fix.
- `visual.yml` stays post-merge and now covers both frameworks
  (`RTC_VISUAL_MAX_PARALLEL=1` discipline unchanged).

### 4.3 Gherkin e2e

- `tests/scripts/devServer.ts`: parameterize the single hardcoded coupling
  (`spawn("pnpm", ["--filter", "@rtc/client-react", "dev"])`) via
  `RTC_CLIENT_PKG` (default `@rtc/client-react`).
- `tests/scripts/run-all.ts`: add solid-targeted browser suite entries (react
  keeps ports 3001+; solid gets the next port block).
- Features, steps, PO contracts, `contracts/testids.ts`, Playwright + Cypress
  drivers: **unchanged** — POs bind through `data-testid`, which the Solid
  client emits identically.

### 4.4 Gates & lint

- `tests/scripts/grep-gates.ts`: gates **34–37** for `client-solid/src/ui`
  (no `rxjs`/`@rx-state` imports, no localStorage, no
  fetch/`import.meta.env`, no timers — clone of 26–29, RN's 30–33 as the
  third-client template).
- Cross-framework hygiene gates: no `react`/`react-dom` imports anywhere in
  `client-solid` or `solid-bindings`; no `solid-js` in `client-react` or
  `react-bindings`.
- ESLint: `client-solid/src/**` joins the path-scoped dumb-UI blocks in
  **both** configs (base + typed); custom rules (newspaper-order,
  one-component-per-file, no-render-functions, class-filename-match) apply
  as-is. Solid-specific pattern watch: destructuring props kills reactivity —
  add `eslint-plugin-solid` (its recommended rules cover this).
- stylelint covers the new package via the existing `packages/*/src/**` glob.

### 4.5 New-package registration checklist (per-package trap list)

For **each** of `ui-contract`, `solid-bindings`, `client-solid`:
knip `workspaces` entry (explicit map — silent skip otherwise); tsconfig
`references` to workspace deps + `#/*` paths; `typecheck` + `test*` scripts
(enforced by `check:scripts`); syncpack/manypkg consistency;
`tsconfig.eslint.json` covers them via glob (verify). New deps (`solid-js`,
`vite-plugin-solid`, `@solidjs/testing-library`, `eslint-plugin-solid`) must
clear the 24h `minimumReleaseAge` cooldown and the `allowBuilds` allowlist —
pick newest versions ≥24h old (`pnpm outdated -r` discipline).

Dev server: `pnpm dev:solid` root script → `client-solid` Vite dev on its own
port (outside the 3001+ e2e block and existing 5273/8899 dev ports).

## 5. Phasing (one PR per phase, full gauntlet each)

- **Phase 0 — Contract extraction.** Create `@rtc/ui-contract`, move specs +
  harness + scenario matrix, re-alias the react trio; everything green before
  any Solid code exists. Pure refactor; valuable standalone.
- **Phase 1 — solid-bindings + scaffold.** Both Solid packages scaffolded with
  **all** monorepo registration (knip, eslint blocks, tsconfig, gates 34–37
  wired, trivially green), bindings implemented + unit-tested, walking
  skeleton: app boots in simulator mode and renders connection status.
- **Phase 2 — Shell + FX.** App chrome (tabs, theme, boot sequence, layout
  engine) + the largest tab. `solid/` swap-trio lands; shell+FX contract
  specs green.
- **Phase 3 — Credit, Equities, Admin.** Three disjoint subtrees → three
  parallel implementer subagents, each gated by its domain's contract specs.
  Coverage gate flips on at ≥95% at phase end.
- **Phase 4 — Visual parity.** Solid's three visual tiers wired against the
  react golden trees; iterate fidelity bugs until diffs pass locally and in
  the pinned container.
- **Phase 5 — E2E + CI + docs.** devServer parameterization, solid run-all
  entries, CI steps, and the doc sync: §8.1 planned→shipped (+
  `framework-swap.svg`), §6 dependency graph, §13 codebase map, package
  READMEs, CLAUDE.md package table.

## 6. Risks

1. **First-frame semantics differ by design.** `bind()` serves the default on
   first render even over warm sources; `bindSignal` reads warm values
   synchronously — Solid is *more* correct on frame one. Boot-gate /
   first-render goldens are where divergence would surface; the fix is
   matching observable behaviour, never copying the react-rxjs quirk.
2. **Visual determinism plumbing.** The react visual hosts pin animation
   state (fixture layout port, animation probe, `document.fonts` force-load,
   `setCurrentTime`-style freezing). Solid hosts must replicate every pinning
   trick; missed ones present as flaky diffs, not logic bugs.
3. **Dependency cooldown.** New deps must clear `minimumReleaseAge` before
   Phase 1 — check first, not mid-phase.
4. **Effort honesty.** §8.1's "~1 day + ~1 week" describes the bindings + raw
   component rewrite; the calibrated full scope is 118 components, 3 visual
   tiers, and 5 CI surfaces. Multi-PR workstream, absorbed by the phasing.

Error handling is inherited, not designed: presenters/machines own all async
failure paths; the Solid UI, like the React UI, only renders state and fires
intents.
