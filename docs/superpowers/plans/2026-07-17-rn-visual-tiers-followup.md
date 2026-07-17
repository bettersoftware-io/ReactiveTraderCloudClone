# RN Visual Tiers Follow-up Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the RN visual-snapshot harness to the originally-specified three permanent tiers (`simctl` shipped; add **Maestro** and **react-native-owl**), pin the **Appearance-sheet** baseline (Phase 2 Task 9), and settle the **tier bake-off** with an injected-paint-bug proof — Mac-local, never a CI gate.

**Architecture:** The shipped Phase 1 harness (`packages/client-react-native/tests/visual/`) already owns the shared `pixelmatch` diff core, the `goldenPath` resolver (with a `maestro` tier slot), the `VisualDriver` interface (with an `owl` name), the dev-only `__visual/[id]` route + `VisualScenarioHost`, and a **Node-safe `scenarioIds.ts`** that the tsx/Node runners iterate (importing the RN-laden `scenarios.tsx` breaks esbuild). This plan adds two more capture drivers over that same registry, one more scenario, and the bake-off — reconciling the 2026-07-10 base plan against what actually shipped.

**Tech Stack:** Expo SDK 57 / RN 0.86, Expo Router, `pixelmatch` + `pngjs` (already installed), `xcrun simctl` + `idb`, Maestro CLI, `react-native-owl` (Detox + `jest-image-snapshot` fallback), tsx, vitest (Node-safe unit island).

## Global Constraints

- **Base spec/plan:** `docs/superpowers/plans/2026-07-10-rn-visual-snapshot-testing.md` (§Phase 2/3/4) and `docs/superpowers/specs/2026-07-10-rn-visual-snapshot-testing-design.md`. This plan **supersedes** the base plan's Phase 2/3/4 where they conflict with shipped reality (below).
- **Not a CI gate. EVER.** Never add these scripts to `.github/workflows/ci.yml`. iOS pixels need macOS; there are no macOS CI runners.
- **Canonical device+runtime pin:** `iPhone 15 · iOS 18.x` (`DEVICE_PIN = "ios-iphone15-18"`, already in `shared/goldens.ts`). All goldens captured on this pin.
- **Diff tolerance:** `compareToGolden` default ratio `0.06` (shipped). Owl uses its own `toMatchBaseline({ threshold: 0.06 })`.
- **`SCENARIO_IDS` (`tests/visual/scenarioIds.ts`) is the Node-safe source of truth.** Every Node/tsx runner (simctl, Maestro) iterates it — **never** import `scenarios.tsx` from a Node runner (pulls RN leaves → esbuild "Unexpected typeof"). `scenarios.tsx` builds its `SCENARIOS` registry against these ids and `scenarios.test.tsx` asserts the two stay in sync — **any new scenario must be added to BOTH and keep that test green.**
- **Deep-link is a proven TWO-STEP, not a one-shot `openLink`** (base plan amendment A2, empirically confirmed and encoded in `simctl/capture.ts`): (1) load the dev client at its Metro base URL `exp+rtc-mobile://expo-development-client/?url=http://localhost:<port>`; (2) after the bundle loads, in-app deep-link `rtcmobile://__visual/<id>`, which raises an iOS "Open in RTC Mobile?" confirmation that must be dismissed (simctl can't; `idb ui tap` at the pin's measured point). RN accessibility state is **not** queryable from `simctl`/`idb`, so simctl uses fixed settle waits, not the `visual-ready` marker.
- **Determinism:** sim ports only (no live WS), skin/mode pinned per scenario, reduce-motion forced (freezes the Phase 2 ambient aurora), only deterministic leaves (no `Math.random`/live-ticking sources — Rates/Analytics/Credit-RFQ are excluded; see `scenarios.tsx` header).
- **Harness dev-only:** `__visual/[id]` inert unless `EXPO_PUBLIC_VISUAL_HARNESS === "1"`.
- **`#/` subpath alias**, not `@/`. Biome bans ≥2-up relative imports.
- **Repo gate rules:** every new dev dep + runner file wired into `knip.json` (RN block), tsconfig/eslint includes, Biome scope, and package.json scripts — even though non-CI (the "all gates cover every package" rule). Run the full local gauntlet per file before each commit.
- **Bundle/scheme identity:** appId/bundle `io.bettersoftware.rtcmobile`, release scheme `rtcmobile`, dev-client scheme `exp+rtc-mobile`, slug `rtc-mobile`.

