# RN mobile-v1 rehaul — Phase 6a (Boot kernel + two scenes + lock screen) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the RN boot splash's SVG stand-in with a real Skia canvas driving two of the eight boot scenes on a shared 3D projection kernel, and replace the lock screen's password field with a hold-to-unlock progress ring.

**Architecture:** The state machinery already exists and is correct — `BootSequenceMachine`, `useBootSequence`, `useBootGate`, `useAuth` are shared verbatim with the web client, and RN already renders a full `BootSequence` / `BootGate` / `LockScreen` wired into `app/(app)/_layout.tsx`. **This phase replaces rendering only.** The per-point 3D projection math is extracted once into `@rtc/motion-core` (today it is duplicated six times across the web variant files); each RN scene is a thin Skia shell over it. Gyroscope drift replaces the web's mouse-pointer input at the same `{mx, my}` seam.

**Tech Stack:** `@shopify/react-native-skia` 2.6.2, `react-native-reanimated` 4.5.0, `react-native-gesture-handler` ~2.32, `expo-sensors` ~57.0.2, `expo-haptics` ~57.0.1, `@rtc/motion-core` (zero runtime deps), vitest (pure) + jest-expo (components).

---

## Global Constraints

Every task's requirements implicitly include this section.

**Scope — what this phase is and is not**
- Phase 6a ships: the projection kernel, the motion/Freeze gate, gyro drift, **two** scenes (`core`, `laser`), the hold-to-unlock ring, visual scenarios, and on-device sign-off. Phase 6b ships the remaining six scenes (`docking`, `hologram`, `geo`, `layers`, `topo`).
- **Do not change any state machinery.** `BootSequenceMachine`, `BootGatePresenter`, `useBootSequence`, `useBootGate`, `useAuth`, and the `PreferencesPort` are correct and shared with web. If a task appears to need a change there, stop and escalate — it is far more likely the RN shell is wrong.
- **Do not change `@rtc/domain`.** `BOOT_VARIANTS` and its cycle order are already correct.

**Rendering idiom — the hybrid decision test (binding)**

This phase deliberately uses both Skia idioms, one per scene, so Phase 6b has evidence for both. Choose by this test, not by preference:

- **Declarative JSX** (the `src/ui/ambient/AmbientBackground.tsx` shape) when the scene is a *bounded set of primitives whose parameters animate* — a fixed number of rects/circles/paths whose position, opacity or colour are driven by shared values.
- **`createPicture`** when the scene *rebuilds geometry every frame* — projected meshes, sweeps, per-point depth sorting — i.e. where the web source is a sequence of `ctx` calls that transliterates rather than decomposes.

By this test: **`core` is imperative** (projected globe mesh, per-frame depth sort) and **`laser` is declarative** (fixed panel rectangles traced by an animating parameter).

**Precompute geometry once, re-project per frame (spec §5).** Fixed geometry — hub lat/lon tables, meridian and parallel point sets, panel tables — is computed **once per scene mount** (a `useMemo`, or a module const where it is theme-independent) and only *projected* per frame. Never rebuild a point set inside the per-frame worklet. The spec states this for `geo`/`topo`, but it applies to every 3D scene and to `core` in this phase.

**VERIFIED — `createPicture` is worklet-safe.** `node_modules/@shopify/react-native-skia/src/skia/core/Picture.ts:15` carries a `"worklet"` directive, and `<Picture>` takes `SkiaProps<PictureProps>`, which accepts a derived value. Imperative scenes therefore build their `SkPicture` inside a `useDerivedValue` worklet and stay on the UI thread. **Per-frame drawing must never run on the JS thread** — see `docs/performance.md`. A scene that drives Skia props from React state per frame is a defect regardless of how it looks.

**Motion gating (every animated surface, no exceptions)**
- RN boot/lock today check `AccessibilityInfo.isReduceMotionEnabled()` and have **no power-saver Freeze gate at all** — a gap versus web, which has short-circuited on `isFreeze` since `client-react/.../BootSequence.tsx:44`. Task 2 closes it.
- The precedence rule, copied from web verbatim: **Freeze always wins.** `forceBootAnimation` overrides only the OS reduced-motion signal, never an explicit user Freeze choice. Concretely: `isFreeze || (prefersReduced && !forced)` disables motion.
- When motion is off, **do not mount `<Canvas>` at all** — render chrome only (wordmark, subtitle, variant label, progress, SKIP). This is the spec's "reduced-motion falls back to a static splash" exit gate, and it matches both the web boot (skips the rAF loop) and `AmbientBackground` (returns `null`).

