# Visual tests

Screenshots of the UI layer rendered against injected fake data. No server,
no presenters, no live streams — the dependency graph stops at `HooksProvider`.

## Coverage

- **Shell** — connection status bar, offline overlay, header/footer/tabs, theme.
- **FX** — Tile (price up/down/flat, loading, and chart down/empty sparkline),
  LiveRatesPanel (chart **and** price view), AnalyticsPanel (populated,
  loading, negative-PnL, empty, all-flat positions), FxBlotter (populated,
  sorted, filtered, no-match, and each filter-type popover — date / number /
  set), and the full App on the FX tab (dark **and** light theme).
- **Credit** — RfqTilesPanel (populated + empty + the "All" filter tab), the
  RfqCard terminal states (done / expired / cancelled / accepted / passed),
  NewRfqForm (default, search-open, instrument-selected, filled, invalid),
  CreditBlotter (populated + empty), SellSidePanel (active / responded / empty),
  the CreditWorkspace sub-views (new-RFQ + sell-side tabs), and the full App on
  the Credit tab.
- **Admin** — the loaded AdminPanel slider (`admin/panel-loaded`) and the full
  App on the Admin tab. The throughput fetch is stubbed (`page.route` for the
  Playwright tiers, `window.fetch` for vitest-browser), since `AdminPanel` reads
  its own hook outside the `HooksProvider` seam.

### Interaction-driven goldens

The blotter sort/filter states, the RFQ "All" filter tab, and the new-RFQ form
states are reached by clicking/typing into controls keyed by **`data-testid`**.
The user authorized **`data-testid`-only** production additions for these (pure
attribute additions — no logic/markup/styling change), so the runner-neutral
`scenarioActions` table can drive multi-step interactions (its `steps` array:
`click` / `type` / `select` by testid). Each has a golden across all three runners.

### Excluded by design

These states have **no golden** on purpose (see
[`COVERAGE-GAPS.md`](./COVERAGE-GAPS.md) for the full per-file inventory):

- **Timer / transition / runtime-only** — the RFQ-active tile states (countdown,
  awaiting, confirmation), the stale "Reconnecting…" overlay, blotter-row hover,
  and the system-preference theme arm. These render only after a timer fires or a
  runtime preference resolves, so a static screenshot can't pin them.
- **Remaining testid-gated arms** — the filter `inRange` two-input arm, the set
  filter checkbox toggle, `DealerSelection` checkboxes, `QuickFilter`, and the
  tile execution/notional handlers were out of this batch's scope (their controls
  still have no `data-testid`). The sociable **contract** tier drives these
  handlers directly, so the behaviour is covered — only the pixel is not.

## Layout

```
tests/ui/visual/
  shared/            — Framework-neutral core (no React imports)
    appData.ts       — AppData type: the injectable data contract
    fixtures.ts      — Named fixture data sets
    scenarios.ts     — scenario name → { componentKey, fixture } manifest
  react/             — React render target (the @ui-visual alias barrel)
    buildFakeHooks.ts — AppData → AppHooks adapter
    registry.tsx      — componentKey → React element map
    VisualScenario.tsx — theme + provider + backdrop wrapper
    index.ts          — barrel export (the @ui-visual alias target)
  scenarioActions.ts — Runner-neutral per-scenario interaction table (used by
                       URL-driven runners to click/hover before screenshotting)
  playwright-ct/     — Tier 1: Playwright Component Testing specs + goldens
    playwright-ct.config.ts — in-suite runner config
    __screenshots__/react/
    *.spec.tsx
    host/            — CT bootstrap template (generated .cache/ is gitignored)
      index.html
      index.tsx
  playwright/        — Tier 2: plain Playwright over a Vite host + goldens
    playwright.config.ts — in-suite runner config
    __screenshots__/react/
    host/            — Tiny Vite app served at /?scenario=<name>
      index.html
      main.tsx
      vite.config.ts
    visual.spec.ts   — Framework-agnostic URL-navigation spec
  vitest-browser/    — Tier 3: Vitest browser mode (toMatchScreenshot) + goldens
    vitest-browser.config.ts — in-suite runner config
    __screenshots__/react/
    visual.spec.tsx  — Data-driven spec (shares scenarioActions with Tier 2)
  run-all.ts         — Parallel orchestrator (reads package.json scripts)
  ADR-001-visual-diff-tooling.md
  README.md          — this file
```

`shared/` is what a SolidJS UI reuses verbatim — it has zero React imports.
The contract is the data (`shared/`) and the goldens (`__screenshots__/`) — not
the React-shaped `AppHooks` interface, which each framework adapts to its own
model.

