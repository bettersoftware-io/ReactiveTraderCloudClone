# Phase 6 — RN Shell Chrome (boot / lock) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring the web client's boot-sequence splash and session-lock overlay to `@rtc/client-react-native` as RN leaves, reusing the framework-neutral `BootSequenceMachine` / `SessionPresenter` seams unchanged.

**Architecture:** A pure-View phase. The boot/lock *state* already exists in `client-core` and is already bound in `react-bindings` (`useBootSequence(onDone)`, `useSession()`); this phase adds only RN paint (`react-native-svg` emblem + `StyleSheet` leaves) plus shell wiring in `app/_layout.tsx`. The web boot `<canvas>` is Expo-Go-incompatible and is **not** ported — an SVG emblem replaces it; the reused machine still drives the progress ramp, skip, and variant cycling.

**Tech Stack:** React Native + Expo, `react-native-svg` (`15.15.3`, already a dep), RN `Animated` + `AccessibilityInfo`, jest-expo + RNTL 14 (`.test.tsx`), vitest node island (`.test.ts`).

## Global Constraints

- **Pure View — zero changes** to `packages/domain`, `packages/client-core`, `packages/react-bindings`, or `packages/client-react` (the web client). All work is inside `packages/client-react-native`.
- **Reuse the seams verbatim:** `useBootSequence(onDone)` → `{ state: { variant, progress, done }, skip }`; `useSession()` → `{ state: { locked, user }, lock, unlock }`. Do not add or modify ViewModel methods.
- **Expo-Go-safe:** boot graphic is a `react-native-svg` emblem. **No** canvas, `react-native-skia`, or `expo-gl`.
- **`LockScreen` is an absolute-fill `<View>`, NOT an RN `Modal`** — an RN `Modal` opened via a press segfaults under x86 jest.
- **`makeStyles` is a `function` declaration** (not an arrow) with an **explicit named return-type interface** (`XxxStyles`). No inline object *types* in parameter or return position (`no-restricted-syntax` bans `TSTypeLiteral` there). Component props use a named `XxxProps` interface.
- **Pure-TS units stay `react-native`-free** so they run under the vitest node island. `src/app/bootSplashGate.ts` imports no `react-native`.
- **RNTL 14: `render` / `renderHook` / `fireEvent.press` are async — `await` every one.** The typed ESLint config's `no-floating-promises` enforces it. Floating promises elsewhere (e.g. `AccessibilityInfo.isReduceMotionEnabled().then(...)`) must be `void`-prefixed.
- **Test island split:** component tests are `.test.tsx` under jest-expo (import from `@jest/globals`); pure-TS tests are `.test.ts` under vitest (import from `vitest`).
- **Copy strings (verbatim):** wordmark `REACTIVE TRADER`; boot subtitle `TACTICAL TRADING OPERATING SYSTEM · v4.0`; skip `SKIP ▸`; variant tag `SEQUENCE · <VARIANT-UPPERCASE>`; lock title `SESSION LOCKED`; lock subtitle `REACTIVE TRADER OS · <user.id>`; authenticate `AUTHENTICATE ▸`; biometric `BIOMETRIC · ENCRYPTED CHANNEL`. The `·` is U+00B7 and `▸` is U+25B8 — paste the glyphs, never a `\uXXXX` escape (bare escapes render literally in JSX text).
- **Commit footer** on every commit:
  ```
  Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01W6UUmSH8EUJui4ZZrF7BMb
  ```
- **Env note:** the worktree has `node_modules` installed and `@rtc/{domain,shared,client-core,react-bindings}` prebuilt to `dist/` (jest maps `@rtc/*` → `dist`). If a jest run reports `Cannot find module '@rtc/...'`, rebuild them: `pnpm --filter @rtc/domain --filter @rtc/shared --filter @rtc/client-core --filter @rtc/react-bindings build`.
- **Commands run from the repo root** unless stated. Single-file test commands:
  - jest (one file): `pnpm --filter @rtc/client-react-native exec jest <path>`
  - vitest (one file): `pnpm --filter @rtc/client-react-native exec vitest run <path>`
  - typecheck: `pnpm --filter @rtc/client-react-native typecheck`

---

### Task 1: Boot splash content — `BootEmblem` + `BootSequence`

**Files:**
- Create: `packages/client-react-native/src/ui/shell/boot/BootEmblem.tsx`
- Create: `packages/client-react-native/src/ui/shell/boot/BootEmblem.test.tsx`
- Create: `packages/client-react-native/src/ui/shell/boot/BootSequence.tsx`
- Create: `packages/client-react-native/src/ui/shell/boot/BootSequence.test.tsx`

**Interfaces:**
- Consumes: `useViewModel().useBootSequence(onDone: () => void)` → `{ state: { variant: "core"|"laser"|"docking", progress: number, done: boolean }, skip: () => void }`. Theme via `useTheme()` / `useThemedStyles(make)`. Test render via `renderWithTheme(ui, theme?)` (default `rnThemeTokens.holo.dark`) and `ViewModelProvider` from `@rtc/react-bindings`.
- Produces: `BootEmblem` (no props); `BootSequence` with `interface BootSequenceProps { onDone: () => void }`. testIDs: `boot-emblem`, `boot-sequence`, `boot-wordmark`, `boot-variant`, `boot-progress`, `boot-pct`, `boot-skip`.

- [ ] **Step 1: Write the failing `BootEmblem` test**

`packages/client-react-native/src/ui/shell/boot/BootEmblem.test.tsx`:
```tsx
import { expect, jest, test } from "@jest/globals";
import { AccessibilityInfo } from "react-native";
import { screen } from "@testing-library/react-native";

import { BootEmblem } from "#/ui/shell/boot/BootEmblem";
import { renderWithTheme } from "#/ui/theme/renderWithTheme";

test("renders the emblem svg (static under reduce-motion)", async () => {
  jest.spyOn(AccessibilityInfo, "isReduceMotionEnabled").mockResolvedValue(true);
  await renderWithTheme(<BootEmblem />);
  expect(screen.getByTestId("boot-emblem")).toBeTruthy();
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @rtc/client-react-native exec jest src/ui/shell/boot/BootEmblem.test.tsx`
Expected: FAIL — `Cannot find module '#/ui/shell/boot/BootEmblem'`.