**Storage key — the spec text is wrong, do not follow it**
- The spec §5 names `rtm_bootSeq`. **No such key exists in this repo.** `docs/boot-splash-animations.md` names `rt_bootSeq`, also wrong.
- The real, live, web-consistent key is `BOOT_VARIANT_STORAGE_KEY = "rt-boot-variant"` (`src/app/adapters/AsyncStoragePreferencesAdapter.ts:37`), already wired end-to-end through `PreferencesPort`.
- **Introduce no new persistence key.** Task 10 corrects both stale docs.

**Repo-wide (CI-enforced)**
- NEVER write the literal tokens `setTimeout`, `setInterval`, `localStorage`, `fetch`, or `rxjs` anywhere under `src/ui` — **including inside comments and prose**. The `@rtc/tests` grep gates match comments and this has reddened CI before. Say "UI-side timers" instead.
- Named exports only in `src/ui/**` and in `packages/motion-core/src/**`; files under `app/**` keep their default export.
- No hardcoded colours — theme tokens via `useThemedStyles(makeStyles)`, never a bare `makeStyles(theme)` call. Skia colour props take theme token strings.
- `@rtc/motion-core` has **zero runtime dependencies** and must import no React, no RN, no Skia, no rxjs. Pure functions and constants only.
- Do not add a lint-disable comment or a knip-ignore entry to make a gate pass. If a gate fails, either fix the code or escalate.
- Custom rules `rtc/newspaper-order`, `rtc/component-newspaper`, `rtc/no-render-functions` apply; follow the ordering sibling files demonstrate.

**Gauntlet — run before every commit**
```
pnpm --filter @rtc/motion-core test          # kernel tasks only
pnpm --filter @rtc/client-react-native typecheck
pnpm --filter @rtc/client-react-native test
pnpm --filter @rtc/tests gates               # 37/37 — DO NOT SKIP, greps comments
pnpm exec biome ci <changed files>
pnpm exec eslint <changed files>
pnpm exec eslint <changed files> --config eslint.config.typed.mjs
```
`pnpm lint:dead` additionally on the integration task.

**Fresh-worktree note:** the workspace libs have no `dist/` in a new worktree. Run `pnpm --filter "@rtc/client-react-native^..." build` once before the first test run, or every `@rtc/*` import fails to resolve.

---

## File Structure

**Created — `packages/motion-core/src/`**
- `project3d.ts` — the pure yaw/pitch/perspective kernel. Zero deps. Consumed by RN scenes now and by Phase 6b's five 3D scenes later.
- `project3d.test.ts` — vitest.

**Created — `packages/client-react-native/src/ui/shell/boot/`**
- `resolveBootMotionEnabled.ts` — pure decision fn (reduced-motion + Freeze + forced). Mirrors `src/ui/ambient/resolveAmbientEnabled.ts`.
- `useBootMotionEnabled.ts` — wires the pure fn to live sources.
- `useGyroDrift.ts` — `expo-sensors` Gyroscope → a `{mx, my}` shared value, gated.
- `bootScene.ts` — the scene contract (props type + registry type). No components, so the registry can export non-components.
- `BootCanvas.tsx` — the `<Canvas>` host: sizes itself, picks the scene from the registry, owns the elapsed-time shared value.
- `scenes/CoreScene.tsx` — `core`, **imperative** (`createPicture` in a worklet).
- `scenes/LaserScene.tsx` — `laser`, **declarative** JSX.
- Co-located `*.test.ts(x)` for each.

**Created — `packages/client-react-native/src/ui/shell/lock/`**
- `useHoldToUnlock.ts` — `Gesture.LongPress` → progress shared value with decay + haptics.
- `HoldToUnlockRing.tsx` — the ring, driven by that shared value.
- Co-located tests.

**Modified**
- `src/ui/shell/boot/BootSequence.tsx` — mount `BootCanvas` behind the existing chrome; static fallback when motion is off.
- `src/ui/shell/lock/LockScreen.tsx` — replace the password `TextInput` + AUTHENTICATE button with the hold ring.
- `tests/visual/scenarioIds.ts` + `tests/visual/scenarios.tsx` — new boot/lock scenarios.
- `docs/boot-splash-animations.md`, the rehaul spec — correct the storage-key name.

---

## Task 1: The 3D projection kernel in `@rtc/motion-core`

**Files:**
- Create: `packages/motion-core/src/project3d.ts`
- Test: `packages/motion-core/src/project3d.test.ts`
- Modify: `packages/motion-core/src/index.ts` (add exports, alphabetical — the file is sorted)

**Interfaces:**
- Consumes: nothing.
- Produces: `project3d(x, y, z, params) => Projected3dPoint`, types `Projection3dParams` / `Projected3dPoint`.

**Why these parameters.** The six web call sites differ in exactly three ways, and the signature reconciles all three without a mode flag:

| site | perspective | screen Y | scale |
|---|---|---|---|
| `bootCore.ts:177` | `1/(1+z*0.28)` | `centerY - y*…` (y-up) | `globeRadius` |
| `bootGeo.ts:516` | `1/(1+z*0.22)` | — | — |
| `bootHologram.ts:205` | `1/(1+z*0.26)` | — | — |
| `bootJarvis.ts:155` | `1/max(0.4, 1+z*0.30)` | `centerY + y*…` (y-down) | `projScale` |
| `bootLayers.ts:190` | `1/max(0.4, 1+z*0.24)` | — | — |
| `bootTopo.ts:376` | `1/max(0.4, 1+z*0.26)` | — | — |

So: the depth coefficient is a **parameter**, the clamp floor is an **optional** parameter (absent = unclamped), and the kernel returns **unit-space** coordinates — the caller applies centre, scale and Y-sign. That keeps the kernel free of screen-space concerns and sign conventions.

- [ ] **Step 1: Write the failing test**

```ts
import { expect, test } from "vitest";

import { project3d } from "./project3d.js";

const FLAT = { yaw: 0, pitch: 0, perspectiveK: 0 };

test("with no rotation and no perspective, x and y pass through unchanged", () => {
  const p = project3d(0.5, 0.25, 0, FLAT);
  expect(p.x).toBeCloseTo(0.5);
  expect(p.y).toBeCloseTo(0.25);
  expect(p.perspective).toBeCloseTo(1);
});

test("a quarter-turn of yaw rotates +x onto -z", () => {
  const p = project3d(1, 0, 0, { ...FLAT, yaw: Math.PI / 2 });
  expect(p.x).toBeCloseTo(0);
  expect(p.z).toBeCloseTo(1);
});

test("positive depth foreshortens: perspective shrinks and scales x", () => {
  const near = project3d(1, 0, -1, { yaw: 0, pitch: 0, perspectiveK: 0.28 });
  const far = project3d(1, 0, 1, { yaw: 0, pitch: 0, perspectiveK: 0.28 });
  expect(far.perspective).toBeLessThan(near.perspective);
  expect(Math.abs(far.x)).toBeLessThan(Math.abs(near.x));
});

test("pitch tilts y toward the viewer and reports depth", () => {
  const p = project3d(0, 1, 0, { ...FLAT, pitch: Math.PI / 2 });
  expect(p.y).toBeCloseTo(0);
  expect(p.z).toBeCloseTo(1);
});

test("without a clamp, a large negative depth can invert the perspective sign", () => {
  const p = project3d(1, 0, -10, { yaw: 0, pitch: 0, perspectiveK: 0.28 });
  expect(p.perspective).toBeLessThan(0);
});

test("minPerspectiveDenom clamps the divisor so perspective stays positive", () => {
  const p = project3d(1, 0, -10, {
    yaw: 0,
    pitch: 0,
    perspectiveK: 0.28,
    minPerspectiveDenom: 0.4,
  });
  expect(p.perspective).toBeCloseTo(1 / 0.4);
});

test("is pure — repeated calls with the same inputs agree", () => {
  const params = { yaw: 0.6, pitch: 0.38, perspectiveK: 0.28 };
  expect(project3d(0.3, 0.4, 0.5, params)).toEqual(
    project3d(0.3, 0.4, 0.5, params),
  );
});
```

- [ ] **Step 2: Run it and confirm it FAILS**

Run: `pnpm --filter @rtc/motion-core test`
Expected: FAIL — cannot resolve `./project3d.js`.

- [ ] **Step 3: Implement**

```ts
/**
 * Per-point 3D projection for the boot scenes: yaw spin, pitch tilt, then a
 * perspective divide.
 *
 * Returns UNIT-SPACE coordinates. The caller applies centre, scale and screen-Y
 * sign, because the scenes disagree on all three: the globe treats +y as up
 * (`centerY - y * r`) while the schematic scenes treat it as down
 * (`centerY + y * r`). Keeping that out of the kernel is what lets one function
 * serve every scene.
 *
 * `perspectiveK` is the depth coefficient (0.22–0.30 across the eight scenes).
 * `minPerspectiveDenom` clamps the divisor: the cursor- and gyro-driven scenes
 * pass 0.4 so that a point swinging behind the camera cannot flip the
 * perspective sign and mirror the geometry. Omit it for fixed-tilt scenes,
 * whose depth range cannot reach the singularity.
 */
export interface Projection3dParams {
  readonly yaw: number;
  readonly pitch: number;
  readonly perspectiveK: number;
  readonly minPerspectiveDenom?: number;
}

export interface Projected3dPoint {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly perspective: number;
}

export function project3d(
  x: number,
  y: number,
  z: number,
  params: Projection3dParams,
): Projected3dPoint {
  "worklet";

  const cosYaw = Math.cos(params.yaw);
  const sinYaw = Math.sin(params.yaw);
  const cosPitch = Math.cos(params.pitch);
  const sinPitch = Math.sin(params.pitch);

  const rotX = x * cosYaw - z * sinYaw;
  const rotZ = x * sinYaw + z * cosYaw;

  const pitchedY = y * cosPitch - rotZ * sinPitch;
  const depthZ = y * sinPitch + rotZ * cosPitch;

  const denom = 1 + depthZ * params.perspectiveK;
  const clamped =
    params.minPerspectiveDenom === undefined
      ? denom
      : Math.max(params.minPerspectiveDenom, denom);
  const perspective = 1 / clamped;

  return {
    x: rotX * perspective,
    y: pitchedY * perspective,
    z: depthZ,
    perspective,
  };
}
```

