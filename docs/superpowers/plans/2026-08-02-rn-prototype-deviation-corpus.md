# RN prototype deviation corpus — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pre-generate 24 committed screenshots of the frozen mobile-v1 prototype, mirrored against the RN app's own visual goldens, plus a generated `DRIFT.md` that makes app-vs-design drift readable from a phone.

**Architecture:** A pure manifest (`shots.ts`) drives a Playwright capture script against the existing zero-dep prototype server (`scripts/serve-design.mjs` on `:8899`). Output PNGs land under `docs/design/mobile/v1/reference-shots/`, structurally out of reach of any test runner. A separate generator reads both PNG trees and writes `DRIFT.md`. A `check:prototype-shots` gate asserts manifest↔tree agreement in both directions.

**Tech Stack:** TypeScript (tsx), Playwright (`^1.60.0`, matching `packages/client-react`), Node built-ins. No image-processing dependency — filmstrips are composed in a headless page.

**Spec:** [../specs/2026-08-02-rn-prototype-deviation-corpus-design.md](../specs/2026-08-02-rn-prototype-deviation-corpus-design.md)

## Global Constraints

- **The corpus is never a CI gate on pixels.** `check:prototype-shots` asserts manifest↔tree *existence* only. No task may add a pixel comparison that can fail.
- **Never re-capture or rewrite the app goldens.** `packages/client-react-native/tests/visual/__screenshots__/**` is read-only for every task in this plan.
- **Never modify the prototype.** `docs/design/mobile/v1/**/*.html` and its `source/` siblings are read-only.
- **Output lives under `docs/design/mobile/v1/reference-shots/`** — never under `__screenshots__/`.
- **Every executable entry point needs a root `package.json` script**, or `pnpm lint:dead` (knip) fails it: the root workspace declares no `entry`, so knip discovers root scripts only through its npm-scripts plugin.
- **Pinned theme:** `rtm_theme='holo3d'`, `rtm_mode='dark'` for every shot except `shell/connection-banner` (app-only, no capture).
- **Pinned viewport:** `402 × 874`, `deviceScaleFactor: 3` → `1206 × 2622`.
- **Pinned boot instant:** `2.52` seconds (`BOOT_SCENE_ELAPSED_SEC` in `packages/client-react-native/tests/visual/fixtures.tsx:343`).
- **Boot variant selection:** seed `rtm_bootSeq = (N + 7) % 8` to land on variant `N`, because the prototype computes `(stored + 1) % 8` on load (`dc.html:1032`).
- Every capture failure **throws**; it never writes a PNG. Arrival is proven by a positive assertion, never by absence of a known-bad state.

---

### Task 1: The shot manifest and its consistency gate

Pure data plus a Node gate. No browser. This task lands the vocabulary every later task consumes, and the guard that stops the tree drifting from the manifest — the failure mode that hid T9's Maestro drift (3 committed flows against 8 scenario ids, invisible because the test exercised the generator function and never looked at the directory).

**Files:**
- Create: `scripts/prototype-shots/shots.ts`
- Create: `scripts/prototype-shots/check.ts`
- Modify: `package.json` (add `check:prototype-shots`)
- Modify: `tsconfig.eslint.json:43` (`scripts/*.ts` → `scripts/**/*.ts`)
- Modify: `.github/workflows/ci.yml` (add the gate to the `checks` job)

**Interfaces:**
- Consumes: nothing.
- Produces: `SHOTS: readonly Shot[]`, and the types `Shot`, `ShotStep`, `Arrival`. Later tasks import `SHOTS` and filter on `appTwin` / `filmstrip`.

- [ ] **Step 1: Write the manifest types and the full shot list**

Create `scripts/prototype-shots/shots.ts`:

```ts
// The prototype deviation corpus's single source of truth.
//
// Pure data, Node-safe, no Playwright import — so the consistency gate and the
// DRIFT.md generator can both read it without pulling a browser in. Same split
// as the app side's `tests/visual/scenarioIds.ts` vs `driver.ts`, for the same
// reason recorded in that file's header.
//
// This corpus is NOT a golden set. See
// docs/superpowers/specs/2026-08-02-rn-prototype-deviation-corpus-design.md §2.

/** One interaction on the way to a shot.
 *
 * The prototype has NO `data-testid` anywhere (verified 2026-08-02: zero
 * occurrences), so steps address elements by visible text or by CSS. Both are
 * legitimate here in a way they would not be in app code, because the prototype
 * is FROZEN — its labels and its runtime-generated class names can never
 * change, so neither locator can rot. */
export type ShotStep =
  | { readonly tapText: string }
  | { readonly tapSelector: string }
  | { readonly holdText: string; readonly ms: number };

/** The radial dock's hex FAB. Addressed by class because its GLYPH is the
 * active module's icon (⇅ on Rates, ◈ on Credit) and becomes ✕ once open —
 * so no text locator survives a screen change. Verified 2026-08-02. */
export const DOCK_FAB = "button.scp4";
/** A spot tile on the Rates grid. Verified: tiles are the only `[data-flip]`
 * elements on that screen. */
export const SPOT_TILE = "[data-flip]";

/** What proves the shot actually arrived. A positive assertion — never
 * "the launcher isn't showing". See spec §7 (T2/T7). */
export type Arrival = { readonly text: string };

export type Shot = {
  readonly id: string;
  /** localStorage seeded BEFORE first load. */
  readonly seed: Readonly<Record<string, string>>;
  /** Wait for boot to finish before running `steps`. False only for boot shots,
   * which are captured mid-boot. */
  readonly afterBoot: boolean;
  readonly steps: readonly ShotStep[];
  readonly arrival: Arrival;
  /** True when an app golden of the same id exists to pair against. */
  readonly appTwin: boolean;
  /** Present only for filmstrips: the elapsed seconds to sample, left to right. */
  readonly filmstrip?: readonly number[];
};

const THEME = { rtm_theme: "holo3d", rtm_mode: "dark" } as const;

/** The prototype advances `(stored + 1) % 8` on load (dc.html:1032), so to land
 * on variant N we store N-1. */
const bootSeed = (variant: number) =>
  ({ ...THEME, rtm_bootSeq: String((variant + 7) % 8) }) as const;

/** seq → app id, read from the prototype's own NAMES array (dc.html:1035):
 * CORE SYNC, UI DRAW-IN, DOCKING CAM, HOLO PROJECTOR, GEO TACTICAL,
 * LAYER COMPOSITOR, SCHEMATIC CORE, VOL TERRAIN. */
const BOOT_VARIANTS: readonly (readonly [string, number, string])[] = [
  ["boot/core", 0, "CORE SYNC"],
  ["boot/laser", 1, "UI DRAW-IN"],
  ["boot/docking", 2, "DOCKING CAM"],
  ["boot/hologram", 3, "HOLO PROJECTOR"],
  ["boot/geo", 4, "GEO TACTICAL"],
  ["boot/layers", 5, "LAYER COMPOSITOR"],
  ["boot/jarvis", 6, "SCHEMATIC CORE"],
  ["boot/topo", 7, "VOL TERRAIN"],
];

const bootShots: readonly Shot[] = BOOT_VARIANTS.map(([id, seq, name]) => ({
  id,
  seed: bootSeed(seq),
  afterBoot: false,
  steps: [],
  arrival: { text: name },
  appTwin: true,
}));

export const SHOTS: readonly Shot[] = [
  ...bootShots,

  // ── paired with an app golden ──────────────────────────────────────────
  {
    id: "blotter/seeded",
    seed: THEME,
    afterBoot: true,
    steps: [{ tapSelector: DOCK_FAB }, { tapText: "BLOTTER" }],
    arrival: { text: "BLOTTER" },
    appTwin: true,
  },
  {
    id: "analytics/dashboard",
    seed: THEME,
    afterBoot: true,
    steps: [{ tapSelector: DOCK_FAB }, { tapText: "ANALYTICS" }],
    arrival: { text: "ANALYTICS" },
    appTwin: true,
  },
  {
    id: "credit/rfq-tiles",
    seed: THEME,
    afterBoot: true,
    steps: [{ tapSelector: DOCK_FAB }, { tapText: "CREDIT" }],
    arrival: { text: "RFQS" },
    appTwin: true,
  },
  {
    // Tab labels verified in the running prototype: RFQS / NEW RFQ / SELL-SIDE.
    id: "credit/sell-side",
    seed: THEME,
    afterBoot: true,
    steps: [{ tapSelector: DOCK_FAB }, { tapText: "CREDIT" }, { tapText: "SELL-SIDE" }],
    arrival: { text: "YOUR QUOTES" },
    appTwin: true,
  },
  {
    id: "shell/appearance",
    seed: THEME,
    afterBoot: true,
    steps: [{ tapText: "◐" }],
    arrival: { text: "APPEARANCE" },
    appTwin: true,
  },
  {
    id: "lock/hold",
    seed: THEME,
    afterBoot: true,
    steps: [{ tapText: "⌖" }, { holdText: "HOLD TO UNLOCK", ms: 900 }],
    arrival: { text: "HOLD TO UNLOCK" },
    appTwin: true,
  },

  // ── prototype-only: surfaces the app has no golden for ─────────────────
  {
    id: "rates/grid",
    seed: THEME,
    afterBoot: true,
    steps: [],
    arrival: { text: "RATES" },
    appTwin: false,
  },
  {
    id: "rates/ticket",
    seed: THEME,
    afterBoot: true,
    steps: [{ tapSelector: SPOT_TILE }],
    arrival: { text: "NOTIONAL" },
    appTwin: false,
  },
  {
    id: "equities/markets",
    seed: THEME,
    afterBoot: true,
    steps: [{ tapSelector: DOCK_FAB }, { tapText: "EQUITIES" }, { tapText: "MARKETS" }],
    arrival: { text: "MARKETS" },
    appTwin: false,
  },
  {
    id: "equities/trade",
    seed: THEME,
    afterBoot: true,
    steps: [{ tapSelector: DOCK_FAB }, { tapText: "EQUITIES" }, { tapText: "TRADE" }],
    arrival: { text: "TRADE" },
    appTwin: false,
  },
  {
    id: "equities/blotter",
    seed: THEME,
    afterBoot: true,
    steps: [{ tapSelector: DOCK_FAB }, { tapText: "EQUITIES" }, { tapText: "BLOTTER" }],
    arrival: { text: "BLOTTER" },
    appTwin: false,
  },
  {
    id: "credit/new-rfq",
    seed: THEME,
    afterBoot: true,
    steps: [{ tapSelector: DOCK_FAB }, { tapText: "CREDIT" }, { tapText: "NEW RFQ" }],
    arrival: { text: "DIRECTION" },
    appTwin: false,
  },
  {
    // The FAB's glyph becomes ✕ once open — that is the arrival proof, and it
    // is unambiguous because ✕ appears nowhere else on the screen.
    id: "shell/dock-open",
    seed: THEME,
    afterBoot: true,
    steps: [{ tapSelector: DOCK_FAB }],
    arrival: { text: "✕" },
    appTwin: false,
  },

  // ── prototype-only filmstrips: ceremonies, sampled left to right ───────
  {
    // BUY is the ticket's submit control; the ceremony runs on the tile behind.
    id: "rates/exec-ceremony",
    seed: THEME,
    afterBoot: true,
    steps: [{ tapSelector: SPOT_TILE }, { tapText: "BUY" }],
    arrival: { text: "NOTIONAL" },
    appTwin: false,
    filmstrip: [0, 0.6, 1.4, 2.4],
  },
  {
    // Every open RFQ card carries an ACCEPT button; the first is enough.
    id: "credit/accept-ceremony",
    seed: THEME,
    afterBoot: true,
    steps: [{ tapSelector: DOCK_FAB }, { tapText: "CREDIT" }, { tapText: "ACCEPT" }],
    arrival: { text: "RFQS" },
    appTwin: false,
    filmstrip: [0, 0.5, 1.1, 2.0],
  },
  {
    // No interaction: the ring is already counting down on arrival. Samples are
    // spread over 9s so the arc visibly sweeps between panels.
    id: "credit/countdown-ring",
    seed: THEME,
    afterBoot: true,
    steps: [{ tapSelector: DOCK_FAB }, { tapText: "CREDIT" }],
    arrival: { text: "RFQS" },
    appTwin: false,
    filmstrip: [0, 3, 6, 9],
  },
];

/** App scenario ids with NO prototype counterpart. They get a DRIFT.md row and
 * no file. `boot/static` is the app's own no-canvas fallback; the prototype has
 * no connection banner at all — every SIM/LIVE string in the prototype is
 * boot-canvas telemetry (dc.html:1298, :1788, :1861, :2038). */
export const APP_ONLY_IDS: readonly string[] = [
  "boot/static",
  "shell/connection-banner",
];
```