- [ ] **Step 3: Implement `BootEmblem`**

`packages/client-react-native/src/ui/shell/boot/BootEmblem.tsx`:
```tsx
import type { JSX } from "react";
import { useEffect, useRef } from "react";
import {
  AccessibilityInfo,
  Animated,
  StyleSheet,
  type ViewStyle,
} from "react-native";
import Svg, { Circle, Polygon } from "react-native-svg";

import { useTheme } from "#/ui/theme/useTheme";

const SIZE = 96;

/** Boot splash emblem: a themed hex badge with a gently pulsing core. Pure
 * cosmetic — the react-native-svg stand-in for the web boot <canvas>, which is
 * Expo-Go-incompatible. The pulse is disabled under reduce-motion. */
export function BootEmblem(): JSX.Element {
  const theme = useTheme();
  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    let cancelled = false;
    let loop: Animated.CompositeAnimation | undefined;
    void AccessibilityInfo.isReduceMotionEnabled().then((reduce) => {
      if (cancelled || reduce) return;
      loop = Animated.loop(
        Animated.sequence([
          Animated.timing(pulse, {
            toValue: 0.4,
            duration: 900,
            useNativeDriver: true,
          }),
          Animated.timing(pulse, {
            toValue: 1,
            duration: 900,
            useNativeDriver: true,
          }),
        ]),
      );
      loop.start();
    });
    return () => {
      cancelled = true;
      loop?.stop();
    };
  }, [pulse]);

  return (
    <Animated.View
      testID="boot-emblem"
      style={[styles.wrap, { opacity: pulse }]}
    >
      <Svg width={SIZE} height={SIZE} viewBox="0 0 48 48">
        <Polygon
          points="24,3 40.6,13.5 40.6,34.5 24,45 7.4,34.5 7.4,13.5"
          fill="none"
          stroke={theme.accentPrimary}
          strokeWidth={1.3}
        />
        <Polygon
          points="24,8 36.3,15.75 36.3,31.25 24,39 11.7,31.25 11.7,15.75"
          fill="none"
          stroke={theme.accent2}
          strokeWidth={1}
          opacity={0.6}
        />
        <Circle cx={24} cy={24} r={3.4} fill={theme.accentPrimary} />
      </Svg>
    </Animated.View>
  );
}

interface BootEmblemStyles {
  wrap: ViewStyle;
}

const styles: BootEmblemStyles = StyleSheet.create({
  wrap: { alignItems: "center", justifyContent: "center" },
});
```

- [ ] **Step 4: Run the `BootEmblem` test — expect PASS**

Run: `pnpm --filter @rtc/client-react-native exec jest src/ui/shell/boot/BootEmblem.test.tsx`
Expected: PASS (1 test).

- [ ] **Step 5: Write the failing `BootSequence` test**

`packages/client-react-native/src/ui/shell/boot/BootSequence.test.tsx`:
```tsx
import { expect, jest, test } from "@jest/globals";
import { AccessibilityInfo } from "react-native";
import { fireEvent, screen } from "@testing-library/react-native";

import type { ViewModel } from "@rtc/react-bindings";
import { ViewModelProvider } from "@rtc/react-bindings";

import { BootSequence } from "#/ui/shell/boot/BootSequence";
import { renderWithTheme } from "#/ui/theme/renderWithTheme";

interface BootState {
  variant: "core" | "laser" | "docking";
  progress: number;
  done: boolean;
}

function fakeViewModel(state: BootState, skip: () => void): ViewModel {
  return {
    useBootSequence: (_onDone: () => void) => {
      return { state, skip };
    },
  } as unknown as ViewModel;
}

const noop = (): void => {
  return undefined;
};

test("renders wordmark, variant tag and progress percent", async () => {
  jest.spyOn(AccessibilityInfo, "isReduceMotionEnabled").mockResolvedValue(true);
  await renderWithTheme(
    <ViewModelProvider
      viewModel={fakeViewModel(
        { variant: "laser", progress: 42, done: false },
        noop,
      )}
    >
      <BootSequence onDone={noop} />
    </ViewModelProvider>,
  );
  expect(screen.getByTestId("boot-wordmark")).toBeTruthy();
  expect(screen.getByTestId("boot-variant").props.children).toEqual([
    "SEQUENCE · ",
    "LASER",
  ]);
  expect(screen.getByTestId("boot-pct").props.children).toEqual([42, "%"]);
});

test("SKIP press dispatches the skip intent", async () => {
  jest.spyOn(AccessibilityInfo, "isReduceMotionEnabled").mockResolvedValue(true);
  const skip = jest.fn();
  await renderWithTheme(
    <ViewModelProvider
      viewModel={fakeViewModel(
        { variant: "core", progress: 10, done: false },
        skip,
      )}
    >
      <BootSequence onDone={noop} />
    </ViewModelProvider>,
  );
  await fireEvent.press(screen.getByTestId("boot-skip"));
  expect(skip).toHaveBeenCalledTimes(1);
});
```

Note on the assertions: JSX text with an interpolation renders as a children *array* (`["SEQUENCE · ", "LASER"]`, `[42, "%"]`) — asserting the array is more discriminating than a substring match and pins the exact copy + variant mapping.

- [ ] **Step 6: Run it to verify it fails**

Run: `pnpm --filter @rtc/client-react-native exec jest src/ui/shell/boot/BootSequence.test.tsx`
Expected: FAIL — `Cannot find module '#/ui/shell/boot/BootSequence'`.

- [ ] **Step 7: Implement `BootSequence`**

