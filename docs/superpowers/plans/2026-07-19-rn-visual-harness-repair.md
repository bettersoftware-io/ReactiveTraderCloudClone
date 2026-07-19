# RN Visual-Harness Repair + Path A Completion — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the RN `__visual` harness route render `VisualScenarioHost` in isolation (outside the authed app shell), harden it against production exposure, then re-capture valid base goldens on `ios-iphone17-26` and complete the Maestro / owl / appearance / injected-bug / BAKEOFF tiers.

**Architecture:** expo-router route-group restructure — the app shell (`AppRoot`/`AuthGate`/`Chrome`/`Tabs`) moves from the root layout into an `(app)` group; the root becomes a minimal `<Slot/>`; `__visual` sits at the root, outside the group. Harness activation is gated on `__DEV__ && EXPO_PUBLIC_VISUAL_HARNESS==="1"`.

**Tech Stack:** Expo SDK 57 / RN 0.86, expo-router, jest-expo (unit), `xcrun simctl` + `idb` + Maestro + react-native-owl (device capture), `pixelmatch`/`pngjs`.

**Design spec:** [../specs/2026-07-19-rn-visual-harness-repair-design.md](../specs/2026-07-19-rn-visual-harness-repair-design.md). Prior tier plan (TAIL detail): [2026-07-17-rn-visual-tiers-followup.md](2026-07-17-rn-visual-tiers-followup.md).

## Global Constraints

- **Never a CI gate.** Never add `test:rn:visual:*` to `.github/workflows/ci.yml` (iOS pixels need macOS).
- **Harness inert unless `__DEV__ && process.env.EXPO_PUBLIC_VISUAL_HARNESS === "1"`.** Both conditions required.
- **Device pin `ios-iphone17-26`** (iPhone 17 / iOS 26.x; Xcode 26 dropped iPhone 15). Booted UDID this machine: `D9160A63-FB61-46FC-8693-666F3AC11BAB`. Confirm-dialog "Open" tap: **(274, 474)** points.
- **Capture runs against a FRESH-install worktree's Metro.** The primary checkout's `node_modules` is corrupt (bundles the worklets red box though `pnpm install` says "up to date"); a fresh worktree install bundles clean. Never capture against primary until it is clean-reinstalled.
- Reduce-motion frozen, sim ports only, deterministic scenarios. `#/` alias not `@/`. Braces on all control statements. Biome + both ESLint configs + stylelint + knip + typecheck green for every moved/new file.
- Bundle/scheme identity unchanged: `io.bettersoftware.rtcmobile`, `rtcmobile`, `exp+rtc-mobile`, slug `rtc-mobile`.
- **Re-pin already applied in this worktree (uncommitted):** `DEVICE_PIN="ios-iphone17-26"`, `git mv` of the `__screenshots__` dir, `owl.config.json` device `iPhone 17`, `capture.ts` tap defaults `274/474` + comments, `goldens.test.ts`, README device refs. Task 3 commits these.

---

## Task 1: Harden the harness gate with `__DEV__`

**Files:**
- Modify: `packages/client-react-native/src/app/visualHarnessGate.ts`
- Test: `packages/client-react-native/src/app/visualHarnessGate.test.ts`

**Interfaces:**
- Produces: `visualHarnessEnabled(): boolean` — now `__DEV__ && env flag`.

- [ ] **Step 1: Add the failing test** — append to `visualHarnessGate.test.ts`:

```ts
it("stays inert in a release build even when the flag is set", () => {
  const prevDev = (globalThis as { __DEV__?: boolean }).__DEV__;
  const prevFlag = process.env.EXPO_PUBLIC_VISUAL_HARNESS;
  try {
    (globalThis as { __DEV__?: boolean }).__DEV__ = false;
    process.env.EXPO_PUBLIC_VISUAL_HARNESS = "1";
    expect(visualHarnessEnabled()).toBe(false);
  } finally {
    (globalThis as { __DEV__?: boolean }).__DEV__ = prevDev;
    process.env.EXPO_PUBLIC_VISUAL_HARNESS = prevFlag;
  }
});
```

- [ ] **Step 2: Run it — expect FAIL** (gate ignores `__DEV__` today)