> **Every locator above was verified against the running prototype on
> 2026-08-02**, not inferred from source. Three would have been wrong if guessed:
> Credit's tabs are `RFQS` / `NEW RFQ` / `SELL-SIDE` (not `NEW` / `SELL`); the
> dock FAB has no text identity because its glyph tracks the active module
> (`⇅` on Rates, `◈` on Credit, `✕` when open); and the prototype contains **zero**
> `data-testid` attributes, so the whole testid approach was unavailable.
>
> Task 2 Step 2 re-checks them rather than discovering them.

- [ ] **Step 2: Widen the type-aware lint glob**

In `tsconfig.eslint.json`, change the `include` entry `"scripts/*.ts"` to `"scripts/**/*.ts"`. Without this the new directory silently escapes `pnpm lint:eslint:types`.

- [ ] **Step 3: Write the consistency gate**

Create `scripts/prototype-shots/check.ts`:

```js
// Asserts the prototype deviation corpus's manifest and its PNG tree agree, in
// BOTH directions: every manifest entry has a file, every file has an entry.
//
// This is NOT a pixel gate and must never become one — see the spec's §2 rule
// (a). A diff against the frozen prototype is permanently non-zero and is never
// a failure. What this catches is the T9 class: a generated artifact committed
// beside its generator with nothing tying the two together, which let the
// Maestro tier sit at 3 flows against 8 scenario ids unnoticed.

import { existsSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { pathToFileURL } from "node:url";

const ROOT = process.cwd();
const SHOTS_DIR = join(ROOT, "docs/design/mobile/v1/reference-shots");
const MANIFEST = join(ROOT, "scripts/prototype-shots/shots.ts");

const { SHOTS } = await import(pathToFileURL(MANIFEST).href);

/** Every .png under `dir`, as ids relative to the shots dir without extension. */
function pngIds(dir) {
  if (!existsSync(dir)) return [];

  const out = [];
  const walk = (current) => {
    for (const name of readdirSync(current)) {
      const full = join(current, name);
      if (statSync(full).isDirectory()) {
        walk(full);
      } else if (name.endsWith(".png")) {
        out.push(relative(SHOTS_DIR, full).replace(/\.png$/, ""));
      }
    }
  };
  walk(dir);

  return out;
}

/** A filmstrip shot writes to filmstrips/<id>.png; a still writes to <id>.png. */
const expectedPath = (shot) =>
  shot.filmstrip === undefined ? shot.id : `filmstrips/${shot.id}`;

const expected = new Set(SHOTS.map(expectedPath));
const found = new Set(pngIds(SHOTS_DIR));

const missing = [...expected].filter((id) => !found.has(id)).sort();
const orphaned = [...found].filter((id) => !expected.has(id)).sort();

if (missing.length > 0) {
  console.error(`check-prototype-shots: ${missing.length} manifest entries have no PNG:`);
  for (const id of missing) console.error(`  - ${id}`);
}

if (orphaned.length > 0) {
  console.error(`check-prototype-shots: ${orphaned.length} PNGs have no manifest entry:`);
  for (const id of orphaned) console.error(`  - ${id}`);
}

if (missing.length > 0 || orphaned.length > 0) {
  process.exit(1);
}

console.log(`check-prototype-shots: ${expected.size} shots, manifest and tree agree`);
```

- [ ] **Step 4: Run the gate and verify it FAILS (red)**

Run: `pnpm exec tsx scripts/prototype-shots/check.ts`

Expected: exit 1, listing all 24 manifest entries as having no PNG — because no PNGs exist yet. This is the correct red state; it proves the gate reads the manifest and looks at the directory.

- [ ] **Step 5: Wire the script and the CI step**

In root `package.json` `scripts`, after `"check:manifest-drift"`, add:

```json
"check:prototype-shots": "tsx scripts/prototype-shots/check.ts",
```

In `.github/workflows/ci.yml`, in the `checks` job immediately after the `Presenter manifest drift (web ↔ React Native)` step, add:

```yaml
      - name: Prototype deviation corpus (manifest ↔ tree)
        run: pnpm check:prototype-shots
```

- [ ] **Step 6: Confirm knip still passes**

Run: `pnpm lint:dead`
Expected: PASS. `check.ts` is now reachable via the `check:prototype-shots` npm script, and `shots.ts` is reachable because that script imports it. If knip reports either as unused, the npm script name and the file path have diverged — fix the script, not the knip config.

- [ ] **Step 7: Commit**

