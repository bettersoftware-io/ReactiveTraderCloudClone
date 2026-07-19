# RN mobile-v1 rehaul — Phase 3: Shell (header/status strip + radial command dock) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the `@rtc/client-react-native` tab-navigator shell with the prototype's HUD chrome — an animated hex-reticle header + status strip with live telemetry, and a router-backed radial command dock that fans out 5 module satellites — with no change to the data seam.

**Architecture:** Rebuild the shell *presentation* from the mobile prototype (`docs/design/mobile/v1/dev-handoff/prototype/source/Reactive Trader Mobile.dc.html`), keeping all data flowing through the existing `@rtc/react-bindings` ViewModel. The `(app)/_layout.tsx` chrome swaps `<Tabs>` for a persistent `ShellHeader` + `<Slot/>` (active route) + `StatusStrip` + `RadialCommandDock`; the dock drives `expo-router` navigation so deep links and the file-route structure survive unchanged. Idle shell motion (logo rotation loops, connection-pulse) is gated by OS reduced-motion AND the power-saver Freeze tier. Radial-dock geometry is a pure, unit-tested function; telemetry reuses `@rtc/motion-core`'s `computeFps`/`fpsTone` with the web client's decorative-static LAT/clock + harness-frozen FPS pattern for golden stability.

**Tech Stack:** React Native 0.86 / Expo Router 57 / TypeScript, `react-native-svg` (logo + hex FAB), `react-native-reanimated` 4 (rotation loops, spring stagger, `useFrameCallback` FPS meter), `expo-blur` (dock scrim), `@rtc/motion-core` (FPS math), jest-expo + `@testing-library/react-native` (`.test.tsx`), vitest node (`.test.ts` pure fns).

## Global Constraints

Every task's requirements implicitly include this section. Values are copied verbatim from the master spec (`docs/superpowers/specs/2026-07-16-rn-mobile-v1-rehaul-design.md` §3–§4) and standing session rules.

- **Data seam untouched:** no changes to `@rtc/domain`, `@rtc/client-core`, `@rtc/react-bindings` presenters, or the wire contracts. All data reaches the UI via `useViewModel()`. Rebuilding presentation must not reach into `domain`/`client-core`.
- **Dumb-UI doctrine:** no `rxjs` / `localStorage` / `fetch` imports in `packages/client-react-native/src/ui` (grep gates enforce this). Data only via the ViewModel.
- **Perf doctrine:** animate **only transform/opacity**; run animations as Reanimated worklets on the UI thread; **calm until a real event** — the only idle motion in the shell is the ambient aurora (already shipped) plus the logo reticle rotation and the connection-pulse dot, both of which MUST still under reduced-motion / Freeze.
- **Motion gates:** honor OS reduced-motion (`useReducedMotion()` from `react-native-reanimated`) **and** power-saver Freeze (`useViewModel().usePowerSaver().isFreeze`) everywhere a loop or spring runs. Gated off ⇒ render the static end-state, and cancel any `withRepeat(-1)` worklet (never leave one running on the UI thread — see `AmbientBackground.tsx`).
- **Router-backed dock:** the dock drives `expo-router`; the 5 file routes (`index`, `blotter`, `analytics`, `credit`, `equities`) under `app/(app)/` stay exactly as named so deep links keep resolving. `app/__visual` (root sibling of `(app)`) is unaffected.
- **No new native deps:** `react-native-svg`, `react-native-reanimated`, `expo-blur` are already installed and jest-mocked. Do not add dependencies in this phase.
- **All gates green, whole package:** `pnpm --filter @rtc/client-react-native typecheck`, `biome ci`, ESLint (base + typed configs), `knip`, and `test` (vitest + jest) must all pass. Custom ESLint rules apply: `rtc/newspaper-order` (type/helper declarations BELOW their first use), `no-restricted-syntax` (NO inline object types in casts, params, or returns — declare a named `interface`/`type`), `padding-line-between-statements`, `func-style`, `useExplicitType` (explicit return types), `style/useBlockStatements` (mandatory braces on all control statements), and `#/`-subpath imports only (Biome bans ≥2-up relative imports; same-dir `./x` is fine).
- **Test-runner split:** files named `*.test.ts` run under **vitest** (node env, pure logic, no `__DEV__`); files named `*.test.tsx` run under **jest-expo** (defines `__DEV__ = true`, RN preset). The package `test` script is `vitest run --passWithNoTests && jest`. Put pure-function tests in `.test.ts`; component/hook tests that render RN in `.test.tsx`.
- **Visual harness:** never add any `test:rn:visual:*` script to `.github/workflows/ci.yml` (macOS-only; no macOS runners). The harness stays gated on `__DEV__ && EXPO_PUBLIC_VISUAL_HARNESS === "1"`. Shell visual-golden capture is an **on-device follow-up** (Task 9), not part of the code PR.
- **Inline dynamic style is allowed in RN** where a value depends on runtime state (e.g. `style={[styles.dot, { backgroundColor: color }]}`), matching the existing `ConnectionBanner.tsx`. Static style always lives in `StyleSheet.create` via `useThemedStyles(makeStyles)`.
- **Jest already globally mocks the native motion stack** (`packages/client-react-native/jest.setup.ts`): the official `react-native-reanimated/mock` (synchronous JS worklets; `useSharedValue`/`withRepeat`/`withTiming`/`withSpring`/`withDelay`/`cancelAnimation`/`useAnimatedProps`/`useAnimatedStyle`/`useFrameCallback`/`runOnJS`/`Animated.createAnimatedComponent` all provided) with `useReducedMotion` pinned to `false`, plus `expo-blur`, `@shopify/react-native-skia`, `expo-haptics`, `expo-sensors`, and gesture-handler. **Consequence for tests:** component tests (Tasks 3, 6, 7) must **not** re-`jest.mock("react-native-reanimated", …)` — that would strip the global mock's other exports the component imports. Control the motion-enabled vs -disabled branch by mocking `./useShellMotionEnabled`, and control the current route by mocking `expo-router` (which is NOT globally mocked). The only permitted local reanimated override is Task 2's, whose subject imports **only** `useReducedMotion`. Task 4's telemetry test may stub `useFrameCallback` locally but must also re-export `runOnJS` in the same factory, or (cleaner) rely on the global mock and drive determinism through `useShellMotionEnabled → false`. `react-native-svg` renders fine under jsdom/jest-expo (no mock needed).

---

## File Structure

New files (all under `packages/client-react-native/`):

- `src/ui/shell/hud/radialDockLayout.ts` — pure geometry for the 5 satellites (+ `.test.ts`, vitest).
- `src/ui/shell/hud/useShellMotionEnabled.ts` — reduced-motion ∧ ¬Freeze gate for shell loops (+ `.test.tsx`).
- `src/ui/shell/hud/HexReticleLogo.tsx` — animated SVG reticle logo (+ `.test.tsx`).
- `src/ui/shell/hud/ShellTelemetryContext.ts` — frozen-telemetry context (harness escape hatch).
- `src/ui/shell/hud/useShellTelemetry.ts` — live FPS meter + decorative LAT/clock/build (+ `.test.tsx`).
- `src/ui/shell/hud/StatusStrip.tsx` — MODULE / telemetry / SESSION strip (+ `.test.tsx`).
- `src/ui/shell/hud/ShellHeader.tsx` — logo + wordmark + env badge + conn-pulse + appearance/lock/logout (+ `.test.tsx`).
- `src/ui/shell/hud/RadialCommandDock.tsx` — hex FAB + 5 satellites over blur scrim, router-backed (+ `.test.tsx`).
- `src/ui/shell/hud/moduleRoutes.ts` — the shared 5-module descriptor list (route key, glyph, label, path).

Modified:

- `app/(app)/_layout.tsx` — swap `<Tabs>` chrome for `ShellHeader` + `<Slot/>` + `StatusStrip` + `RadialCommandDock`; drop the toolbar `<Switch>`/wordmark/`tabIcon`.
- `app/(app)/_layout.test.tsx` — migrate the mount smoke to the new chrome.

`moduleRoutes.ts` is the single source of truth consumed by `RadialCommandDock`, `StatusStrip`, and `radialDockLayout`'s caller, so the module list (order, glyphs, labels, paths) lives in exactly one place.

---

### Task 1: Radial-dock geometry (pure function)

**Files:**
- Create: `packages/client-react-native/src/ui/shell/hud/moduleRoutes.ts`
- Create: `packages/client-react-native/src/ui/shell/hud/radialDockLayout.ts`
- Test: `packages/client-react-native/src/ui/shell/hud/radialDockLayout.test.ts`

**Interfaces:**
- Produces: `MODULE_ROUTES: readonly ModuleRoute[]` where `interface ModuleRoute { readonly key: string; readonly glyph: string; readonly label: string; readonly path: "/" | "/blotter" | "/analytics" | "/credit" | "/equities"; }` — 5 entries in prototype order (rates→equities).
- Produces: `radialDockLayout(count: number): readonly SatelliteLayout[]` where `interface SatelliteLayout { readonly tx: number; readonly ty: number; readonly delayMs: number; }`. For the canonical 5-satellite fan: angles `[150, 120, 90, 60, 30]` degrees, radius `118`, `tx = round(cos(a) * r)`, `ty = round(-sin(a) * r)`, `delayMs = index * 45`.

