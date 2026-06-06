# Visual-Diff Tooling Variants Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Recreate the existing `@rtc/client` visual-diff tier across three runners — `playwright-ct` (relocated existing), `playwright` (plain, URL-driven), and `vitest-browser` (best-effort) — sharing one neutral fixture/scenario core and one React render target, so the runners can be compared head-to-head and a future SolidJS layer can reuse the specs by swapping a single alias.

**Architecture:** `visual/shared/` (framework-neutral fixtures + scenario manifest) and `visual/react/` (the React render target: `buildFakeHooks`, `registry`, `VisualScenario`) stay unchanged and are imported by every runner. Each runner lives in its own subdir (`visual/{playwright-ct,playwright,vitest-browser}/`) with its own config at the package root and its own goldens under `__screenshots__/react/`. Runner specs reach the React harness through a single `@ui-harness` alias (→ `visual/react`); a future Solid run only remaps that alias. The plain-`playwright` specs are fully framework-agnostic (URL navigation only) and reuse verbatim.

**Tech Stack:** Playwright Component Testing (`@playwright/experimental-ct-react` 1.60), plain Playwright (`@playwright/test` 1.60) over a tiny Vite host, Vitest browser mode (`@vitest/browser` + `vitest-browser-react`, best-effort), Vite 6 + `@vitejs/plugin-react`, React 19, tsx for the parallel orchestrator.

---

## Background for the implementer (read once)

You are working in branch `feat/visual-multi-tool-harness` inside `packages/client`. The existing visual tier today looks like this:

```
packages/client/
  playwright-ct.config.ts          # CT config (testDir ./visual)
  playwright/                       # CT bootstrap template (index.html, index.tsx) — DO NOT MOVE
  visual/
    shared/   appData.ts fixtures.ts scenarios.ts   # neutral core — DO NOT CHANGE in this plan
    react/    buildFakeHooks.ts registry.tsx VisualScenario.tsx
    __screenshots__/<spec>.spec.tsx/<arg>.png       # 17 goldens, flat under visual/
    connection.spec.tsx tile.spec.tsx analytics.spec.tsx overlay.spec.tsx
    liveRates.spec.tsx fxBlotter.spec.tsx credit.spec.tsx app.spec.tsx
```

Important facts you must respect:

- **`packages/client/playwright/` is the Playwright CT bootstrap template** (`index.html` + `index.tsx`), found by the CT adapter by convention. It is *not* the plain-Playwright host. Leave it where it is. The new plain-PW host lives at `visual/playwright/host/`.
- The package is ESM (`"type": "module"`). In config/host files use `fileURLToPath(new URL(...))`, not `__dirname`.
- The 17 scenarios are defined in `visual/shared/scenarios.ts`. Five of them screenshot the **whole page** (they render the full `App`, or a fixed-position overlay); the other twelve screenshot a single component. The page-level set is:
  `app/fx`, `app/credit`, `app/admin`, `app/fx-light`, `connection-overlay/offline`.
- Per-scenario stabilizations already proven in the CT specs (you will reproduce them in the other runners):
  - `app/credit` → click `data-testid="tab-credit"`, wait for text `Credit Trades`.
  - `app/admin` → `page.route('**/throughput', …{ value: 250 })`, click `tab-admin`, wait for text `Throughput Control`.
  - `app/fx-light` → click `data-testid="theme-toggle"`, assert its `aria-label` is `Switch to dark theme`.
  - everything else → no interaction, just settle + screenshot.
- Each runner owns its **own** goldens (cross-runner pixels differ by encoder/AA/device-scale-factor). Never share a golden dir between runners.
- `tsconfig.visual.json` type-checks `visual/` for `pnpm typecheck`. Any new alias must be added to its `paths` or typecheck breaks.

Verify your starting point before Task 1:

```bash
cd packages/client
git branch --show-current   # expect: feat/visual-multi-tool-harness
pnpm test:visual            # expect: 17 passed (current CT tier, still at old paths)
```

---

## File Structure (what this plan creates/changes)