## Reconciliation vs the 2026-07-10 base plan (what shipped differs)

| Base plan assumed | Shipped reality (this plan follows) |
|---|---|
| Scenarios `fx/tile-up-holo3d`, `equities/pricechart-holo3d`, `shell/lock`, … | `SCENARIO_IDS = ["blotter/seeded", "shell/connection-banner"]` — the module screens are rebuilt in rehaul Phases 4-6; pinning them now would churn. |
| Runners import `SCENARIOS` from `scenarios.ts` | Runners import `SCENARIO_IDS` from the Node-safe `scenarioIds.ts` (RN-free). |
| Maestro `- openLink: rtcmobile://__visual/<id>` one-shot + `assertVisible: visual-ready` | Two-step dev-client load required. Maestro flows mirror the simctl two-step. Whether Maestro's `assertVisible` (XCUITest a11y query) can see `visual-ready` where simctl can't is an **open bake-off question** to answer on-device, not assume. |
| `appId: io.rtc.mobile` | `io.bettersoftware.rtcmobile`. |
| README/Task 4.3 pending | README already shipped — this plan **extends** it (Maestro/owl sections), not recreate. |
| Task 4.1 gate wiring pending | `pixelmatch`/`pngjs`/`tests/visual/driver.ts` already wired; this plan adds only the Maestro/owl surfaces. |

---

## File Structure

```
packages/client-react-native/tests/visual/
  maestro/
    generateFlows.ts   — NEW: writes one YAML flow per SCENARIO_ID (Node-safe)
    flows/<id>.yaml     — NEW (generated, committed): two-step dev-client flow
    generateFlows.test.ts — NEW (vitest): asserts generated YAML shape
    run.ts             — NEW: `maestro test` → diff shots vs maestro goldens
  owl/
    owl.config.json    — NEW: owl device pin config
    visual.owl.test.ts — NEW: data-driven over SCENARIO_IDS, owns capture+diff
  scenarios.tsx        — MODIFY: add `shell/appearance`
  scenarioIds.ts       — MODIFY: add `"shell/appearance"`
  scenarios.test.tsx   — MODIFY: parity assertion covers the new id
  BAKEOFF.md           — NEW: tier rubric + injected-bug proof (native-session tail)
  README.md            — MODIFY: Maestro + owl tier sections
  __screenshots__/ios-iphone15-18/
    maestro/<id>.png   — NEW goldens (native-session tail)
    simctl/shell/appearance.png — NEW golden (native-session tail)
  owl-baseline/        — NEW owl baselines (native-session tail)
```

---

## Execution shape: parallel HEAD → serial TAIL

**HEAD (code only — parallelizable across isolated worktrees, no device):** Tasks M, O, A build disjoint file sets (`maestro/**`, `owl/**`, the three registry files) with **zero overlap** — none touch `package.json` or `knip.json` (centralised in Task G). Dispatch M, O, A concurrently, each in its own worktree; merge; then Task G wires scripts+gates centrally and runs one gauntlet.

**TAIL (device — serial, one native session, controller-run):** Tasks T1-T5 contend for the single iOS simulator and cannot be subagent'd. They capture goldens, build owl natively, run the injected-bug proof, and write `BAKEOFF.md`. Some outcomes (Maestro needs a release build; owl won't compile on SDK 57) are **legitimate bake-off findings**, recorded, not treated as task failure.

---

## Task M — Maestro tier (flow generator + runner)

**Files:**
- Create: `packages/client-react-native/tests/visual/maestro/generateFlows.ts`
- Create: `packages/client-react-native/tests/visual/maestro/generateFlows.test.ts`
- Create (generated, committed): `packages/client-react-native/tests/visual/maestro/flows/<id>.yaml`
- Create: `packages/client-react-native/tests/visual/maestro/run.ts`
- **Do NOT modify** `package.json` / `knip.json` (Task G does this centrally).