- [ ] **Step 1: Write the module descriptor list**

Create `moduleRoutes.ts`. Note the Rates route path is `/` (the `(app)/index.tsx` route). Glyphs/labels are the prototype's `NAV` array verbatim.

```ts
/** The five trading modules, in prototype dock order (rates → equities). The
 * single source of truth for the radial dock, the status strip's MODULE
 * label, and route navigation. `path` is the expo-router href for each file
 * route under `app/(app)/`; Rates is the group's index route (`/`). */
export interface ModuleRoute {
  readonly key: string;
  readonly glyph: string;
  readonly label: string;
  readonly path: "/" | "/blotter" | "/analytics" | "/credit" | "/equities";
}

export const MODULE_ROUTES: readonly ModuleRoute[] = [
  { key: "rates", glyph: "⇅", label: "RATES", path: "/" },
  { key: "blotter", glyph: "▤", label: "BLOTTER", path: "/blotter" },
  { key: "analytics", glyph: "◵", label: "ANALYTICS", path: "/analytics" },
  { key: "credit", glyph: "◈", label: "CREDIT", path: "/credit" },
  { key: "equities", glyph: "▦", label: "EQUITIES", path: "/equities" },
];
```

- [ ] **Step 2: Write the failing geometry test**

Create `radialDockLayout.test.ts`. The expected `tx/ty` are computed from the prototype's exact formula so the port is provably faithful.

```ts
import { describe, expect, test } from "vitest";

import { radialDockLayout } from "./radialDockLayout";

describe("radialDockLayout", () => {
  test("fans 5 satellites on the prototype's 150→30° arc at r=118", () => {
    const sats = radialDockLayout(5);
    const R = 118;
    const angles = [150, 120, 90, 60, 30];
    const expected = angles.map((deg, i) => {
      const a = (deg * Math.PI) / 180;
      return {
        tx: Math.round(Math.cos(a) * R),
        ty: Math.round(-Math.sin(a) * R),
        delayMs: i * 45,
      };
    });
    expect(sats).toEqual(expected);
  });

  test("the centre satellite sits straight up (tx≈0, ty≈-118)", () => {
    const [, , centre] = radialDockLayout(5);
    expect(centre.tx).toBe(0);
    expect(centre.ty).toBe(-118);
    expect(centre.delayMs).toBe(90);
  });

  test("staggers every satellite by 45ms in order", () => {
    const sats = radialDockLayout(3);
    expect(sats.map((s) => s.delayMs)).toEqual([0, 45, 90]);
  });
});
```

- [ ] **Step 3: Run the test to confirm it fails**

Run: `cd packages/client-react-native && pnpm vitest run src/ui/shell/hud/radialDockLayout.test.ts`
Expected: FAIL — `radialDockLayout` not found.

- [ ] **Step 4: Implement the pure function**

Create `radialDockLayout.ts`. Angles are spread evenly across the 150°→30° top arc; for the canonical count of 5 this yields exactly `[150,120,90,60,30]`. Keep it general (evenly spaced across the arc) but assert the 5-case in tests.

```ts
/** One satellite's resting offset from the FAB centre (px) plus its
 * fan-out stagger delay (ms). Consumed by `RadialCommandDock`. */
export interface SatelliteLayout {
  readonly tx: number;
  readonly ty: number;
  readonly delayMs: number;
}

const RADIUS_PX = 118;
const ARC_START_DEG = 150;
const ARC_END_DEG = 30;
const STAGGER_MS = 45;

/** Fan `count` satellites across the top arc (150°→30°), evenly spaced, at a
 * fixed radius. Mirrors the prototype's `angles = [150,120,90,60,30]; r = 118`
 * for the 5-module dock: `tx = cos(a)·r`, `ty = -sin(a)·r` (screen y is down,
 * so the arc bows upward), each staggered `index · 45ms`. Pure — no RN/Skia. */
export function radialDockLayout(count: number): readonly SatelliteLayout[] {
  const span = count > 1 ? (ARC_START_DEG - ARC_END_DEG) / (count - 1) : 0;
  return Array.from({ length: count }, (_unused, index): SatelliteLayout => {
    const deg = ARC_START_DEG - span * index;
    const a = (deg * Math.PI) / 180;
    return {
      tx: Math.round(Math.cos(a) * RADIUS_PX),
      ty: Math.round(-Math.sin(a) * RADIUS_PX),
      delayMs: index * STAGGER_MS,
    };
  });
}
```

- [ ] **Step 5: Run the test to confirm it passes**

Run: `cd packages/client-react-native && pnpm vitest run src/ui/shell/hud/radialDockLayout.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add packages/client-react-native/src/ui/shell/hud/moduleRoutes.ts \
        packages/client-react-native/src/ui/shell/hud/radialDockLayout.ts \
        packages/client-react-native/src/ui/shell/hud/radialDockLayout.test.ts
git commit -m "feat(rn-shell): radial-dock geometry + module-route descriptors"
```

---

### Task 2: Shell-motion gate hook

**Files:**
- Create: `packages/client-react-native/src/ui/shell/hud/useShellMotionEnabled.ts`
- Test: `packages/client-react-native/src/ui/shell/hud/useShellMotionEnabled.test.tsx`

**Interfaces:**
- Consumes: `useReducedMotion()` (`react-native-reanimated`), `useViewModel().usePowerSaver()` → `{ isFreeze: boolean }`.
- Produces: `useShellMotionEnabled(): boolean` — `true` only when OS reduced-motion is **off** and power-saver is **not** Freeze. Consumed by `HexReticleLogo`, the connection-pulse dot, and `RadialCommandDock` (spring vs instant).

This mirrors `src/ui/ambient/useAmbientEnabled.ts` (which ANDs the animated-background preference with `!reducedMotion`); the shell version ANDs `!reducedMotion` with `!isFreeze` (the shell reticle/pulse have no separate on/off preference — they follow the two motion authorities).

- [ ] **Step 1: Write the failing test**

Create `useShellMotionEnabled.test.tsx`. Drive the two authorities via mocks (jest-expo). Render the hook through a trivial probe component.

```tsx
import { expect, jest, test } from "@jest/globals";
import { render, screen } from "@testing-library/react-native";
import type { JSX } from "react";
import { Text } from "react-native";

const mockReducedMotion = jest.fn<() => boolean>();
const mockPowerSaver = jest.fn<() => { isCalm: boolean; isFreeze: boolean }>();

jest.mock("react-native-reanimated", () => {
  return { useReducedMotion: (): boolean => mockReducedMotion() };
});
jest.mock("@rtc/react-bindings", () => {
  return { useViewModel: () => ({ usePowerSaver: () => mockPowerSaver() }) };
});

// Imported after the mocks are registered.
const { useShellMotionEnabled } = require("./useShellMotionEnabled") as {
  useShellMotionEnabled: () => boolean;
};

function Probe(): JSX.Element {
  return <Text>{useShellMotionEnabled() ? "on" : "off"}</Text>;
}

test("motion runs when reduced-motion is off and not freezing", () => {
  mockReducedMotion.mockReturnValue(false);
  mockPowerSaver.mockReturnValue({ isCalm: false, isFreeze: false });
  render(<Probe />);
  expect(screen.getByText("on")).toBeTruthy();
});

test("reduced motion stills the shell", () => {
  mockReducedMotion.mockReturnValue(true);
  mockPowerSaver.mockReturnValue({ isCalm: false, isFreeze: false });
  render(<Probe />);
  expect(screen.getByText("off")).toBeTruthy();
});

test("power-saver Freeze stills the shell", () => {
  mockReducedMotion.mockReturnValue(false);
  mockPowerSaver.mockReturnValue({ isCalm: true, isFreeze: true });
  render(<Probe />);
  expect(screen.getByText("off")).toBeTruthy();
});
```

- [ ] **Step 2: Run the test to confirm it fails**

Run: `cd packages/client-react-native && pnpm jest src/ui/shell/hud/useShellMotionEnabled.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the hook**

Create `useShellMotionEnabled.ts`:

```ts
import { useReducedMotion } from "react-native-reanimated";

import { useViewModel } from "@rtc/react-bindings";

/** Whether the shell's idle motion (logo reticle rotation, connection-pulse,
 * dock spring) should run right now: OS reduced-motion off AND power-saver not
 * at the Freeze tier. Gated off ⇒ callers render the static end-state and
 * cancel any repeating worklet (mirrors `useAmbientEnabled` for the ambient
 * background). Freeze is the RN analogue of the web `[data-power-saver=freeze]`
 * catch-all that kills every transition. */
export function useShellMotionEnabled(): boolean {
  const reducedMotion = useReducedMotion();
  const { usePowerSaver } = useViewModel();
  const { isFreeze } = usePowerSaver();
  return !reducedMotion && !isFreeze;
}
```

- [ ] **Step 4: Run the test to confirm it passes**

Run: `cd packages/client-react-native && pnpm jest src/ui/shell/hud/useShellMotionEnabled.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/client-react-native/src/ui/shell/hud/useShellMotionEnabled.ts \
        packages/client-react-native/src/ui/shell/hud/useShellMotionEnabled.test.tsx