> The `"worklet"` directive lets the imperative `core` scene call this inside a `useDerivedValue` on the UI thread. It is inert everywhere else — plain JS callers and vitest are unaffected, and it introduces no dependency, so motion-core's zero-runtime-dep constraint holds.

- [ ] **Step 4: Export from the barrel**

Insert into `packages/motion-core/src/index.ts` in alphabetical position (after the `frameRate` block, before `rankGlide`):

```ts
export type { Projected3dPoint, Projection3dParams } from "./project3d.js";
export { project3d } from "./project3d.js";
```

- [ ] **Step 5: Run tests + gauntlet**

Run: `pnpm --filter @rtc/motion-core test` → 7 passed.
Then `pnpm --filter @rtc/motion-core typecheck`, biome, eslint (both configs).

- [ ] **Step 6: Commit**

```bash
git add packages/motion-core/src/project3d.ts packages/motion-core/src/project3d.test.ts packages/motion-core/src/index.ts
git commit -m "feat(motion-core): extract the boot 3D projection kernel"
```

---

## Task 2: Boot motion gate (closes the missing Freeze gap)

**Files:**
- Create: `packages/client-react-native/src/ui/shell/boot/resolveBootMotionEnabled.ts`
- Create: `packages/client-react-native/src/ui/shell/boot/useBootMotionEnabled.ts`
- Test: `resolveBootMotionEnabled.test.ts`

**Interfaces:**
- Produces: `resolveBootMotionEnabled(reducedMotion, isFreeze, forced) => boolean`; `useBootMotionEnabled() => boolean`.

**Why a bespoke gate rather than `useShellMotionEnabled()`.** Boot is the one surface with a *third* input: `forceBootAnimation`, the user preference that overrides the OS reduced-motion signal so the animation can be watched deliberately. `useShellMotionEnabled()` knows nothing about it. The precedence — **Freeze beats forced** — is copied from `client-react/src/ui/shell/boot/BootSequence.tsx:37-46`.