`packages/client-react-native/src/ui/shell/boot/BootSequence.tsx`:
```tsx
import type { JSX } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  type TextStyle,
  View,
  type ViewStyle,
} from "react-native";

import { useViewModel } from "@rtc/react-bindings";

import { BootEmblem } from "#/ui/shell/boot/BootEmblem";
import type { RnTheme } from "#/ui/theme/tokens";
import { useThemedStyles } from "#/ui/theme/useThemedStyles";

interface BootSequenceProps {
  onDone: () => void;
}

/** Boot splash content: emblem + wordmark + progress ramp + SKIP. All timing
 * (progress, done, variant) comes from the reused BootSequenceMachine via
 * `useBootSequence(onDone)`; this leaf only paints it and dispatches `skip`.
 * `onDone` is passed straight through to the machine (which invokes it when the
 * ramp completes or SKIP is pressed) — BootSequence never calls it directly. */
export function BootSequence({ onDone }: BootSequenceProps): JSX.Element {
  const { useBootSequence } = useViewModel();
  const { state, skip } = useBootSequence(onDone);
  const styles = useThemedStyles(makeStyles);

  return (
    <View testID="boot-sequence" style={styles.root}>
      <BootEmblem />
      <Text testID="boot-wordmark" style={styles.wordmark}>
        REACTIVE TRADER
      </Text>
      <Text style={styles.subtitle}>
        TACTICAL TRADING OPERATING SYSTEM · v4.0
      </Text>
      <Text testID="boot-variant" style={styles.variant}>
        SEQUENCE · {state.variant.toUpperCase()}
      </Text>
      <View testID="boot-progress" style={styles.progressRow}>
        <View style={styles.track}>
          <View style={[styles.fill, { width: `${state.progress}%` }]} />
        </View>
        <Text testID="boot-pct" style={styles.pct}>
          {state.progress}%
        </Text>
      </View>
      <Pressable
        testID="boot-skip"
        onPress={() => {
          skip();
        }}
      >
        <Text style={styles.skip}>SKIP ▸</Text>
      </Pressable>
    </View>
  );
}

interface BootSequenceStyles {
  root: ViewStyle;
  wordmark: TextStyle;
  subtitle: TextStyle;
  variant: TextStyle;
  progressRow: ViewStyle;
  track: ViewStyle;
  fill: ViewStyle;
  pct: TextStyle;
  skip: TextStyle;
}

function makeStyles(t: RnTheme): BootSequenceStyles {
  return StyleSheet.create({
    root: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      gap: 12,
      backgroundColor: t.bgPrimary,
    },
    wordmark: {
      color: t.textPrimary,
      fontFamily: t.fontDisplay,
      fontSize: 26,
      letterSpacing: 4,
    },
    subtitle: {
      color: t.textMuted,
      fontFamily: t.fontMono,
      fontSize: 11,
      letterSpacing: 1,
    },
    variant: {
      color: t.accent2,
      fontFamily: t.fontMono,
      fontSize: 11,
      letterSpacing: 2,
    },
    progressRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      width: 220,
    },
    track: {
      flex: 1,
      height: 4,
      borderRadius: 2,
      backgroundColor: t.borderSubtle,
      overflow: "hidden",
    },
    fill: { height: 4, borderRadius: 2, backgroundColor: t.accentPrimary },
    pct: {
      color: t.textMuted,
      fontFamily: t.fontMono,
      fontSize: 11,
      width: 40,
      textAlign: "right",
    },
    skip: {
      color: t.accentPrimary,
      fontFamily: t.fontDisplay,
      fontSize: 13,
      letterSpacing: 1,
      marginTop: 8,
    },
  });
}
```

- [ ] **Step 8: Run both boot tests — expect PASS**

Run: `pnpm --filter @rtc/client-react-native exec jest src/ui/shell/boot/`
Expected: PASS (2 files, 3 tests).

- [ ] **Step 9: Typecheck**

Run: `pnpm --filter @rtc/client-react-native typecheck`
Expected: exit 0, no output.

- [ ] **Step 10: Commit**

```bash
git add packages/client-react-native/src/ui/shell/boot/
git commit -m "$(cat <<'EOF'
feat(rn): boot splash content — BootEmblem + BootSequence

react-native-svg emblem (Expo-Go-safe stand-in for the web boot canvas) +
wordmark/subtitle/variant-tag/progress/SKIP driven by the reused
BootSequenceMachine via useBootSequence(onDone).

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01W6UUmSH8EUJui4ZZrF7BMb
EOF
)"
```

---

### Task 2: Boot overlay host — `BootGate`

**Files:**
- Create: `packages/client-react-native/src/ui/shell/boot/BootGate.tsx`
- Create: `packages/client-react-native/src/ui/shell/boot/BootGate.test.tsx`

**Interfaces:**
- Consumes: `BootSequence` (Task 1) with `onDone: () => void`. `AccessibilityInfo.isReduceMotionEnabled()` → `Promise<boolean>`. `Animated` from `react-native`.
- Produces: `BootGate` with `interface BootGateProps { onFinished: () => void }`. testID `boot-gate`. Renders `BootSequence` inside an absolute-fill `Animated.View`; on the machine's done it fades out (or jump-cuts under reduce-motion) and then calls `onFinished`.

- [ ] **Step 1: Write the failing test**

