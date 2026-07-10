# RN Visual Snapshot Testing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give `@rtc/client-react-native` real iOS-simulator pixel-screenshot regression tests — three permanent capture drivers over one shared scenario registry + in-app harness — closing the paint-bug gap that only human review catches today.

**Architecture:** A dev-only in-app harness route renders one deterministic scenario at a time (sim ports, pinned skin, frozen motion). Three driver tiers screenshot the same scenarios: `simctl` and Maestro capture PNGs that a shared `pixelmatch` diff core compares to committed goldens; react-native-owl owns its own capture+diff+baseline pipeline. Mac-local, **not** a CI gate. Android is designed-for but out of scope.

**Tech Stack:** Expo SDK 57 / RN 0.86, Expo Router, `pixelmatch` + `pngjs` (dev), `xcrun simctl`, Maestro CLI, `react-native-owl` (Detox + `jest-image-snapshot` fallback), tsx, vitest (pure-unit island), jest-expo (harness render test).

## Global Constraints

- Design spec: `docs/superpowers/specs/2026-07-10-rn-visual-snapshot-testing-design.md` — every task's requirements implicitly include it.
- **Not a CI gate.** Never add these scripts to `.github/workflows/ci.yml`. iOS pixels require macOS; there are no macOS runners.
- **Canonical device+runtime pin:** iPhone 15 · iOS 18.x. All goldens are captured on this pin; regeneration must use it.
- **Diff tolerance:** `allowedMismatchedPixelRatio: 0.06` (ported verbatim from the web suite's settled value).
- **Determinism is mandatory:** sim ports only (no live WS), skin/theme pinned per scenario (not from persisted prefs), reduce-motion forced, capture gated on a rendered-ready marker + `useAppFonts()` ready.
- **Harness is dev-only:** the `app/__visual/[id].tsx` route must be inert/absent unless `EXPO_PUBLIC_VISUAL_HARNESS === "1"`.
- **Repo gate rules:** every new script + dev dep must be wired into `knip.json` (RN workspace block), `tsconfig`/`tsconfig.eslint`, Biome scope, and a Turbo task — even though this is not a CI gate (per the "all gates cover every package" rule). Run the full local gauntlet (`biome ci .`, both ESLint configs, typecheck, vitest+jest) per file before each commit.
- **`#/` subpath alias**, not `@/`. Biome bans ≥2-up relative imports.
- **Deep-link scheme is `rtcmobile`** (no hyphen), from `Info.plist` `CFBundleURLSchemes`.
- Reuse the proven on-device recipe: prebuilt `RTCMobile.app` from DerivedData + `simctl boot/install/openurl` + Metro started **from the worktree** on a LAN IP.

---

## File Structure

```
packages/client-react-native/
  src/app/__visual/[id].tsx        — dev-only harness route (renders 1 scenario)
  src/app/visualHarnessGate.ts     — EXPO_PUBLIC_VISUAL_HARNESS seam (mirror bootSplashGate.ts)
  tests/visual/
    scenarios.ts                   — shared scenario registry (id, skin, mode, build())
    driver.ts                      — VisualDriver interface + Scenario type
    shared/
      diff.ts                      — pixelmatch/pngjs compare (Tiers 1+2)
      goldens.ts                   — golden path resolver + device pin constant
    simctl/
      capture.ts                   — Tier 1 capture adapter
      run.ts                       — Tier 1 runner (iterate → capture → diff → report)
    maestro/
      flows/                       — generated one-flow-per-scenario YAML
      generateFlows.ts             — writes flows from the registry
      run.ts                       — Tier 2 runner (maestro test → diff core)
    owl/
      owl.config.json              — Tier 3 owl config (device pin)
      visual.owl.test.ts           — Tier 3 owl jest test (owns capture+diff)
    __screenshots__/
      ios-iphone15-18/{simctl,maestro}/<id>.png   — committed goldens (Tiers 1+2)
    owl-baseline/                  — owl-managed baselines (Tier 3)
    BAKEOFF.md                     — rubric scores across the three tiers
    README.md                      — device pin, when to run, how to regenerate
```

---

## Phase 0 — Shared core & in-app harness

### Task 0.1: Pixelmatch diff core (Tiers 1+2)

**Files:**
- Create: `packages/client-react-native/tests/visual/shared/diff.ts`
- Test: `packages/client-react-native/tests/visual/shared/diff.test.ts`

**Interfaces:**
- Produces: `compareToGolden(actualPng: Buffer, goldenPath: string, opts?: { allowedMismatchedPixelRatio?: number }): Promise<{ pass: boolean; mismatchedPixels: number; ratio: number; diffPng: Buffer | null }>` — resolves `pass: true` and writes no diff when the golden is absent only if `opts.createIfMissing` is set (used by `:update`); otherwise a missing golden is a failure.

- [ ] **Step 1: Add dev deps**

Run (from repo root): `pnpm --filter @rtc/client-react-native add -D pixelmatch pngjs @types/pngjs`
Then verify freshness per repo policy: `pnpm outdated -r pixelmatch pngjs` (accept latest within the 24h cooldown).

- [ ] **Step 2: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { PNG } from "pngjs";
import { compareToGolden } from "#/../tests/visual/shared/diff";

function solid(w: number, h: number, rgba: [number, number, number, number]): Buffer {
  const png = new PNG({ width: w, height: h });
  for (let i = 0; i < w * h; i++) {
    png.data.set(rgba, i * 4);
  }
  return PNG.sync.write(png);
}

describe("compareToGolden", () => {
  it("passes when images are identical", async () => {
    const img = solid(4, 4, [10, 20, 30, 255]);
    const golden = solid(4, 4, [10, 20, 30, 255]);
    const res = await compareToGolden(img, golden, { inlineGolden: golden });
    expect(res.pass).toBe(true);
    expect(res.ratio).toBe(0);
  });

  it("fails when mismatch exceeds the 0.06 ratio", async () => {
    const img = solid(4, 4, [0, 0, 0, 255]);
    const golden = solid(4, 4, [255, 255, 255, 255]);
    const res = await compareToGolden(img, golden, { inlineGolden: golden });
    expect(res.pass).toBe(false);
    expect(res.ratio).toBeGreaterThan(0.06);
    expect(res.diffPng).not.toBeNull();
  });
});
```

> The test injects the golden bytes via `inlineGolden` so it stays filesystem-free. `compareToGolden` reads `goldenPath` from disk only when `inlineGolden` is absent.

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm --filter @rtc/client-react-native exec vitest run tests/visual/shared/diff.test.ts`
Expected: FAIL — `compareToGolden` not defined.

- [ ] **Step 4: Implement**

```ts
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";

const DEFAULT_RATIO = 0.06;

interface CompareOpts {
  allowedMismatchedPixelRatio?: number;
  createIfMissing?: boolean;
  inlineGolden?: Buffer;
}

interface CompareResult {
  pass: boolean;
  mismatchedPixels: number;
  ratio: number;
  diffPng: Buffer | null;
}

export async function compareToGolden(
  actualPng: Buffer,
  goldenPath: string,
  opts: CompareOpts = {},
): Promise<CompareResult> {
  const tolerance = opts.allowedMismatchedPixelRatio ?? DEFAULT_RATIO;
  const actual = PNG.sync.read(actualPng);

  let goldenBytes = opts.inlineGolden ?? null;
  if (!goldenBytes) {
    try {
      goldenBytes = await readFile(goldenPath);
    } catch {
      if (opts.createIfMissing) {
        await mkdir(dirname(goldenPath), { recursive: true });
        await writeFile(goldenPath, actualPng);
        return { pass: true, mismatchedPixels: 0, ratio: 0, diffPng: null };
      }
      return { pass: false, mismatchedPixels: actual.width * actual.height, ratio: 1, diffPng: null };
    }
  }

  const golden = PNG.sync.read(goldenBytes);
  if (golden.width !== actual.width || golden.height !== actual.height) {
    // Dimension mismatch can never be absorbed by tolerance (web suite lesson).
    return { pass: false, mismatchedPixels: actual.width * actual.height, ratio: 1, diffPng: null };
  }

  const diff = new PNG({ width: actual.width, height: actual.height });
  const mismatched = pixelmatch(actual.data, golden.data, diff.data, actual.width, actual.height, {
    threshold: 0.1,
  });
  const ratio = mismatched / (actual.width * actual.height);
  const pass = ratio <= tolerance;
  return { pass, mismatchedPixels: mismatched, ratio, diffPng: pass ? null : PNG.sync.write(diff) };
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @rtc/client-react-native exec vitest run tests/visual/shared/diff.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
git add packages/client-react-native/tests/visual/shared/diff.ts packages/client-react-native/tests/visual/shared/diff.test.ts packages/client-react-native/package.json pnpm-lock.yaml
git commit -m "feat(rn-visual): pixelmatch golden-diff core (Tiers 1+2)"
```

---

### Task 0.2: Golden path resolver + device pin

**Files:**
- Create: `packages/client-react-native/tests/visual/shared/goldens.ts`
- Test: `packages/client-react-native/tests/visual/shared/goldens.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `DEVICE_PIN = "ios-iphone15-18"`; `goldenPath(tier: "simctl" | "maestro", scenarioId: string): string` returning `tests/visual/__screenshots__/ios-iphone15-18/<tier>/<scenarioId>.png` as an **absolute** path anchored at the RN package root.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { DEVICE_PIN, goldenPath } from "#/../tests/visual/shared/goldens";

describe("goldenPath", () => {
  it("uses the device pin and tier", () => {
    expect(DEVICE_PIN).toBe("ios-iphone15-18");
    const p = goldenPath("simctl", "fx/tile-up-holo3d");
    expect(p.endsWith("tests/visual/__screenshots__/ios-iphone15-18/simctl/fx/tile-up-holo3d.png")).toBe(true);
    expect(p.startsWith("/")).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @rtc/client-react-native exec vitest run tests/visual/shared/goldens.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const VISUAL_ROOT = join(HERE, "..");

export const DEVICE_PIN = "ios-iphone15-18";

export type Tier = "simctl" | "maestro";

export function goldenPath(tier: Tier, scenarioId: string): string {
  return join(VISUAL_ROOT, "__screenshots__", DEVICE_PIN, tier, `${scenarioId}.png`);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @rtc/client-react-native exec vitest run tests/visual/shared/goldens.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/client-react-native/tests/visual/shared/goldens.ts packages/client-react-native/tests/visual/shared/goldens.test.ts
git commit -m "feat(rn-visual): golden path resolver + iPhone 15/iOS 18 device pin"
```

---

### Task 0.3: Scenario registry + driver interface

**Files:**
- Create: `packages/client-react-native/tests/visual/driver.ts`
- Create: `packages/client-react-native/tests/visual/scenarios.ts`
- Test: `packages/client-react-native/tests/visual/scenarios.test.ts`

**Interfaces:**
- Consumes: existing `createSimulatorPorts` (`@rtc/client-core`), `createApp`, `createViewModel`/`ViewModelProvider` (`@rtc/react-bindings`), `ThemeProvider` + `RnThemeSkin`/`ThemeMode` (RN `src/ui/theme`). **The implementer must confirm these exact export names before use** (see `src/app/_layout.tsx` for the live composition).
- Produces:
  - `type Scenario = { id: string; skin: RnThemeSkin; mode: ThemeMode; build: () => ReactNode }`
  - `interface VisualDriver { name: "simctl" | "maestro" | "owl"; capture(scenarioId: string): Promise<Buffer> }`
  - `const SCENARIOS: readonly Scenario[]` and `getScenario(id): Scenario | undefined`.

- [ ] **Step 1: Write `driver.ts`** (types only, no logic)

```ts
import type { ReactNode } from "react";
import type { RnThemeSkin, ThemeMode } from "#/ui/theme/tokens";

export interface Scenario {
  id: string;
  skin: RnThemeSkin;
  mode: ThemeMode;
  build: () => ReactNode;
}

export interface VisualDriver {
  name: "simctl" | "maestro" | "owl";
  capture(scenarioId: string): Promise<Buffer>;
}
```

> Confirm `RnThemeSkin`/`ThemeMode` are exported from `#/ui/theme/tokens`; if the live names differ, use those and update this block.

- [ ] **Step 2: Write the failing test for the registry**

```ts
import { describe, expect, it } from "vitest";
import { SCENARIOS, getScenario } from "#/../tests/visual/scenarios";

describe("SCENARIOS", () => {
  it("has unique ids and covers the paint-bug surfaces", () => {
    const ids = SCENARIOS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain("fx/tile-up-holo3d");        // 3D shadow/sheen surface
    expect(ids).toContain("equities/pricechart-holo3d"); // the regressed component
    expect(ids).toContain("shell/lock");
  });

  it("resolves by id", () => {
    expect(getScenario("shell/lock")?.skin).toBeDefined();
    expect(getScenario("nope")).toBeUndefined();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm --filter @rtc/client-react-native exec vitest run tests/visual/scenarios.test.ts`
Expected: FAIL — module not found.

> **Note:** `scenarios.ts` imports RN leaves (`.tsx`). The registry file itself must stay **vitest-parseable** — keep `build()` bodies referencing RN components behind a lazy import boundary, OR mark this test to run under jest instead of vitest. Per the repo's split (`.test.ts`→vitest, `.test.tsx`→jest), rename this to `scenarios.test.tsx` and run under jest if it must import RN components. Choose jest here because scenarios pull real leaves.

Corrected run: `pnpm --filter @rtc/client-react-native exec jest tests/visual/scenarios.test.tsx`

- [ ] **Step 4: Implement `scenarios.ts`**

```tsx
import type { Scenario } from "./driver";
import { VisualScenarioHost } from "#/../tests/visual/VisualScenarioHost";
import { SpotTile } from "#/ui/SpotTile";
import { PriceChart } from "#/ui/equities/PriceChart";
import { LockScreen } from "#/ui/shell/LockScreen";
import { RfqCard } from "#/ui/credit/RfqCard";
import { PairPnlBars } from "#/ui/analytics/PairPnlBars";

// Each build() wraps a leaf in VisualScenarioHost, which injects sim ports,
// pins skin/mode, forces reduce-motion, and raises the ready marker.
export const SCENARIOS: readonly Scenario[] = [
  { id: "fx/tile-up-holo3d", skin: "holo3d", mode: "dark",
    build: () => <VisualScenarioHost skin="holo3d" mode="dark"><SpotTile symbol="EUR/USD" /></VisualScenarioHost> },
  { id: "fx/tile-up-classic", skin: "classic", mode: "dark",
    build: () => <VisualScenarioHost skin="classic" mode="dark"><SpotTile symbol="EUR/USD" /></VisualScenarioHost> },
  { id: "equities/pricechart-holo3d", skin: "holo3d", mode: "dark",
    build: () => <VisualScenarioHost skin="holo3d" mode="dark"><PriceChart symbol="AAPL" /></VisualScenarioHost> },
  { id: "shell/lock", skin: "terminal3d", mode: "dark",
    build: () => <VisualScenarioHost skin="terminal3d" mode="dark"><LockScreen /></VisualScenarioHost> },
  { id: "credit/rfqcard-holo3d", skin: "holo3d", mode: "dark",
    build: () => <VisualScenarioHost skin="holo3d" mode="dark"><RfqCard /></VisualScenarioHost> },
  { id: "analytics/pairpnl-neon", skin: "neon", mode: "light",
    build: () => <VisualScenarioHost skin="neon" mode="light"><PairPnlBars /></VisualScenarioHost> },
];

export function getScenario(id: string): Scenario | undefined {
  return SCENARIOS.find((s) => s.id === id);
}
```

> The exact leaf prop signatures (`SpotTile symbol`, `PriceChart symbol`, `RfqCard`, `PairPnlBars`) must be matched to the live components; the implementer reads each leaf and supplies the props the seam requires. `VisualScenarioHost` is built in Task 0.4.

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @rtc/client-react-native exec jest tests/visual/scenarios.test.tsx`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/client-react-native/tests/visual/driver.ts packages/client-react-native/tests/visual/scenarios.ts packages/client-react-native/tests/visual/scenarios.test.tsx
git commit -m "feat(rn-visual): scenario registry + VisualDriver interface"
```

---

### Task 0.4: In-app harness (`VisualScenarioHost` + route + gate)

**Files:**
- Create: `packages/client-react-native/src/app/visualHarnessGate.ts`
- Create: `packages/client-react-native/tests/visual/VisualScenarioHost.tsx`
- Create: `packages/client-react-native/src/app/__visual/[id].tsx`
- Test: `packages/client-react-native/src/app/visualHarnessGate.test.ts` (vitest)
- Test: `packages/client-react-native/tests/visual/VisualScenarioHost.test.tsx` (jest)

**Interfaces:**
- Consumes: `getScenario` (Task 0.3), `createSimulatorPorts`/`createApp`/`createViewModel`/`ViewModelProvider`, `ThemeProvider`.
- Produces:
  - `visualHarnessEnabled(): boolean` — true iff `process.env.EXPO_PUBLIC_VISUAL_HARNESS === "1"`.
  - `VisualScenarioHost` — a component `{ skin; mode; children }` that mounts the full neutral composition on **sim ports**, wraps children in `ThemeProvider` (pinned skin/mode) + `ViewModelProvider`, forces reduce-motion, and sets `testID="visual-ready"` on its root once fonts + first render settle.

- [ ] **Step 1: Write the failing gate test**

```ts
import { afterEach, describe, expect, it } from "vitest";
import { visualHarnessEnabled } from "#/app/visualHarnessGate";

const original = process.env.EXPO_PUBLIC_VISUAL_HARNESS;
afterEach(() => { process.env.EXPO_PUBLIC_VISUAL_HARNESS = original; });

describe("visualHarnessEnabled", () => {
  it("is off by default", () => {
    delete process.env.EXPO_PUBLIC_VISUAL_HARNESS;
    expect(visualHarnessEnabled()).toBe(false);
  });
  it("is on when the flag is 1", () => {
    process.env.EXPO_PUBLIC_VISUAL_HARNESS = "1";
    expect(visualHarnessEnabled()).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify it fails, then implement `visualHarnessGate.ts`**

Run: `pnpm --filter @rtc/client-react-native exec vitest run src/app/visualHarnessGate.test.ts` → FAIL.

```ts
export function visualHarnessEnabled(): boolean {
  return process.env.EXPO_PUBLIC_VISUAL_HARNESS === "1";
}
```

Re-run → PASS.

- [ ] **Step 3: Write the failing `VisualScenarioHost` render test (jest)**

```tsx
import { render, screen } from "@testing-library/react-native";
import { Text } from "react-native";
import { VisualScenarioHost } from "./VisualScenarioHost";

test("renders children and raises the ready marker on sim ports", async () => {
  await render(
    <VisualScenarioHost skin="classic" mode="dark">
      <Text>hello</Text>
    </VisualScenarioHost>,
  );
  expect(await screen.findByText("hello")).toBeTruthy();
  expect(await screen.findByTestId("visual-ready")).toBeTruthy();
});
```

- [ ] **Step 4: Run to verify it fails**

Run: `pnpm --filter @rtc/client-react-native exec jest tests/visual/VisualScenarioHost.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 5: Implement `VisualScenarioHost.tsx`**

```tsx
import { type ReactNode, useEffect, useState } from "react";
import { View } from "react-native";
import { createSimulatorPorts } from "@rtc/client-core";
import { createApp } from "@rtc/client-core";
import { createViewModel, ViewModelProvider } from "@rtc/react-bindings";
import { ThemeProvider } from "#/ui/theme/ThemeProvider";
import { useAppFonts } from "#/ui/theme/useAppFonts";
import type { RnThemeSkin, ThemeMode } from "#/ui/theme/tokens";

interface Props {
  skin: RnThemeSkin;
  mode: ThemeMode;
  children: ReactNode;
}

// One composition per host mount. Sim ports only — deterministic seeded data,
// no live WS. Confirm createApp/createViewModel arg shapes against _layout.tsx.
export function VisualScenarioHost({ skin, mode, children }: Props): ReactNode {
  const fontsLoaded = useAppFonts();
  const [vm] = useState(() => {
    const { ports } = createSimulatorPorts({ preferences: makeInMemoryPreferences(skin, mode) });
    const app = createApp(ports);
    return createViewModel(app);
  });
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (fontsLoaded) {
      // one frame after fonts settle → mark ready for the screenshot drivers
      const h = requestAnimationFrame(() => setReady(true));
      return () => cancelAnimationFrame(h);
    }
    return undefined;
  }, [fontsLoaded]);

  return (
    <ViewModelProvider viewModel={vm}>
      <ThemeProvider skin={skin} mode={mode} forceReduceMotion>
        <View testID={ready ? "visual-ready" : "visual-pending"} style={{ flex: 1 }}>
          {children}
        </View>
      </ThemeProvider>
    </ViewModelProvider>
  );
}
```

> Two dependencies the implementer wires to the live code:
> 1. `makeInMemoryPreferences(skin, mode)` — a tiny in-file `PreferencesPort` stub seeding the pinned skin/mode and the 5 known keys (mirror `AsyncStoragePreferencesAdapter` defaults). Keeps the pin out of persisted state.
> 2. `ThemeProvider` must accept explicit `skin`/`mode`/`forceReduceMotion` props for the harness. If it currently reads only from the presenter, add these optional overrides (pure additive; default behaviour unchanged) — this is the one small production touch, analogous to the web suite's `data-testid` additions.

- [ ] **Step 6: Run to verify it passes**

Run: `pnpm --filter @rtc/client-react-native exec jest tests/visual/VisualScenarioHost.test.tsx`
Expected: PASS.

- [ ] **Step 7: Implement the harness route**

```tsx
// src/app/__visual/[id].tsx
import { useLocalSearchParams } from "expo-router";
import { Text } from "react-native";
import { visualHarnessEnabled } from "#/app/visualHarnessGate";
import { getScenario } from "#/../tests/visual/scenarios";

export default function VisualHarnessRoute(): React.ReactNode {
  const { id } = useLocalSearchParams<{ id: string }>();
  if (!visualHarnessEnabled()) {
    return <Text>disabled</Text>;
  }
  const scenario = typeof id === "string" ? getScenario(id) : undefined;
  if (!scenario) {
    return <Text testID="visual-not-found">no scenario: {String(id)}</Text>;
  }
  return scenario.build();
}
```

> Expo Router needs the default export → add `src/app/__visual/**` to the RN Biome `noDefaultExport:off` scope (see the existing `app/**` entry). Importing test files from `src/app` is unusual; if the layering gate objects, move `scenarios.ts`/`driver.ts`/`VisualScenarioHost.tsx` under `src/app/__visual/` instead of `tests/visual/` and adjust paths. Prefer keeping them in `tests/visual/` and adding a knip/eslint allowance.

- [ ] **Step 8: Typecheck + full gauntlet, then commit**

```bash
pnpm --filter @rtc/client-react-native typecheck
pnpm --filter @rtc/client-react-native test
git add packages/client-react-native/src/app/visualHarnessGate.ts packages/client-react-native/src/app/visualHarnessGate.test.ts packages/client-react-native/tests/visual/VisualScenarioHost.tsx packages/client-react-native/tests/visual/VisualScenarioHost.test.tsx packages/client-react-native/src/app/__visual/
git commit -m "feat(rn-visual): dev-only in-app harness route + VisualScenarioHost + gate"
```

---

## Phase 1 — Tier 1: `simctl` driver

### Task 1.1: simctl capture adapter

**Files:**
- Create: `packages/client-react-native/tests/visual/simctl/capture.ts`

**Interfaces:**
- Consumes: `VisualDriver` (Task 0.3).
- Produces: `createSimctlDriver(cfg: { udid: string; appPath: string; metroUrl: string }): VisualDriver` whose `capture(id)` deep-links `rtcmobile://__visual/<id>`, waits for the `visual-ready` marker, and returns the screenshot PNG as a Buffer.

- [ ] **Step 1: Implement the adapter** (device orchestration — verified by the Task 1.2 smoke, not a unit test)

```ts
import { execFile } from "node:child_process";
import { readFile, rm } from "node:fs/promises";
import { promisify } from "node:util";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { VisualDriver } from "../driver";

const exec = promisify(execFile);

export function createSimctlDriver(cfg: { udid: string; appPath: string; metroUrl: string }): VisualDriver {
  return {
    name: "simctl",
    async capture(id: string): Promise<Buffer> {
      const dev = cfg.udid;
      // Cold-relaunch the dev client at the harness route via the dev-client deep link.
      const inner = encodeURIComponent(`${cfg.metroUrl}/--/__visual/${id}`);
      await exec("xcrun", ["simctl", "terminate", dev, "io.rtc.mobile"]).catch(() => undefined);
      await exec("xcrun", ["simctl", "openurl", dev,
        `exp+rtc-mobile://expo-development-client/?url=${inner}`]);
      // Poll for the ready marker via a screenshot-stability heuristic:
      // take two shots 400ms apart until identical, then accept (fonts+RAF settled).
      const out = join(tmpdir(), `owl-${id.replace(/\//g, "_")}.png`);
      await stabilize(dev, out);
      const buf = await readFile(out);
      await rm(out, { force: true });
      return buf;
    },
  };
}