Run: `pnpm --filter @rtc/client-react-native exec jest src/app/visualHarnessGate.test.ts`
Expected: FAIL (returns `true`).

- [ ] **Step 3: Implement the guard** in `visualHarnessGate.ts`:

```ts
export function visualHarnessEnabled(): boolean {
  return __DEV__ && process.env.EXPO_PUBLIC_VISUAL_HARNESS === "1";
}
```
Update the doc-comment: note `__DEV__` is hard-`false` in release builds, so a mis-set flag cannot activate the harness in production (defense-in-depth after the route leaves AuthGate).

- [ ] **Step 4: Run tests — expect PASS**

Run: `pnpm --filter @rtc/client-react-native exec jest src/app/visualHarnessGate.test.ts`
Expected: PASS (new case + existing cases).

- [ ] **Step 5: Commit**

```bash
git add packages/client-react-native/src/app/visualHarnessGate.ts packages/client-react-native/src/app/visualHarnessGate.test.ts
git commit -m "fix(rn-visual): gate harness on __DEV__ as well as the env flag (defense-in-depth)"
```

---

## Task 2: Route-group restructure — isolate `__visual` from the app shell

**Files:**
- Modify: `packages/client-react-native/app/_layout.tsx` → minimal root (`GestureHandlerRootView` + `<Slot/>`)
- Create: `packages/client-react-native/app/(app)/_layout.tsx` → the shell (moved verbatim from the old root: fonts gate + `AsyncStorageSessionStore.hydrate` + `AppRoot` + `ThemeProvider` + `AuthGate` + `Chrome` + `BootGate` + `MotionProbe` + `<Tabs>` incl. the `__visual/[...id]` `href:null` screen is **removed** here — see below)
- Move: `app/index.tsx`, `app/blotter.tsx`, `app/analytics.tsx`, `app/credit.tsx`, `app/equities.tsx` → `app/(app)/`
- Move + adapt: `app/_layout.test.tsx` → `app/(app)/_layout.test.tsx` (shell test) and add a minimal-root test `app/_layout.test.tsx`
- Unchanged: `app/__visual/[...id].tsx` (stays at root; the `<Tabs.Screen name="__visual/[...id]" href:null />` entry is dropped from the moved `<Tabs>` because the route is no longer a tab child).

**Interfaces:**
- Consumes: everything the current root `_layout.tsx` imports (move the imports with it).
- Produces: `/` , `/blotter`, `/analytics`, `/credit`, `/equities` resolve through `(app)/_layout` (shell); `/__visual/<id>` resolves through the minimal root only.

- [ ] **Step 1: Create `app/(app)/_layout.tsx`** — move the *entire* current `app/_layout.tsx` body here (the `RootLayout` default export + `Chrome` + `tabIcon` + styles), renaming the default export `AppGroupLayout`. **Remove** the `<Tabs.Screen name="__visual/[...id]" options={{ href: null }} />` line — `__visual` is no longer inside this `<Tabs>`. Keep all five real `<Tabs.Screen>`s, `AuthGate`, `Chrome`, `BootGate`, the fonts+session gates, and `MotionProbe`.

- [ ] **Step 2: Replace `app/_layout.tsx` with the minimal root:**

```tsx
import { Slot } from "expo-router";
import type { JSX } from "react";
import { StyleSheet } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";

/** Minimal expo-router root. The authed app shell (AppRoot/AuthGate/Chrome/Tabs)
 * lives in the `(app)` route group; the dev-only `__visual/[...id]` harness route
 * is a sibling here, so it renders OUTSIDE AuthGate/Chrome in isolation. Only the
 * gesture root is shared (both branches may host gestures). */
export default function RootLayout(): JSX.Element {
  return (
    <GestureHandlerRootView style={styles.screen}>
      <Slot />
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({ screen: { flex: 1 } });
```

- [ ] **Step 3: Move the five tab routes** into `app/(app)/`:

```bash
cd packages/client-react-native
git mv app/index.tsx app/analytics.tsx app/blotter.tsx app/credit.tsx app/equities.tsx app/'(app)'/
```
(Create `app/(app)/` first if `git mv` needs it: the Step-1 file creation makes the dir.)