git commit -m "feat(rn-shell): shell-motion gate (reduced-motion ∧ ¬Freeze)"
```

---

### Task 3: Hex-reticle logo

**Files:**
- Create: `packages/client-react-native/src/ui/shell/hud/HexReticleLogo.tsx`
- Test: `packages/client-react-native/src/ui/shell/hud/HexReticleLogo.test.tsx`

**Interfaces:**
- Consumes: `useShellMotionEnabled()` (Task 2), `useTheme()` → `RnTheme` (`accentPrimary`, `accent2`).
- Produces: `HexReticleLogo(props: HexReticleLogoProps): JSX.Element` where `interface HexReticleLogoProps { readonly size?: number; }` (default 30). Renders `testID="hud-logo"`. Two Reanimated rotation loops: outer dashed ring 16s CW, inner triangles group 22s CCW — both cancelled/held static when `useShellMotionEnabled()` is false.

Port the prototype header SVG (`.dc.html:67-84`): outer hex `polygon` + inner hex + reticle tick lines + dashed spinning `circle` (r=11, `kfSpin` 16s) + counter-spinning triangle group (`kfSpinRev` 22s) + centre dot. Use `react-native-svg` (`Svg`, `G`, `Polygon`, `Line`, `Path`, `Circle`) and Reanimated `useSharedValue` + `withRepeat(withTiming(360, { duration, easing: linear }), -1)` mapped to `rotate` via `useAnimatedProps` on an `Animated.createAnimatedComponent(G)` (`transform={[{ rotate }]}` with `originX/originY` at the centre).

- [ ] **Step 1: Write the failing test**

Create `HexReticleLogo.test.tsx`. Assert it mounts with the logo testID under both motion states (the freeze path must not throw and must not start a loop). Mock the gate + theme.

```tsx
import { expect, jest, test } from "@jest/globals";
import { render, screen } from "@testing-library/react-native";

const mockMotion = jest.fn<() => boolean>();
jest.mock("./useShellMotionEnabled", () => {
  return { useShellMotionEnabled: (): boolean => mockMotion() };
});
jest.mock("#/ui/theme/useTheme", () => {
  return {
    useTheme: () => ({ accentPrimary: "#00E5FF", accent2: "#7C4DFF" }),
  };
});

const { HexReticleLogo } = require("./HexReticleLogo") as {
  HexReticleLogo: (p: { size?: number }) => JSX.Element;
};

test("renders the reticle when motion is enabled", () => {
  mockMotion.mockReturnValue(true);
  render(<HexReticleLogo />);
  expect(screen.getByTestId("hud-logo")).toBeTruthy();
});

test("renders a static reticle when motion is disabled (freeze / reduced)", () => {
  mockMotion.mockReturnValue(false);
  render(<HexReticleLogo />);
  expect(screen.getByTestId("hud-logo")).toBeTruthy();
});
```

- [ ] **Step 2: Run the test to confirm it fails**

Run: `cd packages/client-react-native && pnpm jest src/ui/shell/hud/HexReticleLogo.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the logo**

Create `HexReticleLogo.tsx`. Faithfully port the SVG geometry from `.dc.html:67-84`. Both loops start in an effect only when `enabled`; on disable, `cancelAnimation` and reset the shared values to their static angle (0). Use `Easing.linear`. Guard the spin with the gate so Freeze/reduced-motion leave a static reticle (perf + a11y).

```tsx
import type { JSX } from "react";
import { useEffect } from "react";
import { StyleSheet } from "react-native";
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedProps,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import Svg, { Circle, G, Line, Path, Polygon } from "react-native-svg";

import { useTheme } from "#/ui/theme/useTheme";

import { useShellMotionEnabled } from "./useShellMotionEnabled";

const AnimatedG = Animated.createAnimatedComponent(G);
const OUTER_SPIN_MS = 16_000;
const INNER_SPIN_MS = 22_000;
const CENTER = 24;

export interface HexReticleLogoProps {
  readonly size?: number;
}

/** Animated hex-reticle wordmark logo (prototype header, .dc.html:67-84):
 * static outer/inner hex + reticle ticks, a dashed ring spinning 16s CW, and a
 * twin-triangle group counter-spinning 22s CCW. Both loops run only while
 * `useShellMotionEnabled()` — reduced-motion / power-saver Freeze leave a
 * static reticle and cancel the worklets (no orphaned `withRepeat` on the UI
 * thread). Only transform/opacity animate. */
export function HexReticleLogo({ size = 30 }: HexReticleLogoProps): JSX.Element {
  const t = useTheme();
  const enabled = useShellMotionEnabled();
  const ringAngle = useSharedValue(0);
  const triAngle = useSharedValue(0);

  useEffect(() => {
    if (!enabled) {
      cancelAnimation(ringAngle);
      cancelAnimation(triAngle);
      ringAngle.value = 0;
      triAngle.value = 0;
      return;
    }
    ringAngle.value = withRepeat(
      withTiming(360, { duration: OUTER_SPIN_MS, easing: Easing.linear }),
      -1,
    );
    triAngle.value = withRepeat(
      withTiming(-360, { duration: INNER_SPIN_MS, easing: Easing.linear }),
      -1,
    );
    return () => {
      cancelAnimation(ringAngle);
      cancelAnimation(triAngle);
    };
  }, [enabled, ringAngle, triAngle]);

  const ringProps = useAnimatedProps(() => {
    return { transform: [{ rotate: `${ringAngle.value}deg` }] };
  });
  const triProps = useAnimatedProps(() => {
    return { transform: [{ rotate: `${triAngle.value}deg` }] };
  });

  return (
    <Svg
      testID="hud-logo"
      width={size}
      height={size}
      viewBox="0 0 48 48"
      style={styles.logo}
    >
      <G fill="none" stroke={t.accentPrimary} strokeWidth={1.4} strokeLinejoin="round">
        <Polygon points="24,3 40.6,13.5 40.6,34.5 24,45 7.4,34.5 7.4,13.5" opacity={0.9} />
        <Polygon points="24,8 36.3,15.75 36.3,31.25 24,39 11.7,31.25 11.7,15.75" stroke={t.accent2} strokeWidth={1} opacity={0.6} />
      </G>
      <G stroke={t.accentPrimary} strokeWidth={1.6} strokeLinecap="round" opacity={0.85}>
        <Line x1="24" y1="2" x2="24" y2="6" />
        <Line x1="24" y1="42" x2="24" y2="46" />
        <Line x1="5" y1="13" x2="8.5" y2="15" />
        <Line x1="43" y1="13" x2="39.5" y2="15" />
        <Line x1="5" y1="35" x2="8.5" y2="33" />
        <Line x1="43" y1="35" x2="39.5" y2="33" />
      </G>
      <AnimatedG animatedProps={ringProps} originX={CENTER} originY={CENTER}>
        <Circle cx="24" cy="24" r="11" fill="none" stroke={t.accent2} strokeWidth={1} strokeDasharray="3 5" opacity={0.85} />
      </AnimatedG>
      <AnimatedG animatedProps={triProps} originX={CENTER} originY={CENTER}>
        <Path d="M24 15 L31.8 28.5 L16.2 28.5 Z" fill="none" stroke={t.accentPrimary} strokeWidth={1.2} strokeLinejoin="round" opacity={0.8} />
        <Path d="M24 33 L16.2 19.5 L31.8 19.5 Z" fill="none" stroke={t.accentPrimary} strokeWidth={1.2} strokeLinejoin="round" opacity={0.5} />
      </AnimatedG>
      <Circle cx="24" cy="24" r="3.4" fill={t.accentPrimary} />
      <Circle cx="24" cy="24" r="6.4" fill="none" stroke={t.accentPrimary} strokeWidth={1} />
    </Svg>
  );
}

interface HexReticleLogoStyles {
  logo: { display: "flex" };
}

const styles: HexReticleLogoStyles = StyleSheet.create({
  logo: { display: "flex" },
});
```

> **Implementer note:** if `originX`/`originY` on `AnimatedG` do not rotate about the centre in this RN-SVG version, fall back to wrapping the rotation on the group `transform` string with an explicit translate (`rotate` about `24,24`): `transform={[{ translateX: 24 }, { translateY: 24 }, { rotate }, { translateX: -24 }, { translateY: -24 }]}`. Prove whichever path with the covering test (mount, no throw) plus a manual note; do not leave both.

- [ ] **Step 4: Run the test to confirm it passes**

Run: `cd packages/client-react-native && pnpm jest src/ui/shell/hud/HexReticleLogo.test.tsx`
Expected: PASS (2 tests). If the reanimated/svg jest mocks need a `createAnimatedComponent` stub, add it to the existing jest setup mock rather than the test (check `jest.config.js` `setupFiles`); note it in the report.

- [ ] **Step 5: Commit**

```bash
git add packages/client-react-native/src/ui/shell/hud/HexReticleLogo.tsx \
        packages/client-react-native/src/ui/shell/hud/HexReticleLogo.test.tsx
git commit -m "feat(rn-shell): animated hex-reticle logo (SVG + gated rotation loops)"
```

---

### Task 4: Shell telemetry (live FPS + decorative LAT/clock)