### Goldens: two committed sets (CI vs local)

Screenshot pixels depend on OS/arch font rasterization, so one golden set is not
portable across machines. Both configs route `snapshotPathTemplate` by
environment:

- **`__screenshots__/react/`** — rendered by CI on x86 Linux in the pinned
  Playwright container. This is the **canonical, enforced** set and the
  cross-framework contract. Regenerate it via the `update-visual-goldens`
  GitHub workflow (it runs in that container); never hand-edit it locally.
- **`__screenshots__/react-local/<platform>-<arch>/`** — written by a local
  `:update` run for a fast inner loop on your own machine (e.g.
  `react-local/linux-arm64/`). Committed and reviewed, but **not** re-rendered
  by CI, so it's your responsibility to regenerate it when the UI changes.

A non-CI run (no `CI` env var) reads/writes the `react-local/<plat>-<arch>` set;
CI reads/writes `react/`. An intentional UI change therefore means updating
**both** sets. See ADR-001 → "Cross-platform pixel drift" for the rationale.

## The three implemented runners

### Tier 1 — Playwright Component Testing (`playwright-ct/`)

Config: `playwright-ct/playwright-ct.config.ts`. Uses `@playwright/experimental-ct-react`
to mount `VisualScenario` directly inside a Chromium process via the CT adapter.
Each spec imports `@ui-visual` (the alias pointing at `react/`) and
calls `mount(...)` + `expect(component).toHaveScreenshot(...)`. Goldens live in
`playwright-ct/__screenshots__/react/`.

For a framework port, the `@ui-visual` alias in `playwright-ct.config.ts`'s
`ctViteConfig` is the single re-point: swap `react/` for `solid/`
and point to a matching CT adapter. (Note: the official Solid CT adapter lags the
core Playwright version — see ADR-001 for the adapter-status table and the
recommended alternative.)

### Tier 2 — Plain Playwright over a Vite host (`playwright/`)

Config: `playwright/playwright.config.ts`. Serves a tiny Vite page (`playwright/host/`)
that reads `?scenario=<name>` from the URL, looks up the scenario in `registry`,
and mounts `VisualScenario`. Playwright then navigates to `/?scenario=<name>`,
applies any per-scenario interactions from `scenarioActions.ts`, and calls
`toHaveScreenshot(...)`. Goldens live in `playwright/__screenshots__/react/`.

`playwright/visual.spec.ts` is **fully framework-agnostic** — it only
navigates URLs and takes screenshots. A SolidJS port reuses this spec verbatim;
only the host at `playwright/host/` needs a new `main.tsx` (or `main.tsx`
replaced by a Solid equivalent) that mounts the Solid `VisualScenario`.

### Tier 3 — Vitest browser mode (`vitest-browser/`)

Config: `vitest-browser/vitest-browser.config.ts`. Uses `vitest-browser-react`'s `render(...)`
to mount `VisualScenario` in a real Chromium via the `@vitest/browser-playwright`
provider, then diffs with Vitest 4's experimental
`expect.element(...).toMatchScreenshot(...)`. `vitest-browser/visual.spec.tsx`
is data-driven and **shares the `scenarioActions.ts` table with Tier 2**, so the
two stay behaviourally in lock-step. Goldens live in
`vitest-browser/__screenshots__/react/`.

This tier was originally blocked on the Vitest 3→4 upgrade (its matcher is
v4-only) and was deferred; once Plan A upgraded the repo to Vitest 4 — and the
unit suite's `WebSocket` stub was migrated to a real class — it was built. A few
v4-API specifics worth knowing (the provider is a factory from
`@vitest/browser-playwright`; the golden path is set via a custom
`resolveScreenshotPath`; full-bleed `App` shots target `document.body` since they
have no `scenario-root`; the admin fetch is stubbed via `window.fetch`) are
documented in [`ADR-001-visual-diff-tooling.md`](./ADR-001-visual-diff-tooling.md)
under "Vitest browser mode — implemented (Tier 3)".

For a Solid port, swap the `@ui-visual` alias and `vitest-browser-react` for the
framework's render shim — there's no lagging CT adapter to track, which is why
this tier is the recommended Solid driver.

## Commands

### Run everything

```
pnpm test:ui:visual              # runs all implemented runners concurrently, prints summary
pnpm test:ui:visual:react        # same (today every runner is :react — identical)
```

### Per-runner

