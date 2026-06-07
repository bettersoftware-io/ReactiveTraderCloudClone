# ADR-001: Tooling for the visual-diff test tier

**Status:** Accepted (retrospective — the choice was made in the implementation
plan; this records the rationale and the framework-migration guidance).

## Context

We want a deterministic visual-regression tier that screenshots `@rtc/client`
UI rendered against injected fake data (`AppHooks`), with one explicit goal
beyond catching CSS regressions: the **same baselines must later gate a
reimplementation of the UI layer in another framework** (SolidJS is the stated
near-term target; Vue/Svelte/Angular are possible). True pixel diffing rules out
jsdom/happy-dom (they don't lay out or paint), so a real browser engine is
mandatory.

## Decision

Use **Playwright Component Testing** (`@playwright/experimental-ct-react`),
bundling via Vite (`@vitejs/plugin-react`, already a client dependency).

Reasons, in priority order:

1. **In-repo goldens are the cross-framework contract.** `toHaveScreenshot`
   writes committed PNGs under `__screenshots__/`; a future framework points its
   `snapshotPathTemplate` at the *same* directory. A cloud service
   (Chromatic/Percy/Applitools) stores baselines off-repo and behind an account,
   which breaks that contract and the repo's "works from a cold/offline
   checkout" philosophy.
2. **Vite-native, minimal config.** The harness is essentially
   `ctViteConfig: { plugins: [react()] }`; a Solid port reuses the same runner
   with `vite-plugin-solid`.
3. **Reuses the existing engine.** The e2e tier already runs Playwright; one
   engine, one version to manage (we keep `@playwright/test` and
   `experimental-ct-react` pinned to the same version).
4. **Cypress was a documented dead-end here.** Its command-queue model is
   incompatible with the Promise-shaped page-object contracts, and `.should()`
   retry starves the app's timers. Playwright's `await`/auto-retry model fits a
   tier that mounts live components and needs deterministic settle.

## Consequences / known weaknesses

- **Experimental API.** `experimental-ct-*` can change between releases.
- **Cross-platform pixel drift → two committed baselines.** Screenshot pixels
  depend on OS/arch font rasterization (FreeType/HarfBuzz), so a single golden
  filename is *not* portable across machines. We route by environment
  (`snapshotPathTemplate` in both Playwright configs): CI renders on x86 Linux
  inside the pinned Playwright container and owns the canonical `react/`
  baseline — the cross-framework contract, and the only set the CI visual job
  re-renders and enforces. A local dev machine writes its own committed
  `react-local/<platform>-<arch>/` set, giving a fast local inner loop without
  an emulated container (which on Apple Silicon would be slow qemu amd64). Both
  sets are versioned and reviewed at commit time; an intentional UI change must
  regenerate **both** — the x86 set via the `update-visual-goldens` workflow,
  each local set via the runner's `:update` script — since no CI runner
  reproduces a developer's architecture.
- **No review UI.** Baselines are inspected by eye and committed (no
  Chromatic-style approve/reject workflow).

## Alternatives considered

- **Vitest browser mode** (v4): the closest alternative since the repo already
  runs Vitest. It was *not* chosen as the primary tier (its `toMatchScreenshot`
  is newer/less mature than `toHaveScreenshot`'s masking/threshold/retry), but it
  was later **adopted as a complementary third tier** once the Vitest 4
  prerequisite landed, and is the recommended *driver for a Solid port* — see
  "Vitest browser mode — implemented (Tier 3)" below.
- **Storybook + test-runner / Chromatic:** duplicates the role of
  `scenarios.ts`/`registry.tsx`, adds a large dependency, and (Chromatic) moves
  baselines off-repo.
- **Cloud SaaS (Percy/Applitools/Lost Pixel):** robust diffing + review UI, but
  off-repo baselines and an account requirement — rejected for the contract and
  offline-checkout reasons above.
- **jsdom + jest-image-snapshot:** non-starter; jsdom does not paint.

### Vitest browser mode — implemented (Tier 3)

A third comparison tier driven by Vitest's `@vitest/browser` +
`vitest-browser-react`, using the **experimental**
`expect.element(...).toMatchScreenshot()` matcher (Vitest 4). It mounts the React
harness in a real Chromium via the Playwright provider and diffs against the same
committed, env-routed goldens as the other tiers
(`visual/vitest-browser/__screenshots__/{react ⎮ react-local/<plat>-<arch>}/`).

**Previously blocked, now unblocked.** This tier was originally dropped at a
decision gate because `toMatchScreenshot` needs **Vitest 4**, and at the time the
repo pinned **Vitest 3.2.4** sharing one `vitest` dependency with the unit suite.
Bumping to v4 then regressed `src/app/adapters/WsAdapter.test.ts` (9/69 tests): a
v4 `vi.stubGlobal` change invokes the stubbed global with `new`, and the test
stubbed `WebSocket` with an **arrow function** (not a constructor). Both blockers
are now resolved — Plan A upgraded the repo to `vitest@4.1.8`, and the stub is now
a real class (`vi.stubGlobal("WebSocket", MockWebSocket)`), the exact v4-safe form
the original finding prescribed. The unit suite is green on v4 (26 files / 69
tests), so the tier was built.

**API specifics (stable Vitest 4.1.8 differs from the early-v4 sketch):**

- **Provider is a factory, not a string.** `browser.provider: "playwright"` is
  rejected; import `playwright()` from the separate `@vitest/browser-playwright`
  package and pass the factory.
- **`screenshotDirectory` mis-resolves custom paths.** The built-in golden-path
  template resolves a custom `screenshotDirectory` to an absolute path and then
  mis-joins it under the spec's directory (yielding a mangled `…/Users/…/…`
  path). We bypass it with a custom `browser.expect.toMatchScreenshot.`
  `resolveScreenshotPath` that builds the env-routed path deterministically.
- **Full-page App scenarios have no `scenario-root`.** `VisualScenario` renders
  full-bleed `App` without the padded wrapper, so component shots target
  `screen.getByTestId("scenario-root")` while `fullPage` shots target
  `page.elementLocator(document.body)`.
- **No `page.route`.** The admin throughput fetch is stubbed by overriding
  `window.fetch` before the App mounts (vs the Playwright tier's `page.route`).
- **Filename carries the browser, dir carries the arch.** Goldens are named
  `<scenario>-chromium.png`; the per-arch split lives in the baseline directory.

Vitest browser mode is also the recommended *driver for a future Solid port* (see
below) — having it as a live tier means the Solid port can reuse this runner
directly rather than standing it up from scratch.

## Runner comparison

Three runners are implemented (Tier 3, vitest-browser, was added once the Vitest 4
prerequisite landed — see "Vitest browser mode — implemented (Tier 3)" above).

| | **playwright-ct** (Tier 1) | **playwright** (Tier 2) | **vitest-browser** (Tier 3) |
|---|---|---|---|
| **Mount mechanism** | CT adapter mounts `VisualScenario` inside Chromium via `@playwright/experimental-ct-react` | Plain `page.goto("/?scenario=<name>")` against a tiny served Vite host (`visual/playwright/host/`) | `vitest-browser-react` `render(<VisualScenario/>)` in Chromium via the `@vitest/browser-playwright` provider |
| **Screenshot** | `expect(component).toHaveScreenshot(...)` | `expect(page).toHaveScreenshot(...)` | `expect.element(locator).toMatchScreenshot(...)` |
| **Spec file** | Framework-specific — imports `@ui-harness`, calls `mount(...)` | **Framework-agnostic** — URL navigation only; reused verbatim for any framework | Framework-specific — imports `@ui-harness`, calls `render(...)`; shares the `scenarioActions` table with Tier 2 |
| **Goldens** | `playwright-ct/__screenshots__/{react ⎮ react-local/<plat>-<arch>}/` | `playwright/__screenshots__/{react ⎮ react-local/<plat>-<arch>}/` (CI vs local) | `vitest-browser/__screenshots__/{react ⎮ react-local/<plat>-<arch>}/` |
| **Ergonomics** | Tighter feedback loop; components mount in-process; no server needed | Slightly heavier (Vite dev server started per run); but the spec is maximally portable | In-process mount, no server; fastest of the three locally (~2–4s for all 17) |
| **Solid-reuse story** | **Alias-swap** — re-point `@ui-harness` in the CT Vite config to `visual/solid/` and swap the CT adapter; one config change | **Verbatim reuse** — `visual.spec.ts` needs zero changes; only the Vite host's `main.tsx` is replaced | **Alias-swap + render shim** — re-point `@ui-harness` and swap `vitest-browser-react` for the framework's `render`; no lagging CT adapter to track |
| **Framework lock-in** | CT adapter per framework (React adapter lags for Solid — see adapter-status table below) | None; depends only on a running Vite server | `vitest-browser-<framework>` render shim; Vite-native, no separate CT-adapter version to track |

**Orchestration:** `tsx visual/run-all.ts` discovers all scripts matching
`test:visual:<runner>:<framework>` (exactly 4 colon-separated parts) in
`package.json` and runs them concurrently. `test:visual` and `test:visual:react`
are alias scripts for the orchestrator. When a `:solid` framework set lands and
its scripts are added to `package.json`, they are auto-discovered with no change
to `run-all.ts`.

## Switching the UI framework — is Playwright CT an impediment?

No, *if* you treat the **goldens + the React-free `shared/` manifest** as the
portable contract rather than the runner. The framework-specific surface is only
three small files (`react/buildFakeHooks.ts`, `react/registry.tsx`,
`react/VisualScenario.tsx`); a new framework reimplements those and reuses
`shared/` + `__screenshots__/` unchanged.

Official Playwright CT adapter status (checked 2026-06):

| Target | `@playwright/experimental-ct-*` | Vite-native | Notes |
|--------|--------------------------------|-------------|-------|
| React  | 1.60.0 (current)               | yes         | current harness |
| Vue    | 1.60.0 (current)               | yes         | low friction |
| Svelte | 1.58.2 (slightly behind)       | yes         | low friction |
| Solid  | **1.48.2 (lags ~1.5 yr)**      | yes (`vite-plugin-solid`) | adapter/core version-locked — friction |
| Angular| none                           | no          | CT does not apply |

**Pick the driver per target — you are not locked to a CT adapter:**

1. **Matching CT adapter** — fine for Vue/Svelte; avoid for Solid (its adapter
   lags the core `playwright` version and would fragment or downgrade the repo).
2. **Vitest browser mode** — recommended for the **Solid** port: Vite-native,
   already in the repo, sidesteps the lagging `ct-solid` adapter. Compare against
   the same committed PNGs.
3. **Plain Playwright over a tiny Vite page** — serve a `?scenario=<name>` page
   that mounts the framework's `VisualScenario` equivalent, then `page.goto` +
   `toHaveScreenshot`. Depends on no CT adapter at all; most framework-agnostic.

**Expect a parity punch-list, not day-one green.** Different frameworks can emit
slightly different DOM/CSS (wrapper nodes, attribute order, hydration markers)
that occasionally shift a pixel. The first run's diffs against the shared goldens
*are* the parity report.