`packages/client-react-native/src/ui/shell/boot/BootGate.test.tsx`:
```tsx
import { useEffect, useRef } from "react";
import { expect, jest, test } from "@jest/globals";
import { AccessibilityInfo } from "react-native";
import { screen, waitFor } from "@testing-library/react-native";

import type { ViewModel } from "@rtc/react-bindings";
import { ViewModelProvider } from "@rtc/react-bindings";

import { BootGate } from "#/ui/shell/boot/BootGate";
import { renderWithTheme } from "#/ui/theme/renderWithTheme";

const RUNNING = { variant: "core" as const, progress: 20, done: false };

// Never-done fake: useBootSequence returns a running state and never invokes
// onDone — the splash stays up so we can assert it rendered.
function fakeRunning(): ViewModel {
  return {
    useBootSequence: (_onDone: () => void) => {
      return {
        state: RUNNING,
        skip: () => {
          return undefined;
        },
      };
    },
  } as unknown as ViewModel;
}

// Done-once fake: invokes onDone exactly once after mount, mirroring the machine
// firing its onDone when the ramp completes.
function fakeDoneOnce(): ViewModel {
  return {
    useBootSequence: (onDone: () => void) => {
      const fired = useRef(false);
      useEffect(() => {
        if (!fired.current) {
          fired.current = true;
          onDone();
        }
      }, [onDone]);
      return {
        state: { variant: "core" as const, progress: 100, done: true },
        skip: () => {
          return undefined;
        },
      };
    },
  } as unknown as ViewModel;
}

test("renders the boot splash while the machine is running", async () => {
  jest.spyOn(AccessibilityInfo, "isReduceMotionEnabled").mockResolvedValue(true);
  await renderWithTheme(
    <ViewModelProvider viewModel={fakeRunning()}>
      <BootGate
        onFinished={() => {
          return undefined;
        }}
      />
    </ViewModelProvider>,
  );
  expect(screen.getByTestId("boot-wordmark")).toBeTruthy();
});

test("calls onFinished after the machine reports done (reduce-motion jump-cut)", async () => {
  jest.spyOn(AccessibilityInfo, "isReduceMotionEnabled").mockResolvedValue(true);
  const onFinished = jest.fn();
  await renderWithTheme(
    <ViewModelProvider viewModel={fakeDoneOnce()}>
      <BootGate onFinished={onFinished} />
    </ViewModelProvider>,
  );
  await waitFor(() => {
    expect(onFinished).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @rtc/client-react-native exec jest src/ui/shell/boot/BootGate.test.tsx`
Expected: FAIL — `Cannot find module '#/ui/shell/boot/BootGate'`.

- [ ] **Step 3: Implement `BootGate`**

`packages/client-react-native/src/ui/shell/boot/BootGate.tsx`:
```tsx
import type { JSX } from "react";
import { useRef } from "react";
import {
  AccessibilityInfo,
  Animated,
  StyleSheet,
  type ViewStyle,
} from "react-native";

import { BootSequence } from "#/ui/shell/boot/BootSequence";

interface BootGateProps {
  onFinished: () => void;
}

const FADE_MS = 320;

/** Full-screen boot overlay host. Renders the BootSequence splash on top of the
 * app (which mounts underneath so its streams warm during boot). When the boot
 * machine reports done (ramp complete or SKIP), fades the overlay out and then
 * calls `onFinished` so the host stops rendering it. Under reduce-motion the
 * fade is skipped (jump-cut) and `onFinished` fires at once. The web analogue
 * (BootGate.tsx) waits on a CSS `transitionend`; RN's Animated completion
 * callback is exact, so no equivalent event plumbing is needed. */
export function BootGate({ onFinished }: BootGateProps): JSX.Element {
  const opacity = useRef(new Animated.Value(1)).current;

  function handleDone(): void {
    void AccessibilityInfo.isReduceMotionEnabled().then((reduce) => {
      if (reduce) {
        onFinished();
        return;
      }
      Animated.timing(opacity, {
        toValue: 0,
        duration: FADE_MS,
        useNativeDriver: true,
      }).start(() => {
        onFinished();
      });
    });
  }

  return (
    <Animated.View testID="boot-gate" style={[styles.overlay, { opacity }]}>
      <BootSequence onDone={handleDone} />
    </Animated.View>
  );
}

interface BootGateStyles {
  overlay: ViewStyle;
}

const styles: BootGateStyles = StyleSheet.create({
  overlay: { ...StyleSheet.absoluteFillObject, zIndex: 100, elevation: 100 },
});
```

- [ ] **Step 4: Run the test — expect PASS**

Run: `pnpm --filter @rtc/client-react-native exec jest src/ui/shell/boot/BootGate.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Typecheck**

Run: `pnpm --filter @rtc/client-react-native typecheck`
Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add packages/client-react-native/src/ui/shell/boot/BootGate.tsx packages/client-react-native/src/ui/shell/boot/BootGate.test.tsx
git commit -m "$(cat <<'EOF'
feat(rn): BootGate overlay host with Animated fade-out

Absolute-fill overlay hosting BootSequence; on the machine's done it fades the
overlay out (Animated) then calls onFinished, or jump-cuts under reduce-motion.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01W6UUmSH8EUJui4ZZrF7BMb
EOF
)"
```

---

### Task 3: Lock overlay — `BiometricLine` + `LockScreen`

**Files:**
- Create: `packages/client-react-native/src/ui/shell/lock/BiometricLine.tsx`
- Create: `packages/client-react-native/src/ui/shell/lock/BiometricLine.test.tsx`
- Create: `packages/client-react-native/src/ui/shell/lock/LockScreen.tsx`
- Create: `packages/client-react-native/src/ui/shell/lock/LockScreen.test.tsx`

**Interfaces:**
- Consumes: `useViewModel().useSession()` → `{ state: { locked: boolean, user: { name: string; initials: string; role: string; id: string } }, lock: () => void, unlock: () => void }`. Theme via `useTheme()` / `useThemedStyles`.
- Produces: `BiometricLine` (no props), `LockScreen` (no props, returns `JSX.Element | null` — `null` when unlocked). testIDs: `lock-biometric`, `lock-screen`, `lock-title`, `lock-user-name`, `lock-authenticate`.

- [ ] **Step 1: Write the failing `BiometricLine` test**

`packages/client-react-native/src/ui/shell/lock/BiometricLine.test.tsx`:
```tsx
import { expect, test } from "@jest/globals";
import { screen } from "@testing-library/react-native";

import { BiometricLine } from "#/ui/shell/lock/BiometricLine";
import { renderWithTheme } from "#/ui/theme/renderWithTheme";

test("renders the decorative biometric readout", async () => {
  await renderWithTheme(<BiometricLine />);
  expect(screen.getByTestId("lock-biometric")).toBeTruthy();
  expect(screen.getByText("BIOMETRIC · ENCRYPTED CHANNEL")).toBeTruthy();
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @rtc/client-react-native exec jest src/ui/shell/lock/BiometricLine.test.tsx`
Expected: FAIL — `Cannot find module '#/ui/shell/lock/BiometricLine'`.