```bash
git add scripts/prototype-shots/shots.ts scripts/prototype-shots/check.ts package.json tsconfig.eslint.json .github/workflows/ci.yml
git commit -m "feat(proto-corpus): shot manifest + manifest-vs-tree gate

The gate is deliberately existence-only, never pixels: a diff against the
frozen prototype is permanently non-zero and is never a failure. What it
catches is the T9 class — a generated artifact committed beside its
generator with no test tying the two together."
```

> The gate is RED after this commit and stays red until Task 4 commits the
> PNGs. That is intentional and must be called out in the PR: the tasks land
> on one branch and only the branch as a whole is green. Do not open a PR
> between Task 1 and Task 4.

---

### Task 2: Capture harness — the boot-instant spike and verified selectors

The spec names one unproven thing (§8): the prototype's boot loop runs on `requestAnimationFrame` against `performance.now()` (`dc.html:1032`), which Playwright's `page.clock` does not control. This task settles it before any capture depends on it, and re-checks the manifest's locators against a running prototype.

**Files:**
- Create: `scripts/prototype-shots/capture.ts`
- Modify: `scripts/prototype-shots/shots.ts` (verified locators)
- Modify: `package.json` (add `prototype-shots:capture`, add `playwright` devDep)

**Interfaces:**
- Consumes: `SHOTS`, `Shot`, `ShotStep`, `Arrival` from `shots.ts`.
- Produces: `capture(opts: { only?: string; outDir: string }): Promise<void>`, plus the exported helper `waitForBootInstant(page: Page, seconds: number): Promise<void>` that Task 3 relies on.

- [ ] **Step 1: Add Playwright to the root workspace**

```bash
pnpm add -Dw playwright@^1.60.0
```

Range must match `packages/client-react`'s existing `^1.60.0` — `syncpack lint` (run by `pnpm check:versions`) enforces one range per dependency repo-wide, so "latest" would fail the gate.

- [ ] **Step 2: Re-check the verified locators still resolve**

```bash
pnpm dev:design:mobile   # serves the mobile prototype on :8899
```

The locators in `shots.ts` were read off the running prototype on 2026-08-02. Confirm they still resolve — the prototype is frozen, so this should be a formality, but a five-minute check beats a failed capture run:

- `button.scp4` → exactly one element (the dock FAB), on Rates and on Credit
- `[data-flip]` → the spot tiles, on Rates
- text `◐`, `⌖` → the two header buttons
- text `RFQS`, `NEW RFQ`, `SELL-SIDE` → Credit's three tabs
- text `MARKETS`, `TRADE`, `BLOTTER` → Equities' three tabs

If any fails, fix the manifest before continuing — a selector matching nothing becomes a throw in Task 3, which is recoverable but wastes the run.

- [ ] **Step 3: Write the boot-instant spike**

Create `scripts/prototype-shots/capture.ts` with the boot-instant helper first, and nothing else:

```ts
import type { Page } from "playwright";

/** The instant every boot golden is pinned to, matching the app side's
 * BOOT_SCENE_ELAPSED_SEC (packages/client-react-native/tests/visual/fixtures.tsx:343).
 * Both sides must sample the same frame or every difference is noise. */
export const BOOT_INSTANT_SEC = 2.52;

/** Hold the page until the prototype's boot animation reaches `seconds`.
 *
 * The boot loop runs on requestAnimationFrame against performance.now()
 * (dc.html:1032), which page.clock does NOT control — so this waits on the
 * prototype's own clock rather than trying to drive it. Accuracy is +/-1 frame,
 * which is sufficient: the corpus is never compared against itself (spec rule
 * (b)), so the requirement is "t ~= 2.5s, not t = 0.3s". */
export async function waitForBootInstant(page: Page, seconds: number): Promise<void> {
  await page.evaluate(
    (target) =>
      new Promise<void>((resolve) => {
        const start = performance.now();
        const tick = () => {
          if (performance.now() - start >= target * 1000) {
            resolve();
          } else {
            requestAnimationFrame(tick);
          }
        };
        requestAnimationFrame(tick);
      }),
    seconds,
  );
}
```

- [ ] **Step 4: Prove the spike — capture the same boot frame twice**

Write a throwaway check (do not commit it) that loads `boot/core` twice and captures at `BOOT_INSTANT_SEC`, then compare the two files:

```bash
node -e "console.log(require('fs').statSync('/tmp/a.png').size, require('fs').statSync('/tmp/b.png').size)"
```

Expected: two visibly identical mid-boot frames — the globe mesh drawn, the status banner showing, clearly **not** a blank t=0 frame. Byte-identity is **not** required and is not the bar.

**If the frames differ wildly** (one blank, one mid-animation), the rAF wait is not landing. Fall back to a fixed `page.waitForTimeout(BOOT_INSTANT_SEC * 1000)` after load, record that in the file's header comment, and continue — the spec's §8 declares this fallback acceptable.

- [ ] **Step 5: Write the capture driver**

Append to `scripts/prototype-shots/capture.ts`:

```ts
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { chromium, type Browser, type Page } from "playwright";
import { SHOTS, type Shot, type ShotStep } from "./shots";

const PROTOTYPE_URL = "http://localhost:8899/";

/** The prototype's simulated screen is 402x874 (device-frames.jsx:204), which
 * is exactly the iPhone 17 logical viewport the app goldens use. At dSF 3 that
 * yields 1206x2622 — dimension-identical to its twin, so pairs are alignable
 * rather than merely adjacent. */
const VIEWPORT = { width: 402, height: 874 } as const;
const DEVICE_SCALE_FACTOR = 3;

/** Longest boot is 5600ms (dc.html:1036); allow margin. */
const BOOT_COMPLETE_MS = 7000;
/** Transitions in the prototype are ~200ms; settle past them before shooting. */
const SETTLE_MS = 500;

async function runStep(page: Page, step: ShotStep): Promise<void> {
  if ("tapText" in step) {
    // Not `exact`: the dock satellites render glyph + label in one button
    // ("⇅\n RATES"), so an exact match would find nothing.
    await page.getByText(step.tapText).first().click();
  } else if ("tapSelector" in step) {
    await page.locator(step.tapSelector).first().click();
  } else {
    const target = page.getByText(step.holdText, { exact: true }).first();
    await target.hover();
    await page.mouse.down();
    await page.waitForTimeout(step.ms);
    // Deliberately NOT released: the hold-to-unlock ring must be captured
    // mid-fill, which is the whole point of LOCK_HOLD_PROGRESS = 0.55.
  }
}

/** Throws unless the shot's arrival assertion is satisfied. Positive assertion
 * only — never "the error screen isn't showing". The app harness learned this
 * twice (T2: screenshotted the Expo launcher and called it a regression;
 * T7: every scenario after the first drove a dead app). */
async function assertArrived(page: Page, shot: Shot): Promise<void> {
  const marker = page.getByText(shot.arrival.text, { exact: false }).first();
  try {
    await marker.waitFor({ state: "visible", timeout: 5000 });
  } catch {
    throw new Error(
      `${shot.id}: never arrived — expected text ${JSON.stringify(shot.arrival.text)} was not visible. No PNG written.`,
    );
  }
}

async function openShot(browser: Browser, shot: Shot): Promise<Page> {
  const context = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: DEVICE_SCALE_FACTOR,
  });
  // Seed BEFORE first load: the prototype reads rtm_theme/rtm_mode/rtm_bootSeq
  // during construction (dc.html:690, :702, :1032).
  await context.addInitScript((seed: Record<string, string>) => {
    for (const [key, value] of Object.entries(seed)) {
      localStorage.setItem(key, value);
    }
  }, shot.seed as Record<string, string>);

  const page = await context.newPage();
  await page.goto(PROTOTYPE_URL, { waitUntil: "domcontentloaded" });

  return page;
}

/** The app content root inside the simulated bezel. MEASURED at exactly
 * 402x874 (2026-08-02), so at dSF 3 this yields 1206x2622 — the app goldens'
 * dimensions exactly, with no rounded-corner artifacts and no bezel.
 *
 * Known, expected difference from the app side, NOT drift: the simulated
 * dynamic island and home indicator are siblings of this element (drawn by the
 * frame at device-frames.jsx:218/:237), so they are excluded here, whereas the
 * app's simctl capture includes the REAL island and status bar. That is
 * hardware standing in for hardware; the design content is what is compared. */
function screenOf(page: Page) {
  return page.locator("[data-theme-root]").first();
}

/** Open a fresh context and drive it to the shot's state, arrival asserted.
 *
 * Exported because the filmstrip builder needs exactly this and must not
 * duplicate it: a second copy of the boot wait and the step replay would drift
 * from this one silently, and the filmstrips would stop showing what the stills
 * show. The CALLER owns closing `page.context()`. */
export async function driveToShot(browser: Browser, shot: Shot): Promise<Page> {
  const page = await openShot(browser, shot);

  if (shot.afterBoot) {
    await page.waitForTimeout(BOOT_COMPLETE_MS);
    for (const step of shot.steps) {
      await runStep(page, step);
    }
    await page.waitForTimeout(SETTLE_MS);
  } else {
    await waitForBootInstant(page, BOOT_INSTANT_SEC);
  }

  await assertArrived(page, shot);

  return page;
}

export async function captureShot(browser: Browser, shot: Shot, outDir: string): Promise<string> {
  const page = await driveToShot(browser, shot);

  const file = join(outDir, `${shot.id}.png`);
  mkdirSync(dirname(file), { recursive: true });
  await screenOf(page).screenshot({ path: file });
  await page.context().close();

  return file;
}

export async function capture(opts: { only?: string; outDir: string }): Promise<void> {
  const wanted = opts.only === undefined
    ? SHOTS
    : SHOTS.filter((shot) => shot.id === opts.only);

  if (wanted.length === 0) {
    throw new Error(`no shot matches ${JSON.stringify(opts.only)}`);
  }

  const browser = await chromium.launch();
  try {
    for (const shot of wanted) {
      if (shot.filmstrip !== undefined) continue; // Task 4 handles these
      const file = await captureShot(browser, shot, opts.outDir);
      console.log(`captured ${shot.id} → ${file}`);
    }
  } finally {
    await browser.close();
  }
}

if (process.argv[1]?.endsWith("capture.ts")) {
  const only = process.argv.includes("--only")
    ? process.argv[process.argv.indexOf("--only") + 1]
    : undefined;
  const outDir = process.argv.includes("--out")
    ? process.argv[process.argv.indexOf("--out") + 1]
    : "docs/design/mobile/v1/reference-shots";

  await capture({ only, outDir });
}
```

> **`[data-theme-root]` was measured, not assumed** (2026-08-02): it reports
> exactly `402 × 874` and is a descendant of the bezel frame, so it is both the
> right content and the right size. The bezel div itself carries no attribute
> hook at all (`device-frames.jsx:207` is a bare styled `div`), which is why the
> content root is the correct target rather than the frame. Never screenshot the
> full page — that includes the bezel, its drop shadow and its 48px rounded
> corners, and breaks dimension parity with the app golden.

- [ ] **Step 6: Add the capture script**

In root `package.json` `scripts`:

```json
"prototype-shots:capture": "tsx scripts/prototype-shots/capture.ts",
```

- [ ] **Step 7: Verify arrival-failure throws instead of writing a PNG**

Temporarily change one shot's `arrival.text` to `"THIS TEXT DOES NOT EXIST"`, then:

```bash
pnpm dev:design:mobile &
pnpm prototype-shots:capture --only rates/grid --out /tmp/proto-scratch
```

Expected: throws `rates/grid: never arrived …`, and `/tmp/proto-scratch/rates/grid.png` does **not** exist. Revert the manifest change.

This is the single most important behaviour in the harness — verify it, don't assume it.

- [ ] **Step 8: Commit**

```bash
git add scripts/prototype-shots/capture.ts scripts/prototype-shots/shots.ts package.json pnpm-lock.yaml
git commit -m "feat(proto-corpus): capture harness with verified arrival assertions

Boot shots wait on the prototype's own rAF clock rather than page.clock,
which cannot drive rAF. Accuracy is +/-1 frame and that is sufficient:
the corpus is never compared against itself, so the requirement is
t ~= 2.5s, not frame-exactness.

Arrival is a positive assertion and a failure throws without writing a
PNG — the T2/T7 lesson, where inferring a good state from the absence of
one known-bad state produced goldens of the Expo launcher."
```

---

### Task 3: Capture the 21 stills to scratch, then eyeball them

Captures go to a scratch directory first and are promoted by copying reviewed bytes — never by a second capture run. This mirrors how the app's own 14 goldens were promoted on 2026-08-01, and exists because re-capturing commits pixels nobody looked at.

**Files:**
- Create (untracked): `/tmp/proto-scratch/**`

**Interfaces:**
- Consumes: `capture()` from `capture.ts`.
- Produces: reviewed PNGs ready for Task 4 to promote.

- [ ] **Step 1: Capture every still to scratch**

```bash
pnpm dev:design:mobile &
sleep 2
pnpm prototype-shots:capture --out /tmp/proto-scratch
```

Expected: 21 lines of `captured <id> → …`. Any throw stops the run — fix the locator and re-run only that shot with `--only`.

- [ ] **Step 2: Verify dimension parity on a paired shot**

```bash
sips -g pixelWidth -g pixelHeight /tmp/proto-scratch/boot/core.png
sips -g pixelWidth -g pixelHeight packages/client-react-native/tests/visual/__screenshots__/ios-iphone17-26/simctl/boot/core.png
```

Expected: both report `pixelWidth: 1206`, `pixelHeight: 2622`. If the prototype shot differs, the screen locator is wrong (it is capturing the bezel or the whole page) — fix it in `capture.ts` and re-run.

- [ ] **Step 3: LOOK at every PNG**

Open all 21. For each, confirm it shows the state its id claims. Specifically check the three that are easiest to get silently wrong:

- the 8 `boot/*` are mid-animation, not blank first frames;
- `lock/hold` shows a **partially** filled ring, not empty and not complete;
- `shell/dock-open` shows all five satellites fanned, not a closed dock.

**This step cannot be delegated to a tool.** The app-side session on 2026-08-01 found four defects that no diff could ever have surfaced — a golden asserting a blotter missing its `PENDING` chip entirely — precisely because a diff against an equally-wrong baseline is green.

- [ ] **Step 4: Re-capture and re-eyeball anything wrong**

For each bad shot, fix the manifest or the harness, then `--only <id> --out /tmp/proto-scratch`, then look again. Do not proceed with a shot you have not seen.

No commit in this task — nothing tracked has changed.

---

### Task 4: Compose the filmstrips and promote everything

**Files:**
- Create: `scripts/prototype-shots/filmstrip.ts`
- Create: `docs/design/mobile/v1/reference-shots/**` (21 stills + 3 filmstrips)
- Modify: `package.json` (add `prototype-shots:filmstrips`)

**Interfaces:**
- Consumes: `SHOTS`, `openShot`-equivalent flow from `capture.ts`.
- Produces: the committed PNG tree that `check:prototype-shots` and Task 5 read.

- [ ] **Step 1: Write the filmstrip composer**

No image-processing dependency: the frames are captured as base64 and laid out in a throwaway page, which is then screenshotted. Create `scripts/prototype-shots/filmstrip.ts`:

```ts
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { chromium, type Browser } from "playwright";
import { driveToShot } from "./capture";
import { SHOTS, type Shot } from "./shots";

/** Capture one ceremony at each pinned instant, then lay the frames out
 * left-to-right in a scratch page and screenshot that. A still cannot show a
 * ceremony, and video breaks the mirrored-PNG model — a strip keeps both. */
async function frames(browser: Browser, shot: Shot): Promise<string[]> {
  const instants = shot.filmstrip ?? [];
  const shots: string[] = [];

  for (const at of instants) {
    // A fresh context per instant: the ceremony must restart from the same
    // state each time, and re-driving one page would compound timing error.
    const page = await driveToShot(browser, shot);
    await page.waitForTimeout(at * 1000);
    const buffer = await page.locator("[data-theme-root]").first().screenshot();
    shots.push(buffer.toString("base64"));
    await page.context().close();
  }

  return shots;
}

export async function buildFilmstrips(outDir: string): Promise<void> {
  const browser = await chromium.launch();
  try {
    for (const shot of SHOTS.filter((s) => s.filmstrip !== undefined)) {
      const encoded = await frames(browser, shot);
      const strip = await browser.newContext({ deviceScaleFactor: 1 });
      const page = await strip.newPage();
      await page.setContent(
        `<body style="margin:0;display:flex;background:#000">${encoded
          .map((b64) => `<img src="data:image/png;base64,${b64}" style="height:874px">`)
          .join("")}</body>`,
      );
      const file = join(outDir, "filmstrips", `${shot.id}.png`);
      mkdirSync(dirname(file), { recursive: true });
      await page.locator("body").screenshot({ path: file });
      await strip.close();
      console.log(`filmstrip ${shot.id} → ${file}`);
    }
  } finally {
    await browser.close();
  }
}

if (process.argv[1]?.endsWith("filmstrip.ts")) {
  const outDir = process.argv.includes("--out")
    ? process.argv[process.argv.indexOf("--out") + 1]
    : "docs/design/mobile/v1/reference-shots";

  await buildFilmstrips(outDir);
}
```