**Files:**
- Create: `packages/client-react-native/src/ui/shell/hud/ShellTelemetryContext.ts`
- Create: `packages/client-react-native/src/ui/shell/hud/useShellTelemetry.ts`
- Test: `packages/client-react-native/src/ui/shell/hud/useShellTelemetry.test.tsx`

**Interfaces:**
- Consumes: `computeFps`, `fpsTone` from `@rtc/motion-core`; `useFrameCallback` from `react-native-reanimated`; `useShellMotionEnabled()` (Task 2).
- Produces:
  - `ShellTelemetryContext` — `React.Context<FrozenTelemetry | null>` where `interface FrozenTelemetry { readonly fps: number; readonly latencyMs: number; }` (default `null`).
  - `useShellTelemetry(): ShellTelemetry` where `interface ShellTelemetry { readonly fps: number; readonly fpsTone: MetricTone; readonly latencyMs: number; readonly clock: string; readonly build: string; }`. When the context supplies a frozen value, return it verbatim (golden stability). Otherwise: `fps` is live (rAF window via `useFrameCallback`, republished ~1s, held at the seed under Freeze/reduced-motion), while `latencyMs`, `clock`, `build` are **decorative-static seeds** (`12`, `"09:47:03"`, `"V2.0-RN"`) — matching the web `CosmeticMetrics` design where only FPS/MEM are live and LAT/clock are golden-stable chrome.

This is the web pattern (`packages/client-react/src/ui/shell/status/{useLiveMetrics,CosmeticMetrics,LiveMetricsContext}`) adapted to RN: RN Hermes has no `performance.memory`, so MEM is dropped; the frozen-context escape hatch is what the visual harness (Task 9) uses to keep the FPS readout deterministic.

- [ ] **Step 1: Write the failing test**

Create `useShellTelemetry.test.tsx`. Cover: (a) frozen context wins; (b) default seeds when unfrozen and motion disabled (Freeze holds the seed, loop never ticks under jest anyway).

```tsx
import { expect, jest, test } from "@jest/globals";
import { render, screen } from "@testing-library/react-native";
import type { JSX } from "react";
import { Text } from "react-native";

// `useShellTelemetry` imports `useFrameCallback` + `runOnJS`; stub both so the
// local override doesn't drop a binding the module loads. Motion is forced off
// so the meter is inert and the seed/frozen path is deterministic.
jest.mock("react-native-reanimated", () => {
  return {
    useFrameCallback: (): void => undefined,
    runOnJS: (fn: unknown): unknown => fn,
  };
});
jest.mock("./useShellMotionEnabled", () => {
  return { useShellMotionEnabled: (): boolean => false };
});

const { ShellTelemetryContext } = require("./ShellTelemetryContext") as {
  ShellTelemetryContext: React.Context<{ fps: number; latencyMs: number } | null>;
};
const { useShellTelemetry } = require("./useShellTelemetry") as {
  useShellTelemetry: () => {
    fps: number;
    latencyMs: number;
    clock: string;
    build: string;
  };
};

function Probe(): JSX.Element {
  const t = useShellTelemetry();
  return <Text>{`${t.fps}|${t.latencyMs}|${t.clock}|${t.build}`}</Text>;
}

test("returns the frozen telemetry when a provider supplies it", () => {
  render(
    <ShellTelemetryContext.Provider value={{ fps: 60, latencyMs: 12 }}>
      <Probe />
    </ShellTelemetryContext.Provider>,
  );
  expect(screen.getByText("60|12|09:47:03|V2.0-RN")).toBeTruthy();
});

test("falls back to decorative seeds with no provider", () => {
  render(<Probe />);
  expect(screen.getByText("60|12|09:47:03|V2.0-RN")).toBeTruthy();
});
```

- [ ] **Step 2: Run the test to confirm it fails**

Run: `cd packages/client-react-native && pnpm jest src/ui/shell/hud/useShellTelemetry.test.tsx`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement the context + hook**

Create `ShellTelemetryContext.ts`:

```ts
import { createContext } from "react";

/** A frozen telemetry snapshot the visual harness injects so the FPS readout
 * is deterministic across golden captures (the RN analogue of the web
 * `LiveMetricsContext`). `null` in production ⇒ the live meter runs. */
export interface FrozenTelemetry {
  readonly fps: number;
  readonly latencyMs: number;
}

export const ShellTelemetryContext = createContext<FrozenTelemetry | null>(null);
```

Create `useShellTelemetry.ts`. The FPS meter counts frames in a Reanimated `useFrameCallback` and republishes a rolling ~1s window through `runOnJS`; under Freeze/reduced-motion (`!enabled`) the callback is inert and the seed holds. `clock`/`latencyMs`/`build` are static seeds (decorative, golden-stable).

```ts
import { useContext, useState } from "react";
import { runOnJS, useFrameCallback } from "react-native-reanimated";

import { computeFps, fpsTone, type MetricTone } from "@rtc/motion-core";

import { ShellTelemetryContext } from "./ShellTelemetryContext";
import { useShellMotionEnabled } from "./useShellMotionEnabled";

const SEED_FPS = 60;
const SEED_LATENCY_MS = 12;
const SEED_CLOCK = "09:47:03";
const BUILD_TAG = "V2.0-RN";
const PUBLISH_MS = 1000;

export interface ShellTelemetry {
  readonly fps: number;
  readonly fpsTone: MetricTone;
  readonly latencyMs: number;
  readonly clock: string;
  readonly build: string;
}

/** HUD status-strip telemetry. FPS is a live rolling-window meter (Reanimated
 * `useFrameCallback` → `computeFps`/`fpsTone`), stilled at the seed under
 * reduced-motion / power-saver Freeze — there is no meaningful frame rate to
 * report while the app's own loops are frozen. LAT/clock/build are decorative
 * static seeds (golden-stable chrome, mirroring the web `CosmeticMetrics`
 * design). A `ShellTelemetryContext` provider (visual harness) overrides FPS +
 * latency with a frozen snapshot. */
export function useShellTelemetry(): ShellTelemetry {
  const frozen = useContext(ShellTelemetryContext);
  const enabled = useShellMotionEnabled();
  const [fps, setFps] = useState(SEED_FPS);

  const meter = { frames: 0, windowStartMs: 0 };
  useFrameCallback((frame) => {
    "worklet";
    if (frozen !== null || !enabled) {
      return;
    }
    meter.frames += 1;
    if (meter.windowStartMs === 0) {
      meter.windowStartMs = frame.timeSinceFirstFrame;
    }
    const elapsed = frame.timeSinceFirstFrame - meter.windowStartMs;
    if (elapsed >= PUBLISH_MS) {
      runOnJS(setFps)(computeFps(meter.frames, elapsed));
      meter.frames = 0;
      meter.windowStartMs = frame.timeSinceFirstFrame;
    }
  });

  if (frozen !== null) {
    return {
      fps: frozen.fps,
      fpsTone: fpsTone(frozen.fps),
      latencyMs: frozen.latencyMs,
      clock: SEED_CLOCK,
      build: BUILD_TAG,
    };
  }
  return {
    fps,
    fpsTone: fpsTone(fps),
    latencyMs: SEED_LATENCY_MS,
    clock: SEED_CLOCK,
    build: BUILD_TAG,
  };
}
```

> **Implementer note:** the per-render `meter` object above is a scratch closure for the worklet's rolling counters; if the reanimated worklet plugin objects to a plain object captured by the frame callback, hoist the counters to `useSharedValue(0)` (`framesSv`, `windowStartSv`) and mutate `.value` inside the worklet instead. Verify `MetricTone` is exported from `@rtc/motion-core` (it backs `fpsTone`); if the public entry doesn't re-export the type, import it from its declaring module and note the path in the report.

- [ ] **Step 4: Run the test to confirm it passes**

Run: `cd packages/client-react-native && pnpm jest src/ui/shell/hud/useShellTelemetry.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/client-react-native/src/ui/shell/hud/ShellTelemetryContext.ts \
        packages/client-react-native/src/ui/shell/hud/useShellTelemetry.ts \
        packages/client-react-native/src/ui/shell/hud/useShellTelemetry.test.tsx
git commit -m "feat(rn-shell): HUD telemetry (live FPS + decorative LAT/clock, harness-frozen)"
```

---

### Task 5: Status strip

**Files:**
- Create: `packages/client-react-native/src/ui/shell/hud/StatusStrip.tsx`
- Test: `packages/client-react-native/src/ui/shell/hud/StatusStrip.test.tsx`

**Interfaces:**
- Consumes: `MODULE_ROUTES` (Task 1), `useShellTelemetry()` (Task 4), `useViewModel().useConnectionStatus()`, `usePathname()` (`expo-router`), `useTheme()`/`useThemedStyles`.
- Produces: `StatusStrip(): JSX.Element` — two rows (prototype `.dc.html:447-464`): a telemetry line (`conn label · {lat}MS · {fps}FPS · {clock} · {build}`) and a MODULE/SESSION line. `testID="hud-status-strip"`; the module label carries `testID="hud-module-label"`. Active module derived from `usePathname()` matched against `MODULE_ROUTES` (fallback: first entry).

- [ ] **Step 1: Write the failing test**

Create `StatusStrip.test.tsx`. Mock expo-router pathname + the ViewModel + telemetry; assert the active MODULE label tracks the route.

