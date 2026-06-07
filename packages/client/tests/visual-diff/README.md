# Visual-diff tests

Screenshots of the UI layer rendered against injected fake data. No server,
no presenters, no live streams — the dependency graph stops at `HooksProvider`.

## Coverage

- **Shell** — connection status bar, offline overlay, header/footer/tabs, theme.
- **FX** — Tile (price / loading), LiveRatesPanel, AnalyticsPanel, FxBlotter
  (populated), and the full App on the FX tab (dark **and** light theme).
- **Credit** — RfqTilesPanel, NewRfqForm, CreditBlotter, SellSidePanel, and the
  full App on the Credit tab.
- **Admin** — the App on the Admin tab (the throughput fetch is stubbed in the
  spec via `page.route`, since `AdminPanel` reads its own hook outside the
  `HooksProvider` seam).

Excluded by design: the RFQ-active tile states (countdown / confirmation) are
timer-driven and non-deterministic, so they are not screenshotted here.

## Layout

```
visual/
  shared/            — Framework-neutral core (no React imports)
    appData.ts       — AppData type: the injectable data contract
    fixtures.ts      — Named fixture data sets
    scenarios.ts     — scenario name → { componentKey, fixture } manifest
  react/             — React render target (the @ui-harness alias barrel)
    buildFakeHooks.ts — AppData → AppHooks adapter
    registry.tsx      — componentKey → React element map
    VisualScenario.tsx — theme + provider + backdrop wrapper
    index.ts          — barrel export (the @ui-harness alias target)
  scenarioActions.ts — Runner-neutral per-scenario interaction table (used by
                       URL-driven runners to click/hover before screenshotting)
  playwright-ct/     — Tier 1: Playwright Component Testing specs + goldens
    __screenshots__/react/
    *.spec.tsx
  playwright/        — Tier 2: plain Playwright over a Vite host + goldens
    __screenshots__/react/
    host/            — Tiny Vite app served at /?scenario=<name>
      index.html
      main.tsx
      vite.config.ts
    visual.spec.ts   — Framework-agnostic URL-navigation spec
  vitest-browser/    — Tier 3: Vitest browser mode (toMatchScreenshot) + goldens
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

Config: `playwright-ct.config.ts`. Uses `@playwright/experimental-ct-react`
to mount `VisualScenario` directly inside a Chromium process via the CT adapter.
Each spec imports `@ui-harness` (the alias pointing at `visual/react/`) and
calls `mount(...)` + `expect(component).toHaveScreenshot(...)`. Goldens live in
`visual/playwright-ct/__screenshots__/react/`.

For a framework port, the `@ui-harness` alias in `playwright-ct.config.ts`'s
`ctViteConfig` is the single re-point: swap `react/` for `solid/`
and point to a matching CT adapter. (Note: the official Solid CT adapter lags the
core Playwright version — see ADR-001 for the adapter-status table and the
recommended alternative.)

### Tier 2 — Plain Playwright over a Vite host (`playwright/`)

Config: `playwright.config.ts`. Serves a tiny Vite page (`visual/playwright/host/`)
that reads `?scenario=<name>` from the URL, looks up the scenario in `registry`,
and mounts `VisualScenario`. Playwright then navigates to `/?scenario=<name>`,
applies any per-scenario interactions from `scenarioActions.ts`, and calls
`toHaveScreenshot(...)`. Goldens live in `visual/playwright/__screenshots__/react/`.

`visual/playwright/visual.spec.ts` is **fully framework-agnostic** — it only
navigates URLs and takes screenshots. A SolidJS port reuses this spec verbatim;
only the host at `visual/playwright/host/` needs a new `main.tsx` (or `main.tsx`
replaced by a Solid equivalent) that mounts the Solid `VisualScenario`.

### Tier 3 — Vitest browser mode (`vitest-browser/`)

Config: `vitest-browser.config.ts`. Uses `vitest-browser-react`'s `render(...)`
to mount `VisualScenario` in a real Chromium via the `@vitest/browser-playwright`
provider, then diffs with Vitest 4's experimental
`expect.element(...).toMatchScreenshot(...)`. `visual/vitest-browser/visual.spec.tsx`
is data-driven and **shares the `scenarioActions.ts` table with Tier 2**, so the
two stay behaviourally in lock-step. Goldens live in
`visual/vitest-browser/__screenshots__/react/`.

This tier was originally blocked on the Vitest 3→4 upgrade (its matcher is
v4-only) and was deferred; once Plan A upgraded the repo to Vitest 4 — and the
unit suite's `WebSocket` stub was migrated to a real class — it was built. A few
v4-API specifics worth knowing (the provider is a factory from
`@vitest/browser-playwright`; the golden path is set via a custom
`resolveScreenshotPath`; full-bleed `App` shots target `document.body` since they
have no `scenario-root`; the admin fetch is stubbed via `window.fetch`) are
documented in [`ADR-001-visual-diff-tooling.md`](./ADR-001-visual-diff-tooling.md)
under "Vitest browser mode — implemented (Tier 3)".

For a Solid port, swap the `@ui-harness` alias and `vitest-browser-react` for the
framework's render shim — there's no lagging CT adapter to track, which is why
this tier is the recommended Solid driver.

## Commands

### Run everything

```
pnpm test:visual              # runs all implemented runners concurrently, prints summary
pnpm test:visual:react        # same (today every runner is :react — identical)
```

### Per-runner

```
pnpm test:visual:playwright-ct:react          # Tier 1: CT runner
pnpm test:visual:playwright-ct:react:update   # regenerate Tier 1 goldens
pnpm test:visual:playwright-ct:react:ui       # Playwright UI for Tier 1