async function stabilize(udid: string, out: string): Promise<void> {
  // Minimal stability gate: capture until two consecutive frames match.
  // (Full impl: shell out to `xcrun simctl io <udid> screenshot`, compare bytes.)
  await exec("xcrun", ["simctl", "io", udid, "screenshot", out]);
}
```

> `io.rtc.mobile` / the bundle id and the `exp+rtc-mobile://` dev-client URL must match the live values (`app.config.ts` `bundleIdentifier`, `Info.plist` schemes). The deep-link form is the proven recipe from the project's on-device screenshot notes. A richer `stabilize` (two-frame byte compare) replaces the placeholder before Task 1.2 ships.

- [ ] **Step 2: Commit**

```bash
git add packages/client-react-native/tests/visual/simctl/capture.ts
git commit -m "feat(rn-visual): simctl capture adapter (Tier 1)"
```

---

### Task 1.2: simctl runner + scripts + first goldens

**Files:**
- Create: `packages/client-react-native/tests/visual/simctl/run.ts`
- Modify: `packages/client-react-native/package.json` (scripts)

**Interfaces:**
- Consumes: `SCENARIOS`, `createSimctlDriver`, `compareToGolden`, `goldenPath`.
- Produces: a CLI runner supporting `--update` and exiting non-zero on any failure.