Read `src/ui/ambient/resolveAmbientEnabled.ts` and `useAmbientEnabled.ts` first; this is deliberately the same split (pure fn importable under vitest's node env + a hook that wires live sources).

- [ ] **Step 1: Write the failing test**

```ts
import { expect, test } from "vitest";

import { resolveBootMotionEnabled } from "./resolveBootMotionEnabled";

test("plays when nothing suppresses it", () => {
  expect(resolveBootMotionEnabled(false, false, false)).toBe(true);
});

test("OS reduced-motion suppresses it", () => {
  expect(resolveBootMotionEnabled(true, false, false)).toBe(false);
});

test("forceBootAnimation overrides OS reduced-motion", () => {
  expect(resolveBootMotionEnabled(true, false, true)).toBe(true);
});

test("Freeze suppresses it even when forced", () => {
  expect(resolveBootMotionEnabled(false, true, true)).toBe(false);
});

test("Freeze suppresses it when reduced-motion is also set and forced", () => {
  expect(resolveBootMotionEnabled(true, true, true)).toBe(false);
});
```

- [ ] **Step 2: Run it and confirm it FAILS.**

- [ ] **Step 3: Implement the pure function**

```ts
/**
 * Whether the Skia boot canvas should run.
 *
 * Kept dependency-free (no React/RN/reanimated imports) so it stays importable
 * under vitest's node environment; `useBootMotionEnabled.ts` wires it to live
 * sources.
 *
 * Precedence matches the web client verbatim: Freeze always wins. The
 * `forceBootAnimation` preference exists to override the OS reduced-motion
 * signal for someone who wants to watch the sequence — it must never override
 * an explicit user choice to freeze all motion.
 */
export function resolveBootMotionEnabled(
  reducedMotion: boolean,
  isFreeze: boolean,
  forced: boolean,
): boolean {
  if (isFreeze) {
    return false;
  }

  return !reducedMotion || forced;
}
```

- [ ] **Step 4: Implement the hook**

```ts
import { useReducedMotion } from "react-native-reanimated";

import { useViewModel } from "@rtc/react-bindings";

import { resolveBootMotionEnabled } from "./resolveBootMotionEnabled";

/** Live wiring for {@link resolveBootMotionEnabled}. */
export function useBootMotionEnabled(): boolean {
  const { usePowerSaver, useForceBootAnimation } = useViewModel();
  const { isFreeze } = usePowerSaver();
  const { enabled: forced } = useForceBootAnimation();
  const reducedMotion = useReducedMotion();
  return resolveBootMotionEnabled(reducedMotion, isFreeze, forced);
}
```

> Verified: `useForceBootAnimation()` returns `{ enabled, … }` (`packages/react-bindings/src/createViewModel.ts:778-781`), so the destructuring above is correct as written.

- [ ] **Step 5: Run tests + gauntlet. Step 6: Commit** — `feat(rn-boot): boot motion gate with Freeze precedence`

---

## Task 3: Gyroscope drift

**Files:**
- Create: `packages/client-react-native/src/ui/shell/boot/useGyroDrift.ts`
- Test: `useGyroDrift.test.tsx`

**Interfaces:**
- Consumes: `expo-sensors` `Gyroscope`, `useBootMotionEnabled`.
- Produces: `useGyroDrift(enabled) => SharedValue<{ mx: number; my: number }>`.

**Context.** The web feeds cursor position into a shared `scene.pointer.{mx, my}` (normalized −1..1) which the cursor-driven scenes fold into yaw/pitch (`client-react/.../BootSequence.tsx:72-77`). RN has no cursor; the gyroscope takes its place at the identical seam, so scenes stay platform-agnostic.

`expo-sensors` is already installed (added in Phase 0's `df336141`) and already jest-mocked in `jest.setup.ts:89-101` (`Gyroscope.addListener` / `setUpdateInterval` / `isAvailableAsync`) — read that mock before writing the test.

**Requirements:**
- Subscribe only when `enabled`; remove the listener on unmount and whenever `enabled` goes false, and reset the shared value to `{mx: 0, my: 0}` so a disabled scene renders centred rather than at the last drift.
- Integrate rotation rate into a bounded offset — clamp to −1..1 — and decay toward 0 so the scene drifts back to centre when the device is still. Do not accumulate unbounded.
- `setUpdateInterval` at ~60ms; do not subscribe faster than the scene renders.
- Guard `isAvailableAsync()` — simulators and some devices have no gyroscope. When unavailable, leave the value at `{0, 0}`; this must not throw or warn on every boot.

- [ ] **Step 1: Write the failing test** — with the existing jest mock: assert (a) no listener is added when `enabled` is false; (b) a listener is added when true; (c) it is removed on unmount; (d) an emitted sample moves the shared value; (e) values stay within −1..1 under a long run of large samples; (f) an unavailable gyroscope leaves the value at zero and does not throw.
- [ ] **Step 2: Run it and confirm it FAILS.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run tests + gauntlet. Step 5: Commit** — `feat(rn-boot): gyroscope drift feeding the scene pointer seam`

---

## Task 4: Scene contract + registry

**Files:**
- Create: `packages/client-react-native/src/ui/shell/boot/bootScene.ts`
- Test: `bootScene.test.ts`

**Interfaces:**
- Produces: `BootSceneProps`, `BootSceneComponent`, `BOOT_SCENES`, `hasBootScene(variant)`.

A types-and-registry module with no components, so it can export a non-component map without tripping Biome's `useComponentExportOnlyModules` — the same reason Phase 4b's column ratios live in `blotterColumns.ts` rather than inside a component file.

```ts
export interface BootSceneProps {
  /** Seconds since the scene mounted, on the UI thread. */
  readonly elapsedSec: SharedValue<number>;
  /** Normalized gyro drift, −1..1 on both axes. The web's cursor seam. */
  readonly drift: SharedValue<{ mx: number; my: number }>;
  readonly width: number;
  readonly height: number;
}
```

**Registry requirement — partial by design.** Only `core` and `laser` have scenes in 6a. `BOOT_SCENES` is therefore a `Partial<Record<BootVariant, BootSceneComponent>>`, and `hasBootScene()` reports coverage. `BootCanvas` renders nothing for an unported variant, so the chrome-only splash shows — the rotation still advances and persists correctly. **This must not throw or fall back to a different variant**: a missing scene is an expected state until 6b lands.

- [ ] **Step 1: Write the failing test** — assert `core` and `laser` resolve; assert an unported variant (e.g. `topo`) returns `false` from `hasBootScene` and `undefined` from the registry **without throwing**; assert every key of `BOOT_SCENES` is a member of `BOOT_VARIANTS` (guards against a typo'd key that would silently never render).
- [ ] **Step 2: Confirm FAIL. Step 3: Implement. Step 4: Confirm PASS + gauntlet. Step 5: Commit** — `feat(rn-boot): boot scene contract and registry`

---

## Task 5: `BootCanvas` host

**Files:**
- Create: `packages/client-react-native/src/ui/shell/boot/BootCanvas.tsx`
- Test: `BootCanvas.test.tsx`

**Interfaces:**
- Consumes: `bootScene.ts`, `useGyroDrift`, `useBootMotionEnabled`, Skia `Canvas`, Reanimated.
- Produces: `BootCanvas({ variant })`.

**Requirements:**
- Own the single `elapsedSec` shared value driving every scene. Advance it with `useFrameCallback` (Reanimated) so it ticks on the UI thread. **Not** a JS-thread interval — and remember the token ban applies to comments, so describe it as "UI-side timers" if you need to mention the alternative.
- `StyleSheet.absoluteFill`, `pointerEvents="none"` — SKIP sits above it and must stay tappable.
- Return `null` when `useBootMotionEnabled()` is false. **Do not mount `<Canvas>`.** Follow `AmbientBackground.tsx:64-72,85-87`, which cancels animation and returns `null`.
- Return `null` when the variant has no scene (Task 4).
- Size from `useWindowDimensions()`; pass width/height to the scene.

- [ ] **Step 1: Write the failing test** — assert: renders nothing when motion is disabled; renders nothing for an unported variant; renders a canvas for `core` when enabled. Mock `useBootMotionEnabled`. Skia is globally jest-mocked — assert on presence/absence via `testID`, not on drawing.
- [ ] **Step 2: Confirm FAIL. Step 3: Implement. Step 4: Confirm PASS + gauntlet. Step 5: Commit** — `feat(rn-boot): Skia canvas host with motion gate and scene lookup`

---

## Task 6: `core` scene — imperative (`createPicture`)

**Files:**
- Create: `packages/client-react-native/src/ui/shell/boot/scenes/CoreScene.tsx`
- Test: `CoreScene.test.tsx`

**Source to port:** `packages/client-react/src/ui/shell/boot/variants/bootCore.ts` (608 lines). **Read it fully before writing.** Its header comment (lines 1-12) describes the intended visual; `docs/boot-splash-animations.md` §3.6 documents the projection approach.

**Scope — port these five elements in 6a, defer the rest:**

| element | web lines | port now? |
|---|---|---|
| 3D projection setup | 172-199 | ✅ — via `project3d` |
| meridian sweep with draw-heads | 246-292 | ✅ — carries the identity |
| parallels | 294-320 | ✅ |
| hub nodes + ping ripples | 404-433 | ✅ |
| status banner (SPINNING UP CORE → …) | end | ✅ |
| star-drift backdrop | 165-171 | ⏸ 6b |
| nucleus glow | 220-240 | ⏸ 6b |
| latitude scan ring | 322-347 | ⏸ 6b |
| gyroscopic segmented rings | 349-402 | ⏸ 6b |
| spotlight callout | 435-471 | ⏸ 6b |
| order-flow arcs | 473-558 | ⏸ 6b |
| calibration ticks / holo flicker | 560+ | ⏸ 6b |

Deferring is a **documented** decision, not silent omission: add a file-header comment listing what is deferred and why (prove the pipeline and get on-device perf evidence before adding density), mirroring how `AmbientBackground.tsx:267-289` documents its deliberate approximation.

**Requirements:**
- Build the `SkPicture` inside a `useDerivedValue` worklet reading `elapsedSec` and `drift`; render `<Picture picture={derived} />`. **Per-frame work must not touch the JS thread.**
- Yaw from `elapsedSec * 0.42 + 0.6`; fixed tilt `0.38`; `perspectiveK: 0.28`; **no** `minPerspectiveDenom` (the globe is fixed-tilt and cannot reach the singularity — matching web).
- Fold `drift.mx/my` into yaw/pitch the way the cursor-driven web scenes do, scaled gently — the globe is fixed-tilt on web, so this is an RN addition; keep the influence small (≤0.15 rad) so it reads as parallax, not steering.
- The globe is y-up: apply `centerY - y * radius`.
- Depth-sort before drawing (painter's algorithm) and fade alpha/line width by `perspective`, as the web does.
- Colours from theme tokens passed in as props — no hardcoded hex.

- [ ] **Step 1: Write the failing test** — Skia is jest-mocked, so assert structure not pixels: the component mounts with a `testID`, survives `elapsedSec`/`drift` changes without throwing, and returns a picture. Additionally unit-test any **pure** geometry helper you extract (hub lat/lon → unit vector, meridian point generation) directly — that is where real bugs live and it is testable without Skia.
- [ ] **Step 2: Confirm FAIL. Step 3: Implement. Step 4: Confirm PASS + gauntlet. Step 5: Commit** — `feat(rn-boot): core scene — projected globe mesh, meridian sweep, hub pings`

---

## Task 7: `laser` scene — declarative JSX

**Files:**
- Create: `packages/client-react-native/src/ui/shell/boot/scenes/LaserScene.tsx`
- Test: `LaserScene.test.tsx`

**Source to port:** `drawBootLaser` in `packages/client-react/src/ui/shell/boot/bootCanvas.ts:106-453`. Read it fully. It is **2D only — no projection** — which is why it takes the declarative idiom: a fixed set of panel rectangles, each with normalized geometry (`nx`, `ny`, `nw`, `nh`) and a trace window (`t0`, `t1`), traced by a laser head as progress crosses that window.

**Requirements:**
- Port the panel table verbatim — the exact `nx/ny/nw/nh/t0/t1/kind` values from the source. These are design values; do not re-derive or round them.
- Declarative Skia children (`Rect`/`Path`/`Line`), parameters driven by `useDerivedValue` off `elapsedSec`. Follow `AmbientBackground.tsx` for the shape.
- Progress → normalized 0..1 over the scene duration; each panel traces within its own `[t0, t1]` window and stays drawn afterwards.
- Colours from theme tokens.

- [ ] **Step 1: Write the failing test** — assert all panels render; assert the panel table matches the web source's values exactly (a table-driven assertion catches a transcription slip, which is the realistic failure here); assert it survives elapsed-time changes.
- [ ] **Step 2: Confirm FAIL. Step 3: Implement. Step 4: Confirm PASS + gauntlet. Step 5: Commit** — `feat(rn-boot): laser scene — panel trace-in (declarative Skia)`

---

## Task 8: Wire `BootSequence`

**Files:**
- Modify: `packages/client-react-native/src/ui/shell/boot/BootSequence.tsx`
- Test: extend the existing `BootSequence` test if present, else create it.

**Requirements:**
- Mount `<BootCanvas variant={state.variant} />` **behind** the existing chrome. Keep every current element and `testID` — `boot-sequence`, `boot-wordmark`, `boot-variant`, `boot-progress`, `boot-pct`, `boot-skip`. They are the static fallback and are depended on by tests.
- `BootEmblem` — the SVG stand-in — should render only when the canvas does not (motion off, or unported variant), so the two never overlap. Keep the emblem as the static-splash mark.
- Do not touch `useBootSequence`, `skip`, or `onDone` wiring.

- [ ] **Step 1: Write the failing test** — assert: with motion disabled, chrome + emblem render and no canvas; with motion enabled on `core`, the canvas renders and the emblem does not; SKIP still dispatches in both.
- [ ] **Step 2: Confirm FAIL. Step 3: Implement. Step 4: Confirm PASS + gauntlet. Step 5: Commit** — `feat(rn-boot): mount the Skia canvas behind the boot chrome`

---

## Task 9: Hold-to-unlock ring

**Files:**
- Create: `packages/client-react-native/src/ui/shell/lock/useHoldToUnlock.ts`
- Create: `packages/client-react-native/src/ui/shell/lock/HoldToUnlockRing.tsx`
- Modify: `packages/client-react-native/src/ui/shell/lock/LockScreen.tsx`
- Tests: co-located for both new files; extend the LockScreen test.

**Interfaces:**
- Consumes: `Gesture.LongPress` (gesture-handler), Reanimated, `expo-haptics`, `ringDashOffset`/`ringCircumference` from `@rtc/motion-core`, `useAuth`.
- Produces: `useHoldToUnlock({ onComplete })`, `HoldToUnlockRing({ progress })`.

**Read first:** `src/ui/shell/lock/LockScreen.tsx` (the current password flow and its `testID`s) and `src/ui/rates/ticket/ExecutionCeremony.tsx` (the established once-guard idiom for firing haptics exactly once per event, whose ref updates unconditionally so it re-arms).

**Requirements:**
- Hold fills a progress ring over ~900ms; releasing early **decays** back to 0 rather than snapping — the spec calls for decay explicitly.
- On completion: `Haptics.notificationAsync(Success)` **exactly once** per completion, then call unlock.
- Reuse `ringCircumference` / `ringDashOffset` from motion-core rather than recomputing dash math.
- Motion gating: when motion is disabled, the ring must still be **operable** — this is an authentication control, not decoration. Show discrete state (empty → full) without the animated sweep. Do not make unlock unreachable under reduced-motion or Freeze.
- **Keep a non-gesture fallback.** A hold gesture is inaccessible to some users and to automation. Preserve a tappable AUTHENTICATE affordance (or an accessibility action) so the screen is operable without a sustained press, and keep `lock-screen` / `lock-title` testIDs.

**Escalate rather than guess:** the current screen unlocks with a *password*; a hold ring supplies no credential. Determine from `useAuth()` whether a no-argument unlock path exists. If unlock genuinely requires a password, the ring cannot replace the field — report this and stop. Do **not** invent a stored-credential path or weaken authentication to make the gesture work.

- [ ] **Step 1: Write the failing test** — assert: progress rises while held; decays on early release; `onComplete` fires once at completion, not per frame; haptics fire exactly once and re-arm for a subsequent hold; with motion disabled the control still completes and unlocks.
- [ ] **Step 2: Confirm FAIL. Step 3: Implement. Step 4: Confirm PASS + gauntlet. Step 5: Commit** — `feat(rn-lock): hold-to-unlock progress ring with decay and haptics`

---

## Task 10: Visual scenarios, doc corrections, integration gauntlet

**Files:**
- Modify: `packages/client-react-native/tests/visual/scenarioIds.ts`, `tests/visual/scenarios.tsx`
- Modify: `docs/boot-splash-animations.md`, `docs/superpowers/specs/2026-07-16-rn-mobile-v1-rehaul-design.md`
- Modify: `docs/STATUS.md`

**Read first:** the doc comment at `tests/visual/scenarios.tsx:1-51` on scenario determinism — it explains why a non-deterministic fixture was dropped, and boot is *inherently* time-based, so this is the trap to avoid.

- [ ] **Step 1: Add scenarios** — `boot/core`, `boot/laser`, `boot/static` (motion disabled), `lock/hold`. Add the id to `scenarioIds.ts` **and** the entry to `scenarios.tsx`; `scenarios.test.tsx` asserts the two stay in sync.

  **Determinism is the whole difficulty.** A boot scene animates from a UI-thread clock, so a screenshot races it. Pin a single frame: force reduced-motion for the static scenario, and for the animated ones drive the scene from a **fixed** `elapsedSec` rather than a live frame callback. Do not golden a free-running canvas — that is a flaky baseline, and per the memory of a prior failure, a full-bleed scenario also needs `fullPage: true` or the screenshot call hangs and silently produces zero goldens.

- [ ] **Step 2: Correct the stale storage key in both docs.** `docs/boot-splash-animations.md` says `rt_bootSeq`; the rehaul spec §5 says `rtm_bootSeq`. The real key is `rt-boot-variant`. Fix both and note the real constant's location.

- [ ] **Step 3: Update `docs/STATUS.md`** per the `tracking-workstream-status` skill — Phase 6a in progress, 6b's six scenes and the deferred `core` elements listed as remaining. Bump `Last updated`. Run `pnpm check:doc-links`.

- [ ] **Step 4: FULL gauntlet**

```
pnpm --filter @rtc/motion-core test
pnpm --filter @rtc/client-react-native typecheck
pnpm --filter @rtc/client-react-native test
pnpm --filter @rtc/tests gates
pnpm lint:dead
pnpm exec biome ci packages/client-react-native packages/motion-core
pnpm exec eslint packages/client-react-native packages/motion-core
pnpm exec eslint packages/client-react-native packages/motion-core --config eslint.config.typed.mjs
pnpm check:doc-links
```

- [ ] **Step 5: Commit** — `feat(rn-boot): visual scenarios, doc key corrections, full gauntlet green`

---

## Task 11: On-device sign-off (requires the user + a booted simulator)

**Not executable by a subagent.** Needs a running iOS simulator and human judgement on visual fidelity.

Recipe and traps: see the `reference_rn_on_device_sim_automation` memory — dev-client fast path (no native rebuild needed; `expo-sensors` shipped in Phase 0), `idb ui tap` coordinates are screenshot pixels ÷ 3, and the sim auto-shuts-down between sessions.

- [ ] Boot the app repeatedly and confirm the rotation advances `core → laser → …` and **persists across cold launches** — this is what PR #302's guard fix unblocked, and the exit gate's "rotate/skip/persist."
- [ ] Confirm SKIP short-circuits from both scenes.
- [ ] Confirm the fade-out handoff to the app is clean.
- [ ] **Perf:** watch for steady-state jank. The exit gate is *no* jank; if the imperative `core` scene janks, that is the signal that shapes 6b's idiom choice — capture it either way.
- [ ] Set power-saver to **Freeze** and confirm the canvas does not mount (static splash only). Then enable `forceBootAnimation` and confirm Freeze still wins.
- [ ] Enable OS reduced-motion, confirm the static splash, then enable `forceBootAnimation` and confirm the animation returns.
- [ ] Tilt the device/simulator and confirm gyro parallax drifts and recentres. Note if the simulator reports no gyroscope — the unavailable path must degrade silently.
- [ ] Exercise hold-to-unlock: fill, early-release decay, haptic on success, and the non-gesture fallback.
- [ ] Capture/pin the four new visual goldens, plus the three carried over (`blotter` from 4b, `rates` from 4a, `shell` from Phase 3).
