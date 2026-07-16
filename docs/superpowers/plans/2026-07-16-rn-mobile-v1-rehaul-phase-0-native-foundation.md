# RN Mobile-v1 Rehaul — Phase 0: Native Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Install and wire the native motion/render stack (Reanimated, Skia, gesture-handler, expo-blur/haptics/sensors) into `@rtc/client-react-native`, keep the entire existing test suite green via mocks, and prove the stack runs on the iOS simulator — with zero visual change to the shipped app.

**Architecture:** This is the enabling phase for the whole rehaul (spec: `docs/superpowers/specs/2026-07-16-rn-mobile-v1-rehaul-design.md`). It only adds dependencies, build config, jest mocks, a root `GestureHandlerRootView` wrap, and a flag-gated diagnostic probe. No product UI changes. The probe is the on-device proof that Reanimated worklets and Skia canvas both render natively; it never shows in a normal run.

**Tech Stack:** Expo SDK 57 / RN 0.86, `react-native-reanimated`, `@shopify/react-native-skia`, `react-native-gesture-handler`, `expo-blur`, `expo-haptics`, `expo-sensors`; jest-expo + @testing-library/react-native (component tests, `*.test.tsx`); vitest (pure-fn tests, `*.test.ts`).

## Global Constraints

- **Package:** all work is in `packages/client-react-native`. Do not touch `@rtc/domain`, `@rtc/client-core`, `@rtc/react-bindings`, or the wire protocol.
- **Dumb-UI doctrine:** no `rxjs` / `localStorage` / `fetch` in `src/ui`; data only via the ViewModel seam.
- **No visual change this phase:** the shipped app must look and behave exactly as before; the only new render path is behind `EXPO_PUBLIC_MOTION_PROBE === "1"`.
- **Native deps are SDK-pinned:** install with `npx expo install` (not `pnpm add`) so versions match Expo SDK 57. Then `pnpm install` at the repo root to relink the pnpm workspace.
- **Suite stays green:** every existing `*.test.tsx` (jest) and `*.test.ts` (vitest) must keep passing; new native modules are mocked.
- **iOS-first, Android-safe:** verify on the iOS simulator; no iOS-only API without an Android fallback, but Android is not a gate.
- **Native deps require a dev-client rebuild:** the `ios/` folder is gitignored and rebuilt per-checkout via `pnpm dev:ios`.
- **All package gates must pass before merge:** `pnpm --filter @rtc/client-react-native typecheck`, `pnpm --filter @rtc/client-react-native test`, root `pnpm biome ci`, ESLint, and `knip`.

---

## File Structure

- `packages/client-react-native/package.json` — new native dependencies.
- `packages/client-react-native/babel.config.js` — add the Reanimated/Worklets babel plugin (must be **last**).
- `packages/client-react-native/jest.setup.ts` — official reanimated + gesture-handler jest setup, plus manual factory mocks for Skia / expo-blur / expo-haptics / expo-sensors.
- `packages/client-react-native/app/_layout.tsx` — wrap the app root in `GestureHandlerRootView`; render `MotionProbe` behind the env flag.
- `packages/client-react-native/src/ui/_probe/MotionProbe.tsx` — flag-gated diagnostic: a Reanimated looping fade + a Skia circle. Durable (re-runnable), tiny.
- `packages/client-react-native/src/ui/_probe/MotionProbe.test.tsx` — covering test proving the mocked stack renders.
- `packages/client-react-native/README.md` — note the new native stack + the probe flag.

---

## Task 1: Install the native motion/render dependencies

**Files:**
- Modify: `packages/client-react-native/package.json` (dependencies — written by `expo install`)

**Interfaces:**
- Consumes: nothing.
- Produces: the six packages resolvable at their SDK-57-pinned versions; if Reanimated is v4+, `react-native-worklets` is also installed (later tasks branch the babel plugin on this).

- [ ] **Step 1: Install the SDK-pinned native deps**

Run (from the package directory):

```bash
cd packages/client-react-native
npx expo install react-native-reanimated react-native-gesture-handler @shopify/react-native-skia expo-blur expo-haptics expo-sensors
```

Expected: `expo install` resolves each to its SDK-57-compatible version and writes them into `package.json` `dependencies`.

- [ ] **Step 2: Determine the Reanimated major and install worklets if needed**

Run:

```bash
node -e "console.log(require('react-native-reanimated/package.json').version)"
```

If the major version is **4 or higher**, also run:

```bash
npx expo install react-native-worklets
```