- [ ] **Step 1: Implement the runner**

```ts
import { env, argv, exit } from "node:process";
import { writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { SCENARIOS } from "../scenarios";
import { createSimctlDriver } from "./capture";
import { compareToGolden } from "../shared/diff";
import { goldenPath } from "../shared/goldens";

async function main(): Promise<void> {
  const update = argv.includes("--update");
  const driver = createSimctlDriver({
    udid: env.RTC_VISUAL_UDID ?? "booted",
    appPath: env.RTC_VISUAL_APP ?? "",
    metroUrl: env.RTC_VISUAL_METRO ?? "http://127.0.0.1:8081",
  });
  let failures = 0;
  for (const s of SCENARIOS) {
    const png = await driver.capture(s.id);
    const gp = goldenPath("simctl", s.id);
    const res = await compareToGolden(png, gp, { createIfMissing: update });
    if (update) {
      await mkdir(dirname(gp), { recursive: true });
      await writeFile(gp, png);
      console.log(`updated  ${s.id}`);
    } else if (res.pass) {
      console.log(`pass     ${s.id}  (${(res.ratio * 100).toFixed(2)}%)`);
    } else {
      failures++;
      console.error(`FAIL     ${s.id}  (${(res.ratio * 100).toFixed(2)}%)`);
    }
  }
  exit(failures > 0 ? 1 : 0);
}

void main();
```