- [ ] **Step 2: Add the script and build the filmstrips to scratch**

In root `package.json`:

```json
"prototype-shots:filmstrips": "tsx scripts/prototype-shots/filmstrip.ts",
```

```bash
pnpm prototype-shots:filmstrips --out /tmp/proto-scratch
```

- [ ] **Step 3: LOOK at the three filmstrips**

Each must show **progression** across its four panels. A strip whose four frames are identical means the ceremony had already finished (or never started) before the first sample — adjust that shot's `filmstrip` instants in the manifest and rebuild.

- [ ] **Step 4: Promote the reviewed bytes**

```bash
mkdir -p docs/design/mobile/v1/reference-shots
cp -R /tmp/proto-scratch/. docs/design/mobile/v1/reference-shots/
```

Copy, never re-capture. A second capture run would commit pixels nobody reviewed — the mechanism behind the earlier `--update-snapshots` default-mode bug.

- [ ] **Step 5: Run the gate — it must now be GREEN**

Run: `pnpm check:prototype-shots`
Expected: `check-prototype-shots: 24 shots, manifest and tree agree`

- [ ] **Step 6: Verify the gate fails on drift (both directions)**

```bash
mv docs/design/mobile/v1/reference-shots/rates/grid.png /tmp/held.png
pnpm check:prototype-shots     # expect exit 1: "1 manifest entries have no PNG"
mv /tmp/held.png docs/design/mobile/v1/reference-shots/rates/grid.png

cp docs/design/mobile/v1/reference-shots/rates/grid.png docs/design/mobile/v1/reference-shots/rates/bogus.png
pnpm check:prototype-shots     # expect exit 1: "1 PNGs have no manifest entry"
rm docs/design/mobile/v1/reference-shots/rates/bogus.png

pnpm check:prototype-shots     # expect exit 0 again
```

Both directions must be shown to fail. A gate verified in only one direction is half a gate — deleting a flow and tampering with one were separately verified for the T9 fix for exactly this reason.

- [ ] **Step 7: Commit**

```bash
git add docs/design/mobile/v1/reference-shots scripts/prototype-shots/filmstrip.ts scripts/prototype-shots/capture.ts package.json
git commit -m "feat(proto-corpus): 24 reviewed prototype shots

21 stills + 3 ceremony filmstrips, every one eyeballed before commit.
Promoted by copying reviewed bytes from scratch, never by a second
capture run.

Filmstrips are composed in a headless page rather than by an image
library, so the corpus adds no image-processing dependency."
```

---

### Task 5: Generate DRIFT.md

**Files:**
- Create: `scripts/prototype-shots/render-drift.ts`
- Create: `docs/design/mobile/v1/reference-shots/DRIFT.md`
- Modify: `package.json` (add `prototype-shots:drift`)

**Interfaces:**
- Consumes: `SHOTS`, `APP_ONLY_IDS` from `shots.ts`; both PNG trees on disk.
- Produces: `DRIFT.md`. Nothing consumes it programmatically.

- [ ] **Step 1: Write the generator**

Markdown, not HTML — it has to render on github.com from a phone, which a committed HTML file does not.

Create `scripts/prototype-shots/render-drift.ts`:

```ts
import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { APP_ONLY_IDS, SHOTS } from "./shots";

const SHOTS_DIR = "docs/design/mobile/v1/reference-shots";
const APP_DIR = "packages/client-react-native/tests/visual/__screenshots__/ios-iphone17-26/simctl";
/** From DRIFT.md up to the repo root. */
const UP = "../../../..";

function row(id: string): string {
  const app = `${UP}/${APP_DIR}/${id}.png`;
  const proto = `./${id}.png`;

  return `| **${id}** | <img src="${app}" width="300"> | <img src="${proto}" width="300"> |`;
}

const paired = SHOTS.filter((s) => s.appTwin && s.filmstrip === undefined);
const protoOnly = SHOTS.filter((s) => !s.appTwin && s.filmstrip === undefined);
const strips = SHOTS.filter((s) => s.filmstrip !== undefined);

const missingApp = paired.filter((s) => !existsSync(join(APP_DIR, `${s.id}.png`)));
if (missingApp.length > 0) {
  throw new Error(
    `paired shots with no app golden on disk: ${missingApp.map((s) => s.id).join(", ")} — ` +
      `either the golden was never captured or appTwin is wrong in the manifest`,
  );
}

const doc = `# Design drift — app vs mobile-v1 prototype

> **Generated. Do not edit by hand** — run \`pnpm prototype-shots:drift\`.
>
> **This is not a test report.** The prototype is frozen: it cannot change and
> cannot break, so a difference here is *never* a failure. It is a measurement
> of how far the app has moved from the design, and where. See
> [the spec](../../../superpowers/specs/2026-08-02-rn-prototype-deviation-corpus-design.md).

## Paired — ${paired.length} scenarios

| scenario | app | prototype |
|---|---|---|
${paired.map((s) => row(s.id)).join("\n")}

## Prototype only — ${protoOnly.length}

Surfaces the app has no golden for. Not drift — design reference.

| scenario | prototype |
|---|---|
${protoOnly.map((s) => `| **${s.id}** | <img src="./${s.id}.png" width="300"> |`).join("\n")}

## Ceremony filmstrips — ${strips.length}

Each strip samples one ceremony at several instants, left to right. Prototype
only: the app side needs a booted simulator and a human, which is the
dependency this corpus exists to remove.

| ceremony | instants (s) | prototype |
|---|---|---|
${strips
  .map(
    (s) =>
      `| **${s.id}** | ${(s.filmstrip ?? []).join(", ")} | <img src="./filmstrips/${s.id}.png" width="600"> |`,
  )
  .join("\n")}

## App only — ${APP_ONLY_IDS.length}

The app has these; the design never specified them.

${APP_ONLY_IDS.map((id) => `- \`${id}\``).join("\n")}
`;

writeFileSync(join(SHOTS_DIR, "DRIFT.md"), doc);
console.log(`DRIFT.md: ${paired.length} paired, ${protoOnly.length} prototype-only, ${strips.length} strips, ${APP_ONLY_IDS.length} app-only`);
```