Record the Reanimated major version — Task 2 selects the babel plugin from it. (Reanimated ≥4 → `react-native-worklets/plugin`; Reanimated 3 → `react-native-reanimated/plugin`.)

- [ ] **Step 3: Relink the pnpm workspace and enforce a single version range**

Run (from the repo root):

```bash
pnpm install
pnpm syncpack list-mismatches || true
```

Expected: `pnpm install` completes; `syncpack` reports **no** version mismatches for the newly added packages (they are single-versioned across the workspace). If it reports a mismatch, run `pnpm syncpack fix-mismatches` and re-run `pnpm install`.

- [ ] **Step 4: Verify typecheck still passes**

Run:

```bash
pnpm --filter @rtc/client-react-native typecheck
```

Expected: PASS (no type errors — the new packages ship their own types; nothing imports them yet).

- [ ] **Step 5: Commit**

```bash
git add packages/client-react-native/package.json pnpm-lock.yaml package.json
git commit -m "build(rn): add reanimated/skia/gesture-handler/expo-blur/haptics/sensors"
```

---

## Task 2: Wire the Reanimated babel plugin

**Files:**
- Modify: `packages/client-react-native/babel.config.js`

**Interfaces:**
- Consumes: the Reanimated major from Task 1.
- Produces: a babel config that transforms Reanimated worklets, so native bundling and later worklet code work.

- [ ] **Step 1: Add the worklets/reanimated plugin as the LAST plugin**

The plugin **must be last** in the `plugins` array (Reanimated requirement). Edit `packages/client-react-native/babel.config.js`.

For **Reanimated ≥ 4** (worklets package installed in Task 1):

```js
module.exports = (api) => {
  api.cache(true);
  return {
    presets: ["babel-preset-expo"],
    plugins: [
      [
        "module-resolver",
        {
          alias: {
            "#": "./src",
          },
        },
      ],
      // Reanimated worklets — MUST be the last plugin.
      "react-native-worklets/plugin",
    ],
  };
};
```

For **Reanimated 3** use `"react-native-reanimated/plugin"` as the last plugin instead of `"react-native-worklets/plugin"`. Everything else is identical.

- [ ] **Step 2: Verify the JS bundle builds with the plugin + native imports**

Run (from the package directory) a real iOS bundle export — this exercises the babel plugin and confirms every new native module's JS resolves:

```bash
cd packages/client-react-native
npx expo export --platform ios --output-dir /tmp/rtc-rn-export-smoke
```

Expected: the export completes and writes a bundle to `/tmp/rtc-rn-export-smoke` with no "Reanimated" babel errors and no unresolved-module errors. (This is slow — a few minutes — and is a build smoke only; delete the output afterward: `rm -rf /tmp/rtc-rn-export-smoke`.)

- [ ] **Step 3: Commit**

```bash
git add packages/client-react-native/babel.config.js
git commit -m "build(rn): wire the reanimated worklets babel plugin (last)"
```

---

## Task 3: Keep the jest suite green with mocks

**Files:**
- Modify: `packages/client-react-native/jest.setup.ts`

**Interfaces:**
- Consumes: the installed native packages.
- Produces: a jest environment where every `*.test.tsx` that (later) imports Reanimated/Skia/gesture-handler/expo-blur/haptics/sensors renders without a native runtime. Skia stubs exposed: `Canvas`, `Group`, `Circle`, `Rect`, `Fill`, `Path`, `Line`, `Paint` render as host elements passing through `children`.

- [ ] **Step 1: Add the official + manual mocks to `jest.setup.ts`**

Replace the contents of `packages/client-react-native/jest.setup.ts` with:

```ts
import "@testing-library/react-native";

// Gesture-handler ships an official jest setup (stubs the native gesture module).
import "react-native-gesture-handler/jestSetup";

// Reanimated ships an official mock (stable across v3/v4). It replaces the
// worklet runtime with synchronous JS so animated components render in jsdom.
jest.mock("react-native-reanimated", () =>
  require("react-native-reanimated/mock"),
);

// Skia has no jest-expo mock. Stub the components used across the rehaul as
// pass-through host elements so trees mount; extend this list as later phases
// introduce more Skia primitives.
jest.mock("@shopify/react-native-skia", () => {
  const React = require("react");
  const passthrough =
    (name: string) =>
    (props: { children?: unknown }): unknown =>
      React.createElement(name, props, props.children);
  return {
    Canvas: passthrough("SkiaCanvas"),
    Group: passthrough("SkiaGroup"),
    Circle: passthrough("SkiaCircle"),
    Rect: passthrough("SkiaRect"),
    Fill: passthrough("SkiaFill"),
    Path: passthrough("SkiaPath"),
    Line: passthrough("SkiaLine"),
    Paint: passthrough("SkiaPaint"),
  };
});

jest.mock("expo-blur", () => {
  const React = require("react");
  return {
    BlurView: (props: { children?: unknown }): unknown =>
      React.createElement("BlurView", props, props.children),
  };
});

jest.mock("expo-haptics", () => ({
  impactAsync: jest.fn(async () => undefined),
  notificationAsync: jest.fn(async () => undefined),
  selectionAsync: jest.fn(async () => undefined),
  ImpactFeedbackStyle: { Light: "light", Medium: "medium", Heavy: "heavy" },
  NotificationFeedbackType: {
    Success: "success",
    Warning: "warning",
    Error: "error",
  },
}));

jest.mock("expo-sensors", () => ({
  Gyroscope: {
    addListener: jest.fn(() => ({ remove: jest.fn() })),
    setUpdateInterval: jest.fn(),
    isAvailableAsync: jest.fn(async () => false),
  },
}));
```

- [ ] **Step 2: Run the full existing jest + vitest suite**

Run:

```bash
pnpm --filter @rtc/client-react-native test
```

Expected: PASS — every existing `*.test.tsx` (jest) and `*.test.ts` (vitest) still passes. Nothing imports the new modules yet, so this proves the mocks load cleanly and don't conflict with the jest-expo preset. If jest-expo already mocks one of these and a conflict appears, remove the redundant manual mock and re-run until green.

- [ ] **Step 3: Commit**

```bash
git add packages/client-react-native/jest.setup.ts
git commit -m "test(rn): mock reanimated/skia/gesture-handler/expo native modules"
```

---

## Task 4: Wrap the app root in GestureHandlerRootView

**Files:**
- Modify: `packages/client-react-native/app/_layout.tsx`
- Test: `packages/client-react-native/app/_layout.test.tsx` (create if absent; otherwise extend)

**Interfaces:**
- Consumes: `GestureHandlerRootView` from `react-native-gesture-handler`; the gesture-handler jest mock from Task 3.
- Produces: a root that provides the gesture context every later phase's gestures (dock, lock ring, sheets) require, with `flex: 1` so layout is unchanged.

- [ ] **Step 1: Write the failing test**

Create `packages/client-react-native/app/_layout.test.tsx` (or add this case to the existing file). The test asserts the fonts-loading fallback still renders under the gesture root — a mount smoke that fails if the wrap throws:

```tsx
import { render, screen } from "@testing-library/react-native";
import RootLayout from "./_layout";

test("root layout mounts inside the gesture-handler root", () => {
  render(<RootLayout />);
  // Fonts are not loaded in jsdom, so the gated fallback renders — proving the
  // tree (now wrapped in GestureHandlerRootView) mounts without throwing.
  expect(screen.getByTestId("fonts-loading")).toBeTruthy();
});
```

- [ ] **Step 2: Run the test to confirm current behavior**

Run:

```bash
pnpm --filter @rtc/client-react-native exec jest app/_layout.test.tsx
```

Expected: PASS today (the wrap is not yet added — this pins the mount behavior before the change).

- [ ] **Step 3: Add the GestureHandlerRootView wrap**

In `packages/client-react-native/app/_layout.tsx`, add the import and wrap the outermost returned element of `RootLayout`. The gesture root must be the true outermost node and carry `flex: 1`.

Add to the imports:

```tsx
import { GestureHandlerRootView } from "react-native-gesture-handler";
```

Change the `RootLayout` return so both the fonts-loading fallback and the main tree are wrapped:

```tsx
  if (!fontsLoaded) {
    return (
      <GestureHandlerRootView style={styles.screen}>
        <SafeAreaView style={styles.screen} testID="fonts-loading" />
      </GestureHandlerRootView>
    );
  }

  const playSplash = shouldPlayBootSplash();

  return (
    <GestureHandlerRootView style={styles.screen}>
      <SafeAreaView style={styles.screen}>
        <AppRoot key={simulator ? "sim" : "live"} simulator={simulator}>
          <ThemeProvider>
            <Chrome simulator={simulator} onToggle={setSimulator} />
            {playSplash && !bootDone ? (
              <BootGate
                onFinished={(): void => {
                  setBootDone(true);
                }}
              />
            ) : null}
          </ThemeProvider>
        </AppRoot>
      </SafeAreaView>
    </GestureHandlerRootView>
  );
```