**Interfaces:**
- Consumes: `SCENARIO_IDS` (`../scenarioIds`), `compareToGolden` (`../shared/diff`), `goldenPath` (`../shared/goldens`, tier `"maestro"`).
- Produces: `generateFlows(): Promise<void>` writing `flows/<safeId>.yaml`; a `flowYaml(id: string): string` pure helper (exported for the unit test); a CLI `run.ts` supporting `--update`.

- [ ] **Step 1: Write the failing test for `flowYaml`** (`generateFlows.test.ts`, vitest — Node-safe, no RN import)

```ts
import { describe, expect, it } from "vitest";

import { flowYaml } from "./generateFlows";
import { SCENARIO_IDS } from "../scenarioIds";

describe("flowYaml", () => {
  it("emits a two-step dev-client flow that screenshots the scenario", () => {
    const yaml = flowYaml("blotter/seeded");
    // appId is the dev client / app bundle
    expect(yaml).toContain("appId: io.bettersoftware.rtcmobile");
    // step 1: load the Metro bundle via the dev-client scheme
    expect(yaml).toContain("exp+rtc-mobile://expo-development-client/?url=");
    // step 2: in-app scenario deep link (release scheme)
    expect(yaml).toContain("rtcmobile://__visual/blotter/seeded");
    // waits for the harness ready marker (Maestro CAN query a11y — bake-off point)
    expect(yaml).toContain("visual-ready");
    // screenshots to a flattened (slash-free) name
    expect(yaml).toContain("takeScreenshot: shots/blotter_seeded");
  });

  it("flattens slashes in the screenshot name for every registered id", () => {
    for (const id of SCENARIO_IDS) {
      const yaml = flowYaml(id);
      expect(yaml).toContain(`takeScreenshot: shots/${id.replace(/\//g, "_")}`);
    }
  });
});
```

- [ ] **Step 2: Run it — expect FAIL** (`flowYaml` not defined)

Run: `pnpm --filter @rtc/client-react-native exec vitest run tests/visual/maestro/generateFlows.test.ts`

- [ ] **Step 3: Implement `generateFlows.ts`**

```ts
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { SCENARIO_IDS } from "../scenarioIds";

const HERE = dirname(fileURLToPath(import.meta.url));

/** Dev-client + release schemes — mirror `simctl/capture.ts` (the proven
 * two-step). Maestro's `openLink` drives the same custom-scheme handoff; the
 * dev client must load the Metro bundle before the in-app scenario link.
 * `${METRO_PORT}` is substituted by the runner's env at `maestro test` time. */
const DEV_CLIENT_LINK =
  "exp+rtc-mobile://expo-development-client/?url=http://localhost:${MAESTRO_METRO_PORT}";