```tsx
import { expect, jest, test } from "@jest/globals";
import { render, screen } from "@testing-library/react-native";

const mockPathname = jest.fn<() => string>();
jest.mock("expo-router", () => {
  return { usePathname: (): string => mockPathname() };
});
jest.mock("@rtc/react-bindings", () => {
  return {
    useViewModel: () => ({ useConnectionStatus: () => "CONNECTED" }),
  };
});
jest.mock("./useShellTelemetry", () => {
  return {
    useShellTelemetry: () => ({
      fps: 60,
      fpsTone: "positive",
      latencyMs: 12,
      clock: "09:47:03",
      build: "V2.0-RN",
    }),
  };
});
jest.mock("@rtc/domain", () => {
  return { ConnectionStatus: { CONNECTED: "CONNECTED" } };
});

const { StatusStrip } = require("./StatusStrip") as {
  StatusStrip: () => JSX.Element;
};

test("shows the BLOTTER module label on the /blotter route", () => {
  mockPathname.mockReturnValue("/blotter");
  render(<StatusStrip />);
  expect(screen.getByTestId("hud-module-label")).toHaveTextContent("BLOTTER");
});

test("shows RATES on the index route", () => {
  mockPathname.mockReturnValue("/");
  render(<StatusStrip />);
  expect(screen.getByTestId("hud-module-label")).toHaveTextContent("RATES");
});
```

- [ ] **Step 2: Run the test to confirm it fails**

Run: `cd packages/client-react-native && pnpm jest src/ui/shell/hud/StatusStrip.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the status strip**

Create `StatusStrip.tsx`. Match the active module by exact `path`, then by pathname prefix for nested routes; fall back to `MODULE_ROUTES[0]`. Colours/spacing from the prototype strip; connection label mirrors `ConnectionBanner`'s `LABEL` mapping semantics (Live/Connecting/… — keep it terse: derive a short label locally). Keep the SESSION cell static (`TRADER.EI`, prototype).

```tsx
import type { JSX } from "react";
import { StyleSheet, Text, type TextStyle, View, type ViewStyle } from "react-native";

import { usePathname } from "expo-router";

import { ConnectionStatus } from "@rtc/domain";
import { useViewModel } from "@rtc/react-bindings";

import type { RnTheme } from "#/ui/theme/tokens";
import { useThemedStyles } from "#/ui/theme/useThemedStyles";

import { MODULE_ROUTES } from "./moduleRoutes";
import { useShellTelemetry } from "./useShellTelemetry";

const CONN_LABEL: Record<ConnectionStatus, string> = {
  [ConnectionStatus.CONNECTED]: "WS·CONNECTED",
  [ConnectionStatus.CONNECTING]: "WS·SYNC",
  [ConnectionStatus.DISCONNECTED]: "WS·DOWN",
  [ConnectionStatus.IDLE_DISCONNECTED]: "WS·IDLE",
  [ConnectionStatus.OFFLINE_DISCONNECTED]: "WS·OFFLINE",
};

/** HUD status strip (prototype .dc.html:447-464): a telemetry line
 * (connection · latency · fps · clock · build) above a MODULE / SESSION line.
 * The active MODULE is derived from the current expo-router pathname — the
 * dock and deep links both drive it. */
export function StatusStrip(): JSX.Element {
  const styles = useThemedStyles(makeStyles);
  const pathname = usePathname();
  const { useConnectionStatus } = useViewModel();
  const status = useConnectionStatus();
  const { fps, latencyMs, clock, build } = useShellTelemetry();
  const active =
    MODULE_ROUTES.find((m) => m.path === pathname) ??
    MODULE_ROUTES.find((m) => m.path !== "/" && pathname.startsWith(m.path)) ??
    MODULE_ROUTES[0];

  return (
    <View testID="hud-status-strip" style={styles.wrap}>
      <View style={styles.telemetry}>
        <Text style={styles.conn}>{CONN_LABEL[status]}</Text>
        <Text style={styles.cell}>{latencyMs}MS</Text>
        <Text style={styles.cell}>{fps}FPS</Text>
        <Text style={styles.cell}>{clock}</Text>
        <Text style={styles.cell}>{build}</Text>
      </View>
      <View style={styles.moduleRow}>
        <View>
          <Text style={styles.kicker}>MODULE</Text>
          <Text testID="hud-module-label" style={styles.module}>
            {active.label}
          </Text>
        </View>
        <View style={styles.sessionCol}>
          <Text style={styles.kicker}>SESSION</Text>
          <Text style={styles.session}>TRADER.EI</Text>
        </View>
      </View>
    </View>
  );
}

interface StatusStripStyles {
  wrap: ViewStyle;
  telemetry: ViewStyle;
  conn: TextStyle;
  cell: TextStyle;
  moduleRow: ViewStyle;
  kicker: TextStyle;
  module: TextStyle;
  sessionCol: ViewStyle;
  session: TextStyle;
}

function makeStyles(t: RnTheme): StatusStripStyles {
  return StyleSheet.create({
    wrap: { backgroundColor: t.bgHeader },
    telemetry: {
      flexDirection: "row",
      justifyContent: "center",
      gap: 11,
      paddingTop: 4,
      paddingBottom: 3,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: t.borderSubtle,
    },
    conn: { color: t.accentPositive, fontFamily: t.fontMono, fontSize: 8.5, letterSpacing: 0.8 },
    cell: { color: t.textMuted, fontFamily: t.fontMono, fontSize: 8.5, letterSpacing: 0.8 },
    moduleRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      height: 60,
      paddingHorizontal: 18,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: t.border,
    },
    kicker: { color: t.textMuted, fontFamily: t.fontMono, fontSize: 8.5, letterSpacing: 2 },
    module: { color: t.accentPrimary, fontSize: 13, fontWeight: "600", letterSpacing: 1.6, marginTop: 1 },
    sessionCol: { alignItems: "flex-end" },
    session: { color: t.textSecondary, fontFamily: t.fontMono, fontSize: 10, marginTop: 2 },
  });
}
```

- [ ] **Step 4: Run the test to confirm it passes**

Run: `cd packages/client-react-native && pnpm jest src/ui/shell/hud/StatusStrip.test.tsx`
Expected: PASS (2 tests). If `toHaveTextContent` is unavailable, assert `screen.getByText("BLOTTER")` instead.

- [ ] **Step 5: Commit**

```bash
git add packages/client-react-native/src/ui/shell/hud/StatusStrip.tsx \
        packages/client-react-native/src/ui/shell/hud/StatusStrip.test.tsx
git commit -m "feat(rn-shell): HUD status strip (telemetry + route-derived MODULE label)"
```

---

### Task 6: Shell header

**Files:**
- Create: `packages/client-react-native/src/ui/shell/hud/ShellHeader.tsx`
- Test: `packages/client-react-native/src/ui/shell/hud/ShellHeader.test.tsx`

**Interfaces:**
- Consumes: `HexReticleLogo` (Task 3), `useShellMotionEnabled()` (Task 2), `useViewModel().useConnectionStatus()`, existing `AppearanceButton` (`{ onPress }`), `LockButton`, `LogoutButton`, `useTheme`/`useThemedStyles`, `useSafeAreaInsets()` (`react-native-safe-area-context`).
- Produces: `ShellHeader(props: ShellHeaderProps): JSX.Element` where `interface ShellHeaderProps { readonly simulator: boolean; readonly onToggleSimulator: (value: boolean) => void; readonly onOpenAppearance: () => void; }`. Renders (prototype `.dc.html:64-96`): safe-area spacer, `HexReticleLogo`, Orbitron wordmark `REACTIVE TRADER` (`TRADER` in accent), an env badge button (`SIM`/`LIVE`, toggles the simulator), a connection-pulse dot (`useConnectionStatus`, pulsing opacity when motion enabled), then `AppearanceButton` / `LockButton` / `LogoutButton`. `testID="hud-header"`; env badge `testID="hud-env-badge"`.

- [ ] **Step 1: Write the failing test**

Create `ShellHeader.test.tsx`. Mock child buttons + logo + ViewModel + safe-area; assert the env badge shows LIVE/SIM and toggles.

```tsx
import { expect, jest, test } from "@jest/globals";
import { fireEvent, render, screen } from "@testing-library/react-native";

jest.mock("./HexReticleLogo", () => {
  const { Text } = require("react-native");
  return { HexReticleLogo: () => <Text testID="hud-logo" /> };
});
jest.mock("./useShellMotionEnabled", () => {
  return { useShellMotionEnabled: (): boolean => true };
});
jest.mock("@rtc/react-bindings", () => {
  return { useViewModel: () => ({ useConnectionStatus: () => "CONNECTED" }) };
});
jest.mock("@rtc/domain", () => {
  return { ConnectionStatus: { CONNECTED: "CONNECTED" } };
});
jest.mock("react-native-safe-area-context", () => {
  return { useSafeAreaInsets: () => ({ top: 47, bottom: 34, left: 0, right: 0 }) };
});
jest.mock("#/ui/shell/appearance/AppearanceButton", () => {
  const { Text } = require("react-native");
  return { AppearanceButton: () => <Text>Theme</Text> };
});
jest.mock("#/ui/shell/lock/LockButton", () => {
  const { Text } = require("react-native");
  return { LockButton: () => <Text>Lock</Text> };
});
jest.mock("#/ui/shell/auth/LogoutButton", () => {
  const { Text } = require("react-native");
  return { LogoutButton: () => <Text>Sign out</Text> };
});

