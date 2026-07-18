# ADR-001: Tooling for the visual (visual-diff) test tier

**Status:** Accepted (retrospective — the choice was made in the implementation
plan; this records the rationale and the framework-migration guidance).

## Context

We want a deterministic visual-regression tier that screenshots `@rtc/client-react`
UI rendered against injected fake data (`ViewModel`), with one explicit goal
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
- **Cross-platform pixel drift → a single container-canonical baseline.**
  Screenshot pixels depend on OS/arch font rasterization (FreeType/HarfBuzz), so
  a single golden filename is *not* portable across **native** renders — native
  arm64 differs from CI's x86 by ~30% of pixels (rasterization rounding, not
  font availability; the app fonts are self-hosted via `@fontsource/*`). But the
  pinned x86 Playwright container, emulated via `docker --platform linux/amd64`,
  renders **byte-identical** to CI on any host architecture (measured 2026-07-18:
  30/30 across all three tiers, `cmp`-identical). So there is exactly ONE
  committed set — `react/`, rendered in that container — and every architecture
  regenerates/verifies through the same container via `pnpm goldens:regen` /
  `pnpm goldens:verify`. `snapshotPathTemplate` resolves the constant `react`
  baseline in all three tier configs; an intentional UI change regenerates the
  one set (the `update-visual-goldens` workflow, or the wrapper locally) — there
  is no per-arch set to keep in sync. **Tradeoff:** a native `pnpm test:ui:visual`
  on a non-x86 host will not match `react/`; verify via the container wrapper.
  This supersedes the original two-committed-baselines design (a per-arch
  `react-local/<platform>-<arch>/` set), which rejected the emulated container
  as "slow qemu amd64" **without measuring it** — in practice the warm container
  install is ~21s and the byte-identity is exact.
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
single committed golden set as the other tiers
(`vitest-browser/__screenshots__/react/`).

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
- **Filename carries the browser.** Goldens are named `<scenario>-chromium.png`
  under the single `react/` baseline directory.

Vitest browser mode is also the recommended *driver for a future Solid port* (see
below) — having it as a live tier means the Solid port can reuse this runner
directly rather than standing it up from scratch.

## Runner comparison

Three runners are implemented (Tier 3, vitest-browser, was added once the Vitest 4
prerequisite landed — see "Vitest browser mode — implemented (Tier 3)" above).

| | **playwright-ct** (Tier 1) | **playwright** (Tier 2) | **vitest-browser** (Tier 3) |
|---|---|---|---|
| **Mount mechanism** | CT adapter mounts `VisualScenario` inside Chromium via `@playwright/experimental-ct-react` | Plain `page.goto("/?scenario=<name>")` against a tiny served Vite host (`playwright/host/`) | `vitest-browser-react` `render(<VisualScenario/>)` in Chromium via the `@vitest/browser-playwright` provider |
| **Screenshot** | `expect(component).toHaveScreenshot(...)` | `expect(page).toHaveScreenshot(...)` | `expect.element(locator).toMatchScreenshot(...)` |
| **Spec file** | Framework-specific — imports `@ui-visual`, calls `mount(...)` | **Framework-agnostic** — URL navigation only; reused verbatim for any framework | Framework-specific — imports `@ui-visual`, calls `render(...)`; shares the `scenarioActions` table with Tier 2 |
| **Goldens** | `playwright-ct/__screenshots__/react/` | `playwright/__screenshots__/react/` | `vitest-browser/__screenshots__/react/` |
| **Ergonomics** | Tighter feedback loop; components mount in-process; no server needed | Slightly heavier (Vite dev server started per run); but the spec is maximally portable | In-process mount, no server; fastest of the three locally (~2–4s for all 17) |
| **Solid-reuse story** | **Alias-swap** — re-point `@ui-visual` in the CT Vite config to `solid/` and swap the CT adapter; one config change | **Verbatim reuse** — `visual.spec.ts` needs zero changes; only the Vite host's `main.tsx` is replaced | **Alias-swap + render shim** — re-point `@ui-visual` and swap `vitest-browser-react` for the framework's `render`; no lagging CT adapter to track |
| **Framework lock-in** | CT adapter per framework (React adapter lags for Solid — see adapter-status table below) | None; depends only on a running Vite server | `vitest-browser-<framework>` render shim; Vite-native, no separate CT-adapter version to track |