- [ ] **Step 2: Add scripts to `package.json`**

```json
"test:rn:visual:simctl": "tsx tests/visual/simctl/run.ts",
"test:rn:visual:simctl:update": "tsx tests/visual/simctl/run.ts --update"
```

- [ ] **Step 3: Generate the first goldens on the pinned device**

```bash
# From the RN package: build the dev client once (primary checkout), boot the pin,
# start Metro from the worktree, then update goldens.
xcrun simctl boot "iPhone 15" 2>/dev/null || true
EXPO_PUBLIC_VISUAL_HARNESS=1 npx expo start --dev-client --port 8081 &   # from the worktree
RTC_VISUAL_METRO="http://$(ipconfig getifaddr en0):8081" \
  pnpm --filter @rtc/client-react-native test:rn:visual:simctl:update
```

Expected: one PNG per scenario under `__screenshots__/ios-iphone15-18/simctl/`. Eyeball each for correctness (right skin, no clipped shadow on the 3D tile).

- [ ] **Step 4: Verify the suite passes against its own goldens**

Run: `RTC_VISUAL_METRO=... pnpm --filter @rtc/client-react-native test:rn:visual:simctl`
Expected: all `pass`.

- [ ] **Step 5: Commit (goldens included)**

```bash
git add packages/client-react-native/tests/visual/simctl/run.ts packages/client-react-native/package.json packages/client-react-native/tests/visual/__screenshots__/ios-iphone15-18/simctl/
git commit -m "feat(rn-visual): simctl runner + scripts + committed iOS goldens (Tier 1)"
```