const { ShellHeader } = require("./ShellHeader") as {
  ShellHeader: (p: {
    simulator: boolean;
    onToggleSimulator: (v: boolean) => void;
    onOpenAppearance: () => void;
  }) => JSX.Element;
};

test("env badge reads LIVE when not in simulator mode", () => {
  render(
    <ShellHeader simulator={false} onToggleSimulator={() => {}} onOpenAppearance={() => {}} />,
  );
  expect(screen.getByTestId("hud-env-badge")).toHaveTextContent("LIVE");
});

test("tapping the env badge toggles the simulator flag", () => {
  const onToggle = jest.fn();
  render(
    <ShellHeader simulator={false} onToggleSimulator={onToggle} onOpenAppearance={() => {}} />,
  );
  fireEvent.press(screen.getByTestId("hud-env-badge"));
  expect(onToggle).toHaveBeenCalledWith(true);
});
```

- [ ] **Step 2: Run the test to confirm it fails**

Run: `cd packages/client-react-native && pnpm jest src/ui/shell/hud/ShellHeader.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the header**

Create `ShellHeader.tsx`. Env colour: `accentPositive` when LIVE, `accentAware` when SIM (prototype). Connection dot colour reuses the status→token mapping (import the same `statusConnected`/`statusDisconnected` tokens as `ConnectionBanner`). Pulse: a Reanimated opacity `withRepeat` gated by `useShellMotionEnabled()` (still at opacity 1 when disabled). Wordmark uses `fontDisplay` if that resolves to Orbitron; the app already loads Orbitron via `useAppFonts` — use `t.fontDisplay`.

```tsx
import type { JSX } from "react";
import { useEffect } from "react";
import { Pressable, StyleSheet, Text, type TextStyle, View, type ViewStyle } from "react-native";
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ConnectionStatus } from "@rtc/domain";
import { useViewModel } from "@rtc/react-bindings";

import { AppearanceButton } from "#/ui/shell/appearance/AppearanceButton";
import { LogoutButton } from "#/ui/shell/auth/LogoutButton";
import { LockButton } from "#/ui/shell/lock/LockButton";
import type { RnTheme } from "#/ui/theme/tokens";
import { useTheme } from "#/ui/theme/useTheme";
import { useThemedStyles } from "#/ui/theme/useThemedStyles";

import { HexReticleLogo } from "./HexReticleLogo";
import { useShellMotionEnabled } from "./useShellMotionEnabled";

export interface ShellHeaderProps {
  readonly simulator: boolean;
  readonly onToggleSimulator: (value: boolean) => void;
  readonly onOpenAppearance: () => void;
}

/** HUD header (prototype .dc.html:64-96): safe-area spacer, animated reticle
 * logo, Orbitron wordmark, an env badge that toggles simulator/live, a pulsing
 * connection dot (real `useConnectionStatus`), and the appearance/lock/logout
 * affordances. The pulse loop is gated by `useShellMotionEnabled()`. */
export function ShellHeader({
  simulator,
  onToggleSimulator,
  onOpenAppearance,
}: ShellHeaderProps): JSX.Element {
  const t = useTheme();
  const styles = useThemedStyles(makeStyles);
  const insets = useSafeAreaInsets();
  const enabled = useShellMotionEnabled();
  const { useConnectionStatus } = useViewModel();
  const status = useConnectionStatus();
  const connected = status === ConnectionStatus.CONNECTED;
  const pulse = useSharedValue(1);

  useEffect(() => {
    if (!enabled) {
      cancelAnimation(pulse);
      pulse.value = 1;
      return;
    }
    pulse.value = withRepeat(withTiming(0.35, { duration: 1200 }), -1, true);
    return () => {
      cancelAnimation(pulse);
    };
  }, [enabled, pulse]);

  const dotStyle = useAnimatedStyle(() => {
    return { opacity: pulse.value };
  });
  const envColor = simulator ? t.accentAware : t.accentPositive;
  const connColor = connected ? t.statusConnected : t.statusDisconnected;

  return (
    <View testID="hud-header" style={[styles.header, { paddingTop: insets.top }]}>
      <View style={styles.left}>
        <HexReticleLogo />
        <Text style={styles.wordmark}>
          REACTIVE<Text style={styles.wordmarkAccent}> TRADER</Text>
        </Text>
        <Pressable
          testID="hud-env-badge"
          accessibilityLabel="Toggle simulator"
          onPress={() => {
            onToggleSimulator(!simulator);
          }}
          style={[styles.envBadge, { borderColor: envColor }]}
        >
          <Text style={[styles.envLabel, { color: envColor }]}>
            {simulator ? "SIM" : "LIVE"}
          </Text>
        </Pressable>
      </View>
      <View style={styles.right}>
        <Animated.View
          testID="hud-conn-dot"
          style={[styles.dot, { backgroundColor: connColor }, dotStyle]}
        />
        <AppearanceButton onPress={onOpenAppearance} />
        <LockButton />
        <LogoutButton />
      </View>
    </View>
  );
}

interface ShellHeaderStyles {
  header: ViewStyle;
  left: ViewStyle;
  right: ViewStyle;
  wordmark: TextStyle;
  wordmarkAccent: TextStyle;
  envBadge: ViewStyle;
  envLabel: TextStyle;
  dot: ViewStyle;
}

function makeStyles(t: RnTheme): ShellHeaderStyles {
  return StyleSheet.create({
    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 12,
      paddingBottom: 0,
      backgroundColor: t.bgHeader,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: t.borderSubtle,
    },
    left: { flexDirection: "row", alignItems: "center", gap: 9, minWidth: 0, height: 52 },
    right: { flexDirection: "row", alignItems: "center", gap: 6 },
    wordmark: { color: t.textPrimary, fontFamily: t.fontDisplay, fontSize: 11, fontWeight: "700", letterSpacing: 2.2 },
    wordmarkAccent: { color: t.accentPrimary },
    envBadge: { borderWidth: 1, borderRadius: 4, paddingHorizontal: 8, paddingVertical: 3 },
    envLabel: { fontFamily: t.fontMono, fontSize: 9, fontWeight: "600", letterSpacing: 1 },
    dot: { width: 7, height: 7, borderRadius: 4, marginHorizontal: 8 },
  });
}
```

- [ ] **Step 4: Run the test to confirm it passes**

Run: `cd packages/client-react-native && pnpm jest src/ui/shell/hud/ShellHeader.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/client-react-native/src/ui/shell/hud/ShellHeader.tsx \
        packages/client-react-native/src/ui/shell/hud/ShellHeader.test.tsx
git commit -m "feat(rn-shell): HUD header (logo + wordmark + env badge + conn pulse)"
```

---

### Task 7: Radial command dock

**Files:**
- Create: `packages/client-react-native/src/ui/shell/hud/RadialCommandDock.tsx`
- Test: `packages/client-react-native/src/ui/shell/hud/RadialCommandDock.test.tsx`

**Interfaces:**
- Consumes: `MODULE_ROUTES` + `radialDockLayout` (Task 1), `useShellMotionEnabled()` (Task 2), `useRouter()` + `usePathname()` (`expo-router`), `BlurView` (`expo-blur`), `useTheme`/`useThemedStyles`.
- Produces: `RadialCommandDock(): JSX.Element` — a bottom-centre hex FAB (58px, SVG hexagon fill = accent→accent2, glyph = active module's, or `✕` when open) that toggles `dockOpen`; when open, an `expo-blur` scrim + 5 satellites fanned via `radialDockLayout(5)`, each a `Pressable` (≥44px target) that `router.navigate(path)` and closes. Satellites spring in with `withDelay(i*45, withSpring())` on translate/scale when motion enabled, else appear instantly. `testID="hud-dock-fab"`; scrim `testID="hud-dock-scrim"`; each satellite `testID={`hud-dock-sat-${key}`}`.

- [ ] **Step 1: Write the failing test**

Create `RadialCommandDock.test.tsx`. Mock router + expo-blur + reanimated (identity animated components) + gate. Assert: closed → no satellites; tap FAB → 5 satellites; tap a satellite → `router.navigate` with its path + dock closes.

```tsx
import { expect, jest, test } from "@jest/globals";
import { fireEvent, render, screen } from "@testing-library/react-native";

const navigate = jest.fn();
jest.mock("expo-router", () => {
  return { useRouter: () => ({ navigate }), usePathname: () => "/" };
});
jest.mock("expo-blur", () => {
  const { View } = require("react-native");
  return { BlurView: (p: Record<string, unknown>) => <View {...p} /> };
});
jest.mock("./useShellMotionEnabled", () => {
  return { useShellMotionEnabled: (): boolean => false };
});

const { RadialCommandDock } = require("./RadialCommandDock") as {
  RadialCommandDock: () => JSX.Element;
};

test("is collapsed until the FAB is pressed", () => {
  render(<RadialCommandDock />);
  expect(screen.queryByTestId("hud-dock-sat-blotter")).toBeNull();
});

test("fans out 5 satellites when opened", () => {
  render(<RadialCommandDock />);
  fireEvent.press(screen.getByTestId("hud-dock-fab"));
  expect(screen.getByTestId("hud-dock-sat-rates")).toBeTruthy();
  expect(screen.getByTestId("hud-dock-sat-equities")).toBeTruthy();
});

test("selecting a satellite navigates to its route and closes", () => {
  render(<RadialCommandDock />);
  fireEvent.press(screen.getByTestId("hud-dock-fab"));
  fireEvent.press(screen.getByTestId("hud-dock-sat-credit"));
  expect(navigate).toHaveBeenCalledWith("/credit");
  expect(screen.queryByTestId("hud-dock-sat-credit")).toBeNull();
});
```

- [ ] **Step 2: Run the test to confirm it fails**

Run: `cd packages/client-react-native && pnpm jest src/ui/shell/hud/RadialCommandDock.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the dock**

Create `RadialCommandDock.tsx`. Keep the satellite as an `Animated.View` whose entering transform is driven by a per-satellite shared value animated in an effect (`withDelay(delayMs, withSpring(1))` when enabled, else set to 1 instantly). The FAB is an SVG hexagon (`Polygon` points from the prototype clip-path scaled to 58) filled with a `LinearGradient` accent→accent2. Use `router.navigate` (URL swap; the shell `<Slot/>` re-renders the target — no stack push). Active satellite gets the accent highlight (prototype `navSats` active branch). ≥44px touch targets.

```tsx
import type { JSX } from "react";
import { useEffect } from "react";
import { Pressable, StyleSheet, Text, type TextStyle, View, type ViewStyle } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSpring,
} from "react-native-reanimated";
import Svg, { Defs, LinearGradient, Polygon, Stop } from "react-native-svg";