**Create:**
- `packages/client/visual/react/index.ts` — barrel for the `@ui-harness` alias.
- `packages/client/playwright.config.ts` — plain-Playwright config (webServer + snapshots).
- `packages/client/visual/playwright/host/index.html` — host page.
- `packages/client/visual/playwright/host/main.tsx` — URL-driven mount.
- `packages/client/visual/playwright/host/vite.config.ts` — host Vite config (react + alias).
- `packages/client/visual/playwright/visual.spec.ts` — data-driven framework-agnostic spec.
- `packages/client/visual/scenarioActions.ts` — shared per-scenario interaction table (reused by plain-PW and, if built, vitest-browser).
- `packages/client/visual/run-all.ts` — parallel orchestrator for `test:visual`.
- `packages/client/vitest-browser.config.ts` — **only if Task 3 succeeds.**
- `packages/client/visual/vitest-browser/visual.spec.tsx` — **only if Task 3 succeeds.**

**Move (git mv, names unchanged):**
- `visual/*.spec.tsx` → `visual/playwright-ct/*.spec.tsx` (8 files).
- `visual/__screenshots__/` → `visual/playwright-ct/__screenshots__/react/` (17 goldens).

**Modify:**
- `packages/client/playwright-ct.config.ts` — retarget dirs + add alias.
- `packages/client/visual/react/VisualScenario.tsx` — add `data-testid="scenario-root"` to the component wrapper (pixel-neutral).
- `packages/client/tsconfig.visual.json` — add `baseUrl` + `@ui-harness` paths.
- `packages/client/package.json` — rename/add scripts.
- `packages/client/visual/README.md` and `visual/ADR-001-visual-diff-tooling.md` — document the three tiers.

---

## Task 1: Introduce `@ui-harness` alias and relocate the CT tier

**Files:**
- Create: `packages/client/visual/react/index.ts`
- Modify: `packages/client/visual/react/VisualScenario.tsx`
- Modify: `packages/client/tsconfig.visual.json`
- Modify: `packages/client/playwright-ct.config.ts`
- Move: `packages/client/visual/*.spec.tsx` → `packages/client/visual/playwright-ct/*.spec.tsx`
- Move: `packages/client/visual/__screenshots__/` → `packages/client/visual/playwright-ct/__screenshots__/react/`
- Modify: `packages/client/package.json` (scripts)

- [ ] **Step 1: Create the harness barrel**

Create `packages/client/visual/react/index.ts`:

```ts
// Single import surface for runner specs. Specs import VisualScenario from
// "@ui-harness"; a future Solid harness re-points the alias to visual/solid
// and exposes the same barrel, so no spec file changes on a framework swap.
export { VisualScenario } from "./VisualScenario";
```

- [ ] **Step 2: Add a pixel-neutral testid to the component wrapper**

In `packages/client/visual/react/VisualScenario.tsx`, add `data-testid="scenario-root"` to the inline-block wrapper `div` (the non-full-bleed branch). This lets URL-driven runners target the component's bounding box without changing any pixels. Change only the opening tag of that `div`:

```tsx
        <div
          data-testid="scenario-root"
          style={{
            // ThemeProvider sets CSS vars on <html>; paint a real backdrop so
            // component-level shots aren't on default white.
            backgroundColor: "var(--bg-primary)",
            color: "var(--text-primary)",
            padding: 24,
            display: "inline-block",
          }}
        >
```

- [ ] **Step 3: Add the alias to tsconfig.visual.json**

Replace the contents of `packages/client/tsconfig.visual.json` with (adds `baseUrl` + `paths`; everything else unchanged):

```json
{
  // Type-checks the visual-diff harness (visual/) together with the src files
  // it mounts. The main tsconfig.json restricts rootDir to src, so the visual
  // tier — which lives outside src and imports both @rtc/domain and ../../src —
  // needs its own no-emit program for `pnpm typecheck` to catch drift between
  // buildFakeHooks and the AppHooks interface.
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "noEmit": true,
    "composite": false,
    "declaration": false,
    "declarationMap": false,
    "jsx": "react-jsx",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "types": ["node"],
    "baseUrl": ".",
    "paths": {
      "@ui-harness": ["visual/react"],
      "@ui-harness/*": ["visual/react/*"]
    }
  },
  "include": ["src", "visual"],
  "references": [{ "path": "../domain" }, { "path": "../shared" }]
}
```

- [ ] **Step 4: Move the CT specs and goldens with git mv**

Run from `packages/client`:

```bash
cd packages/client
mkdir -p visual/playwright-ct/__screenshots__
git mv visual/connection.spec.tsx visual/tile.spec.tsx visual/analytics.spec.tsx \
       visual/overlay.spec.tsx visual/liveRates.spec.tsx visual/fxBlotter.spec.tsx \
       visual/credit.spec.tsx visual/app.spec.tsx visual/playwright-ct/
git mv visual/__screenshots__ visual/playwright-ct/__screenshots__/react
```