---

## Phase 2 — Tier 2: Maestro driver

### Task 2.1: Maestro flow generator

**Files:**
- Create: `packages/client-react-native/tests/visual/maestro/generateFlows.ts`
- Create (generated, committed): `packages/client-react-native/tests/visual/maestro/flows/<id>.yaml`

**Interfaces:**
- Consumes: `SCENARIOS`.
- Produces: one YAML flow per scenario that launches, deep-links to the harness route, waits for the ready marker, and screenshots to a known path.

- [ ] **Step 1: Implement the generator**

```ts
import { writeFile, mkdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { SCENARIOS } from "../scenarios";

const HERE = dirname(fileURLToPath(import.meta.url));

function flowYaml(id: string): string {
  const safe = id.replace(/\//g, "_");
  return [
    `appId: io.rtc.mobile`,
    `---`,
    `- launchApp`,
    `- openLink:`,
    `    link: "rtcmobile://__visual/${id}"`,
    `- assertVisible:`,
    `    id: "visual-ready"`,
    `- takeScreenshot: "shots/${safe}"`,
    ``,
  ].join("\n");
}

async function main(): Promise<void> {
  for (const s of SCENARIOS) {
    const p = join(HERE, "flows", `${s.id.replace(/\//g, "_")}.yaml`);
    await mkdir(dirname(p), { recursive: true });
    await writeFile(p, flowYaml(s.id));
  }
}
void main();
```

> `appId: io.rtc.mobile` must match the live bundle id. Maestro screenshots land under its `shots/` output; the runner (Task 2.2) reads them from Maestro's output dir.

- [ ] **Step 2: Generate + commit the flows**

```bash
pnpm --filter @rtc/client-react-native exec tsx tests/visual/maestro/generateFlows.ts
git add packages/client-react-native/tests/visual/maestro/generateFlows.ts packages/client-react-native/tests/visual/maestro/flows/
git commit -m "feat(rn-visual): Maestro flow generator + generated flows (Tier 2)"
```

---

### Task 2.2: Maestro runner + scripts + goldens

**Files:**
- Create: `packages/client-react-native/tests/visual/maestro/run.ts`
- Modify: `packages/client-react-native/package.json`

**Interfaces:**
- Consumes: generated flows, `compareToGolden`, `goldenPath`, `SCENARIOS`.
- Produces: a runner that invokes `maestro test`, then diffs each captured shot against the `maestro` golden set (shared diff core), `--update` supported.

- [ ] **Step 1: Implement the runner**

```ts
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { argv, env, exit } from "node:process";
import { SCENARIOS } from "../scenarios";
import { compareToGolden } from "../shared/diff";
import { goldenPath } from "../shared/goldens";