import { BlurView } from "expo-blur";
import { usePathname, useRouter } from "expo-router";

import type { RnTheme } from "#/ui/theme/tokens";
import { useTheme } from "#/ui/theme/useTheme";
import { useThemedStyles } from "#/ui/theme/useThemedStyles";

import { MODULE_ROUTES } from "./moduleRoutes";
import { radialDockLayout } from "./radialDockLayout";
import { useShellMotionEnabled } from "./useShellMotionEnabled";

const FAB = 58;
const HEX_POINTS = "29,0 54,14.5 54,43.5 29,58 4,43.5 4,14.5";

/** Router-backed radial command dock (prototype .dc.html:465-484). A hex FAB
 * toggles a blurred scrim over which 5 module satellites fan out on the
 * `radialDockLayout` arc, each spring-staggered when motion is enabled and
 * instant under Freeze/reduced-motion. Selecting a satellite drives
 * `expo-router` (deep-link-compatible) and collapses the dock. */
export function RadialCommandDock(): JSX.Element {
  const styles = useThemedStyles(makeStyles);
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const pathname = usePathname();
  const sats = radialDockLayout(MODULE_ROUTES.length);

  return (
    <View pointerEvents="box-none" style={styles.root}>
      {open ? (
        <>
          <Pressable
            testID="hud-dock-scrim"
            accessibilityLabel="Close command dock"
            onPress={() => {
              setOpen(false);
            }}
            style={StyleSheet.absoluteFill}
          >
            <BlurView intensity={18} style={StyleSheet.absoluteFill} />
          </Pressable>
          {MODULE_ROUTES.map((mod, i) => {
            return (
              <Satellite
                key={mod.key}
                index={i}
                module={mod}
                layout={sats[i]}
                active={mod.path === pathname}
                onSelect={() => {
                  router.navigate(mod.path);
                  setOpen(false);
                }}
              />
            );
          })}
        </>
      ) : null}
      <Pressable
        testID="hud-dock-fab"
        accessibilityLabel="Command dock"
        onPress={() => {
          setOpen((v) => !v);
        }}
        style={styles.fab}
      >
        <FabHex />
      </Pressable>
    </View>
  );
}

interface FabHexProps {
  readonly glyph?: string;
}

/** The hex FAB face — an accent→accent2 gradient hexagon (SVG). */
function FabHex(): JSX.Element {
  const t = useTheme();
  return (
    <Svg width={FAB} height={FAB} viewBox="0 0 58 58">
      <Defs>
        <LinearGradient id="fabHex" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={t.accentPrimary} />
          <Stop offset="1" stopColor={t.accent2} />
        </LinearGradient>
      </Defs>
      <Polygon points={HEX_POINTS} fill="url(#fabHex)" />
    </Svg>
  );
}

interface SatelliteProps {
  readonly index: number;
  readonly module: (typeof MODULE_ROUTES)[number];
  readonly layout: { readonly tx: number; readonly ty: number; readonly delayMs: number };
  readonly active: boolean;
  readonly onSelect: () => void;
}

/** One fan-out satellite. Springs from the FAB centre to its resting offset
 * (staggered) when motion is enabled; snaps into place instantly otherwise. */
function Satellite({ index, module, layout, active, onSelect }: SatelliteProps): JSX.Element {
  const styles = useThemedStyles(makeStyles);
  const t = useTheme();
  const enabled = useShellMotionEnabled();
  const progress = useSharedValue(enabled ? 0 : 1);

  useEffect(() => {
    if (!enabled) {
      progress.value = 1;
      return;
    }
    progress.value = withDelay(layout.delayMs, withSpring(1, { damping: 12, stiffness: 140 }));
  }, [enabled, layout.delayMs, progress]);

  const animStyle = useAnimatedStyle(() => {
    return {
      opacity: progress.value,
      transform: [
        { translateX: layout.tx * progress.value },
        { translateY: layout.ty * progress.value },
        { scale: 0.25 + 0.75 * progress.value },
      ],
    };
  });

  return (
    <Animated.View style={[styles.satelliteAnchor, animStyle]} pointerEvents="box-none">
      <Pressable
        testID={`hud-dock-sat-${module.key}`}
        accessibilityLabel={module.label}
        onPress={onSelect}
        style={styles.satelliteHit}
      >
        <View style={[styles.satelliteIcon, active ? { borderColor: t.accentPrimary, backgroundColor: t.accentPrimary } : null]}>
          <Text style={[styles.satelliteGlyph, active ? { color: t.textOnAccent } : null]}>{module.glyph}</Text>
        </View>
        <Text style={[styles.satelliteLabel, active ? { color: t.accentPrimary } : null]}>{module.label}</Text>
      </Pressable>
    </Animated.View>
  );
}

interface RadialDockStyles {
  root: ViewStyle;
  fab: ViewStyle;
  satelliteAnchor: ViewStyle;
  satelliteHit: ViewStyle;
  satelliteIcon: ViewStyle;
  satelliteGlyph: TextStyle;
  satelliteLabel: TextStyle;
}

function makeStyles(t: RnTheme): RadialDockStyles {
  return StyleSheet.create({
    root: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "flex-end" },
    fab: {
      position: "absolute",
      bottom: 26,
      alignSelf: "center",
      width: FAB,
      height: FAB,
      alignItems: "center",
      justifyContent: "center",
    },
    satelliteAnchor: { position: "absolute", bottom: 78, alignSelf: "center" },
    satelliteHit: { width: 58, minHeight: 74, alignItems: "center", justifyContent: "center", gap: 5 },
    satelliteIcon: {
      width: 52,
      height: 52,
      borderRadius: 26,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 1,
      borderColor: t.border,
      backgroundColor: t.panel,
    },
    satelliteGlyph: { color: t.textSecondary, fontSize: 19 },
    satelliteLabel: { color: t.textMuted, fontFamily: t.fontMono, fontSize: 8, letterSpacing: 1.4 },
  });
}
```

> **Implementer note:** add the missing `import { useState } from "react";` at the top (the FAB toggles local `open` state). Keep newspaper-order: `FabHex`/`Satellite`/`makeStyles` and the `interface`s are declared below `RadialCommandDock` — if `no-use-before-define` / `rtc/newspaper-order` objects to the helper components being referenced above their declaration, hoist only what the rule requires and note it. Verify `t.panel` (translucent) reads acceptably behind the `BlurView`; the prototype pairs `panel` with blur.

- [ ] **Step 4: Run the test to confirm it passes**

Run: `cd packages/client-react-native && pnpm jest src/ui/shell/hud/RadialCommandDock.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/client-react-native/src/ui/shell/hud/RadialCommandDock.tsx \
        packages/client-react-native/src/ui/shell/hud/RadialCommandDock.test.tsx