- [ ] **Step 4: Run the test + typecheck to verify the wrap mounts**

Run:

```bash
pnpm --filter @rtc/client-react-native exec jest app/_layout.test.tsx
pnpm --filter @rtc/client-react-native typecheck
```

Expected: both PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/client-react-native/app/_layout.tsx packages/client-react-native/app/_layout.test.tsx
git commit -m "feat(rn): wrap app root in GestureHandlerRootView"
```

---

## Task 5: Add the flag-gated MotionProbe (Reanimated + Skia)

**Files:**
- Create: `packages/client-react-native/src/ui/_probe/MotionProbe.tsx`
- Test: `packages/client-react-native/src/ui/_probe/MotionProbe.test.tsx`
- Modify: `packages/client-react-native/app/_layout.tsx`

**Interfaces:**
- Consumes: Reanimated (`useSharedValue`, `useAnimatedStyle`, `withRepeat`, `withTiming`, `Animated.View`), Skia (`Canvas`, `Circle`, `Fill`); the Task 3 mocks.
- Produces: `MotionProbe` (default export, `(): JSX.Element`) rendering a `testID="motion-probe"` container. Shown in the app only when `process.env.EXPO_PUBLIC_MOTION_PROBE === "1"`.

- [ ] **Step 1: Write the failing test**

Create `packages/client-react-native/src/ui/_probe/MotionProbe.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react-native";
import MotionProbe from "./MotionProbe";

