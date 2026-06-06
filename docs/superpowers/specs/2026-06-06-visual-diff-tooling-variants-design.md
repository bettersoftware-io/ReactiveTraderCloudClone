# Visual-Diff Tooling Variants — Design

**Date:** 2026-06-06
**Status:** Approved (brainstorming complete; next step is a written implementation plan)

## Goal

This is a *conceptual* project: recreate the existing `@rtc/client` visual-diff
tier across **three different runners** so the approaches can be compared
head-to-head (ergonomics, output, speed, memory) — and so the suite is ready for
a future SolidJS UI layer to be diffed against the same scenarios.

The three runners:

1. **`playwright-ct`** — Playwright Component Testing (`@playwright/experimental-ct-react`). The existing tier, relocated.
2. **`playwright`** — plain Playwright driving a served Vite page by URL (no component-test adapter).
3. **`vitest-browser`** — Vitest browser mode (`@vitest/browser` + `vitest-browser-react`). **Best-effort** (see Risks).

All three render the **same** React `VisualScenario` against the **same** neutral
fixtures and scenario manifest. They differ only in how they mount, screenshot,
and diff — which is the comparison.

## Non-goals

- **Performance measurement of React vs Solid.** Visual diff proves *visual
  parity*, not runtime performance. Bundle size / FPS / memory comparisons are a
  separate effort and out of scope here.
- **Building the SolidJS layer.** Out of scope; this design only ensures the
  harness is *ready* for it.
- **Sharing one golden set across the three runners.** Not possible — each runner
  produces subtly different pixels for the identical render (device-scale-factor,
  PNG encoder, font anti-aliasing). Each runner owns its own goldens.

## Key decisions (from brainstorming)

1. **Scope:** all 17 existing scenarios are recreated in each runner (full
   parity), for an apples-to-apples comparison.
2. **Naming:** runners are `playwright-ct`, `playwright`, `vitest-browser`.
3. **Framework suffix lives in scripts and golden dirs only — never in file or
   directory names.** Spec files are named neutrally so the same files can target
   a future Solid variant. The `react`/`solid` split is expressed by the npm
   script name and the `__screenshots__/<framework>/` golden subdir.
4. **Vitest-browser is best-effort:** attempt it; if its experimental
   `toMatchScreenshot` matcher or its network-stubbing story is too rough, drop
   that runner. The two Playwright tiers already provide ample redundancy.

## Architecture

### Shared, unchanged (reused by all runners)

- `visual/shared/` — `appData.ts`, `fixtures.ts`, `scenarios.ts` (framework-neutral).
- `visual/react/` — `buildFakeHooks.ts`, `registry.tsx`, `VisualScenario.tsx`
  (the React render target). This is the "active harness."

### Directory layout

```
visual/
  shared/                         neutral core (unchanged)
  react/                          React render target (unchanged)
  playwright-ct/
    *.spec.tsx                    CT specs (moved from visual/, de-suffixed)
    __screenshots__/react/        goldens
  playwright/
    host/index.html
    host/main.tsx                 reads ?scenario=<name>, mounts VisualScenario
    vite.config.ts                Vite config rooted at host/
    *.spec.ts                     framework-agnostic: goto + toHaveScreenshot
    __screenshots__/react/        goldens
  vitest-browser/
    *.spec.tsx                    render(<VisualScenario/>) + screenshot
    __screenshots__/react/        goldens
```

Config files at the client package root:
- `playwright-ct.config.ts` (existing; retarget `testDir`/`snapshotDir`).
- `playwright.config.ts` (new; plain Playwright + `webServer` for the host).
- `vitest-browser.config.ts` (new; browser mode).

### Reuse-readiness for Solid

- **`playwright`** specs are *fully* framework-agnostic (URL navigation only). A
  future Solid variant reuses them verbatim, pointing `webServer` at a Solid
  host and writing to `__screenshots__/solid/`.
- **`playwright-ct`** and **`vitest-browser`** specs import the harness through a
  single alias **`@ui-harness` → `visual/react`** (set in each runner's Vite
  config + `tsconfig.visual.json` paths). A Solid run only remaps the alias to
  `visual/solid`; spec files are not edited. These runners remain coupled to a
  framework-specific mount/render API by nature, so this is "reuse with an alias
  swap," not literal reuse like `playwright`.

### Determinism parity across runners

Each scenario's stabilizations must be reproduced with each runner's API:

| Concern | playwright-ct | playwright | vitest-browser |
|---|---|---|---|
| Disable animations | `toHaveScreenshot({animations:'disabled'})` | same | matcher option / CSS reset |
| Theme → light | click `theme-toggle`, assert aria-label | same (real page) | `userEvent` click |
| Credit/Admin tab | click `tab-*` testid | same | `userEvent` click |
| Admin throughput fetch | `page.route('**/throughput', …)` | same | `vi.stubGlobal('fetch', …)` / MSW |
| Fixed viewport | config `viewport` | config `viewport` | browser instance viewport |

### Scripts

```
test:visual:playwright-ct:react     playwright test -c playwright-ct.config.ts
test:visual:playwright:react        playwright test -c playwright.config.ts
test:visual:vitest-browser:react    vitest run -c vitest-browser.config.ts
test:visual:react                   runs all three that exist
test:visual                         alias → test:visual:react
```
Plus `:update` variants where each runner supports baseline regeneration.

`turbo.json`'s `test:visual` task already exists (cache:false); it will invoke
the aggregate.

## Data flow (all runners)

```
scenarios.ts (name → componentKey + fixtureKey)
   → fixtures.ts (AppData)
   → buildFakeHooks(AppData) → AppHooks
   → VisualScenario mounts registry[componentKey] inside
     ThemeProvider + HooksProvider (+ backdrop)
   → runner screenshots the mount (or page, for full-bleed)
   → compare against __screenshots__/react/<...>.png
```

The only per-runner difference is the final two steps (mount mechanism +
screenshot/diff engine).

## Risks & mitigations

- **Vitest-browser maturity (primary risk):** `toMatchScreenshot` is
  experimental in v4; network interception differs from `page.route`. Mitigation:
  it is explicitly best-effort — verify the matcher in an early task; if
  inadequate, drop the runner (documented as a comparison finding). The two
  Playwright tiers are unaffected.
- **Golden regeneration churn for `playwright-ct`:** relocating specs changes
  snapshot paths, regenerating its 17 goldens. Mitigation: same render → same
  pixels; re-inspect a sample to confirm no visual drift.
- **Three golden sets to maintain (51 PNGs):** accepted cost of a comparison
  project; each runner's goldens are independent by necessity.
- **`playwright.config.ts` name collision:** none in this package (e2e lives in
  the `tests/` package); the client's plain config is the only Playwright config
  of that name here.

## Testing / acceptance

- Each implemented runner passes all 17 scenarios against its own committed
  goldens.
- A sampled set of regenerated/new PNGs is visually inspected (dark + light
  theme, a credit page, the admin slider) to confirm correct rendering.
- `pnpm typecheck` (incl. `tsconfig.visual.json`) stays clean.
- `pnpm --filter @rtc/client test:visual` runs every implemented runner green.
- The `ADR-001` doc and `visual/README.md` are updated to describe the three
  tiers and the per-runner trade-offs observed.

## Out of scope / deferred

- The SolidJS UI layer and its `:solid` scripts/goldens.
- Performance/bundle comparison tooling.
- Removing any existing test tier.