- [ ] **Step 3: Implement `BiometricLine`**

`packages/client-react-native/src/ui/shell/lock/BiometricLine.tsx`:
```tsx
import type { JSX } from "react";
import {
  StyleSheet,
  Text,
  type TextStyle,
  View,
  type ViewStyle,
} from "react-native";

import type { RnTheme } from "#/ui/theme/tokens";
import { useThemedStyles } from "#/ui/theme/useThemedStyles";

/** Decorative-only biometric readout on the lock overlay: a row of status dots
 * plus the channel line. No port behind it (matches the web's explicitly
 * decorative BiometricLine — there is no biometric signal). */
export function BiometricLine(): JSX.Element {
  const styles = useThemedStyles(makeStyles);
  return (
    <View testID="lock-biometric" style={styles.wrap}>
      <View style={styles.dots}>
        <View style={[styles.dot, styles.on]} />
        <View style={[styles.dot, styles.on]} />
        <View style={[styles.dot, styles.on]} />
        <View style={[styles.dot, styles.on]} />
        <View style={[styles.dot, styles.off]} />
        <View style={[styles.dot, styles.off]} />
      </View>
      <Text style={styles.channel}>BIOMETRIC · ENCRYPTED CHANNEL</Text>
    </View>
  );
}

interface BiometricLineStyles {
  wrap: ViewStyle;
  dots: ViewStyle;
  dot: ViewStyle;
  on: ViewStyle;
  off: ViewStyle;
  channel: TextStyle;
}

function makeStyles(t: RnTheme): BiometricLineStyles {
  return StyleSheet.create({
    wrap: { alignItems: "center", gap: 8 },
    dots: { flexDirection: "row", gap: 6 },
    dot: { width: 6, height: 6, borderRadius: 3 },
    on: { backgroundColor: t.accentPrimary },
    off: { backgroundColor: t.borderSubtle },
    channel: {
      color: t.textMuted,
      fontFamily: t.fontMono,
      fontSize: 10,
      letterSpacing: 1,
    },
  });
}
```

- [ ] **Step 4: Run the `BiometricLine` test — expect PASS**

Run: `pnpm --filter @rtc/client-react-native exec jest src/ui/shell/lock/BiometricLine.test.tsx`
Expected: PASS (1 test).

- [ ] **Step 5: Write the failing `LockScreen` test**

`packages/client-react-native/src/ui/shell/lock/LockScreen.test.tsx`:
```tsx
import { expect, jest, test } from "@jest/globals";
import { fireEvent, screen } from "@testing-library/react-native";

import type { ViewModel } from "@rtc/react-bindings";
import { ViewModelProvider } from "@rtc/react-bindings";

import { LockScreen } from "#/ui/shell/lock/LockScreen";
import { renderWithTheme } from "#/ui/theme/renderWithTheme";

const USER = {
  name: "Anthony Stark",
  initials: "AS",
  role: "Senior FX Trader",
  id: "TRD-0042",
};

function fakeViewModel(locked: boolean, unlock: () => void): ViewModel {
  return {
    useSession: () => {
      return {
        state: { locked, user: USER },
        lock: () => {
          return undefined;
        },
        unlock,
      };
    },
  } as unknown as ViewModel;
}

const noop = (): void => {
  return undefined;
};

test("renders nothing when the session is unlocked", async () => {
  await renderWithTheme(
    <ViewModelProvider viewModel={fakeViewModel(false, noop)}>
      <LockScreen />
    </ViewModelProvider>,
  );
  expect(screen.queryByTestId("lock-screen")).toBeNull();
});

test("shows the operator identity when locked", async () => {
  await renderWithTheme(
    <ViewModelProvider viewModel={fakeViewModel(true, noop)}>
      <LockScreen />
    </ViewModelProvider>,
  );
  expect(screen.getByTestId("lock-title")).toBeTruthy();
  expect(screen.getByTestId("lock-user-name").props.children).toBe(
    "Anthony Stark",
  );
  expect(screen.getByText("Senior FX Trader")).toBeTruthy();
});

test("AUTHENTICATE press calls unlock", async () => {
  const unlock = jest.fn();
  await renderWithTheme(
    <ViewModelProvider viewModel={fakeViewModel(true, unlock)}>
      <LockScreen />
    </ViewModelProvider>,
  );
  await fireEvent.press(screen.getByTestId("lock-authenticate"));
  expect(unlock).toHaveBeenCalledTimes(1);
});
```

- [ ] **Step 6: Run it to verify it fails**

Run: `pnpm --filter @rtc/client-react-native exec jest src/ui/shell/lock/LockScreen.test.tsx`
Expected: FAIL — `Cannot find module '#/ui/shell/lock/LockScreen'`.

- [ ] **Step 7: Implement `LockScreen`**