const exec = promisify(execFile);
const SHOTS = env.RTC_VISUAL_MAESTRO_SHOTS ?? join(process.cwd(), ".maestro-shots");

async function main(): Promise<void> {
  const update = argv.includes("--update");
  await exec("maestro", ["test", "tests/visual/maestro/flows", "--format", "junit"],
    { env: { ...env, MAESTRO_CLI_NO_ANALYTICS: "1" } });
  let failures = 0;
  for (const s of SCENARIOS) {
    const shot = join(SHOTS, `${s.id.replace(/\//g, "_")}.png`);
    const png = await readFile(shot);
    const gp = goldenPath("maestro", s.id);
    const res = await compareToGolden(png, gp, { createIfMissing: update });
    if (update) {
      await mkdir(dirname(gp), { recursive: true });
      await writeFile(gp, png);
      console.log(`updated  ${s.id}`);
    } else if (res.pass) {
      console.log(`pass     ${s.id}`);
    } else {
      failures++;
      console.error(`FAIL     ${s.id}  (${(res.ratio * 100).toFixed(2)}%)`);
    }
  }
  exit(failures > 0 ? 1 : 0);
}
void main();
```

- [ ] **Step 2: Add scripts + install Maestro locally**

```json
"test:rn:visual:maestro": "tsx tests/visual/maestro/run.ts",
"test:rn:visual:maestro:update": "tsx tests/visual/maestro/run.ts --update"
```

Maestro is a CLI, not an npm dep: document `curl -fsSL "https://get.maestro.mobile.dev" | bash` in the README (Task 4.3). Do **not** add it to `package.json` deps.

- [ ] **Step 3: Generate goldens on the pin, verify, commit**

```bash
EXPO_PUBLIC_VISUAL_HARNESS=1 npx expo start --dev-client --port 8081 &  # worktree Metro
pnpm --filter @rtc/client-react-native test:rn:visual:maestro:update
pnpm --filter @rtc/client-react-native test:rn:visual:maestro    # expect all pass
git add packages/client-react-native/tests/visual/maestro/run.ts packages/client-react-native/package.json packages/client-react-native/tests/visual/__screenshots__/ios-iphone15-18/maestro/
git commit -m "feat(rn-visual): Maestro runner + scripts + committed goldens (Tier 2)"
```

---

## Phase 3 — Tier 3: react-native-owl

> Tier 3 is the batteries-included contrast: owl **owns capture + diff + baseline** via its own jest matcher, so it does **not** use the shared `pixelmatch` core. The only shared piece is the scenario registry (owl navigates the same harness routes).

### Task 3.1: owl config + owl test + scripts + baselines

**Files:**
- Create: `packages/client-react-native/tests/visual/owl/owl.config.json`
- Create: `packages/client-react-native/tests/visual/owl/visual.owl.test.ts`
- Modify: `packages/client-react-native/package.json`

**Interfaces:**
- Consumes: `SCENARIOS`, owl's `takeScreenshot` + `toMatchBaseline`.
- Produces: `test:rn:visual:owl` (build+test) and `:update` scripts; owl-managed baselines under `owl-baseline/`.

- [ ] **Step 1: Add owl + write config**

```bash
pnpm --filter @rtc/client-react-native add -D react-native-owl
```

```json
{
  "ios": {
    "workspace": "ios/RTCMobile.xcworkspace",
    "scheme": "RTCMobile",
    "configuration": "Debug",
    "device": "iPhone 15"
  },
  "report": true
}
```

> If Expo hasn't produced `ios/*.xcworkspace` yet, run `npx expo prebuild -p ios` once. owl needs a native build — this is the "heavier setup" the rubric records. If owl fails to build against SDK 57 / RN 0.86, switch Tier 3 to the Detox + `jest-image-snapshot` fallback (documented in the spec §11) and record the failure as the decisive owl rubric finding.

- [ ] **Step 2: Write the owl test (data-driven over the registry)**

```ts
import { takeScreenshot } from "react-native-owl";
import { SCENARIOS } from "../scenarios";

// owl drives the built app; navigate each scenario via its deep link, then snapshot.
describe("rn-visual (owl)", () => {
  for (const s of SCENARIOS) {
    it(`matches ${s.id}`, async () => {
      // deep-link into the harness route (owl exposes the running app; use its
      // navigation helper or a simctl openurl shell-out documented in README)
      const screen = await takeScreenshot(s.id.replace(/\//g, "_"));
      expect(screen).toMatchBaseline({ threshold: 0.06 });
    });
  }
});
```

> owl's screenshot naming can't contain `/` — the `_`-flattened id keeps baselines addressable. Navigation to the harness route: owl runs its own jest env; drive the deep link with `xcrun simctl openurl booted "rtcmobile://__visual/<id>"` inside a `beforeEach`, or use owl's press/scroll helpers if the harness exposes an index. Keep `EXPO_PUBLIC_VISUAL_HARNESS=1` in the owl build env.

- [ ] **Step 3: Add scripts**

```json
"test:rn:visual:owl": "owl build --platform ios && owl test --platform ios",
"test:rn:visual:owl:update": "owl test --platform ios --update"
```

- [ ] **Step 4: Build baselines on the pin, verify, commit**

```bash
EXPO_PUBLIC_VISUAL_HARNESS=1 pnpm --filter @rtc/client-react-native test:rn:visual:owl:update
pnpm --filter @rtc/client-react-native test:rn:visual:owl   # expect pass on 2nd run
git add packages/client-react-native/tests/visual/owl/ packages/client-react-native/package.json
git commit -m "feat(rn-visual): react-native-owl tier + config + baselines (Tier 3)"
```

---

## Phase 4 — Bake-off, injected-bug proof, wiring, docs

### Task 4.1: Gate wiring (knip / tsconfig / Biome / Turbo)

**Files:**
- Modify: `knip.json`, `packages/client-react-native/tsconfig.json`, `tsconfig.eslint.json` (or RN eslint include), root `biome.json` scope, `turbo.json`.

- [ ] **Step 1: Wire every new dev dep + script**

- `knip.json` RN workspace block: add `pixelmatch`, `pngjs`, `react-native-owl` to the entry/ignore as appropriate; add `tests/visual/**` entry patterns so knip doesn't flag the runners as dead.
- Biome: extend the RN `noDefaultExport:off` scope to `src/app/__visual/**`.
- tsconfig include: ensure `tests/visual/**` is typechecked; add the new test files to the RN eslint include.
- `turbo.json`: no new pipeline task required (these are not `test`/`build`); document that they are invoked directly. If a Turbo alias is wanted, add `test:rn:visual` as a non-cached passthrough.

- [ ] **Step 2: Run the full gauntlet at repo root**

```bash
pnpm biome ci .
pnpm eslint .
pnpm eslint . --config eslint.config.typed.mjs
pnpm --filter @rtc/client-react-native typecheck
pnpm --filter @rtc/client-react-native test
pnpm knip
```

Expected: all clean. Fix any `func-style`/`useExplicitType`/`no-floating-promises`/`newspaper-order` findings (the recurring RN traps).

- [ ] **Step 3: Commit**

```bash
git add knip.json turbo.json biome.json packages/client-react-native/tsconfig.json tsconfig.eslint.json
git commit -m "chore(rn-visual): wire scripts + dev deps into repo gates (non-CI)"
```

---

### Task 4.2: Injected-bug proof + `BAKEOFF.md`

**Files:**
- Create: `packages/client-react-native/tests/visual/BAKEOFF.md`

- [ ] **Step 1: On a scratch commit, reintroduce the documented paint bug**

In `src/ui/SurfaceCard.tsx` (or `PriceChart`), reintroduce `overflow: "hidden"` on the shadowed card view — the exact regression from PR #147's whole-branch-review finding. Do **not** regenerate goldens.

- [ ] **Step 2: Run all three tiers and record which go red**

```bash
pnpm --filter @rtc/client-react-native test:rn:visual:simctl
pnpm --filter @rtc/client-react-native test:rn:visual:maestro
pnpm --filter @rtc/client-react-native test:rn:visual:owl
```

Expected: `equities/pricechart-holo3d` (and the 3D FX tile) FAIL on every tier that renders the shadow correctly — capture the exact ratios.

- [ ] **Step 3: Revert the bug; write `BAKEOFF.md`**

Score the three tiers in a table: setup cost · config/LOC · per-run wall-clock (measure) · flake/determinism (run each 3× on identical input, record ratio spread) · **caught the injected bug? (yes/no + ratio)** · Android-portability · maintenance risk · DX. Add a short recommendation paragraph.

- [ ] **Step 4: Commit**

```bash
git checkout -- src/ui   # ensure the bug is reverted
git add packages/client-react-native/tests/visual/BAKEOFF.md
git commit -m "docs(rn-visual): bake-off rubric with injected-paint-bug proof"
```

---

### Task 4.3: README

**Files:**
- Create: `packages/client-react-native/tests/visual/README.md`

- [ ] **Step 1: Write the README** covering:

- **Not a CI gate** and why (Mac-only iOS pixels); when to run it (any RN view change, pre-merge).
- Prerequisites: prebuilt `RTCMobile.app`, `pnpm build` first, Maestro install one-liner, the **iPhone 15 · iOS 18.x** pin.
- How to run each tier and how to regenerate goldens (`:update`), and that regeneration must use the pin.
- The tier map: simctl/Maestro share the `pixelmatch` diff core + `__screenshots__/` goldens; owl owns its own baselines under `owl-baseline/`.
- Determinism controls and the `EXPO_PUBLIC_VISUAL_HARNESS` flag.
- Pointer to `BAKEOFF.md` and the design spec.

- [ ] **Step 2: Commit**

```bash
git add packages/client-react-native/tests/visual/README.md
git commit -m "docs(rn-visual): suite README (device pin, when to run, regenerate)"
```

---

## Self-Review (completed against the spec)

- **Spec coverage:** fidelity=real pixels (Phase 1–3); three permanent tiers (Ph1 simctl, Ph2 maestro, Ph3 owl); shared registry+harness (Ph0); determinism controls (Task 0.4); device pin + goldens (Task 0.2, Ph1–3); non-gate + wiring (Task 4.1); BAKEOFF + injected bug (Task 4.2); README (Task 4.3); Android seam = explicitly out of scope (spec §10). ✔ all covered.
- **Placeholder scan:** device orchestration steps (`stabilize`, owl navigation) are flagged as implementer-completes-against-live-values, not silent TODOs — each names the exact live artifact to match. No bare "add error handling".
- **Type consistency:** `compareToGolden` signature identical across Tasks 0.1/1.2/2.2; `goldenPath(tier, id)` identical across 0.2/1.2/2.2; `VisualDriver`/`Scenario` from `driver.ts` used consistently; `visualHarnessEnabled` naming stable.
- **Known risk carried into execution:** exact live export names (`createSimulatorPorts`/`createApp`/`createViewModel`/`ThemeProvider` props, leaf props, bundle id, dev-client URL) must be confirmed against source in Task 0.3/0.4/1.1 before use — called out inline rather than assumed.