- [ ] **Step 4: Migrate the layout test.** Move the shell assertions to `app/(app)/_layout.test.tsx` (import the shell from `(app)/_layout`), and add a minimal `app/_layout.test.tsx` asserting the root renders a `Slot` inside a `GestureHandlerRootView` (and does NOT render `AuthGate`/`Chrome`). Mirror the existing test's render/util patterns.

- [ ] **Step 5: Typecheck + jest**

Run: `pnpm --filter @rtc/client-react-native typecheck && pnpm --filter @rtc/client-react-native exec jest app/`
Expected: PASS. Fix any expo-router route-typing (`app.config.ts` router root stays `./app`; groups need no config).

- [ ] **Step 6: Commit**

```bash
git add packages/client-react-native/app
git commit -m "refactor(rn): move app shell into (app) route group; __visual renders isolated at root"
```

---

## Task 3: Central gate wiring + commit the re-pin + full gauntlet

**Files:**
- Modify: `knip.json` (RN entries for moved route files if enumerated), any `tsconfig`/`eslint` include globbing `app/**` (verify `app/(app)/**` is covered — parenthesised dirs can trip globs).
- Commit: the already-applied re-pin edits (`goldens.ts`, `goldens.test.ts`, `owl.config.json`, `capture.ts`, README, the `git mv` screenshot dir rename).

- [ ] **Step 1: Verify globs still cover the moved files.** Run knip + both eslint configs; confirm `app/(app)/*.tsx` are linted/typed and not flagged unused. Fix include patterns if the `(app)` parens break a glob.

- [ ] **Step 2: Full local gauntlet** (repo root):

```bash
pnpm biome ci .
pnpm eslint .
pnpm eslint . --config eslint.config.typed.mjs
pnpm --filter @rtc/client-react-native typecheck
pnpm --filter @rtc/client-react-native test
pnpm knip
```
Expected: all clean. Fix RN lint traps (func-style, useExplicitType, no-floating-promises, newspaper-order, padding-line-between-statements).

- [ ] **Step 3: Commit re-pin + wiring**

```bash
git add -A
git commit -m "chore(rn-visual): re-pin goldens to ios-iphone17-26 (iPhone 17/iOS 26); tap (274,474); gate wiring"
```

---

## Device TAIL (serial — controller-run on the pinned simulator; NOT subagent-able)

> One iOS sim, one Metro. Reuse the proven recipe. **Metro must run from THIS fresh-install worktree** with `EXPO_PUBLIC_VISUAL_HARNESS=1` (dev build → `__DEV__` true). The dev-client app binary already installed on the sim is fine; only its Metro JS source must be this worktree. Restore `tsconfig.json` + `expo-env.d.ts` after any `expo run:ios`/`expo start` (they get rewritten).

### Task 4 (T1): On-device proof — real app intact + harness renders isolated

- [ ] Boot the pin; start Metro: `cd packages/client-react-native && EXPO_PUBLIC_VISUAL_HARNESS=1 ./node_modules/.bin/expo start --dev-client --port 8083`.
- [ ] **Real app:** deep-link the dev client to `exp+rtc-mobile://expo-development-client/?url=http://localhost:8083`; confirm it boots → LoginScreen → sign in `demo`/`mcdc2026` → five tabs render, boot splash plays. Screenshot as evidence.
- [ ] **Harness isolation:** deep-link `rtcmobile://__visual/blotter/seeded`, dismiss the "Open" dialog (`idb ui tap <udid> 274 474`), screenshot. Expected: the seeded blotter (5 trades), **no login, no toolbar/tab bar**. Repeat for `shell/connection-banner` and `shell/appearance`. If any shows `visual-not-found`, root-cause scenario resolution before continuing.

### Task 5 (T2): simctl golden re-capture on `ios-iphone17-26`

- [ ] With Metro + app up: `RTC_VISUAL_UDID=D9160A63-... RTC_VISUAL_METRO_PORT=8083 RTC_VISUAL_IDB=$(command -v idb) pnpm --filter @rtc/client-react-native test:rn:visual:simctl:update`.
- [ ] Eyeball every PNG under `__screenshots__/ios-iphone17-26/simctl/` (correct isolated scenario, no chrome/login). Then verify: `… test:rn:visual:simctl` → must report `pass` for all three (self-reproduces).
- [ ] Commit the new goldens.