pnpm test:visual:playwright:react             # Tier 2: URL-driven runner
pnpm test:visual:playwright:react:update      # regenerate Tier 2 goldens
pnpm test:visual:playwright:react:ui          # Playwright UI for Tier 2

pnpm test:visual:vitest-browser:react         # Tier 3: Vitest browser mode
pnpm test:visual:vitest-browser:react:update  # regenerate Tier 3 goldens
```

`test:visual` and `test:visual:react` are wired to `tsx visual/run-all.ts`.
The orchestrator reads `package.json` scripts and discovers every entry matching
`test:visual:<runner>:<framework>` (exactly four colon-delimited parts). When a
`:solid` framework set lands (with its own runner scripts), it is auto-discovered
with no edit to `run-all.ts`.

**Perf caveat:** `test:visual` runs runners concurrently for fast feedback.
Concurrent runs contend for CPU/GPU, so the wall-clock time is NOT a fair
per-runner benchmark. Run a single runner in isolation to measure actual speed.

## Type-checking

The harness is type-checked by `pnpm typecheck` via `tsconfig.visual.json`. The
main `tsconfig.json` restricts `rootDir` to `src`; without the separate visual
project, drift between `buildFakeHooks` and the `AppHooks` interface would go
unnoticed (the Playwright CT bundle strips types without checking them). The
visual tsconfig covers both `src` and `visual`, including `run-all.ts`.

## Porting to another UI framework (e.g. SolidJS)

The goal: run the **same** scenarios and match the **same** goldens.

**What to reuse verbatim:**

- `shared/` — untouched (or extracted to a shared package)
- `visual/playwright/visual.spec.ts` — URL-driven, zero framework assumptions
- `visual/playwright-ct/__screenshots__/react/` and
  `visual/playwright/__screenshots__/react/` — the canonical (CI-enforced)
  golden contract (see "Goldens: two committed sets" above; the per-arch
  `react-local/` sets are local-feedback only)

**What to implement for the new framework:**

1. A new `visual/<framework>/` folder with:
   - `buildFakeHooks.ts` (or equivalent) — AppData fed into that framework's
     context/store model
   - `registry` — same `componentKey`s mapped to the new components
   - `VisualScenario` wrapper (theme + provider + backdrop)
   - `index.ts` barrel (the `@ui-harness` alias target)
2. A new `visual/playwright-ct/` CT config if a stable CT adapter exists for
   the framework; otherwise use the plain-Playwright host (Tier 2).
3. New scripts `test:visual:playwright-ct:<framework>` /
   `test:visual:playwright:<framework>` in `package.json`. They are discovered
   automatically by `run-all.ts`.

**The single framework seam:**

The `@ui-harness` alias is declared in each runner's Vite config and in
`tsconfig.visual.json`'s `paths`. Pointing it at `visual/<new-framework>` is
the only structural change. The plain-Playwright `visual.spec.ts` needs **no
change at all** — it only navigates URLs.

For the full rationale, the adapter-status table, and guidance on choosing a
driver per target (CT adapter vs. vitest-browser vs. plain Playwright), see
[`ADR-001-visual-diff-tooling.md`](./ADR-001-visual-diff-tooling.md).