git commit -m "feat(rn-shell): router-backed radial command dock (hex FAB + 5 satellites)"
```

---

### Task 8: Shell restructure — swap tabs for HUD chrome

**Files:**
- Modify: `packages/client-react-native/app/(app)/_layout.tsx`
- Modify: `packages/client-react-native/app/(app)/_layout.test.tsx`

**Interfaces:**
- Consumes: `ShellHeader` (Task 6), `StatusStrip` (Task 5), `RadialCommandDock` (Task 7), `Slot` (`expo-router`). Retains: `AppRoot`, `ThemeProvider`, `AuthGate`, `BootGate`, `AmbientBackground`, `ConnectionBanner`, `AppearanceOverlay`, `LockScreen`, `MotionProbe`, the `AsyncStorageSessionStore` hydration, the `simulator` state.
- Produces: the persistent HUD shell. The `Chrome` component renders `AmbientBackground` (backmost) → `ShellHeader` → `ConnectionBanner` (kept: the only Reconnect recovery path) → `<Slot/>` (active route) → `StatusStrip` → `RadialCommandDock` → `AppearanceOverlay` + `LockScreen`. Deletes the `<Tabs>` navigator, the toolbar `<Switch>`/wordmark, and the `tabIcon` factory.

- [ ] **Step 1: Migrate the shell test first (red)**

Rewrite the assertion focus of `app/(app)/_layout.test.tsx`. The existing mount smoke still pins `useAppFonts` false and asserts the `fonts-loading` fallback — keep that (it doesn't touch the new chrome). Add nothing that requires an expo-router context (the fallback returns before `AppRoot`/`Slot` mount). The migration is: confirm the test still describes the app-group layout and passes unchanged against the rewritten `_layout.tsx`. If the current test references `Tabs` indirectly via a mock, drop that mock.

Run first to see it pass against the OLD file, then after Step 2 it must still pass:
Run: `cd packages/client-react-native && pnpm jest "app/(app)/_layout.test.tsx"`
Expected (pre-change): PASS.

- [ ] **Step 2: Rewrite `_layout.tsx`**

Replace the `Chrome` body and imports. The outer `AppGroupLayout` (fonts + session hydration + `AppRoot`/`ThemeProvider`/`AuthGate`/`BootGate` wiring) is unchanged except the toolbar is gone. New `Chrome`:

```tsx
import { Slot } from "expo-router";
import type { JSX } from "react";
import { useState } from "react";
import { StyleSheet, View, type ViewStyle } from "react-native";

import { AmbientBackground } from "#/ui/ambient/AmbientBackground";
import { ConnectionBanner } from "#/ui/ConnectionBanner";
import { AppearanceOverlay } from "#/ui/shell/appearance/AppearanceOverlay";
import { RadialCommandDock } from "#/ui/shell/hud/RadialCommandDock";
import { ShellHeader } from "#/ui/shell/hud/ShellHeader";
import { StatusStrip } from "#/ui/shell/hud/StatusStrip";
import { LockScreen } from "#/ui/shell/lock/LockScreen";
import type { RnTheme } from "#/ui/theme/tokens";
import { useThemedStyles } from "#/ui/theme/useThemedStyles";

interface ChromeProps {
  readonly simulator: boolean;
  readonly onToggle: (value: boolean) => void;
}

/** The persistent HUD shell inside the providers: ambient background (backmost)
 * → HUD header → connection banner (the sole Reconnect recovery path) → the
 * active route (`<Slot/>`, driven by the dock and deep links) → status strip →
 * radial command dock, with the appearance sheet and lock screen as overlays.
 * Replaces the former tab navigator; the file routes under `app/(app)/` are
 * unchanged so deep links still resolve. */
function Chrome({ simulator, onToggle }: ChromeProps): JSX.Element {
  const styles = useThemedStyles(makeStyles);
  const [appearanceOpen, setAppearanceOpen] = useState(false);

  return (
    <View style={styles.fill}>
      <AmbientBackground />
      <ShellHeader
        simulator={simulator}
        onToggleSimulator={onToggle}
        onOpenAppearance={() => {
          setAppearanceOpen(true);
        }}
      />
      <ConnectionBanner />
      <View style={styles.body}>
        <Slot />
      </View>
      <StatusStrip />
      <RadialCommandDock />
      <AppearanceOverlay
        open={appearanceOpen}
        onClose={() => {
          setAppearanceOpen(false);
        }}
      />
      <LockScreen />
    </View>
  );
}

interface ChromeStyles {
  fill: ViewStyle;
  body: ViewStyle;
}

function makeStyles(t: RnTheme): ChromeStyles {
  return StyleSheet.create({
    fill: { flex: 1, backgroundColor: t.bgPrimary },
    body: { flex: 1, minHeight: 0 },
  });
}
```

Delete from the file: the `Tabs` import, the `Switch`/`Text`/`ColorValue`/`TextStyle` imports only used by the old toolbar (keep what `AppGroupLayout` still needs), the `tabIcon` factory + `TabIconProps`, and the old `ChromeStyles` toolbar members (`toolbar`, `toolbarRight`, `wordmark`, `simLabel`). Keep `SafeAreaView`/`GestureHandlerRootView` usage in `AppGroupLayout` exactly as-is (the header now owns its own safe-area top inset, but the outer `SafeAreaView` is retained — verify no double top-inset; if the header's `insets.top` double-pads under `SafeAreaView`, switch the outer wrapper to a plain `View` and note it).

The `AppGroupLayout` default export, the fonts/session gating, and the `AppRoot`/`ThemeProvider`/`AuthGate`/`BootGate` tree stay. Update the `Chrome` invocation inside `AuthGate` — it already passes `simulator`/`onToggle`, unchanged.

- [ ] **Step 3: Run the migrated shell test**

Run: `cd packages/client-react-native && pnpm jest "app/(app)/_layout.test.tsx"`
Expected: PASS (the fonts-loading fallback still renders before the chrome mounts).

- [ ] **Step 4: Full package gauntlet**

Run:
```bash
cd packages/client-react-native
pnpm typecheck
pnpm test        # vitest + jest, whole package
cd ../..
pnpm --filter @rtc/client-react-native lint   # or: eslint packages/client-react-native --no-cache
pnpm biome ci packages/client-react-native
pnpm knip
```
Expected: all green. Fix any newspaper-order / no-restricted-syntax / padding-line / import-sort findings the new files trip (run `eslint … --fix` and `biome check --write` where safe). `knip` must show no new unused exports — every new module is imported by `_layout.tsx` or a sibling.

- [ ] **Step 5: Commit**

```bash
git add "packages/client-react-native/app/(app)/_layout.tsx" \
        "packages/client-react-native/app/(app)/_layout.test.tsx"
git commit -m "feat(rn-shell): swap tab navigator for HUD chrome + radial dock"
```

---

### Task 9 (on-device follow-up, NOT in the code PR): shell visual golden + sign-off

**This task is gated on the iOS simulator and the user's go/no-go — it is not executed by an implementer subagent.** It is recorded here so the phase's exit gate is traceable.

- Run the app on the iPhone-17 sim (`ios-iphone17-26`) from a **fresh-install** worktree Metro (never the primary's node_modules until clean-reinstalled), per `reference_rn_on_device_sim_automation`.
- Verify the exit gate manually: navigation reaches all 5 modules via the dock; deep links (`rtcmobile://blotter`, etc.) still resolve; reduced-motion / Freeze still the reticle + pulse + dock spring.
- Add a `shell` visual scenario capturing the new chrome (dock closed) and a dock-open state; wire a `ShellTelemetryContext` frozen provider in `VisualScenarioHost` so the FPS readout is deterministic. Pin simctl + Maestro goldens.
- Update `docs/STATUS.md` (Phase 3 done; Phase 4 next) via the `tracking-workstream-status` skill, and the mobile-client memory.

---

## Self-Review

**Spec coverage (§5 Phase 3):**
- "Animated hex-reticle logo (RN SVG + Reanimated rotation loops)" → Task 3. ✓
- "env badge, connection pulse, telemetry (latency/FPS/clock) from real perf/connection signals" → Tasks 4 (FPS live from real frame signal; latency/clock decorative per the web reference design), 5, 6. ✓ (Note: latency/clock are decorative-static, matching the merged web `CosmeticMetrics` design; FPS is the live signal. If the user wants live latency from `useLatencySamples()`, that's a Task-4 swap — flagged.)
- "Radial command dock replaces tab nav: hex FAB fans out 5 satellites over an expo-blur scrim, per-satellite spring stagger, ≥44px targets" → Task 7. ✓
- "Router-backed (the dock drives expo-router) so deep links and the existing route structure survive" → Tasks 7 + 8 (`<Slot/>` + `router.navigate`, routes unchanged). ✓
- "navigation reaches all 5 modules via the dock; deep links still resolve; shell baseline pinned" → Tasks 7/8 (nav) + Task 9 (deep-link verify + baseline pin, on-device). ✓

**Cross-cutting (§4):** motion gates (Task 2 consumed by 3/6/7), transform/opacity-only, no data-seam change, dumb-UI, no new deps, test-runner split honored (`.test.ts` vitest for the pure fn, `.test.tsx` jest elsewhere). ✓

**Placeholder scan:** every code step carries full code; no TBD/"handle edge cases". ✓

**Type consistency:** `ModuleRoute`/`SatelliteLayout`/`FrozenTelemetry`/`ShellTelemetry`/`ShellHeaderProps` names are used identically across producing/consuming tasks; `radialDockLayout(count)` signature matches its two callers (`RadialCommandDock`, `StatusStrip` uses `MODULE_ROUTES` not the layout). ✓

**Known implementer risks (flagged inline):** RN-SVG group rotation origin (Task 3), reanimated worklet capturing a plain object (Task 4), `MetricTone` export path (Task 4), `no-use-before-define` on helper components (Task 7), double top-inset under `SafeAreaView` (Task 8). Each has a concrete fallback in its note.