Expected after: `visual/playwright-ct/` holds 8 specs; goldens live at `visual/playwright-ct/__screenshots__/react/<spec>.spec.tsx/<arg>.png`.

- [ ] **Step 5: Point the moved CT specs at the alias**

In each of the 8 files under `visual/playwright-ct/`, replace the harness import line

```tsx
import { VisualScenario } from "./react/VisualScenario";
```

with

```tsx
import { VisualScenario } from "@ui-harness";
```

(The `@playwright/experimental-ct-react` import line stays as-is.)

- [ ] **Step 6: Retarget the CT config and register the alias**

Replace `packages/client/playwright-ct.config.ts` with:

```ts
import { defineConfig, devices } from "@playwright/experimental-ct-react";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

const uiHarness = fileURLToPath(new URL("./visual/react", import.meta.url));

export default defineConfig({
  testDir: "./visual/playwright-ct",
  testMatch: "**/*.spec.tsx",
  snapshotDir: "./visual/playwright-ct/__screenshots__",
  // React goldens live under a per-framework subdir so a future Solid run can
  // write ./solid/ alongside without colliding. Identical filename on every
  // OS/arch keeps baselines portable across machines.
  snapshotPathTemplate: "{snapshotDir}/react/{testFileName}/{arg}{ext}",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: process.env.CI ? "line" : "list",
  use: {
    viewport: { width: 1280, height: 800 },
    ctViteConfig: {
      plugins: [react()],
      resolve: { alias: { "@ui-harness": uiHarness } },
    },
    ctPort: 3100,
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
```

- [ ] **Step 7: Rename the CT scripts in package.json**

In `packages/client/package.json`, replace the three `test:visual*` script lines with the runner-explicit names (the aggregate `test:visual` is added in Task 4 — temporarily there is no bare `test:visual` between Task 1 and Task 4, which is fine):

```json
    "test:visual:playwright-ct:react": "playwright test -c playwright-ct.config.ts",
    "test:visual:playwright-ct:react:update": "playwright test -c playwright-ct.config.ts --update-snapshots",
    "test:visual:playwright-ct:react:ui": "playwright test -c playwright-ct.config.ts --ui",
```

- [ ] **Step 8: Typecheck the relocated harness**

Run: `pnpm --filter @rtc/client typecheck`
Expected: PASS (the `@ui-harness` alias now resolves in `tsconfig.visual.json`).

- [ ] **Step 9: Run the relocated CT tier against the moved goldens**

Run: `pnpm --filter @rtc/client test:visual:playwright-ct:react`
Expected: **17 passed.** The render is byte-identical (same component, same wrapper; the new `data-testid` does not paint), so the moved goldens still match. If any fail on a sub-pixel diff, inspect the diff image; only if it is a genuine no-op AA shift, regenerate with `…:update` and eyeball one PNG.

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "refactor(visual): relocate CT tier to visual/playwright-ct + @ui-harness alias"
```

---

## Task 2: Plain-Playwright tier (URL-driven, framework-agnostic)

This tier serves a tiny Vite page that mounts `VisualScenario` chosen by `?scenario=<name>`, then drives it with plain Playwright. The specs contain **no React**, so a Solid host reuses them verbatim.

**Files:**
- Create: `packages/client/visual/scenarioActions.ts`
- Create: `packages/client/visual/playwright/host/index.html`
- Create: `packages/client/visual/playwright/host/main.tsx`
- Create: `packages/client/visual/playwright/host/vite.config.ts`
- Create: `packages/client/playwright.config.ts`
- Create: `packages/client/visual/playwright/visual.spec.ts`
- Modify: `packages/client/package.json` (scripts)

- [ ] **Step 1: Define the shared per-scenario interaction table**

Create `packages/client/visual/scenarioActions.ts`. This encodes, in a runner-neutral way, which scenarios screenshot the whole page and what (if any) interaction each needs. It is consumed by the plain-PW spec (and later the vitest-browser spec).

```ts
// Runner-neutral description of how each visual scenario is stabilized and
// captured. The DOM hooks (testids, visible text, the throughput URL) are
// framework-agnostic, so plain-Playwright and vitest-browser share this table.
// CT specs do not use it — they were hand-written first and stay as-is.