- [ ] **Step 2: Add the script and generate**

```json
"prototype-shots:drift": "tsx scripts/prototype-shots/render-drift.ts",
```

```bash
pnpm prototype-shots:drift
```

Expected: `DRIFT.md: 14 paired, 7 prototype-only, 3 strips, 2 app-only`

- [ ] **Step 3: Verify every image path resolves**

```bash
pnpm check:doc-links
```

Expected: PASS. `check-doc-links` validates relative links; a wrong `../` depth in `UP` shows up here rather than as broken images on a phone.

- [ ] **Step 4: Confirm it renders on a phone**

Push the branch and open `DRIFT.md` on github.com from a phone. Both columns must show images, not broken icons.

This is the deliverable's actual acceptance test — a `DRIFT.md` that renders only on a laptop has failed at the one thing it exists for.

- [ ] **Step 5: Commit**

```bash
git add scripts/prototype-shots/render-drift.ts docs/design/mobile/v1/reference-shots/DRIFT.md package.json
git commit -m "feat(proto-corpus): generated DRIFT.md comparison page

Markdown rather than HTML because the requirement is reading this on a
phone, and github.com renders md with images while a committed html file
would mean downloading a file or standing up hosting."
```

---

### Task 6: README and STATUS

**Files:**
- Create: `docs/design/mobile/v1/reference-shots/README.md`
- Modify: `docs/STATUS.md`

- [ ] **Step 1: Write the README**

The three rules must live in the folder they govern — a rule recorded only in a backlog is a rule the next reader of the folder will not find.

Create `docs/design/mobile/v1/reference-shots/README.md`:

```markdown
# Prototype reference shots — a DEVIATION corpus, not a golden set

Screenshots of the frozen mobile-v1 prototype, mirrored against the RN app's own
visual goldens, so *"how far has the app drifted from the design, and where?"* is
answerable from a phone — read [DRIFT.md](DRIFT.md).

**These are not baselines and this is not regression testing.** The prototype
cannot change and cannot break, so there is nothing to regress and a difference
is never a failure. A permanently non-zero diff is the expected steady state.

## Three rules

1. **Never a CI gate.** `check:prototype-shots` asserts only that the manifest
   and this tree agree on which files exist. Never add a pixel comparison — it
   would be either permanently red or tolerance-widened until it asserts
   nothing.
2. **Never auto-updated** — and in particular never "reconciled" by re-shooting
   the prototype to match the app. The gap *is* the artifact; closing it erases
   the entire signal.
3. **Mirror the app's structure and naming.** Same scenario ids, same directory
   shape, so mapping app↔prototype stays mechanical for a human skimming two
   folders and for an LLM asked to compare them.

## Regenerating

Deliberately manual, and deliberately two steps — you are expected to look at
the PNGs between them.

    pnpm dev:design:mobile &                                   # serve the prototype
    pnpm prototype-shots:capture --out /tmp/proto-scratch      # stills
    pnpm prototype-shots:filmstrips --out /tmp/proto-scratch   # ceremonies
    # LOOK at every PNG, then promote by copying:
    cp -R /tmp/proto-scratch/. docs/design/mobile/v1/reference-shots/
    pnpm prototype-shots:drift

Promote by **copying reviewed bytes**, never by re-running capture straight into
this directory — that commits pixels nobody looked at.

Manifest: [`scripts/prototype-shots/shots.ts`](../../../../scripts/prototype-shots/shots.ts).
Design: [the spec](../../../superpowers/specs/2026-08-02-rn-prototype-deviation-corpus-design.md).
```

- [ ] **Step 2: Move the STATUS entry to shipped**

In `docs/STATUS.md`, the entry **"Prototype reference shots — a DEVIATION corpus, not a golden set"** currently sits under `## 🔴 Designed, not built`. Delete it — STATUS is pending-only and finished work is removed, not archived.

Then in the `## 🟡 In progress` entry **"RN visual goldens — capture the full set, and a prototype set beside it"**, replace half (2) with a one-line note that the prototype corpus has shipped, linking `docs/design/mobile/v1/reference-shots/DRIFT.md`.

Bump `**Last updated:**` to today.

- [ ] **Step 3: Run the doc gate**

```bash
pnpm check:doc-links
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add docs/design/mobile/v1/reference-shots/README.md docs/STATUS.md
git commit -m "docs(proto-corpus): README with the three rules + STATUS close-out

The rules live in the folder they govern: a rule recorded only in the
backlog is a rule the next reader of this directory will not find."
```

---

## Final verification

- [ ] `pnpm check:prototype-shots` → 24 shots, agree
- [ ] `pnpm check:doc-links` → PASS
- [ ] `pnpm lint:dead` → PASS (every entry point reachable from a package.json script)
- [ ] `pnpm check:versions` → PASS (playwright at one range repo-wide)
- [ ] `pnpm exec biome ci .` → PASS
- [ ] `pnpm lint:eslint:types` → PASS (proves the widened `scripts/**/*.ts` glob works)
- [ ] `git status` on `packages/client-react-native/tests/visual/__screenshots__/` → **clean**. Any change here is a plan violation; the app goldens are read-only.
- [ ] `DRIFT.md` opened on a phone, both columns rendering