`packages/client-react-native/src/ui/shell/lock/LockScreen.tsx`:
```tsx
import type { JSX } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  type TextStyle,
  View,
  type ViewStyle,
} from "react-native";
import Svg, { Circle, Polygon } from "react-native-svg";

import { useViewModel } from "@rtc/react-bindings";

import { BiometricLine } from "#/ui/shell/lock/BiometricLine";
import type { RnTheme } from "#/ui/theme/tokens";
import { useTheme } from "#/ui/theme/useTheme";
import { useThemedStyles } from "#/ui/theme/useThemedStyles";

/** Full-screen session-lock overlay. Renders nothing unless the session is
 * locked; while locked it covers the whole shell — an absolute-fill <View>
 * (NOT an RN Modal: Modal-via-press segfaults under x86 jest) — and shows the
 * operator identity plus an AUTHENTICATE control that re-authenticates (unlock).
 * All state arrives through the reused `useSession` seam; only BiometricLine is
 * decorative. */
export function LockScreen(): JSX.Element | null {
  const { useSession } = useViewModel();
  const { state, unlock } = useSession();
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);

  if (!state.locked) return null;

  const { user } = state;

  return (
    <View testID="lock-screen" style={styles.overlay}>
      <Svg width={72} height={72} viewBox="0 0 48 48">
        <Polygon
          points="24,3 40.6,13.5 40.6,34.5 24,45 7.4,34.5 7.4,13.5"
          fill="none"
          stroke={theme.accentPrimary}
          strokeWidth={1.3}
        />
        <Polygon
          points="24,8 36.3,15.75 36.3,31.25 24,39 11.7,31.25 11.7,15.75"
          fill="none"
          stroke={theme.accent2}
          strokeWidth={1}
          opacity={0.6}
        />
        <Circle cx={24} cy={24} r={3.4} fill={theme.accentPrimary} />
      </Svg>

      <Text testID="lock-title" style={styles.title}>
        SESSION LOCKED
      </Text>
      <Text style={styles.subtitle}>REACTIVE TRADER OS · {user.id}</Text>

      <View style={styles.avatar}>
        <Svg width={40} height={40} viewBox="0 0 28 28">
          <Polygon
            points="14,1.5 25,7.75 25,20.25 14,26.5 3,20.25 3,7.75"
            fill={theme.chip}
            stroke={theme.accentPrimary}
            strokeWidth={1.3}
          />
        </Svg>
        <Text style={styles.initials}>{user.initials}</Text>
      </View>

      <Text testID="lock-user-name" style={styles.name}>
        {user.name}
      </Text>
      <Text style={styles.role}>{user.role}</Text>

      <Pressable
        testID="lock-authenticate"
        onPress={() => {
          unlock();
        }}
      >
        <Text style={styles.authenticate}>AUTHENTICATE ▸</Text>
      </Pressable>

      <BiometricLine />
    </View>
  );
}

interface LockScreenStyles {
  overlay: ViewStyle;
  title: TextStyle;
  subtitle: TextStyle;
  avatar: ViewStyle;
  initials: TextStyle;
  name: TextStyle;
  role: TextStyle;
  authenticate: TextStyle;
}

function makeStyles(t: RnTheme): LockScreenStyles {
  return StyleSheet.create({
    overlay: {
      ...StyleSheet.absoluteFillObject,
      zIndex: 200,
      elevation: 200,
      alignItems: "center",
      justifyContent: "center",
      gap: 10,
      backgroundColor: t.bgPrimary,
    },
    title: {
      color: t.textPrimary,
      fontFamily: t.fontDisplay,
      fontSize: 20,
      letterSpacing: 3,
    },
    subtitle: {
      color: t.textMuted,
      fontFamily: t.fontMono,
      fontSize: 11,
      letterSpacing: 1,
    },
    avatar: { alignItems: "center", justifyContent: "center" },
    initials: {
      position: "absolute",
      color: t.textPrimary,
      fontFamily: t.fontDisplay,
      fontSize: 12,
    },
    name: { color: t.textPrimary, fontFamily: t.fontDisplay, fontSize: 16 },
    role: { color: t.textMuted, fontFamily: t.fontMono, fontSize: 11 },
    authenticate: {
      color: t.accentPrimary,
      fontFamily: t.fontDisplay,
      fontSize: 14,
      letterSpacing: 1,
      marginTop: 8,
    },
  });
}
```

- [ ] **Step 8: Run both lock tests — expect PASS**

Run: `pnpm --filter @rtc/client-react-native exec jest src/ui/shell/lock/`
Expected: PASS (2 files, 4 tests).

- [ ] **Step 9: Typecheck**

Run: `pnpm --filter @rtc/client-react-native typecheck`
Expected: exit 0.

- [ ] **Step 10: Commit**

```bash
git add packages/client-react-native/src/ui/shell/lock/
git commit -m "$(cat <<'EOF'
feat(rn): session lock overlay — LockScreen + BiometricLine

Absolute-fill lock overlay (not an RN Modal) reading the reused useSession seam:
operator identity + react-native-svg hex emblem + AUTHENTICATE (unlock) +
decorative biometric readout.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01W6UUmSH8EUJui4ZZrF7BMb
EOF
)"
```

---

### Task 4: Lock trigger + boot gate seam + shell wiring

**Files:**
- Create: `packages/client-react-native/src/app/bootSplashGate.ts`
- Create: `packages/client-react-native/src/app/bootSplashGate.test.ts`
- Create: `packages/client-react-native/src/ui/shell/lock/LockButton.tsx`
- Create: `packages/client-react-native/src/ui/shell/lock/LockButton.test.tsx`
- Modify: `packages/client-react-native/app/_layout.tsx`

**Interfaces:**
- Consumes: `BootGate` (Task 2, `onFinished`), `LockScreen` (Task 3), `useViewModel().useSession().lock`. Existing `_layout.tsx` `RootLayout` (owns `simulator` + `useAppFonts()`) and `Chrome`.
- Produces: `shouldPlayBootSplash(): boolean` (pure TS, returns `true`); `LockButton` (no props, testID `lock-button`). `_layout.tsx` renders `<BootGate>` (gated by `shouldPlayBootSplash() && !bootDone`, above the sim-toggle `key`), `<LockScreen>` inside `Chrome`, and `<LockButton>` in the toolbar.

- [ ] **Step 1: Write the failing `bootSplashGate` test (vitest node island)**

`packages/client-react-native/src/app/bootSplashGate.test.ts`:
```ts
import { expect, test } from "vitest";

import { shouldPlayBootSplash } from "#/app/bootSplashGate";

test("boot splash plays on every launch", () => {
  expect(shouldPlayBootSplash()).toBe(true);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @rtc/client-react-native exec vitest run src/app/bootSplashGate.test.ts`
Expected: FAIL — cannot resolve `#/app/bootSplashGate`.