### Task 6 (T3): Maestro tier

- [ ] `JAVA_HOME=/opt/homebrew/opt/openjdk@17 ~/.maestro/bin/maestro --version` sanity. Regenerate flows if `SCENARIO_IDS` changed (`tsx generateFlows.ts`).
- [ ] `JAVA_HOME=… MAESTRO_METRO_PORT=8083 pnpm --filter @rtc/client-react-native test:rn:visual:maestro:update`; eyeball; then `:maestro` verify (all pass). If the two-step / `visual-ready` a11y assert fails against the dev client, record the exact failure as a bake-off finding (do NOT switch to a Release build without a non-`__DEV__` harness flag — see spec §Security hardening coupling). Commit whatever goldens succeed.

### Task 7 (T4): owl tier

- [ ] Correct `owl.config.json` workspace/scheme to the prebuild output if needed; `test:rn:visual:owl:update` (Debug build → `__DEV__` true). If owl won't build on SDK 57 / RN 0.86, record the exact build error as the decisive owl finding (Detox+`jest-image-snapshot` fallback or "not viable"). Commit baselines if produced.

### Task 8 (T5): Injected-paint-bug proof

- [ ] On a scratch commit, reintroduce the `overflow:"hidden"` shadow-clip on a 3D surface card (PR #147 finding). Do NOT regenerate goldens. Run each viable tier; record which go red + exact ratios. `git checkout` the bug away.

### Task 9 (T6): BAKEOFF.md + README + toolchain note

- [ ] Write `tests/visual/BAKEOFF.md`: score simctl vs Maestro vs owl (setup cost · LOC · measured wall-clock · flake over 3 identical runs · caught-the-injected-bug + ratio · Android portability · DX) + a recommendation reflecting real findings.
- [ ] Extend `tests/visual/README.md`: Maestro (install one-liner incl. `JAVA_HOME`) + owl sections + the tier map, and finish the device/pin refs.
- [ ] Add the **toolchain troubleshooting note** to `tests/visual/README.md` (and optionally CLAUDE.md, parallel to the Vite "blank screen" note): "RN red box `[Worklets] Babel plugin exception: reading 'length'` = corrupt local `node_modules` (pnpm may say 'up to date'); fix = clean reinstall (`rm -rf node_modules && pnpm install`), NOT a worklets/reanimated bump; diagnose headlessly via `expo export` + a dev-bundle curl to `/.expo/.virtual-metro-entry.bundle`."
- [ ] Update `docs/STATUS.md` (remove the now-obsolete "RN visual harness — Maestro + owl tiers + bake-off" gated item once complete; the mobile-v1 rehaul entry stays). Bump its Last-updated; `pnpm check:doc-links`.
- [ ] Commit BAKEOFF + README + STATUS.

---

## Self-Review

- **Spec coverage:** harness isolation (Task 2), security `__DEV__` guard + test (Task 1), scenario-resolution verify (Task 4), re-pin commit (Task 3), simctl re-capture (Task 5), Maestro (6), owl (7), injected-bug (8), BAKEOFF+README+toolchain-note+STATUS (9). ✔
- **Placeholder scan:** device tasks name exact commands/UDID/port/tap; "confirm empirically" items (Slot-vs-Stack, scenario resolution, owl build, Maestro release-build) each carry a decision rule. No bare TODOs. ✔
- **Type/name consistency:** `visualHarnessEnabled`, `DEVICE_PIN="ios-iphone17-26"`, tap `274/474`, `EXPO_PUBLIC_VISUAL_HARNESS`, `(app)` group — used consistently. ✔
- **Ordering:** code tasks (1–3) gate the device TAIL (4–9); Task 4 is the go/no-go proof the restructure works before any capture. ✔
- **Parallel-safety:** Tasks 1 and 2 touch disjoint files (gate vs routes) and could run concurrently; Task 3 is the central barrier (gauntlet + re-pin commit) before the serial device TAIL. ✔