export interface ScenarioAction {
  /** Screenshot the whole page (full App or a fixed-position overlay) rather
   *  than just the #scenario-root component box. */
  readonly fullPage?: boolean;
  /** A `**\/throughput` JSON response to stub before navigation (admin only). */
  readonly stubThroughput?: number;
  /** A testid to click after the page settles (e.g. a tab or the theme toggle). */
  readonly click?: string;
  /** Visible text to wait for after the click, proving the view switched. */
  readonly waitForText?: string;
  /** A testid whose aria-label must equal `expectAriaLabel` before capture. */
  readonly assertAriaLabelOf?: string;
  readonly expectAriaLabel?: string;
}

// Keyed by scenario name (see visual/shared/scenarios.ts). Absent key == a
// component-level shot with no interaction.
export const scenarioActions: Record<string, ScenarioAction> = {
  "connection-overlay/offline": { fullPage: true },
  "app/fx": { fullPage: true },
  "app/credit": {
    fullPage: true,
    click: "tab-credit",
    waitForText: "Credit Trades",
  },
  "app/admin": {
    fullPage: true,
    stubThroughput: 250,
    click: "tab-admin",
    waitForText: "Throughput Control",
  },
  "app/fx-light": {
    fullPage: true,
    click: "theme-toggle",
    assertAriaLabelOf: "theme-toggle",
    expectAriaLabel: "Switch to dark theme",
  },
};
```

- [ ] **Step 2: Create the host page**

Create `packages/client/visual/playwright/host/index.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Visual harness host</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 3: Create the URL-driven mount**

Create `packages/client/visual/playwright/host/main.tsx`:

```tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { VisualScenario } from "@ui-harness";

// Same reset the real app uses, so full-App scenarios lay out at full height.
const style = document.createElement("style");
style.textContent = `
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  html, body, #root {
    height: 100%;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto,
      Oxygen, Ubuntu, Cantarell, "Fira Sans", "Droid Sans", "Helvetica Neue",
      sans-serif;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
  }
`;
document.head.appendChild(style);

const name = new URLSearchParams(window.location.search).get("scenario");
if (!name) throw new Error("Missing ?scenario=<name>");

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <VisualScenario name={name} />
  </StrictMode>,
);
```

- [ ] **Step 4: Create the host Vite config**

Create `packages/client/visual/playwright/host/vite.config.ts`:

```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

// Root is this host dir; @ui-harness resolves to the React render target two
// levels up. A Solid host would point the alias at visual/solid instead.
export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  plugins: [react()],
  resolve: {
    alias: {
      "@ui-harness": fileURLToPath(new URL("../../react", import.meta.url)),
    },
  },
  server: { host: "127.0.0.1", port: 3200 },
});
```

- [ ] **Step 5: Create the plain-Playwright config**

Create `packages/client/playwright.config.ts`:

```ts
import { defineConfig, devices } from "@playwright/test";

const PORT = 3200;

export default defineConfig({
  testDir: "./visual/playwright",
  testMatch: "**/*.spec.ts",
  snapshotDir: "./visual/playwright/__screenshots__",
  snapshotPathTemplate: "{snapshotDir}/react/{testFileName}/{arg}{ext}",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: process.env.CI ? "line" : "list",
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    viewport: { width: 1280, height: 800 },
    ...devices["Desktop Chrome"],
  },
  webServer: {
    command: "vite --config visual/playwright/host/vite.config.ts",
    url: `http://127.0.0.1:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
```

- [ ] **Step 6: Write the data-driven spec**

Create `packages/client/visual/playwright/visual.spec.ts`. One test per scenario, generated from the shared manifest + action table. Component scenarios shoot `#scenario-root`; page scenarios shoot the page.