test("MotionProbe renders the reanimated + skia probe surface", () => {
  render(<MotionProbe />);
  expect(screen.getByTestId("motion-probe")).toBeTruthy();
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
pnpm --filter @rtc/client-react-native exec jest src/ui/_probe/MotionProbe.test.tsx
```

Expected: FAIL — `Cannot find module './MotionProbe'`.

- [ ] **Step 3: Implement `MotionProbe`**

Create `packages/client-react-native/src/ui/_probe/MotionProbe.tsx`:

```tsx
import { Canvas, Circle, Fill } from "@shopify/react-native-skia";
import type { JSX } from "react";
import { useEffect } from "react";
import { StyleSheet, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";

/**
 * Flag-gated native-stack diagnostic (Phase 0). Renders a Reanimated looping
 * fade over a Skia-drawn circle. Never shown in a normal run — mounted only
 * when EXPO_PUBLIC_MOTION_PROBE === "1". Its purpose is to prove, on-device,
 * that worklet animations and the Skia canvas both render. Safe to delete once
 * later phases exercise the same stack in real UI.
 */
export default function MotionProbe(): JSX.Element {
  const opacity = useSharedValue(0.3);

  useEffect(() => {
    opacity.value = withRepeat(withTiming(1, { duration: 900 }), -1, true);
  }, [opacity]);

  const fade = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return (
    <View style={styles.wrap} testID="motion-probe" pointerEvents="none">
      <Animated.View style={[styles.badge, fade]}>
        <Canvas style={styles.canvas}>
          <Fill color="transparent" />
          <Circle cx={20} cy={20} r={16} color="#00e5ff" />
        </Canvas>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: "absolute", top: 60, right: 12, zIndex: 999 },
  badge: { width: 40, height: 40 },
  canvas: { width: 40, height: 40 },
});
```

- [ ] **Step 4: Run the test to verify it passes**

Run:

```bash
pnpm --filter @rtc/client-react-native exec jest src/ui/_probe/MotionProbe.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Mount `MotionProbe` behind the env flag in `_layout.tsx`**

In `packages/client-react-native/app/_layout.tsx`, add the import:

```tsx
import MotionProbe from "#/ui/_probe/MotionProbe";
```

Then, inside the main return's `<SafeAreaView>` (after the `AppRoot` block, still inside the gesture root), add the flag-gated mount:

```tsx
        </AppRoot>
        {process.env.EXPO_PUBLIC_MOTION_PROBE === "1" ? <MotionProbe /> : null}
      </SafeAreaView>
```

- [ ] **Step 6: Verify typecheck + the full suite are green**

Run:

```bash
pnpm --filter @rtc/client-react-native typecheck
pnpm --filter @rtc/client-react-native test
```

Expected: both PASS (the probe is not mounted in tests — the env flag is unset — so no snapshot/behavior changes elsewhere).

- [ ] **Step 7: Commit**

```bash
git add packages/client-react-native/src/ui/_probe/ packages/client-react-native/app/_layout.tsx
git commit -m "feat(rn): flag-gated MotionProbe proving the reanimated+skia stack"
```

---

## Task 6: Rebuild the dev client, prove it on-device, and document

**Files:**
- Modify: `packages/client-react-native/README.md`

**Interfaces:**
- Consumes: everything above.
- Produces: an on-device verification record and a README note; no runtime code change.

- [ ] **Step 1: Rebuild the iOS dev-client with the new native modules**

The six new packages include native code, so the existing dev client lacks them. Rebuild from the **primary checkout** (the `ios/` folder is gitignored and lives only where it is built):

```bash
pnpm dev:ios
```

Expected: `expo run:ios` prebuilds, compiles the native dev client (now linking Skia/Reanimated/gesture-handler/expo-blur/haptics/sensors), installs it on the booted simulator, and starts Metro.

- [ ] **Step 2: Prove the motion stack on-device with the probe flag**

Stop Metro, then start it with the probe flag set (EXPO_PUBLIC_* is baked into the bundle at Metro start, so it must be set on the launch command):

```bash
EXPO_PUBLIC_MOTION_PROBE=1 pnpm dev:ios
```

Expected on the simulator: a small cyan circle (Skia) in the top-right that **pulses** (Reanimated fade loop). This confirms both native renderers work. Capture a screenshot for the sign-off record.

- [ ] **Step 3: Confirm normal runs are visually unchanged**

Restart Metro **without** the flag:

```bash
pnpm dev:ios
```

Expected: the app looks exactly as before — no probe, no visual change.

- [ ] **Step 4: Document the native stack + the probe flag in the README**

Add a short section to `packages/client-react-native/README.md` (place it near the existing dev/run instructions) recording the new native dependencies and the diagnostic flag:

```markdown
## Native motion/render stack

The client uses `react-native-reanimated`, `@shopify/react-native-skia`,
`react-native-gesture-handler`, `expo-blur`, `expo-haptics`, and `expo-sensors`.
Because these are native modules, adding or upgrading them requires rebuilding
the dev client (`pnpm dev:ios`) — a JS reload is not enough.

**Diagnostic:** launch with `EXPO_PUBLIC_MOTION_PROBE=1 pnpm dev:ios` to render a
flag-gated probe (`src/ui/_probe/MotionProbe.tsx`) — a pulsing Skia circle that
confirms the Reanimated worklet runtime and the Skia canvas both render on
device. It never appears in a normal run.
```

- [ ] **Step 5: Run the full package gate suite**

Run (from the repo root):

```bash
pnpm --filter @rtc/client-react-native typecheck
pnpm --filter @rtc/client-react-native test
pnpm biome ci packages/client-react-native
pnpm --filter @rtc/client-react-native exec eslint .
pnpm knip || true
```

Expected: typecheck, tests, Biome, and ESLint all clean. Address any `knip` finding for the newly added deps (e.g. add an intentional-dependency note or a `knip` ignore only if the dep is a native-autolink runtime dependency with no JS import — `expo-haptics`/`expo-sensors` may be flagged until later phases import them; if so, defer their import to their consuming phase and add a scoped `knip` ignore with a comment).

- [ ] **Step 6: Commit**

```bash
git add packages/client-react-native/README.md
git commit -m "docs(rn): document the native motion stack + MotionProbe flag"
```

---

## Self-Review

**Spec coverage (Phase 0 exit gate = "app boots on the iOS sim rendering a trivial Skia + Reanimated smoke view; full gauntlet green; on-device sign-off that nothing regressed"):**
- Native deps installed → Task 1. Babel wiring → Task 2. Suite-green via mocks → Task 3. Gesture root → Task 4. Skia+Reanimated smoke view (the probe) → Task 5. Dev-client rebuild + on-device proof + gauntlet + docs → Task 6. All covered.

**Placeholder scan:** No "TBD"/"handle edge cases"/"similar to". The only conditional (Reanimated 3 vs ≥4 babel plugin) is a deterministic branch with both concrete forms given. The `knip` note names the exact likely-flagged packages and the concrete resolution.

**Type consistency:** `MotionProbe` is a default export `(): JSX.Element` in both its test and the `_layout.tsx` import (`#/ui/_probe/MotionProbe`). The env flag string `"1"` and var name `EXPO_PUBLIC_MOTION_PROBE` are identical in `MotionProbe` mounting (Task 5), the on-device command (Task 6), and the README (Task 6). Skia stubs mocked in Task 3 (`Canvas`, `Circle`, `Fill`) are exactly those imported by `MotionProbe` in Task 5.