**Orchestration:** `tsx tests/ui/visual/run-all.ts` discovers all scripts matching
`test:ui:visual:<runner>:<framework>` (exactly 5 colon-separated parts) in
`package.json` and runs them concurrently. `test:ui:visual` and `test:ui:visual:react`
are alias scripts for the orchestrator. When a `:solid` framework set lands and
its scripts are added to `package.json`, they are auto-discovered with no change
to `run-all.ts`.

## Switching the UI framework — is Playwright CT an impediment?

No, *if* you treat the **goldens + the React-free `shared/` manifest** as the
portable contract rather than the runner. The framework-specific surface is only
three small files (`react/buildFakeViewModel.ts`, `react/registry.tsx`,
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

## Theme matrix (5 skins × dark/light)

Every visual scenario is captured across the full theme matrix: **Classic, Holo,
Holo-3D, Terminal, Terminal-3D × dark, light = 10 combos**. Neon is **excluded**
(the sixth skin) by product decision — its high-contrast cyberpunk grid is not a
supported showcase surface. That's **1222 scenarios per tier** (122 expandable
base scenarios × 10, plus 2 un-expanded mode-cycle scenarios), **× 3 tiers =
3666 goldens per architecture set**, ~**109 MB** on disk per set (full-page shots
grow with the viewport; the ~1100 component shots are content-sized and don't).

### How it works

- **Resolver seam** (`react/resolveScenarioData.ts`): the `Scenario` type carries
  optional `themeSkin`/`themeMode`; `VisualScenario` layers them onto the fixture's
  `AppData` before building the fake ViewModel, so the theme is seeded through the
  same port the app uses (`useThemeSkinPreference`/`useThemePreference`) — no
  localStorage, no per-scenario React.
- **Matrix expander** (`@rtc/ui-contract`'s `src/visual/scenarios.ts`): `expandThemeMatrix` REPLACES each
  base scenario with its full 10-combo cross-product, each carrying an explicit
  `themeSkin`/`themeMode`. There is **no bare baseline** — classic-dark is the
  `classic-dark/` folder like any other combo. Scope lives in three symbols:
  `MATRIX_SKINS`, `MATRIX_MODES`, `MATRIX_EXCLUDE`.
- **All three tiers are data-driven.** The `playwright-ct` tier was rewritten from
  15 hand-written per-component specs into one `matrix.spec.tsx` that loops the
  shared manifest exactly like the plain-Playwright tier — so all three derive
  identically and every combo is captured everywhere.

### Golden layout — theme sub-folder

Goldens are stored **one PNG per combo** under a `<skin>-<mode>/` sub-folder:
`…/<specfile>/holo3d-light/app-fx.png`. This keeps each theme reviewable/diffable
in isolation on GitHub and lets you regenerate one theme at a time. The shared
`@rtc/ui-contract`'s `src/visual/goldenPath.ts` computes the path. **Load-bearing quirk:** Playwright
flattens a *string* screenshot arg containing `/` to `-` (verified: `"a/b.png"`
→ `a-b.png`), so the two Playwright tiers pass the **array form**
`goldenPathArray(name, scenario)` → `[<skin>-<mode>, <base>.png]` to nest a real
subdir; the vitest-browser tier passes the string `goldenPath` (its
`resolveScreenshotPath` nests via `path.join`).

### Viewport — 1920×1080

The two Playwright tier configs render at a realistic **1920×1080** desktop (was
1280×720). The HUD is `height:100vh`, so the viewport *is* the full-page golden
size; 720p cramped the 4-panel HUD and looked vertically squeezed. **Known gap:**
the vitest-browser tier silently ignores its `viewport` config (top-level and
per-instance both tried) and still renders at Playwright's 1280×720 default — a
vitest-browser follow-up (see below).

### Fonts & component fidelity

- **Fonts:** `react/loadFonts.ts` (a side-effect import in `VisualScenario`)
  registers the app's real `@fontsource` faces — Chakra Petch, IBM Plex
  Mono/Sans, JetBrains Mono, Orbitron (mirrors `src/main.tsx`). Without it the
  harness rendered in the fallback system stack and goldens didn't look like the
  app. **Known gap:** the vitest-browser tier registers the `@font-face` rules
  but the webfonts stay `unloaded` at capture time (`document.fonts.ready`
  resolves on fallback; explicit `FontFace.load()` didn't change the capture) —
  Playwright's stability-retry masks this on the other two tiers. So the
  vitest-browser goldens render in fallback fonts. Follow-up.
- **AdminDashboard** is captured at a fixed panel *width* (1280) but
  content-driven *height* (was a fixed `height: 700` + `overflow: hidden`, which
  clipped the bottom row — topology / sessions / incidents / throughput).
- **`app/fx-system`** (the lone `system`-preference scenario) folds into the
  `classic-dark/` folder — `goldenPath` maps `themeMode: "system"` → `dark` — so
  there is no one-file `classic-system/` folder.

**vitest-browser follow-up:** fonts don't load + viewport ignored + it duplicates
the plain-Playwright tier's coverage. Options: fix its asset-loading/viewport, or
retire the tier. Tracked; the other two tiers are the faithful reference.

### Off-PR gate (taken 2026-07-10)

The full matrix made the `visual` job the ~20-min critical path (serial per
`RTC_VISUAL_MAX_PARALLEL=1` / CT `workers:1`), blocking every branch push while
the UI was still churning. Rather than curate it down, the job was moved **off
PRs entirely**: it no longer lives in `ci.yml` but in its own
`.github/workflows/visual.yml`, triggered on push to `main` (post-merge) plus
manual `workflow_dispatch`. PRs and branch pushes are no longer blocked by it; a
red post-merge run is the signal to inspect the diff and either fix the
regression or regenerate the goldens. Coverage is unchanged — only *when* it runs
moved. This is a stronger form of lever 2 below.

**To restore it as a PR gate once the UI stabilises:** move the `visual` job back
into `ci.yml` **and** re-add `visual diffs` to `main`'s required status checks —
both halves, or you get a gate that runs-but-doesn't-block or
blocks-but-doesn't-run. If PR-gate time then hurts, two independent levers exist,
no rework:

1. **Curate** — trim `MATRIX_SKINS`/`MATRIX_MODES` or add to `MATRIX_EXCLUDE`
   (e.g. matrix only the full-page app scenarios). One-line change; regenerate.
2. **Smoke-on-PR** — split `visual` into a small classic-dark smoke gate on PRs +
   the full matrix staying post-merge / on-demand (the `workflow_dispatch` pattern
   already exists in both `visual.yml` and `update-visual-goldens.yml`).

### Regeneration

One set, one path. The canonical `react/` set is rendered in the pinned x86
Playwright container — either by the `update-visual-goldens.yml` workflow (a
full refresh **cleans the `react/` dirs before regen** since `--update` never
deletes orphaned goldens; a `scenario_pattern` dispatch instead regenerates only
the matching goldens and auto-commits them to the branch), or locally by the
`pnpm goldens:regen` / `pnpm goldens:verify` wrapper, which runs the same
container via `docker --platform linux/amd64` on any host and produces
byte-identical output. There is no per-arch set to regenerate.

**Docker-less environments (the claude-sandbox).** The sandbox has no Docker
(no CLI, no socket mount, unprivileged), so it can't run the wrapper. It updates
goldens by pushing a branch and dispatching `update-visual-goldens.yml` (Option
C — CI-routed), which regenerates and commits back. A local native
`pnpm test:ui:visual` there (or on any non-x86 host) will not match `react/` and
is not the gate — the container run is.