```ts
import { test, expect } from "@playwright/test";
import { scenarios } from "../shared/scenarios";
import { scenarioActions } from "../scenarioActions";

// Golden filename: scenario name with "/" → "-" (path-safe, stable).
const goldenName = (scenario: string) => `${scenario.replace(/\//g, "-")}.png`;

for (const name of Object.keys(scenarios)) {
  const action = scenarioActions[name] ?? {};

  test(name, async ({ page }) => {
    if (action.stubThroughput !== undefined) {
      await page.route("**/throughput", (route) =>
        route.fulfill({ json: { value: action.stubThroughput } }),
      );
    }

    await page.goto(`/?scenario=${encodeURIComponent(name)}`);

    if (action.click) {
      await page.getByTestId(action.click).click();
    }
    if (action.waitForText) {
      await expect(page.getByText(action.waitForText)).toBeVisible();
    }
    if (action.assertAriaLabelOf) {
      await expect(page.getByTestId(action.assertAriaLabelOf)).toHaveAttribute(
        "aria-label",
        action.expectAriaLabel!,
      );
    }

    const shot = goldenName(name);
    if (action.fullPage) {
      await expect(page).toHaveScreenshot(shot, {
        animations: "disabled",
        fullPage: true,
      });
    } else {
      await expect(page.getByTestId("scenario-root")).toHaveScreenshot(shot, {
        animations: "disabled",
      });
    }
  });
}
```

- [ ] **Step 7: Add the plain-PW scripts**

In `packages/client/package.json`, add:

```json
    "test:visual:playwright:react": "playwright test -c playwright.config.ts",
    "test:visual:playwright:react:update": "playwright test -c playwright.config.ts --update-snapshots",
    "test:visual:playwright:react:ui": "playwright test -c playwright.config.ts --ui",
```

- [ ] **Step 8: Generate this tier's goldens and inspect**

Run: `pnpm --filter @rtc/client test:visual:playwright:react:update`
Expected: webServer boots, 17 screenshots written under `visual/playwright/__screenshots__/react/visual.spec.ts/`.

Then visually inspect at least four PNGs to confirm correct rendering (not blank/white, correct theme/tab):

```bash
ls packages/client/visual/playwright/__screenshots__/react/visual.spec.ts/
# Open and eyeball: app-fx.png (dark full app), app-fx-light.png (light),
# app-credit.png (Credit tab), app-admin.png (throughput slider).
```

Use the Read tool on those four PNGs to confirm: `app-fx.png` dark, `app-fx-light.png` light, `app-credit.png` shows Credit Trades, `app-admin.png` shows Throughput Control.

- [ ] **Step 9: Re-run against the committed goldens to confirm determinism**

Run: `pnpm --filter @rtc/client test:visual:playwright:react`
Expected: **17 passed** (a second run with no `--update` must match what step 8 wrote).

- [ ] **Step 10: Typecheck**

Run: `pnpm --filter @rtc/client typecheck`
Expected: PASS (the spec, action table, and host all resolve `@ui-harness` and `../shared/scenarios`).

- [ ] **Step 11: Commit**

```bash
git add -A
git commit -m "feat(visual): add plain-Playwright URL-driven tier (framework-agnostic specs)"
```

---

## Task 3: Vitest browser-mode tier (best-effort spike, then build or drop)

`toMatchScreenshot` is experimental and lives in Vitest **4**; the repo is on Vitest 3.2.4. This task **spikes the upgrade and matcher first**. If the matcher works AND the existing unit tests still pass on v4, build the full tier. Otherwise revert the deps and record the finding — the two Playwright tiers already cover the comparison.

**Files:**
- Create (conditional): `packages/client/vitest-browser.config.ts`
- Create (conditional): `packages/client/visual/vitest-browser/visual.spec.tsx`
- Modify (conditional): `packages/client/package.json`

- [ ] **Step 1: Install the browser-mode deps on a v4 line**

Run from `packages/client`:

```bash
cd packages/client
pnpm add -D vitest@^4 @vitest/browser@^4 vitest-browser-react@^1 playwright@^1.60
```

(If `vitest@^4` is not yet published as stable, use the latest `4.0.0-beta`. Record the exact version installed.)

- [ ] **Step 2: Guard the existing unit suite against the major bump**

Run: `pnpm --filter @rtc/client test`
Expected: the `src/**/*.test.*` suite still passes on Vitest 4.

**Decision gate:** If the unit suite breaks on v4 in ways unrelated to this work, do NOT fix it (out of scope). Instead: `git checkout package.json pnpm-lock.yaml && pnpm install`, then skip to Step 7 (drop-and-document). Note the breakage as a comparison finding.

- [ ] **Step 3: Write a one-scenario matcher spike**

Create `packages/client/visual/vitest-browser/visual.spec.tsx` with a single scenario to prove the matcher end-to-end:

```tsx
import { expect, test } from "vitest";
import { render } from "vitest-browser-react";
import { VisualScenario } from "@ui-harness";

test("tile/eurusd-up", async () => {
  const screen = render(<VisualScenario name="tile/eurusd-up" />);
  await expect
    .element(screen.getByTestId("scenario-root"))
    .toMatchScreenshot("tile-eurusd-up");
});
```

- [ ] **Step 4: Write the browser-mode config**

Create `packages/client/vitest-browser.config.ts`:

```ts
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@ui-harness": fileURLToPath(new URL("./visual/react", import.meta.url)),
    },
  },
  test: {
    include: ["visual/vitest-browser/**/*.spec.tsx"],
    browser: {
      enabled: true,
      provider: "playwright",
      headless: true,
      instances: [{ browser: "chromium" }],
      viewport: { width: 1280, height: 800 },
      screenshotDirectory: "visual/vitest-browser/__screenshots__/react",
    },
  },
});
```

- [ ] **Step 5: Run the spike (update, then verify)**

```bash
pnpm exec vitest run -c vitest-browser.config.ts --update
pnpm exec vitest run -c vitest-browser.config.ts
```

Expected: a golden PNG written under `visual/vitest-browser/__screenshots__/react/`, second run **1 passed**. Read the PNG to confirm it shows the EURUSD tile (not blank).

**Decision gate:** If `toMatchScreenshot` is unavailable, errors, or produces a blank/unstable image you cannot settle, STOP the tier here: revert deps (`git checkout package.json pnpm-lock.yaml && pnpm install`), delete `vitest-browser.config.ts` and `visual/vitest-browser/`, and go to Step 7 (drop-and-document). The two Playwright tiers stand on their own.

- [ ] **Step 6: Expand to all 17 scenarios (only if the spike passed)**

Replace `packages/client/visual/vitest-browser/visual.spec.tsx` with the data-driven version reusing the shared table:

```tsx
import { expect, test } from "vitest";
import { render } from "vitest-browser-react";
import { userEvent } from "@vitest/browser/context";
import { VisualScenario } from "@ui-harness";
import { scenarios } from "../shared/scenarios";
import { scenarioActions } from "../scenarioActions";