export function flowYaml(id: string): string {
  const safe = id.replace(/\//g, "_");
  return [
    "appId: io.bettersoftware.rtcmobile",
    "---",
    "# Step 1: load the Metro bundle via the dev client (two-step deep link).",
    "- openLink:",
    `    link: "${DEV_CLIENT_LINK}"`,
    "- extendedWaitUntil:",
    "    visible:",
    "      id: \"visual-pending|visual-ready\"",
    "    timeout: 20000",
    "# Step 2: in-app navigation to the scenario route (release scheme).",
    "- openLink:",
    `    link: "rtcmobile://__visual/${id}"`,
    "# Dismiss the iOS 'Open in RTC Mobile?' confirmation if it appears.",
    "- runFlow:",
    "    when:",
    "      visible: \"Open\"",
    "    commands:",
    "      - tapOn: \"Open\"",
    "# Maestro CAN query the a11y tree (XCUITest) — unlike simctl/idb. If this",
    "# assert proves flaky on-device, fall back to a fixed wait (bake-off note).",
    "- assertVisible:",
    "    id: \"visual-ready\"",
    `- takeScreenshot: shots/${safe}`,
    "",
  ].join("\n");
}

export async function generateFlows(): Promise<void> {
  for (const id of SCENARIO_IDS) {
    const p = join(HERE, "flows", `${id.replace(/\//g, "_")}.yaml`);
    await mkdir(dirname(p), { recursive: true });
    await writeFile(p, flowYaml(id));
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  void generateFlows();
}
```

- [ ] **Step 4: Run the test — expect PASS**

Run: `pnpm --filter @rtc/client-react-native exec vitest run tests/visual/maestro/generateFlows.test.ts`

- [ ] **Step 5: Generate the flows and commit them**

Run: `pnpm --filter @rtc/client-react-native exec tsx tests/visual/maestro/generateFlows.ts`
Expected: `flows/blotter_seeded.yaml`, `flows/shell_connection-banner.yaml` written.

- [ ] **Step 6: Implement `run.ts`** (invokes `maestro test`, diffs shots via the shared core)

```ts
import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { argv, cwd, env, exit } from "node:process";
import { promisify } from "node:util";

import { SCENARIO_IDS } from "../scenarioIds";
import { compareToGolden } from "../shared/diff";
import { goldenPath } from "../shared/goldens";

const exec = promisify(execFile);

/**
 * Tier 2 CLI runner: runs the generated Maestro flows (which screenshot each
 * scenario), then diffs each shot against its committed `maestro` golden using
 * the shared `pixelmatch` core. Mac-local only, never CI.
 *
 *   pnpm --filter @rtc/client-react-native test:rn:visual:maestro
 *   pnpm --filter @rtc/client-react-native test:rn:visual:maestro:update
 *
 * Env: `MAESTRO_METRO_PORT` (default `8083`, substituted into the flow's
 * dev-client link), `RTC_VISUAL_MAESTRO_SHOTS` (Maestro's screenshot output
 * dir, default `<cwd>/.maestro-shots`).
 */
const FLOWS_DIR = "tests/visual/maestro/flows";
const SHOTS = env.RTC_VISUAL_MAESTRO_SHOTS ?? join(cwd(), ".maestro-shots");

async function main(): Promise<void> {
  const update = argv.includes("--update");
  await exec("maestro", ["test", FLOWS_DIR, "--format", "junit"], {
    env: {
      ...env,
      MAESTRO_CLI_NO_ANALYTICS: "1",
      MAESTRO_METRO_PORT: env.MAESTRO_METRO_PORT ?? "8083",
    },
  });

  let failures = 0;

  for (const id of SCENARIO_IDS) {
    const shot = join(SHOTS, `${id.replace(/\//g, "_")}.png`);
    const png = await readFile(shot);
    const gp = goldenPath("maestro", id);

    if (update) {
      await mkdir(dirname(gp), { recursive: true });
      await writeFile(gp, png);
      console.log(`updated  ${id}`);
      continue;
    }

    const result = await compareToGolden(png, gp);
    if (result.pass) {
      console.log(`pass     ${id}  (${(result.ratio * 100).toFixed(2)}%)`);
    } else {
      failures += 1;
      console.error(`FAIL     ${id}  (${(result.ratio * 100).toFixed(2)}%)`);
    }
  }

  if (failures > 0) {
    console.error(`${failures} scenario(s) failed`);
    exit(1);
  }
  exit(0);
}

main().catch((e: unknown): void => {
  console.error("maestro visual run failed:", e);
  exit(1);
});
```

- [ ] **Step 7: Typecheck + covering test + commit** (no device run here — that's Task T1)

```bash
pnpm --filter @rtc/client-react-native exec vitest run tests/visual/maestro/generateFlows.test.ts
pnpm --filter @rtc/client-react-native typecheck
git add packages/client-react-native/tests/visual/maestro/
git commit -m "feat(rn-visual): Maestro tier — flow generator + runner (Tier 2, code only)"
```

---

## Task O — react-native-owl tier (config + test)

**Files:**
- Create: `packages/client-react-native/tests/visual/owl/owl.config.json`
- Create: `packages/client-react-native/tests/visual/owl/visual.owl.test.ts`
- **Do NOT modify** `package.json` / `knip.json` (Task G). **Do NOT** run `pnpm add react-native-owl` here — Task G adds the dep centrally to avoid a lockfile collision with the parallel Task M/A branches. Reference the import; it will resolve after Task G installs it.

**Interfaces:**
- Consumes: `SCENARIO_IDS`, owl's `takeScreenshot` + `toMatchBaseline` jest matcher.
- Produces: an owl jest test data-driven over `SCENARIO_IDS`; `owl.config.json` pinned to iPhone 15.

- [ ] **Step 1: Write `owl.config.json`**

```json
{
  "ios": {
    "workspace": "ios/RTCMobile.xcworkspace",
    "scheme": "RTCMobile",
    "configuration": "Debug",
    "device": "iPhone 15",
    "buildCommand": "EXPO_PUBLIC_VISUAL_HARNESS=1 xcodebuild"
  },
  "report": true
}
```

> The exact `workspace`/`scheme` come from Expo prebuild output (`ios/*.xcworkspace`). If prebuild names them differently, Task T2 corrects this file on-device and records it. `buildCommand` carries the harness flag into the native build so `__visual/*` is live.

- [ ] **Step 2: Write `visual.owl.test.ts`** (owl owns capture+diff; it navigates the same harness routes via the two-step)

```ts
import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { takeScreenshot } from "react-native-owl";

import { SCENARIO_IDS } from "../scenarioIds";

const exec = promisify(execFile);

const APP_SCHEME = "rtcmobile";
const SETTLE_MS = 2500;

/**
 * Tier 3 (react-native-owl): the batteries-included contrast — owl owns
 * capture + diff + baseline via its own jest matcher, so it does NOT use the
 * shared `pixelmatch` core. The only shared piece is `SCENARIO_IDS`.
 *
 * owl drives the built (native) app; we deep-link each scenario with
 * `simctl openurl` (owl runs against the already-launched app on the booted
 * sim), let it settle, then snapshot. Requires the harness native build
 * (`EXPO_PUBLIC_VISUAL_HARNESS=1`) — see `owl.config.json`.
 */
async function openScenario(id: string): Promise<void> {
  await exec("xcrun", ["simctl", "openurl", "booted", `${APP_SCHEME}://__visual/${id}`]);
  await new Promise((r) => setTimeout(r, SETTLE_MS));
}

describe("rn-visual (owl)", () => {
  for (const id of SCENARIO_IDS) {
    // biome-ignore lint/suspicious/noSkippedTests: owl requires a native build (Task T2, native session)
    it(`matches ${id}`, async () => {
      await openScenario(id);
      const screen = await takeScreenshot(id.replace(/\//g, "_"));
      expect(screen).toMatchBaseline({ threshold: 0.06 });
    });
  }
});
```

> owl screenshot names can't contain `/` — the `_`-flattened id keeps baselines addressable. If owl won't build against Expo SDK 57 / RN 0.86, Task T2 switches Tier 3 to the Detox + `jest-image-snapshot` fallback (base spec §11) and records that as the decisive owl bake-off finding.

- [ ] **Step 3: Typecheck-tolerant commit** (owl dep not yet installed → typecheck of this file is deferred to Task G; commit the source now)

```bash
git add packages/client-react-native/tests/visual/owl/
git commit -m "feat(rn-visual): react-native-owl tier — config + data-driven test (Tier 3, code only)"
```

---

## Task A — Appearance scenario (Phase 2 Task 9 code portion)

**Files:**
- Modify: `packages/client-react-native/tests/visual/scenarioIds.ts` (add `"shell/appearance"`)
- Modify: `packages/client-react-native/tests/visual/scenarios.tsx` (register `shell/appearance`)
- Modify: `packages/client-react-native/tests/visual/scenarios.test.tsx` (parity assertion picks up the new id)

**Interfaces:**
- Consumes: `VisualScenarioHost`, the rebuilt Appearance-sheet component (Phase 2 Task 7). **The implementer must find the live component** — search `packages/client-react-native/src/ui` for the Appearance sheet rebuilt in Phase 2 (likely `src/ui/appearance/*` or a settings screen; confirm the export name and required props by reading it, exactly as `scenarios.tsx` does for `Blotter`/`ConnectionBanner`).
- Produces: a deterministic `shell/appearance` scenario (pinned skin/mode, reduced-motion forced so the ambient aurora is frozen).

- [ ] **Step 1: Add the id to `scenarioIds.ts`**

Append `"shell/appearance"` to `SCENARIO_IDS` (with a one-line comment: pinned Appearance sheet, ambient frozen via forceReduceMotion).

- [ ] **Step 2: Register the scenario in `scenarios.tsx`**

Add an entry mirroring the existing shape. Example (adjust the component import/props to the live Appearance sheet):

```tsx
{
  id: "shell/appearance",
  skin: "holo3d",
  mode: "dark",
  build: (): ReactNode => {
    return (
      <VisualScenarioHost skin="holo3d" mode="dark">
        <AppearanceSheet />
      </VisualScenarioHost>
    );
  },
},
```

> `VisualScenarioHost` already forces reduce-motion, which freezes the Phase 2 Skia ambient (its `withRepeat` drift is `cancelAnimation`'d when disabled) — so the shot is deterministic. Confirm the Appearance sheet renders on sim ports without a live-ticking source; if it reads persisted prefs, the host's in-memory preferences seed (pinned skin/mode) governs.

- [ ] **Step 3: Confirm the parity test still passes** (`scenarios.test.tsx` asserts `SCENARIO_IDS` ↔ `SCENARIOS` id parity + uniqueness)

Run: `pnpm --filter @rtc/client-react-native exec jest tests/visual/scenarios.test.tsx`
Expected: PASS with 3 ids. If the test hard-codes the id list, update it to include `shell/appearance`.

- [ ] **Step 4: Typecheck + covering test + commit**

```bash
pnpm --filter @rtc/client-react-native typecheck
git add packages/client-react-native/tests/visual/scenarioIds.ts packages/client-react-native/tests/visual/scenarios.tsx packages/client-react-native/tests/visual/scenarios.test.tsx
git commit -m "feat(rn-visual): register shell/appearance scenario (Phase 2 Task 9, code)"
```

---

## Task G — Central gate wiring + one full gauntlet (after M/O/A merge)

**Files:**
- Modify: `packages/client-react-native/package.json` (scripts), `knip.json` (RN block), any tsconfig/eslint include for `tests/visual/maestro|owl/**`, root `biome.json` scope if needed.

- [ ] **Step 1: Install owl as a dev dep** (single lockfile mutation, done centrally)

```bash
pnpm --filter @rtc/client-react-native add -D react-native-owl
pnpm outdated -r react-native-owl   # accept latest within the 24h cooldown
```

- [ ] **Step 2: Add all new scripts to `packages/client-react-native/package.json`**

```json
"test:rn:visual:maestro": "tsx tests/visual/maestro/run.ts",
"test:rn:visual:maestro:update": "tsx tests/visual/maestro/run.ts --update",
"test:rn:visual:owl": "owl build --platform ios && owl test --platform ios",
"test:rn:visual:owl:update": "owl test --platform ios --update"
```

- [ ] **Step 3: Wire `knip.json` (RN block)** — add `react-native-owl` to deps handling; add `tests/visual/maestro/generateFlows.ts`, `tests/visual/maestro/run.ts`, `tests/visual/owl/visual.owl.test.ts` to the RN `entry`/`ignore` patterns (mirror the existing `tests/visual/driver.ts` entry) so the runners aren't flagged dead. Ensure `tests/visual/maestro/**` and `tests/visual/owl/**` fall under the RN tsconfig + eslint includes (verify, don't assume).

- [ ] **Step 4: Run the full local gauntlet at repo root**

```bash
pnpm biome ci .
pnpm eslint .
pnpm eslint . --config eslint.config.typed.mjs
pnpm --filter @rtc/client-react-native typecheck
pnpm --filter @rtc/client-react-native test
pnpm knip
```

Expected: all clean. Fix the recurring RN traps (`func-style`, `useExplicitType`, `no-floating-promises`, `newspaper-order`, `padding-line-between-statements`, inline object return types). **Biome-clean ≠ CI-clean** — run BOTH eslint configs.

- [ ] **Step 5: Commit**

```bash
git add packages/client-react-native/package.json knip.json pnpm-lock.yaml
git commit -m "chore(rn-visual): wire Maestro + owl scripts/deps into repo gates (non-CI)"
```

---

## Native-session TAIL (serial — controller-run on the pinned simulator)

> These tasks cannot be subagent'd — they drive the one iOS simulator. Run them in order in a single native session. Reuse the proven recipe: prebuilt dev client from DerivedData (or fresh `expo run:ios` if native deps changed), Metro from **this worktree** with `EXPO_PUBLIC_VISUAL_HARNESS=1`, `idb` for confirmation-dialog taps. **Restore `tsconfig.json` + `expo-env.d.ts` after any `expo prebuild`/`run:ios` (they get reformatted/deleted).**

### Task T1 — Maestro goldens
- [ ] Install Maestro (`curl -fsSL "https://get.maestro.mobile.dev" | bash`). Regenerate flows if `SCENARIO_IDS` changed (`tsx generateFlows.ts`).
- [ ] Boot the pin + dev client + worktree Metro (`EXPO_PUBLIC_VISUAL_HARNESS=1`). Run `test:rn:visual:maestro:update`, eyeball each shot, then `test:rn:visual:maestro` (expect all pass).
- [ ] **If Maestro's `openLink` two-step / `assertVisible` fails against the dev client** → record the exact failure as a bake-off finding; try a release/standalone build (`expo run:ios --configuration Release`) with the `rtcmobile` scheme; if still blocked, mark Maestro goldens deferred and note it. Commit whatever goldens succeed.

### Task T2 — owl baselines
- [ ] `npx expo prebuild -p ios` if `ios/*.xcworkspace` absent; correct `owl.config.json` workspace/scheme to the real names.
- [ ] `test:rn:visual:owl:update` (owl build + baseline). If owl **won't build** on SDK 57 / RN 0.86 → record the build error as the decisive owl bake-off finding; either apply the Detox + `jest-image-snapshot` fallback (base spec §11) or mark Tier 3 "not viable on this stack" and un-skip nothing. Commit baselines if produced.

### Task T3 — Appearance golden (simctl tier)
- [ ] With Metro + dev client up, `RTC_VISUAL_METRO_PORT=<port> pnpm --filter @rtc/client-react-native test:rn:visual:simctl:update` to (re)capture — includes the new `shell/appearance`. Eyeball `shell/appearance.png` (correct skin, ambient frozen, no clipped 3D shadow), then `test:rn:visual:simctl` (expect pass). Commit the new golden.

### Task T4 — Injected-paint-bug proof
- [ ] On a scratch commit, reintroduce the documented regression (`overflow: "hidden"` clipping a shadow on a 3D surface card — the PR #147 finding). Do NOT regenerate goldens. Run each viable tier; record which go red and the exact ratios. `git checkout` the bug away.

### Task T5 — `BAKEOFF.md` + README
- [ ] Write `tests/visual/BAKEOFF.md`: table scoring simctl vs Maestro vs owl on setup cost · config/LOC · per-run wall-clock (measured) · flake (3× on identical input, ratio spread) · **caught the injected bug? (ratio)** · Android-portability · maintenance · DX — plus a recommendation paragraph reflecting the real on-device findings (incl. any "needs release build" / "won't compile" outcomes).
- [ ] Extend `tests/visual/README.md` with Maestro (install one-liner, two-step note) + owl (native build, baseline dir) sections and the tier map. Commit `BAKEOFF.md` + README.

---

## Self-Review (against the base spec + shipped reality)

- **Spec coverage:** Tier 2 Maestro (Task M + T1); Tier 3 owl (Task O + T2); Appearance baseline / Phase 2 Task 9 (Task A + T3); bake-off + injected-bug proof (Task T4 + T5); gate wiring (Task G); README extension (Task T5). ✔
- **Reconciliation:** every base-plan assumption that shipped differently is tabled above and the tasks follow shipped reality (`SCENARIO_IDS`, two-step deep link, real bundle id, existing README/wiring). ✔
- **Parallel-safety:** Tasks M/O/A touch disjoint files and none touch `package.json`/`knip.json`/`pnpm-lock.yaml` (all centralised in Task G) → no merge collisions. ✔
- **Placeholder scan:** device-orchestration unknowns (Maestro `assertVisible` viability, owl build on SDK 57, Appearance component name) are flagged as implementer/controller-confirms-against-live, each naming the exact artifact — not silent TODOs. ✔
- **Type consistency:** `compareToGolden`/`goldenPath("maestro", id)`/`SCENARIO_IDS` used exactly as shipped; owl uses its own matcher (no shared core), as specified. ✔
- **Honest risk:** Maestro-needs-release-build and owl-won't-compile are pre-declared as valid bake-off *outcomes*, so the TAIL cannot "fail" by discovering them. ✔