- [ ] **Step 3: Implement `bootSplashGate`**

`packages/client-react-native/src/app/bootSplashGate.ts`:
```ts
/**
 * Whether the boot splash should play for this app launch.
 *
 * Real users get the splash on every cold start (it is skippable via SKIP).
 * This seam is where a future e2e/Maestro run would suppress it — the web
 * analogue (client-react `bootSplashGate.ts`) reads `navigator.webdriver` and
 * `?nosplash`; RN has no such signals yet, so it always plays. Kept as a named
 * function so the suppression policy has a single home outside the dumb UI.
 *
 * Pure TS — no `react-native` import (runs under the vitest node island).
 */
export function shouldPlayBootSplash(): boolean {
  return true;
}
```

- [ ] **Step 4: Run the `bootSplashGate` test — expect PASS**

Run: `pnpm --filter @rtc/client-react-native exec vitest run src/app/bootSplashGate.test.ts`
Expected: PASS (1 test).

- [ ] **Step 5: Write the failing `LockButton` test**

`packages/client-react-native/src/ui/shell/lock/LockButton.test.tsx`:
```tsx
import { expect, jest, test } from "@jest/globals";
import { fireEvent, screen } from "@testing-library/react-native";

import type { ViewModel } from "@rtc/react-bindings";
import { ViewModelProvider } from "@rtc/react-bindings";

import { LockButton } from "#/ui/shell/lock/LockButton";
import { renderWithTheme } from "#/ui/theme/renderWithTheme";

function fakeViewModel(lock: () => void): ViewModel {
  return {
    useSession: () => {
      return {
        state: {
          locked: false,
          user: { name: "", initials: "", role: "", id: "" },
        },
        lock,
        unlock: () => {
          return undefined;
        },
      };
    },
  } as unknown as ViewModel;
}

test("press locks the session", async () => {
  const lock = jest.fn();
  await renderWithTheme(
    <ViewModelProvider viewModel={fakeViewModel(lock)}>
      <LockButton />
    </ViewModelProvider>,
  );
  await fireEvent.press(screen.getByTestId("lock-button"));
  expect(lock).toHaveBeenCalledTimes(1);
});
```

- [ ] **Step 6: Run it to verify it fails**

Run: `pnpm --filter @rtc/client-react-native exec jest src/ui/shell/lock/LockButton.test.tsx`
Expected: FAIL — `Cannot find module '#/ui/shell/lock/LockButton'`.

- [ ] **Step 7: Implement `LockButton`**

`packages/client-react-native/src/ui/shell/lock/LockButton.tsx`:
```tsx
import type { JSX } from "react";
import { Pressable, StyleSheet, Text, type TextStyle } from "react-native";

import { useViewModel } from "@rtc/react-bindings";

import type { RnTheme } from "#/ui/theme/tokens";
import { useThemedStyles } from "#/ui/theme/useThemedStyles";

/** Toolbar affordance that locks the session. RN has no header AccountMenu, so
 * the toolbar carries the lock control; it raises the LockScreen overlay via
 * the reused `useSession().lock()` seam. */
export function LockButton(): JSX.Element {
  const { useSession } = useViewModel();
  const { lock } = useSession();
  const styles = useThemedStyles(makeStyles);
  return (
    <Pressable
      testID="lock-button"
      onPress={() => {
        lock();
      }}
    >
      <Text style={styles.label}>Lock</Text>
    </Pressable>
  );
}

interface LockButtonStyles {
  label: TextStyle;
}

function makeStyles(t: RnTheme): LockButtonStyles {
  return StyleSheet.create({
    label: { color: t.accentPrimary, fontFamily: t.fontDisplay },
  });
}
```

- [ ] **Step 8: Run the `LockButton` test — expect PASS**

Run: `pnpm --filter @rtc/client-react-native exec jest src/ui/shell/lock/LockButton.test.tsx`
Expected: PASS (1 test).

- [ ] **Step 9: Wire the shell in `app/_layout.tsx`**

Apply four edits to `packages/client-react-native/app/_layout.tsx`.

(a) Add imports (keep Biome import-sort order — `#/` group, alphabetical within group):
```tsx
import { AppRoot } from "#/app/AppRoot";
import { bootSplashGate } from "#/app/bootSplashGate"; // placeholder line — replaced below
```
Actually add these exact import lines to the existing `#/` import group:
```tsx
import { shouldPlayBootSplash } from "#/app/bootSplashGate";
import { ConnectionBanner } from "#/ui/ConnectionBanner";
import { BootGate } from "#/ui/shell/boot/BootGate";
import { LockButton } from "#/ui/shell/lock/LockButton";
import { LockScreen } from "#/ui/shell/lock/LockScreen";
import { useAppFonts } from "#/ui/theme/fonts";
```
(The `ConnectionBanner` / `useAppFonts` lines already exist; add `shouldPlayBootSplash`, `BootGate`, `LockButton`, `LockScreen` and let Biome sort — run `pnpm --filter @rtc/client-react-native exec biome check --write app/_layout.tsx` after editing to normalise order.)

(b) In `RootLayout`, add the `bootDone` state and the gate decision, and render `BootGate` inside the providers:
```tsx
export default function RootLayout(): JSX.Element {
  const [simulator, setSimulator] = useState(false);
  const [bootDone, setBootDone] = useState(false);
  const fontsLoaded = useAppFonts();

  if (!fontsLoaded) {
    return <SafeAreaView style={styles.screen} testID="fonts-loading" />;
  }

  const playSplash = shouldPlayBootSplash();

  return (
    <SafeAreaView style={styles.screen}>
      <AppRoot key={simulator ? "sim" : "live"} simulator={simulator}>
        <ThemeProvider>
          <Chrome simulator={simulator} onToggle={setSimulator} />
          {playSplash && !bootDone ? (
            <BootGate
              onFinished={() => {
                setBootDone(true);
              }}
            />
          ) : null}
        </ThemeProvider>
      </AppRoot>
    </SafeAreaView>
  );
}
```
Note: `bootDone` lives in `RootLayout`, **above** the `AppRoot key`, so toggling Simulator (which remounts `AppRoot`) does not replay the splash.