const goldenName = (scenario: string) => scenario.replace(/\//g, "-");

for (const name of Object.keys(scenarios)) {
  const action = scenarioActions[name] ?? {};

  test(name, async () => {
    // Admin throughput fetch: vitest-browser has no page.route; stub global fetch.
    if (action.stubThroughput !== undefined) {
      const value = action.stubThroughput;
      // @ts-expect-error overriding the test-page fetch for this scenario only
      window.fetch = async () =>
        new Response(JSON.stringify({ value }), {
          headers: { "content-type": "application/json" },
        });
    }

    const screen = render(<VisualScenario name={name} />);

    if (action.click) {
      await userEvent.click(screen.getByTestId(action.click).element());
    }
    if (action.waitForText) {
      await expect.element(screen.getByText(action.waitForText)).toBeVisible();
    }
    if (action.assertAriaLabelOf) {
      await expect
        .element(screen.getByTestId(action.assertAriaLabelOf))
        .toHaveAttribute("aria-label", action.expectAriaLabel!);
    }

    const target = action.fullPage
      ? screen.getByTestId("scenario-root").element().ownerDocument.body
      : screen.getByTestId("scenario-root").element();
    await expect.element(target).toMatchScreenshot(goldenName(name));
  });
}
```

> Note: full-App scenarios render `App` (which is full-bleed and has no `scenario-root` wrapper). If `getByTestId("scenario-root")` throws for the five page-level scenarios under vitest-browser, fall back to capturing `document.body` for `action.fullPage` scenarios and guard the component branch with the testid only for the rest. Adjust the `target` resolution accordingly and note it as a vitest-browser quirk in the ADR.

Then generate + verify:

```bash
pnpm exec vitest run -c vitest-browser.config.ts --update
pnpm exec vitest run -c vitest-browser.config.ts
```

Expected: 17 goldens written; second run **17 passed**. Eyeball `app-fx.png`, `app-fx-light.png`, `app-credit.png`, `app-admin.png`.

Add scripts to `packages/client/package.json`:

```json
    "test:visual:vitest-browser:react": "vitest run -c vitest-browser.config.ts",
    "test:visual:vitest-browser:react:update": "vitest run -c vitest-browser.config.ts --update",
```

- [ ] **Step 7: If dropped — record the finding**

Only if the tier was dropped at a decision gate: add a short subsection to `visual/ADR-001-visual-diff-tooling.md` under "Alternatives considered" stating that vitest-browser's `toMatchScreenshot` (Vitest 4, experimental) was attempted and why it was not adopted (matcher unavailable / unstable image / v4 broke the unit suite — state which). No scripts or config remain.

- [ ] **Step 8: Typecheck**

Run: `pnpm --filter @rtc/client typecheck`
Expected: PASS. (If the tier was built, ensure `visual/vitest-browser` is covered — it already is via `include: ["src","visual"]` in `tsconfig.visual.json`.)

- [ ] **Step 9: Commit**

If built:

```bash
git add -A
git commit -m "feat(visual): add vitest-browser tier (experimental toMatchScreenshot)"
```

If dropped:

```bash
git add -A
git commit -m "docs(visual): record vitest-browser drop as a comparison finding"
```

---

## Task 4: Aggregate scripts, parallel orchestrator, turbo, and docs

**Files:**
- Create: `packages/client/visual/run-all.ts`
- Modify: `packages/client/package.json` (aggregate scripts)
- Modify: `packages/client/visual/README.md`
- Modify: `packages/client/visual/ADR-001-visual-diff-tooling.md`

- [ ] **Step 1: Write the parallel orchestrator**

Create `packages/client/visual/run-all.ts`. It discovers `test:visual:<runner>:<framework>` scripts in `package.json`, optionally filters by a framework arg, runs them concurrently with buffered output, and exits non-zero if any fail. Mirrors the e2e `run-all.ts` philosophy (buffered per-runner output + summary).

```ts
// Runs every implemented visual runner concurrently and prints a pass/fail
// summary. `tsx visual/run-all.ts` runs all frameworks; `tsx visual/run-all.ts
// react` runs only react:* runners. Today only :react exists, so both are the
// same; when :solid lands it is discovered automatically (no edit here).
//
// Perf caveat: concurrent runs contend for CPU/GPU — wall-clock here is NOT a
// fair per-runner benchmark. Run a single runner in isolation to measure speed.
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const pkgUrl = new URL("../package.json", import.meta.url);
const pkg = JSON.parse(readFileSync(fileURLToPath(pkgUrl), "utf8")) as {
  scripts: Record<string, string>;
};

const frameworkFilter = process.argv[2]; // e.g. "react" | undefined

// Leaf runner scripts only: test:visual:<runner>:<framework> (exactly 4 parts),
// excluding :update / :ui variants and the aggregates added below.
const runners = Object.keys(pkg.scripts).filter((name) => {
  const parts = name.split(":");
  if (parts.length !== 4) return false;
  if (parts[0] !== "test" || parts[1] !== "visual") return false;
  return frameworkFilter ? parts[3] === frameworkFilter : true;
});

if (runners.length === 0) {
  console.error(
    `No visual runners found${frameworkFilter ? ` for "${frameworkFilter}"` : ""}.`,
  );
  process.exit(1);
}

console.log(`Running ${runners.length} visual runner(s) concurrently:`);
runners.forEach((r) => console.log(`  • ${r}`));

const run = (script: string) =>
  new Promise<{ script: string; code: number; output: string }>((resolve) => {
    const child = spawn("pnpm", ["run", script], { shell: false });
    let output = "";
    child.stdout.on("data", (d) => (output += d));
    child.stderr.on("data", (d) => (output += d));
    child.on("close", (code) =>
      resolve({ script, code: code ?? 1, output }),
    );
  });

const results = await Promise.all(runners.map(run));

for (const r of results) {
  console.log(`\n${"=".repeat(72)}\n${r.script} ${r.code === 0 ? "✅" : "❌"}\n${"=".repeat(72)}`);
  console.log(r.output.trimEnd());
}

const failed = results.filter((r) => r.code !== 0);
console.log(
  `\nVisual summary: ${results.length - failed.length}/${results.length} runner(s) passed.`,
);
process.exit(failed.length === 0 ? 0 : 1);
```

- [ ] **Step 2: Add the aggregate scripts**

In `packages/client/package.json`, add the two aggregate scripts. `test:visual` runs EVERYTHING (all frameworks × all runners); `test:visual:react` runs the React subset. Both use the orchestrator.

```json
    "test:visual": "tsx visual/run-all.ts",
    "test:visual:react": "tsx visual/run-all.ts react",
```

Ensure `tsx` is available (it is used by the e2e run-all). If `tsx` is not already a devDependency of this package, add it:

```bash
cd packages/client
node -e "require.resolve('tsx')" 2>/dev/null && echo "tsx present" || pnpm add -D tsx
```

- [ ] **Step 3: Run the full aggregate**

Run: `pnpm --filter @rtc/client test:visual`
Expected: the orchestrator lists the implemented runners (playwright-ct + playwright, plus vitest-browser if built), runs them concurrently, and prints `Visual summary: N/N runner(s) passed.` with exit 0.

- [ ] **Step 4: Confirm the React alias of the aggregate**

Run: `pnpm --filter @rtc/client test:visual:react`
Expected: same runners as Step 3 (today every runner is `:react`), all green.

- [ ] **Step 5: Update the README**

Rewrite `packages/client/visual/README.md` to describe the three-tier layout and the run commands. Key points to include (write full prose, not placeholders):
- Layout: `shared/` (neutral core, no React), `react/` (render target behind `@ui-harness`), `playwright-ct/`, `playwright/`, and `vitest-browser/` (or a note it was dropped), each with its own `__screenshots__/react/` goldens.
- Commands: `pnpm test:visual` (everything, concurrent), `pnpm test:visual:react` (React subset), and the per-runner `test:visual:<runner>:react` (+ `:update`).
- The `@ui-harness` alias is the single seam a Solid port re-points; `playwright/` specs need no change at all (URL-driven).
- The perf caveat: the aggregate is for fast feedback; benchmark a single runner in isolation.

- [ ] **Step 6: Update ADR-001**

In `packages/client/visual/ADR-001-visual-diff-tooling.md`, add a "Three-runner comparison" section recording, per runner: how it mounts, how it screenshots, ergonomics observed, and the Solid-reuse story (plain-`playwright` = verbatim; `playwright-ct`/`vitest-browser` = alias swap). If vitest-browser was dropped, state that outcome as a finding. Keep the existing framework-switch guidance.

- [ ] **Step 7: Typecheck and commit**

```bash
pnpm --filter @rtc/client typecheck
git add -A
git commit -m "feat(visual): add run-everything aggregate + docs for the three tiers"
```

---

## Task 5: Full verification and finish the branch

**Files:** none (verification only).

- [ ] **Step 1: Clean typecheck across the workspace**

Run: `pnpm typecheck`
Expected: PASS in all packages (including `tsconfig.visual.json`).

- [ ] **Step 2: Unit tests still green**

Run: `pnpm --filter @rtc/client test`
Expected: PASS (confirms Task 3's dep changes — whether kept or reverted — left the unit suite intact).

- [ ] **Step 3: All implemented visual runners green**

Run: `pnpm --filter @rtc/client test:visual`
Expected: `Visual summary: N/N runner(s) passed.`

- [ ] **Step 4: Confirm no stray golden dirs and the turbo task resolves**

```bash
git status --porcelain          # expect: clean (everything committed)
ls packages/client/visual/playwright-ct/__screenshots__/react | head
ls packages/client/visual/playwright/__screenshots__/react/visual.spec.ts | head
pnpm turbo run test:visual --filter @rtc/client --dry=json | grep -q test:visual && echo "turbo task wired"
```

Expected: clean tree, both golden dirs populated, turbo recognizes the `test:visual` task (already present in `turbo.json`, cache:false).

- [ ] **Step 5: Finish the branch**

Announce: "I'm using the finishing-a-development-branch skill to complete this work." Then follow superpowers:finishing-a-development-branch — it will verify tests, detect the environment, and present the merge/PR/keep/discard options.

---

## Self-review notes (for the implementer)

- **Spec coverage:** three runners (Tasks 1–3), neutral spec names + framework-only-in-scripts/golden-dirs (Task 1 Step 4–7, Task 2 Step 6), `@ui-harness` alias for ct/vitest reuse + verbatim reuse for plain-PW (Task 1 Step 1, Task 2 Step 6), determinism parity table reproduced via `scenarioActions.ts` (Task 2 Step 1), `test:visual` = run-everything-concurrent with perf caveat (Task 4 Steps 1–2), per-runner goldens under `__screenshots__/react/` (every config). All map to the approved spec `docs/superpowers/specs/2026-06-06-visual-diff-tooling-variants-design.md`.
- **Vitest-browser is explicitly best-effort** with two hard decision gates (Task 3 Steps 2 and 5) that revert deps and document the drop — matching the spec's "attempt; drop if rough."
- **Naming consistency:** the interaction type is `ScenarioAction`, the table is `scenarioActions`, the alias is `@ui-harness`, the golden subdir is always `react`, leaf scripts are always `test:visual:<runner>:react` — used identically across Tasks 2–4.