```
pnpm test:ui:visual:playwright-ct:react          # Tier 1: CT runner
pnpm test:ui:visual:playwright-ct:react:update   # regenerate Tier 1 goldens
pnpm test:ui:visual:playwright-ct:react:ui       # Playwright UI for Tier 1

pnpm test:ui:visual:playwright:react             # Tier 2: URL-driven runner
pnpm test:ui:visual:playwright:react:update      # regenerate Tier 2 goldens
pnpm test:ui:visual:playwright:react:ui          # Playwright UI for Tier 2

pnpm test:ui:visual:vitest-browser:react         # Tier 3: Vitest browser mode
pnpm test:ui:visual:vitest-browser:react:update  # regenerate Tier 3 goldens
```

`test:ui:visual` and `test:ui:visual:react` are wired to
`tsx tests/ui/visual/run-all.ts`. The orchestrator reads `package.json`
scripts and discovers every entry matching
`test:ui:visual:<runner>:<framework>` (exactly five colon-delimited parts). When a
`:solid` framework set lands (with its own runner scripts), it is auto-discovered
with no edit to `run-all.ts`.

**Perf caveat:** `test:ui:visual` runs runners concurrently for fast feedback.
Concurrent runs contend for CPU/GPU, so the wall-clock time is NOT a fair
per-runner benchmark. Run a single runner in isolation to measure actual speed.

## Type-checking

The harness is type-checked by `pnpm typecheck` via `tsconfig.ui-visual.json`.
The main `tsconfig.json` restricts `rootDir` to `src`; without the separate
visual project, drift between `buildFakeHooks` and the `AppHooks` interface
would go unnoticed (the Playwright CT bundle strips types without checking
them). The ui-visual tsconfig covers both `src` and `tests` (the whole
visual suite, including `run-all.ts` — minus
`playwright-ct/playwright-ct.config.ts`, see the comment in the tsconfig).

## Porting to another UI framework (e.g. SolidJS)

The goal: run the **same** scenarios and match the **same** goldens.

**What to reuse verbatim:**

- `shared/` — untouched (or extracted to a shared package)
- `playwright/visual.spec.ts` — URL-driven, zero framework assumptions
- `playwright-ct/__screenshots__/react/` and
  `playwright/__screenshots__/react/` — the canonical (CI-enforced)
  golden contract (see "Goldens: two committed sets" above; the per-arch
  `react-local/` sets are local-feedback only)

**What to implement for the new framework:**

1. A new `<framework>/` folder with:
   - `buildFakeHooks.ts` (or equivalent) — AppData fed into that framework's
     context/store model
   - `registry` — same `componentKey`s mapped to the new components
   - `VisualScenario` wrapper (theme + provider + backdrop)
   - `index.ts` barrel (the `@ui-visual` alias target)
2. A new `playwright-ct/` CT config if a stable CT adapter exists for
   the framework; otherwise use the plain-Playwright host (Tier 2).
3. New scripts `test:ui:visual:playwright-ct:<framework>` /
   `test:ui:visual:playwright:<framework>` in `package.json`. They are discovered
   automatically by `run-all.ts`.

**The single framework seam:**

The `@ui-visual` alias is declared in each runner's Vite config and in
`tsconfig.ui-visual.json`'s `paths`. Pointing it at
`tests/ui/visual/<new-framework>` is
the only structural change. The plain-Playwright `visual.spec.ts` needs **no
change at all** — it only navigates URLs.

For the full rationale, the adapter-status table, and guidance on choosing a
driver per target (CT adapter vs. vitest-browser vs. plain Playwright), see
[`ADR-001-visual-diff-tooling.md`](./ADR-001-visual-diff-tooling.md).

## Coverage gaps

`test:ui:visual:vitest-browser:react:coverage` instruments `src/ui` (istanbul)
while the vitest-browser tier renders every scenario, so uncovered branches are
visual states with no golden. The report (HTML + `lcov.info`) lands at
`reports/ui/visual/coverage/` (open `reports/ui/visual/coverage/index.html`); it
is report-only, with no threshold gate. See [`COVERAGE-GAPS.md`](./COVERAGE-GAPS.md)
(snapshot 2026-06-16) for the current inventory. Red = definitely no snapshot;
green = rendered into some frame (not a guarantee of a dedicated scenario). The
denominator is `src/ui/**/*.tsx` only — pure `.ts` logic/hook files belong to the
unit/contract tiers.

> **CI golden caveat.** The canonical x86 `react/` goldens are generated by the
> `update-visual-goldens` GitHub workflow (it runs in the pinned x86 Playwright
> container); they **cannot** be produced in the aarch64 dev container, which
> writes only the `react-local/linux-arm64/` set. When a PR adds or changes
> scenarios, the local set is committed here but the CI `react/` set lags until
> the workflow runs — so the **visual CI job stays red until that workflow
> regenerates `react/`**. That is expected on such a PR, not a regression.