(c) In `Chrome`, add `LockButton` to the toolbar and render `LockScreen` as the last child (absolute-fill overlay on top of the Tabs):
```tsx
function Chrome({ simulator, onToggle }: ChromeProps): JSX.Element {
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);

  return (
    <View style={styles.fill}>
      <View style={styles.toolbar}>
        <Text style={styles.toolbarLabel}>Simulator</Text>
        <View style={styles.toolbarRight}>
          <Switch value={simulator} onValueChange={onToggle} />
          <LockButton />
        </View>
      </View>
      <ConnectionBanner />
      <Tabs
        screenOptions={{
          headerShown: false,
          sceneStyle: { backgroundColor: theme.bgPrimary },
          tabBarStyle: {
            backgroundColor: theme.bgHeader,
            borderTopColor: theme.borderSubtle,
          },
          tabBarActiveTintColor: theme.accentPrimary,
          tabBarInactiveTintColor: theme.textMuted,
        }}
      >
        <Tabs.Screen name="index" options={{ title: "Rates" }} />
        <Tabs.Screen name="blotter" options={{ title: "Blotter" }} />
        <Tabs.Screen name="analytics" options={{ title: "Analytics" }} />
        <Tabs.Screen name="appearance" options={{ title: "Appearance" }} />
      </Tabs>
      <LockScreen />
    </View>
  );
}
```

(d) Add the `toolbarRight` style to `ChromeStyles` and `makeStyles`:
```tsx
interface ChromeStyles {
  fill: ViewStyle;
  toolbar: ViewStyle;
  toolbarRight: ViewStyle;
  toolbarLabel: TextStyle;
}

function makeStyles(t: RnTheme): ChromeStyles {
  return StyleSheet.create({
    fill: { flex: 1, backgroundColor: t.bgPrimary },
    toolbar: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 16,
      paddingVertical: 8,
      backgroundColor: t.bgHeader,
    },
    toolbarRight: { flexDirection: "row", alignItems: "center", gap: 12 },
    toolbarLabel: { color: t.textPrimary, fontFamily: t.fontDisplay },
  });
}
```

- [ ] **Step 10: Normalise formatting/imports, typecheck, and confirm the app bundles**

Run: `pnpm --filter @rtc/client-react-native exec biome check --write app/_layout.tsx`
Expected: writes import-order/format fixes, exits 0.

Run: `pnpm --filter @rtc/client-react-native typecheck`
Expected: exit 0.

Run: `pnpm --filter @rtc/client-react-native export`
Expected: `expo export` completes and reports a module count (the `_layout.tsx` wiring is verified by a clean bundle; there is no `_layout` unit test — it mounts the full navigator + real composition, matching how Phases 4–5 verified `_layout` changes).

- [ ] **Step 11: Run the full RN suite**

Run: `pnpm --filter @rtc/client-react-native test`
Expected: vitest (node island) + jest all green — the pre-existing suite plus the new boot/lock tests.

- [ ] **Step 12: Commit**

```bash
git add packages/client-react-native/src/app/bootSplashGate.ts packages/client-react-native/src/app/bootSplashGate.test.ts packages/client-react-native/src/ui/shell/lock/LockButton.tsx packages/client-react-native/src/ui/shell/lock/LockButton.test.tsx packages/client-react-native/app/_layout.tsx
git commit -m "$(cat <<'EOF'
feat(rn): wire boot gate + lock overlay into the shell

Toolbar Lock button (useSession().lock()), shouldPlayBootSplash() seam, and
_layout wiring: BootGate above the sim-toggle key (plays once per cold start,
skippable) + LockScreen overlay inside Chrome.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01W6UUmSH8EUJui4ZZrF7BMb
EOF
)"
```

---

## Controller gauntlet (after all tasks, before PR)

Run first-hand from the repo root and capture real exit codes (do **not** grep for a "Checked" line — capture `$?`):

```bash
pnpm --filter @rtc/client-react-native typecheck
pnpm --filter @rtc/client-react-native test
pnpm exec biome ci .                    ; echo "biome exit=$?"
pnpm run lint:eslint                    # eslint .
pnpm run lint:eslint:types              # eslint . --config eslint.config.typed.mjs
pnpm run lint:css
pnpm run lint:dead                      # knip
pnpm run check:versions                 # manypkg + syncpack
pnpm run check:deps                     # depcruise
pnpm --filter @rtc/client-react-native export   # expo export module count
```

All must exit 0. `biome ci .` and both ESLint configs are the ones that catch what `typecheck`+jest miss (import order, `useComponentExportOnlyModules`, `no-floating-promises` on un-awaited RNTL calls, `no-restricted-syntax` inline type literals). The live-WS smoke (`smoke:ws`) is **not** a gate.

## Self-Review (completed by plan author)

**1. Spec coverage** — every spec §4 file has a task: BootEmblem+BootSequence (T1), BootGate (T2), LockScreen+BiometricLine (T3), LockButton+bootSplashGate+`_layout` (T4). Spec §5 placement (boot gate above sim-toggle key; lock overlay in Chrome; fade via Animated callback; reduce-motion jump-cut) is in T2+T4. Spec §7 decisions (single emblem + variant tag; absolute-fill not Modal) are in T1/T3. No gaps.

**2. Placeholder scan** — no TBD/TODO; every code step shows complete code; every command has expected output. (The one `// placeholder line — replaced below` in T4 Step 9(a) is an explicit instruction, immediately superseded by the exact import block.)

**3. Type consistency** — `BootSequenceProps.onDone`, `BootGateProps.onFinished`, `shouldPlayBootSplash(): boolean`, and the `useSession`/`useBootSequence` shapes match across tasks and match the real `ViewModel` interface in `react-bindings`. testIDs are consistent between each component and its test.
