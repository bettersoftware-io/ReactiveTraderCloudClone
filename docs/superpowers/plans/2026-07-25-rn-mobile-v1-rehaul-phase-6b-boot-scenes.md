# RN mobile-v1 rehaul — Phase 6b-1 (core/laser fidelity backfill + the `docking` scene) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish the two boot scenes Phase 6a shipped as deliberate partial ports — bring `core` from 5 of its 12 web elements to all 12 (including the whole-frame holo flicker) and `laser` from border-trace-only to the full web draw — and port `docking`, the last boot scene that needs no 3D projection kernel.

**Architecture:** Unchanged from 6a. `BootSequenceMachine` / `BootGatePresenter` / `useBootSequence` / `useBootGate` and the `PreferencesPort` are shared verbatim with the web client and are **not touched**. `BootCanvas` already owns the single `elapsedSec` shared value, the gyro-drift pointer seam and the `BOOT_SCENES` registry lookup; this phase adds draw layers inside two existing scenes and registers one new one. Every new element is ported from `@rtc/boot-splash` — `packages/boot-splash/src/variants/bootCore.ts` for `core`, and `drawBootLaser` / `drawBootDocking` in `packages/boot-splash/src/bootCanvas.ts` for the other two. That package is the fidelity source of truth: formulas and design constants are transliterated, never re-derived.

**Tech Stack:** `@shopify/react-native-skia` 2.6.2, `react-native-reanimated` 4.5.0, `react-native-gesture-handler` ~2.32, `expo-sensors` ~57.0.2, `@rtc/motion-core` (zero runtime deps), vitest (pure `*.test.ts`) + jest-expo (`*.test.tsx`).

---

## Scope note — why this is 6b-**1**, not all of 6b

`docs/STATUS.md` scopes Phase 6b as "the six unported boot scenes — `docking`, `hologram`, `geo`, `layers`, `jarvis`, `topo` — plus the `core` scene's 7 deferred elements". Measured against the web sources that is ~4,700 lines of dense canvas-2D across seven work items, each needing its own pure-geometry module, its own Skia draw shell, its own jest-mock extensions and its own on-device fidelity judgement. That is three to four times the size of the 6a plan and cannot be reviewed or signed off as one unit.

It splits cleanly along a real technical seam:

- **6b-1 (this plan) — the non-projected work.** `core`'s and `laser`'s deferred elements plus the `docking` scene. None of these needs a new projection call site: `core` already projects through `@rtc/motion-core`'s `project3d`, and `laser` and `docking` are pure 2D (screen space only — see `bootCanvas.ts`, which has no `project()` at all). The value is also front-loaded: `core` is first in `BOOT_VARIANTS`, so it is the scene most users see, and `laser` is second.
- **6b-2 (next plan) — the five projected 3D scenes.** `hologram`, `geo`, `layers`, `jarvis`, `topo`. All five share one shape the 6b-1 work does not: a `project3d` call site with `minPerspectiveDenom: 0.4`, a cursor/gyro-steered camera, and precomputed world geometry (coastline tables, heightfield contours, fragment fields) that must be built once per mount and only re-projected per frame. They also all carry heavy text furniture and so all hit the regular-weight Skia text gap below. Write that plan as `docs/superpowers/plans/<date>-rn-mobile-v1-rehaul-phase-6b-2-boot-3d-scenes.md` once this one has landed and been signed off on-device.

**Do not start 6b-2 work inside this plan.** If a task here appears to need `hologram`/`geo`/`layers`/`jarvis`/`topo`, it is out of scope.

---

## Global Constraints

Every task's requirements implicitly include this section.

### 1. The Reanimated/Skia worklet rule (the one that has bitten this repo twice)

Any function reached from inside a worklet body must **itself** carry the `"worklet"` directive as its first statement. Worklet bodies here are: `useDerivedValue` / `useAnimatedStyle` / `useAnimatedProps` callbacks, `useFrameCallback` callbacks, gesture-handler callbacks, and the `createPicture` recorder callback. The rule is transitive — a marked worklet's callees need marking too, including helpers imported from `@rtc/motion-core` and from the `*Geometry.ts` modules in this package.

- Symptom when violated: `[Worklets] Tried to synchronously call a Remote Function` — a red box the instant the scene mounts on a real device.
- Prior instances: PR #334 (`meridianLatitudes`' dropped default parameter) and PR #340 (`ringDashOffset` in `@rtc/motion-core` was unmarked, red-boxing `LockScreen` on every device).
- **Never reference a module-level const from a DEFAULT-PARAMETER position inside a worklet.** The Babel plugin captures consts referenced in a worklet's *body* into its closure but silently drops one referenced only in a default-parameter position; on the UI thread that surfaces as `Property 'X' doesn't exist`. Resolve defaults in the body with `??` (not `||`, so an explicit `0` survives) — `coreGeometry.ts`'s `meridianLatitudes` / `parallelLongitudes` show the pattern.
- **jest is structurally blind to this whole class.** Its Reanimated mock runs worklets as plain JS with full module scope, so an unmarked callee passes every unit test. The iOS simulator is the only witness. Each task below that adds worklet-reachable math repeats this as an explicit step; do not treat a green `pnpm --filter @rtc/client-react-native test` as evidence.

### 2. Banned literal tokens under `src/ui` (CI-enforced by plain grep)

NEVER write the literal tokens `setTimeout`, `setInterval`, `localStorage`, `fetch`, or `rxjs` anywhere under `src/ui` — **including inside comments and prose**. `pnpm --filter @rtc/tests gates` greps text, not AST, and this has reddened CI before. Say "UI-side timers" instead.

### 3. Skia text renders at regular weight only

`Skia.Font()` resolves the platform default typeface and no bold face is bundled, so the web's `bold 12px` / `bold 13px` / `bold 18px` banners render regular here. This is a **known, accepted cosmetic gap documented in 6a** (`docs/STATUS.md`, and the comment in `CoreScene.tsx`'s `drawStatusBanner`). Document it where a new text element hits it; do not try to synthesize bold by double-drawing with an offset, and do not add a font asset — bundling a mono bold face is its own decision, not a side effect of a scene port.

Also: build fonts as `Skia.Font()` + `setSize(n)`. Passing the typeface explicitly as `Skia.Font(undefined, 12)` throws `Value is undefined, expected an Object` on real iOS Skia (the jest mock tolerates it), and from inside a draw helper that fires every frame.

Skia has no `textAlign`. Centre/right alignment is computed with `font.getTextWidth(text)` — `drawStatusBanner` already does this; follow it.

### 4. Motion gating

All boot motion goes through the existing gate, unchanged: `resolveBootMotionEnabled(reducedMotion, isFreeze, forced)`, wired by `useBootMotionEnabled()` and consumed by `BootCanvas`. Power-saver **Freeze always wins** over `forceBootAnimation` and over OS reduced-motion. When motion is off, `BootCanvas` returns `null` and no `<Canvas>` mounts at all. No task in this plan changes that gate or adds a second one.

### 5. Performance doctrine (`docs/performance.md`)

- **Per-frame drawing must never touch the JS thread.** Imperative scenes build their `SkPicture` inside a `useDerivedValue` worklet; declarative scenes drive Skia props from `useDerivedValue`. A scene that writes React state per frame is a defect regardless of how it looks.
- **Precompute geometry once, re-project/redraw per frame.** Anything whose *shape* depends only on `width`/`height` (docking's scan-line overlay, its perspective corridor, its HUD grid; laser's background grid) is built once in a `useMemo` keyed on the dimensions and only *drawn* per frame. Never rebuild a point set inside the per-frame worklet.
- **Avoid `saveLayer`.** The web's whole-frame `ctx.globalAlpha` wash has no free Skia equivalent — `canvas.saveLayer()` allocates an offscreen surface every frame. Thread the flicker factor into each draw call's alpha instead (Task 1 does this).
- **Do not port `ctx.shadowBlur` glows as `MaskFilter.MakeBlur`.** A blur mask filter on a per-frame stroke is the mobile equivalent of the `filter`/`backdrop-filter` traps `docs/performance.md` catalogues. Where the web uses `shadowBlur` for bloom, port the *stroke* and note the missing bloom in a comment, exactly as `laserGeometry.ts`'s header already does for the panel borders. If a scene reads flat on-device without it, that is a Task 11 finding to escalate, not something to fix speculatively.

### 6. The jest Skia mock must be extended for every new Skia API

`packages/client-react-native/jest.setup.ts` mocks `@shopify/react-native-skia` by hand (Skia ships no jest mock). Its `createPicture` really invokes the draw callback against a no-op canvas/paint, so **any Skia method a new draw helper calls that the mock lacks throws `is not a function` under jest**. Every task that introduces a new Skia call adds it to that mock in the same commit, with a comment naming the task that needed it — the existing comments in that file show the convention.

Where the API is a plain data shape rather than behaviour, prefer an **object literal over the Skia factory**: `SkPoint` is `{ x, y }` and `SkRect` is `{ x, y, width, height }`, so `Skia.Point(...)` / `Skia.XYWHRect(...)` are avoidable. Fewer host-object calls inside worklets, and no mock surface to extend.

### 7. Visual scenarios must be pinned, never live

Each scene registers a `__visual` scenario driven by a **fixed** `elapsedSec` shared value (`tests/visual/fixtures.tsx`'s `BOOT_SCENE_ELAPSED_SEC`), never `BootCanvas`'s live `useFrameCallback` — a live clock races the screenshot exactly like the dropped `credit/rfq-tiles-empty` fixture. Add the id to `tests/visual/scenarioIds.ts` **and** the entry to `tests/visual/scenarios.tsx`; `scenarios.test.tsx` asserts the two stay in sync. A full-bleed scenario needs `fullPage: true` at capture or it silently produces zero goldens.

**The existing `boot/core` and `boot/laser` goldens become invalid in this phase** — every task changes what those scenes paint. They are re-captured in Task 11, not defended.

### 8. Repo-wide

- Named exports only in `src/ui/**`; files under `app/**` keep their default export.
- No hardcoded colours. Scenes receive the resolved theme as the `theme` prop (Skia's canvas is a separate reconciler that React Context does not cross — a `useTheme()` call inside a scene throws on a real device). Use `theme.accentPrimary`, `theme.accent2`, `theme.accentPositive`, `theme.accentNegative`.
- Do not add a lint-disable comment or a knip-ignore entry to make a gate pass. Fix the code or escalate.
- Custom rules `rtc/newspaper-order`, `rtc/component-newspaper`, `rtc/no-render-functions` apply; follow the ordering the sibling files demonstrate (public component first, helpers below).
- Biome's `useComponentExportOnlyModules`: a module exports either components or non-components, never both. That is why `bootScene.ts`, `fixtures.tsx` and the `*Geometry.ts` modules are split the way they are — keep new pure modules component-free.
- `@rtc/motion-core` stays zero-runtime-dependency and React/RN/Skia-free. This phase adds nothing to it; all new math lives in `packages/client-react-native/src/ui/shell/boot/scenes/`.

### 9. Gauntlet — run before every commit

```
pnpm --filter @rtc/client-react-native typecheck
pnpm --filter @rtc/client-react-native test
pnpm --filter @rtc/tests gates               # DO NOT SKIP — greps comments
pnpm exec biome ci <changed files>
pnpm exec eslint <changed files>
pnpm exec eslint <changed files> --config eslint.config.typed.mjs
```

`pnpm lint:dead` additionally on the integration task (Task 10).

**Fresh-worktree note:** the workspace libs have no `dist/` in a new worktree. Run `pnpm --filter "@rtc/client-react-native^..." build` once before the first test run, or every `@rtc/*` import fails to resolve.

---

## File Structure

**Created — `packages/client-react-native/src/ui/shell/boot/scenes/`**
- `coreBackdrop.ts` + `.test.ts` — star field table, twinkle alpha, holo-flicker alpha, nucleus-glow constants (Task 1).
- `coreRings.ts` + `.test.ts` — latitude scan-ring latitude, gyro-ring segment sampling and the two ring specs (Task 2).
- `coreArcs.ts` + `.test.ts` — the deterministic order-flow arc schedule, great-circle bulge points, spotlight selection (Task 3).
- `coreTelemetry.ts` + `.test.ts` — calibration-tick state and the four corner telemetry strings (Task 4).
- `laserPanelContent.ts` + `.test.ts` — per-kind panel content geometry and the content reveal ease (Task 6).
- `dockingGeometry.ts` + `.test.ts` — every pure value the docking scene needs: shake/wobble, target position, craft radius, lock box, blink, status ladder, telemetry strings (Task 7).
- `DockingScene.tsx` + `.test.tsx` + `DockingSceneHarness.tsx` — the imperative docking scene (Tasks 8-9).

**Modified**
- `scenes/CoreScene.tsx` — Tasks 1-4 add draw layers and thread the flicker factor.
- `scenes/coreGeometry.ts` — Task 2 adds `projectGlobeVector`; Task 3 exports `hashRandom`.
- `scenes/LaserScene.tsx` — Tasks 5-6.
- `scenes/laserGeometry.ts` — Tasks 5-6 add grid, flash, corner-tick and perimeter-head helpers.
- `bootScene.ts` — Task 9 registers `docking` in `BOOT_SCENES`.
- `jest.setup.ts` — Tasks 1, 2, 8 extend the Skia mock.
- `tests/visual/scenarioIds.ts`, `tests/visual/scenarios.tsx` — Task 10 adds `boot/docking`.
- `docs/STATUS.md` — Task 10.

**Not modified by any task in this plan:** `BootCanvas.tsx`, `BootSequence.tsx`, `useBootMotionEnabled.ts`, `resolveBootMotionEnabled.ts`, `useGyroDrift.ts`, anything under `packages/domain`, `packages/client-core`, `packages/motion-core`, `packages/boot-splash`.

---

## Task 1: `core` — holo flicker, star-drift backdrop, nucleus glow

**Files:**
- Create: `packages/client-react-native/src/ui/shell/boot/scenes/coreBackdrop.ts`
- Test: `packages/client-react-native/src/ui/shell/boot/scenes/coreBackdrop.test.ts` (vitest)
- Modify: `packages/client-react-native/src/ui/shell/boot/scenes/CoreScene.tsx`
- Modify: `packages/client-react-native/jest.setup.ts`

**Interfaces:**
- Consumes: `clamp01`, `hexToRgba` from `coreGeometry.ts`.
- Produces: `CORE_STARS: readonly CoreStar[]`, `starTwinkleAlpha(elapsedSec, star) => number`, `holoFlickerAlpha(elapsedSec) => number`, `NUCLEUS_RADIUS_FACTOR`, `NUCLEUS_STOPS`.

**Source to port:** `packages/boot-splash/src/variants/bootCore.ts` lines 112-121 (star seeding), 156-171 (flicker + star draw), 220-238 (nucleus glow). Read them before writing.

**Why these three land together.** The holo flicker is a whole-frame `ctx.globalAlpha` wash in the web source (`ctx.save(); ctx.globalAlpha = flickerAlpha; …; ctx.restore()`), so it modulates every layer including the five 6a already ported. It cannot be added "later, on top" without touching every draw helper anyway — and the star field and nucleus glow are the two layers that sit *underneath* everything and are meaningless without it. Doing them as one task means `CoreScene`'s draw helpers get their `flicker` parameter exactly once.

**The flicker is threaded, not layered.** Skia's equivalent of `globalAlpha` is `canvas.saveLayer(paint)`, which allocates an offscreen surface every frame — banned by the perf constraint above. Instead every draw helper takes a `flicker: number` and multiplies it into the alpha it already passes to `hexToRgba`. Visually identical for these layers (they are all simple alpha-blended strokes/fills with no overlap-compositing), and free.

- [ ] **Step 1: Write the failing test** — `coreBackdrop.test.ts`

```ts
import { expect, test } from "vitest";

import { CORE_STARS, holoFlickerAlpha, starTwinkleAlpha } from "./coreBackdrop.js";

test("seeds 52 stars inside the normalized band the web variant uses", () => {
  expect(CORE_STARS).toHaveLength(52);

  for (const star of CORE_STARS) {
    expect(star.x).toBeGreaterThanOrEqual(0);
    expect(star.x).toBeLessThan(1);
    expect(star.y).toBeGreaterThanOrEqual(0);
    expect(star.y).toBeLessThanOrEqual(0.85);
    expect(star.size).toBeGreaterThanOrEqual(0.5);
    expect(star.size).toBeLessThanOrEqual(2);
    expect(star.phase).toBeGreaterThanOrEqual(0);
    expect(star.phase).toBeLessThanOrEqual(6.283);
  }
});

test("the star table is deterministic — no Math.random in the seeding", () => {
  const first = CORE_STARS[0];
  expect(first.x).toBeCloseTo(CORE_STARS[0].x);
  expect(CORE_STARS[7].phase).not.toBe(CORE_STARS[8].phase);
});

test("star twinkle stays inside the web's 0.08..0.28 alpha band", () => {
  for (const t of [0, 0.3, 1.1, 2.7, 4.2, 9]) {
    for (const star of CORE_STARS) {
      const alpha = starTwinkleAlpha(t, star);
      expect(alpha).toBeGreaterThanOrEqual(0.08);
      expect(alpha).toBeLessThanOrEqual(0.28);
    }
  }
});

test("holo flicker hovers near 1 and never exceeds it", () => {
  for (const t of [0, 0.05, 0.4, 1.7, 3.3, 6]) {
    const alpha = holoFlickerAlpha(t);
    expect(alpha).toBeGreaterThan(0.4);
    expect(alpha).toBeLessThanOrEqual(1);
  }
});

test("holo flicker dips hard on a glitch frame", () => {
  const samples: number[] = [];

  for (let i = 0; i < 600; i++) {
    samples.push(holoFlickerAlpha(i / 60));
  }

  const dipped = samples.filter((a) => {
    return a < 0.6;
  });
  expect(dipped.length).toBeGreaterThan(0);
});

test("holo flicker is pure — the same second yields the same alpha", () => {
  expect(holoFlickerAlpha(2.5)).toBe(holoFlickerAlpha(2.5));
});
```

- [ ] **Step 2: Run it and confirm it FAILS**

Run: `pnpm --filter @rtc/client-react-native test coreBackdrop` — FAIL, cannot resolve `./coreBackdrop.js`.

- [ ] **Step 3: Implement `coreBackdrop.ts`**

```ts
// packages/client-react-native/src/ui/shell/boot/scenes/coreBackdrop.ts
import { clamp01 } from "#/ui/shell/boot/scenes/coreGeometry";

/**
 * The three backdrop/whole-frame layers of the `core` boot scene, deferred
 * from phase 6a and ported here: the star-drift backdrop, the nucleus glow,
 * and the holo flicker.
 *
 * Ported verbatim (formulas unchanged) from
 * `packages/boot-splash/src/variants/bootCore.ts` — star seeding lines
 * 112-121, flicker + star draw 156-171, nucleus glow 220-238.
 *
 * Every function here is called from inside `CoreScene`'s `createPicture`
 * recorder, which is a worklet — so every one carries the `"worklet"`
 * directive itself. Reanimated worklet-ifies a function where it is
 * *defined*, so an unmarked import called from a worklet red-boxes on a real
 * device with "Tried to synchronously call a Remote Function". jest cannot
 * catch that (its mock runs worklets as plain JS); the simulator is the only
 * witness.
 */

/** Deterministic pseudo-random in [0,1) from an integer seed — the same
 * sine-hash the web variant uses so the star field is stable across renders
 * (never `Math.random`, which would make the visual golden non-deterministic).
 * Duplicated from `coreGeometry.ts`'s file-private copy rather than exported
 * from there, because Task 3 needs it too and a single shared export would
 * make `coreGeometry` the odd module that owns another scene layer's seeding.
 * See Task 3: it promotes this to the shared export and this copy is removed. */
function hashRandom(seed: number): number {
  "worklet";
  const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

/** One star-drift mote: normalized position (0..1 of width/height), pixel
 * size and twinkle phase offset. */
export interface CoreStar {
  readonly x: number;
  readonly y: number;
  readonly size: number;
  readonly phase: number;
}

const STAR_COUNT = 52;

/** 52 stars, seeded once at module load exactly as the web factory seeds them
 * per boot. Module-level rather than per-mount because the seeding is
 * deterministic and theme-independent — there is nothing to recompute. */
export const CORE_STARS: readonly CoreStar[] = Array.from(
  { length: STAR_COUNT },
  (_unused, i) => {
    return {
      x: hashRandom(i * 7 + 1),
      y: hashRandom(i * 11 + 2) * 0.85,
      size: 0.5 + hashRandom(i * 13 + 3) * 1.5,
      phase: hashRandom(i * 17 + 4) * 6.283,
    };
  },
);

/** Star side length in pixels — the web's `fillRect(x, y, 1.3, 1.3)`. */
export const STAR_SIZE_PX = 1.3;

/** Per-star twinkle alpha: a 0.08..0.28 band driven by an absolute sine whose
 * frequency is the star's own size, so bigger stars pulse faster. */
export function starTwinkleAlpha(elapsedSec: number, star: CoreStar): number {
  "worklet";
  const twinkle =
    0.25 + 0.55 * Math.abs(Math.sin(elapsedSec * star.size + star.phase));
  return 0.08 + 0.2 * twinkle;
}

/**
 * Whole-frame holo flicker: a fast carrier sine whose own phase wobbles, plus
 * an occasional hard dip when a per-sixth-of-a-second hash crosses 0.94.
 *
 * The web applies this as `ctx.globalAlpha` around the entire draw. Skia's
 * equivalent is `canvas.saveLayer()`, which allocates an offscreen surface
 * every frame — so `CoreScene` instead multiplies this factor into every
 * layer's alpha. Same result for alpha-blended strokes and fills, no
 * per-frame allocation (see docs/performance.md).
 */
export function holoFlickerAlpha(elapsedSec: number): number {
  "worklet";
  const carrier =
    0.88 + 0.12 * Math.sin(elapsedSec * 36 + Math.sin(elapsedSec * 9) * 4);

  if (hashRandom(Math.floor(elapsedSec * 6) + 2) > 0.94) {
    return carrier * 0.55;
  }

  return carrier;
}

// --- nucleus glow ---------------------------------------------------------

/** The radial gradient's outer radius, as a multiple of the globe radius. */
export const NUCLEUS_RADIUS_FACTOR = 1.15;

/** Half-extent of the square the gradient is painted into, as a multiple of
 * the globe radius — the web fills a `2.6 * globeRadius` box centred on the
 * globe rather than the whole canvas. */
export const NUCLEUS_BOX_FACTOR = 1.3;

/** Gradient stop positions. The colours are resolved at draw time from the
 * theme accent, so only the offsets and their alphas live here. */
export const NUCLEUS_STOPS: readonly number[] = [0, 0.55, 1];
export const NUCLEUS_ALPHAS: readonly number[] = [0.16, 0.05, 0];

/** Alpha of the flat background wash the web paints before anything else
 * (`rgba(0,3,6,0.5)`). Kept as a named constant because it is one of the two
 * places a boot scene paints a non-theme colour — a near-black the design
 * uses to sink the splash below the app background. */
export const CORE_BACKDROP_WASH = "rgba(0,3,6,0.5)";

/** Clamped 0..1 helper re-exported for the draw site's convenience — the
 * gradient alphas are pre-multiplied by the flicker factor, which can push a
 * value fractionally past its band on a glitch frame. */
export function nucleusAlpha(baseAlpha: number, flicker: number): number {
  "worklet";
  return clamp01(baseAlpha * flicker);
}
```

- [ ] **Step 4: Extend the jest Skia mock**

In `packages/client-react-native/jest.setup.ts`, add to `createMockPaint()`:

```ts
      setShader: () => {},
```

add to `createMockCanvas()`:

```ts
      drawPaint: () => {},
```

and add to the mocked `Skia` object plus the module exports:

```ts
    // Phase 6b-1, Task 1 (CoreScene nucleus glow): the radial-gradient shader
    // factory and the tile-mode enum it takes.
    TileMode: { Clamp: 0, Repeat: 1, Mirror: 2, Decal: 3 },
```

and inside `Skia`:

```ts
      Shader: {
        MakeRadialGradient: () => {
          return { __mockShader: true };
        },
      },
```

Also widen the `MockPaint` / `MockCanvas` interfaces at the top of the file with the new members.

- [ ] **Step 5: Thread the flicker through `CoreScene` and add the two backdrop layers**

In `CoreScene.tsx`, inside the `createPicture` callback, before the existing `drawMeridians` call:

```ts
        const flicker = holoFlickerAlpha(elapsed);

        drawBackdropWash(canvas, width, height);
        drawStars(canvas, width, height, elapsed, flicker, accent);
        drawNucleusGlow(canvas, centerX, centerY, radius, flicker, accent);
```

Then give **every** existing draw helper (`drawMeridians`, `drawParallels`, `drawHubNodes`, `drawStatusBanner`) a `flicker: number` parameter and multiply it into each `hexToRgba(..., alpha)` call — e.g. `hexToRgba(accent, segmentAlpha(...) * flicker)`. Pass `flicker` at each call site.

The three new helpers, added below the existing ones in newspaper order:

```ts
function drawBackdropWash(
  canvas: SkCanvas,
  width: number,
  height: number,
): void {
  "worklet";
  const paint = Skia.Paint();
  paint.setColor(Skia.Color(CORE_BACKDROP_WASH));
  canvas.drawRect({ x: 0, y: 0, width, height }, paint);
}

function drawStars(
  canvas: SkCanvas,
  width: number,
  height: number,
  elapsed: number,
  flicker: number,
  accent: string,
): void {
  "worklet";
  const paint = Skia.Paint();
  paint.setAntiAlias(false);

  for (const star of CORE_STARS) {
    paint.setColor(
      Skia.Color(hexToRgba(accent, starTwinkleAlpha(elapsed, star) * flicker)),
    );
    canvas.drawRect(
      {
        x: star.x * width,
        y: star.y * height,
        width: STAR_SIZE_PX,
        height: STAR_SIZE_PX,
      },
      paint,
    );
  }
}

function drawNucleusGlow(
  canvas: SkCanvas,
  centerX: number,
  centerY: number,
  radius: number,
  flicker: number,
  accent: string,
): void {
  "worklet";
  // SkPoint is structurally `{ x, y }`, so an object literal beats calling the
  // `Skia.Point` host factory from inside the worklet — one less cross-boundary
  // call per frame and nothing extra for the jest mock to stub.
  const shader = Skia.Shader.MakeRadialGradient(
    { x: centerX, y: centerY },
    radius * NUCLEUS_RADIUS_FACTOR,
    [
      Skia.Color(hexToRgba(accent, nucleusAlpha(NUCLEUS_ALPHAS[0], flicker))),
      Skia.Color(hexToRgba(accent, nucleusAlpha(NUCLEUS_ALPHAS[1], flicker))),
      Skia.Color("rgba(0,0,0,0)"),
    ],
    [...NUCLEUS_STOPS],
    TileMode.Clamp,
  );
  const paint = Skia.Paint();
  paint.setShader(shader);
  const box = radius * NUCLEUS_BOX_FACTOR;
  canvas.drawRect(
    {
      x: centerX - box,
      y: centerY - box,
      width: box * 2,
      height: box * 2,
    },
    paint,
  );
}
```

Update `CoreScene.tsx`'s header comment: move star-drift backdrop, nucleus glow and holo flicker out of the DEFERRED list into the ported list, and note the flicker-threading decision (no `saveLayer`).

- [ ] **Step 6: Extend `CoreScene.test.tsx`** — add a test that sweeps `elapsedSec` across a range dense enough to hit a glitch frame (`for (let i = 0; i < 40; i++) { await rerender(<CoreSceneHarness elapsedSec={i / 6} mx={0} my={0} />); }`) and still resolves `boot-scene-core`. This is the only jest-visible proof the new helpers do not throw.

- [ ] **Step 7: Worklet audit (jest cannot do this for you)** — grep the new file for `export function` and confirm each body's first statement is `"worklet";`. Confirm no default-parameter references a module const.

- [ ] **Step 8: Run tests + gauntlet. Step 9: Commit**

```
feat(rn-boot): core scene — holo flicker, star backdrop, nucleus glow
```

---

## Task 2: `core` — latitude scan ring + the two counter-rotating gyroscopic rings

**Files:**
- Create: `packages/client-react-native/src/ui/shell/boot/scenes/coreRings.ts`
- Test: `packages/client-react-native/src/ui/shell/boot/scenes/coreRings.test.ts` (vitest)
- Modify: `packages/client-react-native/src/ui/shell/boot/scenes/coreGeometry.ts`
- Modify: `packages/client-react-native/src/ui/shell/boot/scenes/CoreScene.tsx`
- Modify: `packages/client-react-native/jest.setup.ts`

**Interfaces:**
- Consumes: `projectGlobeVector` (new, in `coreGeometry.ts`), `clamp01`, `ease`.
- Produces: `scanRingLatitude(elapsedSec)`, `scanRingAlpha(z)`, `GYRO_RINGS: readonly GyroRingSpec[]`, `gyroRingSpin(elapsedSec, spec)`, `gyroSegmentAngles(segmentIndex)`, `gyroPointVector(angle, spec, spin)`, `ringsPhase(progress)`.

**Source to port:** `bootCore.ts` lines 322-347 (scan ring) and 349-402 (gyro rings).

**Why they land together.** Both are ring geometry projected through the same globe camera, and both need the same new primitive: projecting an arbitrary `(x, y, z)` unit vector rather than a lat/lon pair. Today `coreGeometry.ts` only exposes `projectGlobePoint(lat, lon, …)`.

**The `coreGeometry` change is a refactor, not a rewrite.** Add `projectGlobeVector` and make `projectGlobePoint` delegate to it:

```ts
/** Projects an arbitrary unit-space vector through the globe camera. The
 * gyroscopic rings (`coreRings.ts`) sample points that are not on the unit
 * sphere at all — they are tilted, spun ring points at radius 1.5/1.66 — so
 * they cannot go through `projectGlobePoint`'s lat/lon door. */
export function projectGlobeVector(
  x: number,
  y: number,
  z: number,
  params: Projection3dParams,
  centerX: number,
  centerY: number,
  radius: number,
): GlobeScreenPoint {
  "worklet";
  const projected = project3d(x, y, z, params);
  return {
    x: centerX + projected.x * radius,
    y: centerY - projected.y * radius,
    z: projected.z,
    perspective: projected.perspective,
  };
}
```

and

```ts
export function projectGlobePoint(
  lat: number,
  lon: number,
  params: Projection3dParams,
  centerX: number,
  centerY: number,
  radius: number,
): GlobeScreenPoint {
  "worklet";
  const [x, y, z] = hubVectorFromLatLon(lat, lon);
  return projectGlobeVector(x, y, z, params, centerX, centerY, radius);
}
```

The existing `coreGeometry.test.ts` assertions on `projectGlobePoint` must keep passing unchanged — that is the refactor's safety net.

- [ ] **Step 1: Write the failing test** — `coreRings.test.ts`

```ts
import { expect, test } from "vitest";

import {
  GYRO_RINGS,
  gyroPointVector,
  gyroRingSpin,
  gyroSegmentAngles,
  ringsPhase,
  scanRingAlpha,
  scanRingLatitude,
} from "./coreRings.js";

test("the scan ring sweeps south pole to north pole and wraps", () => {
  expect(scanRingLatitude(0)).toBeCloseTo(-Math.PI / 2);
  // 0.3 rev/s → half a sweep at t = 1/0.6 s.
  expect(scanRingLatitude(1 / 0.6)).toBeCloseTo(0);
  // Just before a full sweep it is near the north pole; just after, back south.
  expect(scanRingLatitude(3.32)).toBeGreaterThan(0);
  expect(scanRingLatitude(3.34)).toBeLessThan(0);
});

test("scan-ring alpha is brightest at the near edge and floors at 0.08", () => {
  expect(scanRingAlpha(-1)).toBeGreaterThan(scanRingAlpha(1));
  expect(scanRingAlpha(5)).toBeCloseTo(0.08);
  expect(scanRingAlpha(-5)).toBeCloseTo(0.46);
});

test("two rings counter-rotate at the web's radii and tilts", () => {
  expect(GYRO_RINGS).toHaveLength(2);
  expect(GYRO_RINGS[0].radius).toBeCloseTo(1.5);
  expect(GYRO_RINGS[1].radius).toBeCloseTo(1.66);
  expect(GYRO_RINGS[0].tilt).toBeCloseTo(1.05);
  expect(GYRO_RINGS[1].tilt).toBeCloseTo(-0.85);
  expect(Math.sign(GYRO_RINGS[0].spinRate)).not.toBe(
    Math.sign(GYRO_RINGS[1].spinRate),
  );
});

test("spin advances linearly with elapsed time", () => {
  expect(gyroRingSpin(0, GYRO_RINGS[0])).toBeCloseTo(0);
  expect(gyroRingSpin(2, GYRO_RINGS[0])).toBeCloseTo(1.2);
  expect(gyroRingSpin(2, GYRO_RINGS[1])).toBeCloseTo(-0.9);
});

test("segment 3 of every group of 4 is the gap — 6 drawn of 8", () => {
  const drawn = [0, 1, 2, 3, 4, 5, 6, 7].filter((seg) => {
    return gyroSegmentAngles(seg).length > 0;
  });
  expect(drawn).toEqual([0, 1, 2, 4, 5, 6]);
});

test("each drawn segment samples 11 angles inside one 8th-turn slot", () => {
  const angles = gyroSegmentAngles(1);
  expect(angles).toHaveLength(11);
  expect(angles[0]).toBeCloseTo((10 / 80) * 6.283);
  expect(angles[10]).toBeCloseTo((20 / 80) * 6.283);
});

test("a ring point lies at the ring radius before perspective is applied", () => {
  const spec = GYRO_RINGS[0];
  const [x, y, z] = gyroPointVector(0, spec, 0);
  expect(Math.hypot(x, y, z)).toBeCloseTo(spec.radius);
});

test("ring reveal starts at 18% of boot progress and completes by 43%", () => {
  expect(ringsPhase(0.1)).toBe(0);
  expect(ringsPhase(0.18)).toBeCloseTo(0);
  expect(ringsPhase(0.43)).toBeCloseTo(1);
  expect(ringsPhase(1)).toBeCloseTo(1);
});
```

- [ ] **Step 2: Run it and confirm it FAILS.**

- [ ] **Step 3: Implement `coreRings.ts`**

```ts
// packages/client-react-native/src/ui/shell/boot/scenes/coreRings.ts
import { clamp01, ease } from "#/ui/shell/boot/scenes/coreGeometry";

/**
 * The two ring layers of the `core` boot scene, deferred from phase 6a: the
 * latitude scan ring that sweeps south → north across the globe, and the two
 * counter-rotating gyroscopic segmented rings that wrap it.
 *
 * Ported verbatim from `packages/boot-splash/src/variants/bootCore.ts` —
 * scan ring lines 322-347, gyro rings 349-402.
 *
 * Every export carries the `"worklet"` directive: all of it is called from
 * inside `CoreScene`'s `createPicture` recorder worklet, and an unmarked
 * callee red-boxes on device (jest is blind to it).
 */

// --- latitude scan ring ---------------------------------------------------

const SCAN_SWEEP_RATE = 0.3;

/** The scanning parallel's latitude: a saw wave from the south pole to the
 * north pole, one full sweep every `1 / 0.3` seconds. */
export function scanRingLatitude(elapsedSec: number): number {
  "worklet";
  return -Math.PI / 2 + ((elapsedSec * SCAN_SWEEP_RATE) % 1) * Math.PI;
}

/** Depth-cued alpha for a scan-ring segment. A wider band than the mesh's
 * `segmentAlpha` (0.08..0.46 vs 0.28..0.78) because the ring must read as a
 * moving highlight over the mesh, not as more mesh. */
export function scanRingAlpha(z: number): number {
  "worklet";
  return 0.08 + 0.38 * clamp01((0.55 - z) / 1.1);
}

/** Longitude samples for the scan ring — a full turn in 40 steps, matching
 * the web loop. Constant across frames, so `CoreScene` hoists it out of the
 * per-frame path; exported for the test. */
export const SCAN_RING_SEGMENTS = 40;
export const SCAN_RING_STROKE_WIDTH = 1.4;

// --- gyroscopic segmented rings -------------------------------------------

/** One of the two rings: unit-space radius, tilt about the X axis, spin rate
 * in rad/s (signed — the two counter-rotate), colour role and stroke. */
export interface GyroRingSpec {
  readonly radius: number;
  readonly tilt: number;
  readonly spinRate: number;
  /** `true` → the theme's `accent2`, `false` → `accentPrimary`. Resolving the
   * token itself belongs to the draw site, which is where the theme lives. */
  readonly useAltColor: boolean;
  readonly alpha: number;
  readonly strokeWidth: number;
}

/** Verbatim from the web's two `drawGyroRing(...)` calls (bootCore.ts:399-400). */
export const GYRO_RINGS: readonly GyroRingSpec[] = [
  {
    radius: 1.5,
    tilt: 1.05,
    spinRate: 0.6,
    useAltColor: false,
    alpha: 0.5,
    strokeWidth: 1.2,
  },
  {
    radius: 1.66,
    tilt: -0.85,
    spinRate: -0.45,
    useAltColor: true,
    alpha: 0.3,
    strokeWidth: 1,
  },
];

export function gyroRingSpin(elapsedSec: number, spec: GyroRingSpec): number {
  "worklet";
  return elapsedSec * spec.spinRate;
}

const GYRO_SEGMENT_COUNT = 8;
const GYRO_SAMPLES_PER_SEGMENT = 10;
const GYRO_TOTAL_SAMPLES = 80;

/**
 * Angles sampled for one ring segment, or an empty list for the gap segments.
 * The web draws 8 segments of a ring that is divided into 80 sample slots,
 * skipping every 4th (`seg % 4 === 3`) so the ring reads as machinery rather
 * than a solid hoop.
 */
export function gyroSegmentAngles(segmentIndex: number): readonly number[] {
  "worklet";

  if (segmentIndex % 4 === 3) {
    return [];
  }

  const angles: number[] = [];

  for (let sample = 0; sample <= GYRO_SAMPLES_PER_SEGMENT; sample++) {
    angles.push(
      ((segmentIndex * GYRO_SAMPLES_PER_SEGMENT + sample) /
        GYRO_TOTAL_SAMPLES) *
        6.283,
    );
  }

  return angles;
}

export const GYRO_SEGMENT_INDICES: readonly number[] = Array.from(
  { length: GYRO_SEGMENT_COUNT },
  (_unused, i) => {
    return i;
  },
);

/**
 * A ring point in the globe's unit space: a circle of `spec.radius` in the
 * XZ plane, tilted about X, then spun about Z. The result is fed to
 * `projectGlobeVector` — the same camera the mesh uses, so the rings sit in
 * the same world as the globe rather than being screen-space decoration.
 */
export function gyroPointVector(
  angle: number,
  spec: GyroRingSpec,
  spin: number,
): readonly [number, number, number] {
  "worklet";
  const ringX = Math.cos(angle) * spec.radius;
  const ringZ = Math.sin(angle) * spec.radius;
  const tiltedY = -ringZ * Math.sin(spec.tilt);
  const tiltedZ = ringZ * Math.cos(spec.tilt);
  const spunX = ringX * Math.cos(spin) - tiltedY * Math.sin(spin);
  const spunY = ringX * Math.sin(spin) + tiltedY * Math.cos(spin);
  return [spunX, spunY, tiltedZ];
}

/** Ring reveal ramp: nothing before 18% of boot progress, fully in by 43%. */
export function ringsPhase(progress: number): number {
  "worklet";
  return ease((progress - 0.18) / 0.25);
}
```

- [ ] **Step 4: Extend the jest Skia mock** — the gyro rings are drawn as multi-point polylines, so the draw helper builds an `SkPath`. Add to the mocked `Skia` object:

```ts
      // Phase 6b-1, Task 2 (CoreScene gyro rings): polyline paths built inside
      // the recorder worklet.
      Path: {
        Make: () => {
          return {
            moveTo: () => {},
            lineTo: () => {},
            close: () => {},
            addRect: () => {},
            addCircle: () => {},
          };
        },
      },
```

(`drawPath` is already on the mock canvas.)

- [ ] **Step 5: Add the two draw helpers to `CoreScene.tsx`**

Call them after `drawParallels` and before `drawHubNodes` — the web's z-order.

```ts
function drawScanRing(
  canvas: SkCanvas,
  params: Projection3dParams,
  centerX: number,
  centerY: number,
  radius: number,
  elapsed: number,
  flicker: number,
  accentAlt: string,
): void {
  "worklet";
  const lat = scanRingLatitude(elapsed);
  const paint = Skia.Paint();
  paint.setStyle(PaintStyle.Stroke);
  paint.setStrokeWidth(SCAN_RING_STROKE_WIDTH);
  paint.setAntiAlias(true);
  let prev: GlobeScreenPoint | null = null;

  for (let i = 0; i <= SCAN_RING_SEGMENTS; i++) {
    const point = projectGlobePoint(
      lat,
      (i / SCAN_RING_SEGMENTS) * Math.PI * 2,
      params,
      centerX,
      centerY,
      radius,
    );

    if (prev !== null) {
      paint.setColor(
        Skia.Color(hexToRgba(accentAlt, scanRingAlpha(point.z) * flicker)),
      );
      canvas.drawLine(prev.x, prev.y, point.x, point.y, paint);
    }

    prev = point;
  }
}

function drawGyroRings(
  canvas: SkCanvas,
  params: Projection3dParams,
  centerX: number,
  centerY: number,
  radius: number,
  elapsed: number,
  progress: number,
  flicker: number,
  accent: string,
  accentAlt: string,
): void {
  "worklet";
  const phase = ringsPhase(progress);

  if (phase <= 0) {
    return;
  }

  const paint = Skia.Paint();
  paint.setStyle(PaintStyle.Stroke);
  paint.setAntiAlias(true);

  for (const spec of GYRO_RINGS) {
    const spin = gyroRingSpin(elapsed, spec);
    paint.setStrokeWidth(spec.strokeWidth);
    paint.setColor(
      Skia.Color(
        hexToRgba(
          spec.useAltColor ? accentAlt : accent,
          spec.alpha * phase * flicker,
        ),
      ),
    );

    for (const segmentIndex of GYRO_SEGMENT_INDICES) {
      const angles = gyroSegmentAngles(segmentIndex);

      if (angles.length === 0) {
        continue;
      }

      const path = Skia.Path.Make();

      for (let i = 0; i < angles.length; i++) {
        const [vx, vy, vz] = gyroPointVector(angles[i], spec, spin);
        const point = projectGlobeVector(
          vx,
          vy,
          vz,
          params,
          centerX,
          centerY,
          radius,
        );

        if (i === 0) {
          path.moveTo(point.x, point.y);
        } else {
          path.lineTo(point.x, point.y);
        }
      }

      canvas.drawPath(path, paint);
    }
  }
}
```

Move both elements out of `CoreScene.tsx`'s DEFERRED header list.

- [ ] **Step 6: Extend `CoreScene.test.tsx`** — sweep `elapsedSec` across the ring reveal thresholds (`0.7`, `0.8`, `1.9`) and assert the scene still resolves. Add a `coreGeometry.test.ts` case asserting `projectGlobeVector` and `projectGlobePoint` agree for a lat/lon-derived vector (proves the delegation refactor).

- [ ] **Step 7: Worklet audit** — as Task 1, Step 7.

- [ ] **Step 8: Run tests + gauntlet. Step 9: Commit**

```
feat(rn-boot): core scene — latitude scan ring and gyroscopic rings
```

---

## Task 3: `core` — order-flow arcs (deterministic schedule) + rotating spotlight callout

**Files:**
- Create: `packages/client-react-native/src/ui/shell/boot/scenes/coreArcs.ts`
- Test: `packages/client-react-native/src/ui/shell/boot/scenes/coreArcs.test.ts` (vitest)
- Modify: `packages/client-react-native/src/ui/shell/boot/scenes/coreGeometry.ts` (export `hashRandom`)
- Modify: `packages/client-react-native/src/ui/shell/boot/scenes/coreBackdrop.ts` (drop its private copy, import the shared one)
- Modify: `packages/client-react-native/src/ui/shell/boot/scenes/CoreScene.tsx`

**Interfaces:**
- Consumes: `hashRandom`, `hubVectorFromLatLon`, `projectGlobeVector`, `CORE_HUBS`, `clamp01`.
- Produces: `activeFlowArcs(elapsedSec) => readonly ActiveFlowArc[]`, `spawnedArcCount(elapsedSec) => number`, `arcBulgeVector(fraction, fromVec, toVec)`, `spotlightIndex(elapsedSec, hubCount)`, `spotlightFlowRate(elapsedSec, hubPhase)`.

**Source to port:** `bootCore.ts` lines 435-471 (spotlight) and 473-558 (arcs).

**The one real design decision in this task: the arc schedule must be stateless.**

The web keeps mutable per-boot state — an `arcs` array it pushes to and splices from, `lastArcSec`, an incrementing `arcSeed`, and a cumulative `arcCount`. None of that survives into a worklet cleanly: the recorder runs on the UI thread and must be a pure function of `elapsedSec`, or the picture stops being reproducible (and the pinned visual golden stops being deterministic).

Reformulate the same behaviour as a closed-form schedule. The web spawns its first arc on the first frame where `progress > 0.36` (i.e. `elapsedSec > 0.36 × 4.2 = 1.512`), then one every `0.5` s, drawing seeds from `hashRandom` with a counter that starts at 7 and advances by 4 per arc. So arc `n` (0-based):

| property | web expression | closed form |
|---|---|---|
| start | first frame past the gate, then `+0.5` each | `1.512 + n × 0.5` |
| `fromHub` | `hashRandom(arcSeed++)` | `hashRandom(7 + 4n)` |
| `toHub` | `hashRandom(arcSeed++)`, bumped `+4` on collision | `hashRandom(8 + 4n)`, same bump |
| `durationSec` | `1.5 + hashRandom(arcSeed++) * 0.8` | `1.5 + hashRandom(9 + 4n) * 0.8` |
| `buy` | `hashRandom(arcSeed++) > 0.45` | `hashRandom(10 + 4n) > 0.45` |

**The web's `arcs.length < 6` cap never binds** and is therefore not ported: durations top out at 2.3 s against a 0.5 s interval, so at most 5 arcs are ever live. Assert that in the test rather than trusting the arithmetic — if it ever fails, the schedule needs the cap back.

- [ ] **Step 1: Write the failing test** — `coreArcs.test.ts`

```ts
import { expect, test } from "vitest";

import { CORE_HUBS, hubVectorFromLatLon } from "./coreGeometry.js";
import {
  ARC_FIRST_SEC,
  ARC_INTERVAL_SEC,
  activeFlowArcs,
  arcBulgeVector,
  spawnedArcCount,
  spotlightFlowRate,
  spotlightIndex,
} from "./coreArcs.js";

test("no arcs before the 36%-of-boot gate", () => {
  expect(activeFlowArcs(0)).toHaveLength(0);
  expect(activeFlowArcs(ARC_FIRST_SEC - 0.01)).toHaveLength(0);
  expect(spawnedArcCount(1)).toBe(0);
});

test("the first arc is live immediately after the gate", () => {
  const arcs = activeFlowArcs(ARC_FIRST_SEC + 0.01);
  expect(arcs).toHaveLength(1);
  expect(arcs[0].progress).toBeGreaterThan(0);
  expect(arcs[0].progress).toBeLessThan(0.05);
});

test("arcs spawn every half second and retire when their progress passes 1", () => {
  const at = ARC_FIRST_SEC + ARC_INTERVAL_SEC * 4 + 0.01;
  expect(spawnedArcCount(at)).toBe(5);
  const live = activeFlowArcs(at);
  expect(live.length).toBeGreaterThan(0);
  expect(live.length).toBeLessThan(5);

  for (const arc of live) {
    expect(arc.progress).toBeGreaterThanOrEqual(0);
    expect(arc.progress).toBeLessThan(1);
  }
});

test("live arcs never exceed 5, so the web's cap of 6 is unreachable", () => {
  let peak = 0;

  for (let i = 0; i < 2000; i++) {
    peak = Math.max(peak, activeFlowArcs(i / 100).length);
  }

  expect(peak).toBeLessThanOrEqual(5);
});

test("an arc never links a hub to itself", () => {
  for (let n = 0; n < 200; n++) {
    const at = ARC_FIRST_SEC + n * ARC_INTERVAL_SEC + 0.01;

    for (const arc of activeFlowArcs(at)) {
      expect(arc.fromHub).not.toBe(arc.toHub);
      expect(arc.fromHub).toBeGreaterThanOrEqual(0);
      expect(arc.fromHub).toBeLessThan(CORE_HUBS.length);
      expect(arc.toHub).toBeLessThan(CORE_HUBS.length);
    }
  }
});

test("the schedule is pure — the same instant yields the same arcs", () => {
  expect(activeFlowArcs(3.7)).toEqual(activeFlowArcs(3.7));
});

test("both buy and sell arcs occur", () => {
  const kinds = new Set<boolean>();

  for (let i = 0; i < 600; i++) {
    for (const arc of activeFlowArcs(i / 20)) {
      kinds.add(arc.buy);
    }
  }

  expect(kinds.size).toBe(2);
});

test("an arc's midpoint bows off the sphere by the 0.28 bulge", () => {
  const from = hubVectorFromLatLon(CORE_HUBS[0].lat, CORE_HUBS[0].lon);
  const to = hubVectorFromLatLon(CORE_HUBS[1].lat, CORE_HUBS[1].lon);
  const mid = arcBulgeVector(0.5, from, to);
  expect(Math.hypot(mid[0], mid[1], mid[2])).toBeCloseTo(1.28);
  const start = arcBulgeVector(0, from, to);
  expect(Math.hypot(start[0], start[1], start[2])).toBeCloseTo(1);
});

test("the spotlight steps to the next hub every 2.2s and wraps", () => {
  expect(spotlightIndex(0, 10)).toBe(0);
  expect(spotlightIndex(2.3, 10)).toBe(1);
  expect(spotlightIndex(22.1, 10)).toBe(0);
});

test("the spotlight flow rate stays in the web's 120..300 M/s band", () => {
  for (let i = 0; i < 400; i++) {
    const rate = spotlightFlowRate(i / 10, 1.7);
    expect(rate).toBeGreaterThanOrEqual(120);
    expect(rate).toBeLessThanOrEqual(300);
  }
});
```

- [ ] **Step 2: Run it and confirm it FAILS.**

- [ ] **Step 3: Promote `hashRandom` to a shared export**

In `coreGeometry.ts` change `function hashRandom` to `export function hashRandom` and update its doc comment (it now seeds the star field, the hub ping phases and the arc schedule). In `coreBackdrop.ts`, delete the private copy and import the shared one, removing the "see Task 3" note.

- [ ] **Step 4: Implement `coreArcs.ts`**

```ts
// packages/client-react-native/src/ui/shell/boot/scenes/coreArcs.ts
import { BOOT_DURATION_MS } from "@rtc/client-core";

import { CORE_HUBS, clamp01, hashRandom } from "#/ui/shell/boot/scenes/coreGeometry";

/**
 * Order-flow arcs and the rotating spotlight callout — two `core` scene
 * layers deferred from phase 6a.
 *
 * Ported from `packages/boot-splash/src/variants/bootCore.ts` (spotlight
 * 435-471, arcs 473-558), with ONE deliberate structural change: the web
 * keeps mutable per-boot state (an `arcs` array it pushes/splices, a
 * `lastArcSec`, an incrementing seed counter, a cumulative count). A worklet
 * recorder has to be a pure function of `elapsedSec` — otherwise the picture
 * stops being reproducible and the pinned visual golden stops being
 * deterministic — so the same behaviour is expressed as a closed-form
 * schedule: arc `n` starts at `ARC_FIRST_SEC + n * ARC_INTERVAL_SEC` and
 * draws its four random properties from the same `hashRandom` seeds
 * (7 + 4n .. 10 + 4n) the web's counter would have produced.
 *
 * The web's `arcs.length < 6` concurrency cap is NOT ported: durations top
 * out at 2.3s against a 0.5s spawn interval, so at most 5 arcs are ever live
 * and the cap can never bind. `coreArcs.test.ts` asserts that bound directly,
 * so if the constants ever change the test fails rather than the visual
 * silently drifting.
 *
 * All exports carry `"worklet"` — every one is called from inside
 * `CoreScene`'s recorder worklet.
 */

/** Boot progress at which the web opens the arc gate (`progress > 0.36`),
 * converted to seconds against the shared boot duration. */
export const ARC_FIRST_SEC = 0.36 * (BOOT_DURATION_MS / 1000);
export const ARC_INTERVAL_SEC = 0.5;

const ARC_SEED_BASE = 7;
const ARC_SEED_STRIDE = 4;
const ARC_MIN_DURATION_SEC = 1.5;
const ARC_DURATION_SPREAD_SEC = 0.8;
const ARC_BUY_THRESHOLD = 0.45;
/** Great-circle lift: the arc bows off the sphere by up to 28% at its
 * midpoint, tapering to nothing at both hubs. */
const ARC_BULGE = 0.28;

/** A currently-in-flight arc, resolved for one instant. */
export interface ActiveFlowArc {
  readonly fromHub: number;
  readonly toHub: number;
  /** 0..1 along the arc — the draw head's position. */
  readonly progress: number;
  readonly buy: boolean;
}

/** How many arcs have been scheduled by `elapsedSec` — the web's cumulative
 * `arcCount`, which the corner telemetry readout prints as `LINKS n`. */
export function spawnedArcCount(elapsedSec: number): number {
  "worklet";

  if (elapsedSec < ARC_FIRST_SEC) {
    return 0;
  }

  return Math.floor((elapsedSec - ARC_FIRST_SEC) / ARC_INTERVAL_SEC) + 1;
}

function arcDurationSec(index: number): number {
  "worklet";
  return (
    ARC_MIN_DURATION_SEC +
    hashRandom(ARC_SEED_BASE + 2 + ARC_SEED_STRIDE * index) *
      ARC_DURATION_SPREAD_SEC
  );
}

/** The arcs in flight at `elapsedSec`, oldest first. */
export function activeFlowArcs(elapsedSec: number): readonly ActiveFlowArc[] {
  "worklet";
  const spawned = spawnedArcCount(elapsedSec);
  const arcs: ActiveFlowArc[] = [];
  const hubCount = CORE_HUBS.length;

  for (let index = 0; index < spawned; index++) {
    const startSec = ARC_FIRST_SEC + index * ARC_INTERVAL_SEC;
    const progress = (elapsedSec - startSec) / arcDurationSec(index);

    if (progress < 0 || progress >= 1) {
      continue;
    }

    const fromHub = Math.floor(
      hashRandom(ARC_SEED_BASE + ARC_SEED_STRIDE * index) * hubCount,
    );
    let toHub = Math.floor(
      hashRandom(ARC_SEED_BASE + 1 + ARC_SEED_STRIDE * index) * hubCount,
    );

    if (toHub === fromHub) {
      toHub = (toHub + 4) % hubCount;
    }

    arcs.push({
      fromHub,
      toHub,
      progress,
      buy:
        hashRandom(ARC_SEED_BASE + 3 + ARC_SEED_STRIDE * index) >
        ARC_BUY_THRESHOLD,
    });
  }

  return arcs;
}

/**
 * A point `fraction` of the way along the great-circle path between two hub
 * vectors, re-normalized onto the sphere and lifted by a sine bulge so the
 * arc bows toward the camera instead of hugging the surface.
 */
export function arcBulgeVector(
  fraction: number,
  fromVec: readonly [number, number, number],
  toVec: readonly [number, number, number],
): readonly [number, number, number] {
  "worklet";
  const x = fromVec[0] + (toVec[0] - fromVec[0]) * fraction;
  const y = fromVec[1] + (toVec[1] - fromVec[1]) * fraction;
  const z = fromVec[2] + (toVec[2] - fromVec[2]) * fraction;
  const length = Math.hypot(x, y, z) || 1;
  const bulge = 1 + ARC_BULGE * Math.sin(Math.PI * fraction);
  return [(x / length) * bulge, (y / length) * bulge, (z / length) * bulge];
}

/** Samples along the faint full-length arc and along the bright tail. */
export const ARC_TRAIL_SAMPLES = 20;
export const ARC_TAIL_SAMPLES = 8;
/** The bright tail trails the head by this much of the arc. */
export const ARC_TAIL_LENGTH = 0.18;
/** Landing-ripple window: the last 12% of an arc's flight. */
export const ARC_RIPPLE_START = 0.88;

export function arcRippleFraction(progress: number): number {
  "worklet";
  return clamp01((progress - ARC_RIPPLE_START) / (1 - ARC_RIPPLE_START));
}

// --- rotating spotlight callout -------------------------------------------

const SPOTLIGHT_DWELL_SEC = 2.2;

/** Which hub the callout is labelling right now — one every 2.2 seconds,
 * wrapping around the hub table. */
export function spotlightIndex(elapsedSec: number, hubCount: number): number {
  "worklet";
  return Math.floor(elapsedSec / SPOTLIGHT_DWELL_SEC) % hubCount;
}

/** The decorative "FLOW nnnM/S" figure under the hub code. Verbatim from the
 * web: a 120..300 band driven by a slow sine offset per hub. */
export function spotlightFlowRate(
  elapsedSec: number,
  hubPhase: number,
): number {
  "worklet";
  return (
    120 + Math.round(90 * Math.sin(elapsedSec * 0.7 + hubPhase) + 90)
  );
}

/** Leader-line and label offsets, in screen pixels, verbatim from the web. */
export const SPOTLIGHT_ELBOW_DX = 12;
export const SPOTLIGHT_ELBOW_DY = -14;
export const SPOTLIGHT_LABEL_WIDTH = 110;
export const SPOTLIGHT_LABEL_MIN_X = 16;
export const SPOTLIGHT_LABEL_RIGHT_INSET = 130;
```

- [ ] **Step 5: Add the two draw helpers to `CoreScene.tsx`**

Draw order, matching the web: arcs go after the hub nodes, spotlight after the arcs, both before the banner. The arc head is `#fff` in the web with a `shadowBlur` bloom — port the white dot, skip the bloom (perf constraint 5) and say so in a comment.

```ts
function drawFlowArcs(
  canvas: SkCanvas,
  params: Projection3dParams,
  centerX: number,
  centerY: number,
  radius: number,
  elapsed: number,
  flicker: number,
  buyColor: string,
  sellColor: string,
): void {
  "worklet";
  const arcs = activeFlowArcs(elapsed);

  if (arcs.length === 0) {
    return;
  }

  const paint = Skia.Paint();
  paint.setStyle(PaintStyle.Stroke);
  paint.setAntiAlias(true);
  const headPaint = Skia.Paint();
  headPaint.setAntiAlias(true);

  for (const arc of arcs) {
    const fromVec = hubVectorFromLatLon(
      CORE_HUBS[arc.fromHub].lat,
      CORE_HUBS[arc.fromHub].lon,
    );
    const toVec = hubVectorFromLatLon(
      CORE_HUBS[arc.toHub].lat,
      CORE_HUBS[arc.toHub].lon,
    );
    const color = arc.buy ? buyColor : sellColor;

    const trail = Skia.Path.Make();

    for (let i = 0; i <= ARC_TRAIL_SAMPLES; i++) {
      const [vx, vy, vz] = arcBulgeVector(
        i / ARC_TRAIL_SAMPLES,
        fromVec,
        toVec,
      );
      const point = projectGlobeVector(
        vx,
        vy,
        vz,
        params,
        centerX,
        centerY,
        radius,
      );

      if (i === 0) {
        trail.moveTo(point.x, point.y);
      } else {
        trail.lineTo(point.x, point.y);
      }
    }

    paint.setStrokeWidth(1);
    paint.setColor(Skia.Color(hexToRgba(color, 0.16 * flicker)));
    canvas.drawPath(trail, paint);

    const tailStart = Math.max(0, arc.progress - ARC_TAIL_LENGTH);
    const tail = Skia.Path.Make();

    for (let i = 0; i <= ARC_TAIL_SAMPLES; i++) {
      const [vx, vy, vz] = arcBulgeVector(
        tailStart + ((arc.progress - tailStart) * i) / ARC_TAIL_SAMPLES,
        fromVec,
        toVec,
      );
      const point = projectGlobeVector(
        vx,
        vy,
        vz,
        params,
        centerX,
        centerY,
        radius,
      );

      if (i === 0) {
        tail.moveTo(point.x, point.y);
      } else {
        tail.lineTo(point.x, point.y);
      }
    }

    paint.setStrokeWidth(1.7);
    paint.setColor(Skia.Color(hexToRgba(color, 0.8 * flicker)));
    canvas.drawPath(tail, paint);

    const [hx, hy, hz] = arcBulgeVector(arc.progress, fromVec, toVec);
    const head = projectGlobeVector(
      hx,
      hy,
      hz,
      params,
      centerX,
      centerY,
      radius,
    );
    // The web wraps this dot in a `shadowBlur: 10` bloom. A per-frame blur
    // mask filter is the mobile equivalent of the compositing traps in
    // docs/performance.md, so the dot is ported and the bloom is not.
    headPaint.setColor(Skia.Color(`rgba(255,255,255,${flicker})`));
    canvas.drawCircle(head.x, head.y, 1.9, headPaint);

    const ripple = arcRippleFraction(arc.progress);

    if (ripple > 0) {
      const [lx, ly, lz] = arcBulgeVector(1, fromVec, toVec);
      const landing = projectGlobeVector(
        lx,
        ly,
        lz,
        params,
        centerX,
        centerY,
        radius,
      );
      paint.setStrokeWidth(1.3);
      paint.setColor(
        Skia.Color(hexToRgba(color, 0.7 * (1 - ripple) * flicker)),
      );
      canvas.drawCircle(landing.x, landing.y, 2 + ripple * 9, paint);
    }
  }
}

function drawSpotlight(
  canvas: SkCanvas,
  params: Projection3dParams,
  centerX: number,
  centerY: number,
  radius: number,
  width: number,
  elapsed: number,
  progress: number,
  flicker: number,
  accent: string,
  accentAlt: string,
): void {
  "worklet";

  if (ease(Math.max(0, Math.min(1, (progress - 0.28) / 0.22))) < 1) {
    return;
  }

  const index = spotlightIndex(elapsed, CORE_HUBS.length);
  const hub = CORE_HUBS[index];
  const point = projectGlobePoint(
    hub.lat,
    hub.lon,
    params,
    centerX,
    centerY,
    radius,
  );

  if (point.z >= 0) {
    return;
  }

  const labelX = Math.min(
    Math.max(point.x + 14, SPOTLIGHT_LABEL_MIN_X),
    width - SPOTLIGHT_LABEL_RIGHT_INSET,
  );
  const leader = Skia.Path.Make();
  leader.moveTo(point.x, point.y);
  leader.lineTo(point.x + SPOTLIGHT_ELBOW_DX, point.y + SPOTLIGHT_ELBOW_DY);
  leader.lineTo(
    labelX + SPOTLIGHT_LABEL_WIDTH,
    point.y + SPOTLIGHT_ELBOW_DY,
  );
  const linePaint = Skia.Paint();
  linePaint.setStyle(PaintStyle.Stroke);
  linePaint.setStrokeWidth(1);
  linePaint.setAntiAlias(true);
  linePaint.setColor(Skia.Color(hexToRgba(accent, 0.45 * flicker)));
  canvas.drawPath(leader, linePaint);

  // Regular weight only — no bold typeface is bundled (see this file's header
  // and the phase 6a note in docs/STATUS.md). The web label is 10px regular
  // here anyway, so only the banner is affected.
  const font = Skia.Font();
  font.setSize(10);
  const textPaint = Skia.Paint();
  textPaint.setAntiAlias(true);
  textPaint.setColor(Skia.Color(hexToRgba(accentAlt, 0.9 * flicker)));
  const code = `${hub.code} · NODE ${String(index + 1).padStart(2, "0")}`;
  canvas.drawText(code, labelX + 2, point.y - 20, textPaint, font);
  textPaint.setColor(Skia.Color(hexToRgba(accent, 0.7 * flicker)));
  canvas.drawText(
    `FLOW ${spotlightFlowRate(elapsed, hub.phase)}M/S`,
    labelX + 2,
    point.y - 7,
    textPaint,
    font,
  );
}
```

Note the spotlight's gate duplicates `drawHubNodes`' `nodesPhase` expression; hoist that into a small `nodesPhase(progress)` export in `coreGeometry.ts` and use it in both, rather than repeating the literal thresholds.

- [ ] **Step 6: Extend `CoreScene.test.tsx`** — sweep `elapsedSec` past the arc gate (`1.6`, `2.4`, `3.1`, `4.2`) and assert no throw; the arc paths are the densest per-frame allocation in the scene and a mocked-Skia mount is the cheapest smoke for it.

- [ ] **Step 7: Worklet audit. Step 8: Run tests + gauntlet. Step 9: Commit**

```
feat(rn-boot): core scene — order-flow arcs and spotlight callout
```

---

## Task 4: `core` — calibration ticks + corner telemetry readout

**Files:**
- Create: `packages/client-react-native/src/ui/shell/boot/scenes/coreTelemetry.ts`
- Test: `packages/client-react-native/src/ui/shell/boot/scenes/coreTelemetry.test.ts` (vitest)
- Modify: `packages/client-react-native/src/ui/shell/boot/scenes/CoreScene.tsx`

**Interfaces:**
- Consumes: `spawnedArcCount`, `activeFlowArcs` (Task 3), `globeYaw`.
- Produces: `CALIBRATION_TICK_COUNT`, `calibrationTickLit(elapsedSec, index)`, `coreTelemetryLines(elapsedSec, progress, yaw) => CoreTelemetry`.

**Source to port:** `bootCore.ts` lines 560-576 (ticks) and 578-588 (telemetry text).

**Why this task is last of the four.** Two of its four strings read the arc state — `LINKS ${arcCount} · LIVE ${arcs.length}` — which only exists once Task 3's schedule does. This was the reason 6a deferred the whole block together.

- [ ] **Step 1: Write the failing test** — `coreTelemetry.test.ts`

```ts
import { expect, test } from "vitest";

import {
  CALIBRATION_TICK_COUNT,
  calibrationTickLit,
  coreTelemetryLines,
} from "./coreTelemetry.js";

test("48 calibration ticks ring the globe", () => {
  expect(CALIBRATION_TICK_COUNT).toBe(48);
});

test("the lit arc grows with time and wraps every 48/14 seconds", () => {
  expect(calibrationTickLit(0, 0)).toBe(false);
  expect(calibrationTickLit(1, 0)).toBe(true);
  expect(calibrationTickLit(1, 40)).toBe(false);
  expect(calibrationTickLit(3, 40)).toBe(true);
  // (t*14) % 48 wraps at t = 48/14 ≈ 3.4286 s.
  expect(calibrationTickLit(3.43, 40)).toBe(false);
});

test("telemetry reports uplink as an integer percentage of boot progress", () => {
  expect(coreTelemetryLines(0, 0, 0).topLeftSecond).toBe("NODES 10 · UPLINK 0%");
  expect(coreTelemetryLines(0, 0.5, 0).topLeftSecond).toBe(
    "NODES 10 · UPLINK 50%",
  );
  expect(coreTelemetryLines(0, 1, 0).topLeftSecond).toBe(
    "NODES 10 · UPLINK 100%",
  );
});

test("telemetry prints yaw in degrees, wrapped to a single turn", () => {
  expect(coreTelemetryLines(0, 0, 0).topRightFirst).toBe("YAW 0.0°");
  expect(coreTelemetryLines(0, 0, 1).topRightFirst).toBe("YAW 57.3°");
});

test("the links line counts scheduled and live arcs", () => {
  const early = coreTelemetryLines(0.5, 0.1, 0).topRightSecond;
  expect(early).toBe("LINKS 0 · LIVE 0");
  const later = coreTelemetryLines(3, 0.7, 0).topRightSecond;
  expect(later).toMatch(/^LINKS \d+ · LIVE \d+$/);
});

test("the fixed banner text never changes", () => {
  expect(coreTelemetryLines(2, 0.4, 1).topLeftFirst).toBe(
    "◉ CORE SYNC · GLOBAL MESH",
  );
});
```

- [ ] **Step 2: Run it and confirm it FAILS.**

- [ ] **Step 3: Implement `coreTelemetry.ts`**

```ts
// packages/client-react-native/src/ui/shell/boot/scenes/coreTelemetry.ts
import { activeFlowArcs, spawnedArcCount } from "#/ui/shell/boot/scenes/coreArcs";
import { CORE_HUBS } from "#/ui/shell/boot/scenes/coreGeometry";

/**
 * The `core` scene's screen-space furniture: the 48 calibration ticks that
 * ring the globe and the four corner telemetry strings.
 *
 * Ported verbatim from `packages/boot-splash/src/variants/bootCore.ts` —
 * ticks lines 560-576, telemetry 578-588. Deferred from phase 6a because two
 * of the four strings read the order-flow arc state, which only exists once
 * `coreArcs.ts` (Task 3) does.
 *
 * All exports carry `"worklet"` — called from `CoreScene`'s recorder worklet.
 */

export const CALIBRATION_TICK_COUNT = 48;
/** Inner/outer tick radii, as multiples of the globe radius. */
export const CALIBRATION_INNER_FACTOR = 1.86;
export const CALIBRATION_OUTER_FACTOR = 1.93;
export const CALIBRATION_LIT_ALPHA = 0.5;
export const CALIBRATION_DIM_ALPHA = 0.08;

const CALIBRATION_SWEEP_RATE = 14;

/** Whether tick `index` is in the lit arc: a head sweeps the ring at 14 ticks
 * per second and everything behind it up to the wrap point is lit. */
export function calibrationTickLit(
  elapsedSec: number,
  index: number,
): boolean {
  "worklet";
  return (elapsedSec * CALIBRATION_SWEEP_RATE) % CALIBRATION_TICK_COUNT > index;
}

/** The four corner strings, named by their screen position. Top-left pair is
 * left-aligned, top-right pair right-aligned (Skia has no textAlign — the
 * draw site subtracts `font.getTextWidth`). */
export interface CoreTelemetry {
  readonly topLeftFirst: string;
  readonly topLeftSecond: string;
  readonly topRightFirst: string;
  readonly topRightSecond: string;
}

export function coreTelemetryLines(
  elapsedSec: number,
  progress: number,
  yaw: number,
): CoreTelemetry {
  "worklet";
  return {
    topLeftFirst: "◉ CORE SYNC · GLOBAL MESH",
    topLeftSecond: `NODES ${CORE_HUBS.length} · UPLINK ${Math.round(progress * 100)}%`,
    topRightFirst: `YAW ${((yaw * 57.29) % 360).toFixed(1)}°`,
    topRightSecond: `LINKS ${spawnedArcCount(elapsedSec)} · LIVE ${activeFlowArcs(elapsedSec).length}`,
  };
}

/** Telemetry text size and its inset from each screen edge, verbatim. */
export const TELEMETRY_FONT_SIZE = 11;
export const TELEMETRY_INSET = 20;
export const TELEMETRY_FIRST_BASELINE = 28;
export const TELEMETRY_SECOND_BASELINE = 44;
```

- [ ] **Step 4: Add the two draw helpers to `CoreScene.tsx`**

```ts
function drawCalibrationTicks(
  canvas: SkCanvas,
  centerX: number,
  centerY: number,
  radius: number,
  elapsed: number,
  flicker: number,
  accent: string,
): void {
  "worklet";
  const paint = Skia.Paint();
  paint.setStyle(PaintStyle.Stroke);
  paint.setStrokeWidth(1);
  paint.setAntiAlias(true);

  for (let i = 0; i < CALIBRATION_TICK_COUNT; i++) {
    const angle = (i / CALIBRATION_TICK_COUNT) * Math.PI * 2;
    const alpha = calibrationTickLit(elapsed, i)
      ? CALIBRATION_LIT_ALPHA
      : CALIBRATION_DIM_ALPHA;
    paint.setColor(Skia.Color(hexToRgba(accent, alpha * flicker)));
    canvas.drawLine(
      centerX + Math.cos(angle) * radius * CALIBRATION_INNER_FACTOR,
      centerY + Math.sin(angle) * radius * CALIBRATION_INNER_FACTOR,
      centerX + Math.cos(angle) * radius * CALIBRATION_OUTER_FACTOR,
      centerY + Math.sin(angle) * radius * CALIBRATION_OUTER_FACTOR,
      paint,
    );
  }
}

function drawTelemetry(
  canvas: SkCanvas,
  width: number,
  elapsed: number,
  progress: number,
  yaw: number,
  flicker: number,
  accent: string,
  accentAlt: string,
): void {
  "worklet";
  const lines = coreTelemetryLines(elapsed, progress, yaw);
  const font = Skia.Font();
  font.setSize(TELEMETRY_FONT_SIZE);
  const paint = Skia.Paint();
  paint.setAntiAlias(true);
  paint.setColor(Skia.Color(hexToRgba(accent, 0.7 * flicker)));
  canvas.drawText(
    lines.topLeftFirst,
    TELEMETRY_INSET,
    TELEMETRY_FIRST_BASELINE,
    paint,
    font,
  );
  canvas.drawText(
    lines.topLeftSecond,
    TELEMETRY_INSET,
    TELEMETRY_SECOND_BASELINE,
    paint,
    font,
  );
  canvas.drawText(
    lines.topRightFirst,
    width - TELEMETRY_INSET - font.getTextWidth(lines.topRightFirst),
    TELEMETRY_FIRST_BASELINE,
    paint,
    font,
  );
  paint.setColor(Skia.Color(hexToRgba(accentAlt, 0.7 * flicker)));
  canvas.drawText(
    lines.topRightSecond,
    width - TELEMETRY_INSET - font.getTextWidth(lines.topRightSecond),
    TELEMETRY_SECOND_BASELINE,
    paint,
    font,
  );
}
```

Call `drawCalibrationTicks` after the arcs/spotlight and `drawTelemetry` immediately before `drawStatusBanner`, matching the web's order. `yaw` is already computed for `params` — pass the same value so the readout cannot disagree with the geometry.

- [ ] **Step 5: Rewrite `CoreScene.tsx`'s header comment.** All twelve web elements are now ported; the DEFERRED block collapses to the two documented non-goals: the `shadowBlur` bloom layers (perf) and bold banner weight (no bundled typeface). Keep the `clearRect` note.

- [ ] **Step 6: Extend `CoreScene.test.tsx`** and run the whole boot sweep once more.

- [ ] **Step 7: Worklet audit. Step 8: Run tests + gauntlet. Step 9: Commit**

```
feat(rn-boot): core scene — calibration ticks and corner telemetry
```

---

## Task 5: `laser` — background grid + wash, post-trace flash, completion corner ticks

**Files:**
- Modify: `packages/client-react-native/src/ui/shell/boot/scenes/laserGeometry.ts`
- Test: `packages/client-react-native/src/ui/shell/boot/scenes/laserGeometry.test.ts`
- Modify: `packages/client-react-native/src/ui/shell/boot/scenes/LaserScene.tsx`
- Test: `packages/client-react-native/src/ui/shell/boot/scenes/LaserScene.test.tsx`

**Interfaces:**
- Produces: `gridLinePositions(extent, step)`, `LASER_GRID_STEP`, `LASER_WASH`, `panelFlashAlpha(progress, t1)`, `cornerTickPath(rect, tickLength)`, `panelRectPx(panel, width, height)`.

**Source to port:** `drawBootLaser` in `packages/boot-splash/src/bootCanvas.ts` — background wash + 44px grid lines 292-310, post-trace flash 383-387, corner ticks 389-407.

**Idiom.** `LaserScene` is the declarative scene and stays declarative. The background is a `<Rect>` plus a `<Path>` of grid lines built once in a `useMemo` keyed on `width`/`height` (perf constraint 5: its shape never changes). The flash is a `<Rect>` per panel with an animated `opacity`. The corner ticks are one `<Path>` per panel with an animated `opacity` that steps 0 → 1 at `drawFrac > 0.985`.

- [ ] **Step 1: Write the failing tests** — append to `laserGeometry.test.ts`

```ts
test("grid lines march from 0 in 44px steps and stop before the extent", () => {
  expect(gridLinePositions(100, LASER_GRID_STEP)).toEqual([0, 44, 88]);
  expect(gridLinePositions(88, LASER_GRID_STEP)).toEqual([0, 44]);
});

test("a zero or negative extent produces no grid lines rather than looping", () => {
  expect(gridLinePositions(0, LASER_GRID_STEP)).toEqual([]);
  expect(gridLinePositions(-10, LASER_GRID_STEP)).toEqual([]);
});

test("a non-positive step is floored to 1 so the loop always advances", () => {
  expect(gridLinePositions(3, 0)).toEqual([0, 1, 2]);
});

test("the post-trace flash fades over the 0.07 window after a panel completes", () => {
  expect(panelFlashAlpha(0.09, 0.1)).toBe(0);
  expect(panelFlashAlpha(0.1, 0.1)).toBeCloseTo(1);
  expect(panelFlashAlpha(0.135, 0.1)).toBeCloseTo(0.5);
  expect(panelFlashAlpha(0.17, 0.1)).toBe(0);
  expect(panelFlashAlpha(0.9, 0.1)).toBe(0);
});

test("corner ticks trace an L into each corner of the panel rect", () => {
  const path = cornerTickPath({ x: 10, y: 20, width: 100, height: 50 }, 8);
  // Four L shapes: each is a moveTo plus two lineTo commands.
  expect(path.split("M")).toHaveLength(5);
  expect(path).toContain("M10 28");
  expect(path).toContain("M110 28");
});

test("panel rects scale to the viewport", () => {
  const rect = panelRectPx(LASER_PANELS[0], 400, 800);
  expect(rect.x).toBeCloseTo(22);
  expect(rect.y).toBeCloseTo(36);
  expect(rect.width).toBeCloseTo(356);
  expect(rect.height).toBeCloseTo(60);
});
```

- [ ] **Step 2: Run and confirm FAIL.**

- [ ] **Step 3: Implement in `laserGeometry.ts`**

```ts
/** Panel rectangle in pixels. Shaped like Skia's `SkRect` (`x`/`y`/`width`/
 * `height`) so it can be handed straight to a draw call or a `<Rect>` without
 * a translation step. */
export interface LaserRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export function panelRectPx(
  panel: LaserPanel,
  width: number,
  height: number,
): LaserRect {
  return {
    x: panel.nx * width,
    y: panel.ny * height,
    width: panel.nw * width,
    height: panel.nh * height,
  };
}

/** The web's HUD grid pitch (`x += 44`). */
export const LASER_GRID_STEP = 44;
/** The flat wash the web paints under everything (`rgba(0,0,0,0.42)`). */
export const LASER_WASH = "rgba(0,0,0,0.42)";
export const LASER_GRID_ALPHA = 0.045;

/**
 * Grid-line offsets along one axis. Floors the step at 1 for the same reason
 * `drawBootDocking` does: a zero step would never advance the loop, which is
 * an infinite loop rather than a wasted frame.
 */
export function gridLinePositions(
  extent: number,
  step: number,
): readonly number[] {
  const safeStep = Math.max(1, step);
  const positions: number[] = [];

  for (let at = 0; at < extent; at += safeStep) {
    positions.push(at);
  }

  return positions;
}

/** Grid lines as one SVG path string, built once per viewport size — the
 * shape depends only on width/height, so it must never be rebuilt per frame
 * (docs/performance.md). */
export function gridPath(width: number, height: number): string {
  const parts: string[] = [];

  for (const x of gridLinePositions(width, LASER_GRID_STEP)) {
    parts.push(`M${x} 0 L${x} ${height}`);
  }

  for (const y of gridLinePositions(height, LASER_GRID_STEP)) {
    parts.push(`M0 ${y} L${width} ${y}`);
  }

  return parts.join(" ");
}

const FLASH_WINDOW = 0.07;

/** Post-trace flash: a full-panel wash that fires the instant a panel
 * finishes tracing and fades out over the next 7% of boot progress. */
export function panelFlashAlpha(progress: number, t1: number): number {
  "worklet";

  if (progress < t1 || progress >= t1 + FLASH_WINDOW) {
    return 0;
  }

  return 1 - (progress - t1) / FLASH_WINDOW;
}

export const FLASH_PEAK_OPACITY = 0.2;
/** Trace fraction past which the completion corner ticks appear. */
export const CORNER_TICK_THRESHOLD = 0.985;
export const CORNER_TICK_LENGTH = 8;
export const CORNER_TICK_OPACITY = 0.85;
export const CORNER_TICK_STROKE_WIDTH = 1.4;

/** Four corner "L" brackets as one SVG path, drawn inward from each corner —
 * verbatim geometry from the web's `[x, y, dx, dy]` corner table. */
export function cornerTickPath(rect: LaserRect, tickLength: number): string {
  const corners: ReadonlyArray<readonly [number, number, number, number]> = [
    [rect.x, rect.y, 1, 1],
    [rect.x + rect.width, rect.y, -1, 1],
    [rect.x, rect.y + rect.height, 1, -1],
    [rect.x + rect.width, rect.y + rect.height, -1, -1],
  ];
  return corners
    .map(([cx, cy, dx, dy]) => {
      return `M${cx} ${cy + dy * tickLength} L${cx} ${cy} L${cx + dx * tickLength} ${cy}`;
    })
    .join(" ");
}
```

- [ ] **Step 4: Wire the three layers into `LaserScene.tsx`**

The background sits above the `LASER_PANELS.map(...)`:

```ts
  const grid = useMemo(() => {
    return gridPath(width, height);
  }, [width, height]);

  const washProps = {
    x: 0,
    y: 0,
    width,
    height,
    color: LASER_WASH,
  };
  const gridProps = {
    testID: "boot-scene-laser-grid",
    path: grid,
    style: "stroke" as const,
    strokeWidth: 1,
    color: accent,
    opacity: LASER_GRID_ALPHA,
  };
```

rendered as `<Rect {...washProps} />` then `<Path {...gridProps} />` inside the existing `<Group>`.

Inside `LaserPanelTrace`, add two siblings next to the existing traced `<Path>`:

```ts
  const flashOpacity = useDerivedValue(() => {
    const progress = bootProgress(elapsedSec.value, BOOT_DURATION_MS);
    return panelFlashAlpha(progress, panel.t1) * FLASH_PEAK_OPACITY;
  });

  const tickOpacity = useDerivedValue(() => {
    const progress = bootProgress(elapsedSec.value, BOOT_DURATION_MS);
    const fraction = panelRevealFraction(progress, panel.t0, panel.t1);
    return fraction > CORNER_TICK_THRESHOLD ? CORNER_TICK_OPACITY : 0;
  });
```

with `<Rect {...flashProps} />` (colour `accent`, `opacity={flashOpacity}`) and `<Path {...tickProps} />` (colour `accentAlt`, `strokeWidth` `CORNER_TICK_STROKE_WIDTH`, `opacity={tickOpacity}`). `LaserScene` currently destructures only `accent` from the theme — add `accentAlt = theme.accent2` and thread it into `LaserPanelTrace`.

- [ ] **Step 5: Extend `LaserScene.test.tsx`** — assert `boot-scene-laser-grid` renders, assert one flash rect and one tick path exist per panel (6 each), and re-run the elapsed-sweep test.

- [ ] **Step 6: Run tests + gauntlet. Step 7: Commit**

```
feat(rn-boot): laser scene — HUD grid, post-trace flash, corner ticks
```

---

## Task 6: `laser` — per-kind panel content + the draw-head/emitter beam

**Files:**
- Create: `packages/client-react-native/src/ui/shell/boot/scenes/laserPanelContent.ts`
- Test: `packages/client-react-native/src/ui/shell/boot/scenes/laserPanelContent.test.ts` (vitest)
- Modify: `packages/client-react-native/src/ui/shell/boot/scenes/laserGeometry.ts` (add `perimeterPoint`)
- Modify: `packages/client-react-native/src/ui/shell/boot/scenes/LaserScene.tsx`
- Test: `packages/client-react-native/src/ui/shell/boot/scenes/LaserScene.test.tsx`

**Interfaces:**
- Produces: `panelContentShapes(panel, rect) => readonly ContentShape[]`, `contentEase(progress, t1)`, `contentScale(ease)`, `perimeterPoint(rect, fraction) => { x, y }`, `LASER_EMITTER_Y`.

**Source to port:** `drawPanelContent` (`bootCanvas.ts` lines 169-279), the content scale/ease block (409-427), and the draw head + emitter beam (321-381, 430-452).

**Design.** The five `kind` branches are pure geometry: each returns a list of rects and polylines in panel-local pixel space. Compute them once per panel per viewport (`useMemo`), and animate only the group's `opacity` and `scale`. That keeps the declarative idiom and satisfies "precompute once".

The draw head is the one element `laserGeometry.ts`'s header called out as having "no direct declarative counterpart" — `<Path start/end>` trims the stroke without ever computing the trace's current point. It does now: `perimeterPoint(rect, fraction)` walks the same four-segment perimeter the web walks and returns the point at that fraction, which drives a `<Circle>` pair plus the emitter `<Line>`.

**Only one panel carries the head at a time** in the web (`head` is overwritten by each still-tracing panel, so the *last* one in table order wins). Reproduce that exactly: the scene picks the highest-indexed panel whose `drawFrac` is in `(0, 1)` — not "every tracing panel", which would draw up to two heads.

- [ ] **Step 1: Write the failing test** — `laserPanelContent.test.ts`

```ts
import { expect, test } from "vitest";

import { LASER_PANELS, panelRectPx, perimeterPoint } from "./laserGeometry.js";
import {
  contentEase,
  contentScale,
  panelContentShapes,
} from "./laserPanelContent.js";

const RECT = { x: 0, y: 0, width: 200, height: 100 };

test("header panels lay out four chips, the first in the alt colour", () => {
  const shapes = panelContentShapes("header", RECT);
  expect(shapes).toHaveLength(4);
  expect(shapes[0].useAltColor).toBe(true);
  expect(shapes[1].useAltColor).toBe(false);
});

test("main panels lay out a 2x2 tile grid: outline, head band, sparkline each", () => {
  const shapes = panelContentShapes("main", RECT);
  expect(shapes.filter((s) => s.kind === "strokeRect")).toHaveLength(4);
  expect(shapes.filter((s) => s.kind === "fillRect")).toHaveLength(4);
  expect(shapes.filter((s) => s.kind === "polyline")).toHaveLength(4);
});

test("list panels lay out four rows of decreasing width and alpha", () => {
  const shapes = panelContentShapes("list", RECT);
  expect(shapes).toHaveLength(4);
  expect(shapes[0].width).toBeGreaterThan(shapes[3].width);
  expect(shapes[0].alpha).toBeGreaterThan(shapes[3].alpha);
});

test("blotter panels lay out a header band, 3 rules and 15 cells", () => {
  const shapes = panelContentShapes("blotter", RECT);
  expect(shapes.filter((s) => s.kind === "line")).toHaveLength(3);
  expect(shapes.filter((s) => s.kind === "fillRect")).toHaveLength(16);
});

test("status panels lay out nine pips, every third in the alt colour", () => {
  const shapes = panelContentShapes("status", RECT);
  expect(shapes).toHaveLength(9);
  expect(shapes.map((s) => s.useAltColor)).toEqual([
    true, false, false, true, false, false, true, false, false,
  ]);
});

test("an unknown kind renders nothing rather than throwing", () => {
  expect(panelContentShapes("nope", RECT)).toEqual([]);
});

test("content eases in over the 0.24 window after the panel completes", () => {
  expect(contentEase(0.05, 0.1)).toBe(0);
  expect(contentEase(0.1, 0.1)).toBe(0);
  expect(contentEase(0.34, 0.1)).toBeCloseTo(1);
  expect(contentEase(0.9, 0.1)).toBeCloseTo(1);
});

test("content scales up from 0.32 to 1", () => {
  expect(contentScale(0)).toBeCloseTo(0.32);
  expect(contentScale(1)).toBeCloseTo(1);
});

test("the perimeter walk starts and ends at the top-left corner", () => {
  expect(perimeterPoint(RECT, 0)).toEqual({ x: 0, y: 0 });
  expect(perimeterPoint(RECT, 1)).toEqual({ x: 0, y: 0 });
});

test("the perimeter walk crosses each corner in top-right-bottom-left order", () => {
  // Perimeter 600: top 200, right 100, bottom 200, left 100.
  expect(perimeterPoint(RECT, 200 / 600)).toEqual({ x: 200, y: 0 });
  expect(perimeterPoint(RECT, 300 / 600)).toEqual({ x: 200, y: 100 });
  expect(perimeterPoint(RECT, 500 / 600)).toEqual({ x: 0, y: 100 });
});

test("every panel's content fits inside its own rect", () => {
  for (const panel of LASER_PANELS) {
    const rect = panelRectPx(panel, 390, 844);

    for (const shape of panelContentShapes(panel.kind, rect)) {
      if (shape.kind === "polyline") {
        continue;
      }

      expect(shape.x).toBeGreaterThanOrEqual(rect.x - 1);
      expect(shape.y).toBeGreaterThanOrEqual(rect.y - 1);
    }
  }
});
```

- [ ] **Step 2: Run and confirm FAIL.**

- [ ] **Step 3: Implement `laserPanelContent.ts`**

Model the five branches as a discriminated union so the scene can render each shape with the matching Skia primitive:

```ts
// packages/client-react-native/src/ui/shell/boot/scenes/laserPanelContent.ts
import { clamp01, ease } from "#/ui/shell/boot/scenes/coreGeometry";
import type { LaserRect } from "#/ui/shell/boot/scenes/laserGeometry";

/**
 * The per-kind interior content of a `laser` panel — the layer phase 6a
 * deferred as "`drawPanelContent`'s five branches".
 *
 * Ported verbatim from `drawPanelContent` in
 * `packages/boot-splash/src/bootCanvas.ts` (lines 169-279) plus the content
 * scale/ease block (409-427).
 *
 * Pure geometry only: each branch returns shapes in absolute pixel space,
 * computed once per panel per viewport size and animated by nothing but the
 * group's opacity and scale. Nothing here runs per frame, so — unlike the
 * `core*` modules — these are NOT worklets: `LaserScene` is the declarative
 * scene and calls them from React render, where the shapes become props.
 */

export type ContentShape =
  | {
      readonly kind: "fillRect";
      readonly x: number;
      readonly y: number;
      readonly width: number;
      readonly height: number;
      readonly alpha: number;
      readonly useAltColor: boolean;
    }
  | {
      readonly kind: "strokeRect";
      readonly x: number;
      readonly y: number;
      readonly width: number;
      readonly height: number;
      readonly alpha: number;
      readonly useAltColor: boolean;
      readonly strokeWidth: number;
    }
  | {
      readonly kind: "line";
      readonly x: number;
      readonly y: number;
      readonly width: number;
      readonly height: number;
      readonly alpha: number;
      readonly useAltColor: boolean;
    }
  | {
      readonly kind: "polyline";
      readonly points: readonly (readonly [number, number])[];
      readonly alpha: number;
      readonly useAltColor: boolean;
      readonly strokeWidth: number;
    };

/** Inner padding as a fraction of the panel's smaller side — the web's
 * `Math.min(w, h) * 0.11`. */
const PAD_FACTOR = 0.11;
const CONTENT_WINDOW = 0.24;
const CONTENT_MIN_SCALE = 0.32;

export function contentEase(progress: number, t1: number): number {
  "worklet";
  const end = Math.min(1, t1 + CONTENT_WINDOW);
  return ease(clamp01((progress - t1) / (end - t1)));
}

export function contentScale(eased: number): number {
  "worklet";
  return CONTENT_MIN_SCALE + (1 - CONTENT_MIN_SCALE) * eased;
}

export function panelContentShapes(
  kind: string,
  rect: LaserRect,
): readonly ContentShape[] {
  const pad = Math.min(rect.width, rect.height) * PAD_FACTOR;
  const inner = {
    x: rect.x + pad,
    y: rect.y + pad,
    width: rect.width - pad * 2,
    height: rect.height - pad * 2,
  };

  if (kind === "header") {
    return headerShapes(inner);
  }

  if (kind === "main") {
    return mainShapes(inner);
  }

  if (kind === "list") {
    return listShapes(inner);
  }

  if (kind === "blotter") {
    return blotterShapes(inner);
  }

  if (kind === "status") {
    return statusShapes(inner);
  }

  return [];
}
```

Then one small function per branch, each transliterating the corresponding `if` block from `drawPanelContent` — `headerShapes` emits four 54×`innerH*0.4` chips at `innerX + i*72`; `mainShapes` emits the 2×2 tile grid (`strokeRect` outline at alpha 0.5, `fillRect` head band at 0.16 over `tileH*0.34`, and the 13-point sine `polyline` at alpha 0.7 / width 1.4); `listShapes` emits four rows at `alpha 0.42 - i*0.06` and width `innerW * (0.92 - i*0.14)`; `blotterShapes` emits the alt-coloured header band, three rules and the 3×5 cell grid; `statusShapes` emits nine pips with `i % 3 === 0` in the alt colour. Keep every literal (72, 54, 14, 12, 0.8, 0.13, …) exactly as the source has it — these are design values.

Add `perimeterPoint` to `laserGeometry.ts`:

```ts
/** The point at `fraction` along the panel rect's perimeter, walked in the
 * same top → right → bottom → left order `rectTracePath` traces. This is what
 * `<Path start/end>` trimming hides: the laser draw-head needs the trace's
 * actual current point, which the trim never exposes. */
export function perimeterPoint(
  rect: LaserRect,
  fraction: number,
): { readonly x: number; readonly y: number } {
  "worklet";
  const segments: ReadonlyArray<readonly [number, number, number, number]> = [
    [rect.x, rect.y, rect.x + rect.width, rect.y],
    [rect.x + rect.width, rect.y, rect.x + rect.width, rect.y + rect.height],
    [
      rect.x + rect.width,
      rect.y + rect.height,
      rect.x,
      rect.y + rect.height,
    ],
    [rect.x, rect.y + rect.height, rect.x, rect.y],
  ];
  const perimeter = (rect.width + rect.height) * 2;
  let remaining = clamp01(fraction) * perimeter;

  for (const [x0, y0, x1, y1] of segments) {
    const length = Math.hypot(x1 - x0, y1 - y0);

    if (remaining > length) {
      remaining -= length;
      continue;
    }

    const along = length === 0 ? 0 : remaining / length;
    return { x: x0 + (x1 - x0) * along, y: y0 + (y1 - y0) * along };
  }

  return { x: rect.x, y: rect.y };
}

/** The emitter sits just off the top edge, centred — the web's `emitterY = -24`. */
export const LASER_EMITTER_Y = -24;
```

- [ ] **Step 4: Render content + head in `LaserScene.tsx`**

Per panel, add a content group whose shapes are `useMemo`'d and whose transform is animated:

```ts
  const shapes = useMemo(() => {
    return panelContentShapes(panel.kind, rect);
  }, [panel.kind, rect]);

  const contentOpacity = useDerivedValue(() => {
    return contentEase(bootProgress(elapsedSec.value, BOOT_DURATION_MS), panel.t1);
  });

  const contentTransform = useDerivedValue(() => {
    const scale = contentScale(
      contentEase(bootProgress(elapsedSec.value, BOOT_DURATION_MS), panel.t1),
    );
    return [
      { translateX: rect.x + rect.width / 2 },
      { translateY: rect.y + rect.height / 2 },
      { scale },
      { translateX: -(rect.x + rect.width / 2) },
      { translateY: -(rect.y + rect.height / 2) },
    ];
  });
```

wrapped as `<Group opacity={contentOpacity} transform={contentTransform}>` containing one `<Rect>` / `<Path>` per `ContentShape`. The translate-scale-translate triple is the declarative form of the web's `translate(cx,cy); scale(s,s); translate(-cx,-cy)`.

The draw head is a scene-level (not per-panel) element, since only one exists:

```ts
  const headIndex = useDerivedValue(() => {
    const progress = bootProgress(elapsedSec.value, BOOT_DURATION_MS);
    let index = -1;

    for (let i = 0; i < LASER_PANELS.length; i++) {
      const fraction = panelRevealFraction(
        progress,
        LASER_PANELS[i].t0,
        LASER_PANELS[i].t1,
      );

      if (fraction > 0 && fraction < 1) {
        index = i;
      }
    }

    return index;
  });
```

with `headPoint` derived from `headIndex` through `perimeterPoint`, feeding a `<Line>` from `{ x: width / 2, y: LASER_EMITTER_Y }` plus two `<Circle>`s (r 7 at accent/0.45, r 3 white) whose `opacity` is 0 when `headIndex.value < 0`. The web's `shadowBlur` bloom on the head is not ported — same reason as everywhere else; note it in the comment.

- [ ] **Step 5: Extend `LaserScene.test.tsx`** — assert content shapes render for every panel kind, assert the head elements exist, and re-run the elapsed sweep including `elapsedSec = 0` (nothing tracing yet) and `elapsedSec = 4.2` (everything complete, no head).

- [ ] **Step 6: Update both file header comments** — `laserGeometry.ts`'s DEFERRED block collapses to just the border-stroke glow; `LaserScene.tsx`'s Task-7 note becomes a description of the complete port.

- [ ] **Step 7: Run tests + gauntlet. Step 8: Commit**

```
feat(rn-boot): laser scene — per-kind panel content and the draw head
```

---

## Task 7: `docking` — the pure geometry module

**Files:**
- Create: `packages/client-react-native/src/ui/shell/boot/scenes/dockingGeometry.ts`
- Test: `packages/client-react-native/src/ui/shell/boot/scenes/dockingGeometry.test.ts` (vitest)

**Interfaces:**
- Consumes: `clamp01`, `ease` from `coreGeometry.ts`.
- Produces: `dockingShake(elapsedSec, easedProgress)`, `dockingTarget(...)`, `craftRadius(easedProgress)`, `lockBox(...)`, `lockBlink(elapsedSec, progress)`, `lockPhase(progress)`, `dockingStatus(progress)`, `dockingTelemetry(...)`, `padTwo`, `dockingTimecode(elapsedSec)`, plus the corridor/ring/grid tables.

**Source to port:** `drawBootDocking`, `packages/boot-splash/src/bootCanvas.ts` lines 459-1021. **Read it fully before writing.** This task ports none of the drawing — only the numbers and strings, so Tasks 8 and 9 are pure transliteration with nothing left to work out.

**Note on the `docking` scene generally.** It is 2D — screen space only, no `project3d` call anywhere — which is why it belongs in 6b-1 rather than with the five projected scenes. It is also the most *text-heavy* boot scene: ~20 distinct readouts. Every one renders at regular weight (constraint 3), including the two the web sets `bold 18px` (the RANGE / RANGE RATE figures) and the `bold 13px` status banner. Note that in the file header; it is the single largest cosmetic gap in this phase.

- [ ] **Step 1: Write the failing test**

```ts
import { expect, test } from "vitest";

import {
  craftRadius,
  dockingShake,
  dockingStatus,
  dockingTarget,
  dockingTelemetry,
  dockingTimecode,
  lockBlink,
  lockBoxSize,
  lockPhase,
  padTwo,
  scanSweepY,
} from "./dockingGeometry.js";

test("camera shake decays as the boot eases in but never fully settles", () => {
  const early = dockingShake(0.3, 0);
  const late = dockingShake(0.3, 1);
  expect(Math.abs(early.x)).toBeGreaterThan(Math.abs(late.x));
  expect(Math.abs(late.x)).toBeGreaterThan(0);
});

test("shake amplitude is bounded by the web's coefficients", () => {
  for (let i = 0; i < 500; i++) {
    const shake = dockingShake(i / 50, 0);
    expect(Math.abs(shake.x)).toBeLessThanOrEqual(2.1 * 1.22);
    expect(Math.abs(shake.y)).toBeLessThanOrEqual(1.6 * 1.22);
  }
});

test("the craft grows from 12px to 104px across the boot", () => {
  expect(craftRadius(0)).toBeCloseTo(12);
  expect(craftRadius(1)).toBeCloseTo(104);
});

test("the target wobbles around centre early and settles on it late", () => {
  const early = dockingTarget(1.2, 0, 200, 400);
  const settled = dockingTarget(1.2, 1, 200, 400);
  expect(Math.hypot(settled.x - 200, settled.y - 400)).toBeLessThan(
    Math.hypot(early.x - 200, early.y - 400),
  );
});

test("the lock box closes in as the lock phase completes", () => {
  expect(lockBoxSize(0, 12, 400)).toBeGreaterThan(lockBoxSize(1, 12, 400));
  expect(lockBoxSize(1, 12, 400)).toBeCloseTo(12 * 1.45);
});

test("lock phase opens at 18% of progress and completes by 68%", () => {
  expect(lockPhase(0.1)).toBe(0);
  expect(lockPhase(0.68)).toBeCloseTo(1);
});

test("the reticle blinks only while acquiring", () => {
  expect(lockBlink(0.4, 0.1)).toBeLessThan(1);
  expect(lockBlink(0.4, 0.5)).toBe(1);
});

test("the status ladder walks the five docking states in order", () => {
  expect(dockingStatus(0).text).toBe("ACQUIRING");
  expect(dockingStatus(0.3).text).toBe("TRACKING");
  expect(dockingStatus(0.6).text).toBe("TARGET LOCKED");
  expect(dockingStatus(0.85).text).toBe("DOCKING SEQUENCE");
  expect(dockingStatus(0.99).text).toBe("CLAMP ENGAGED");
});

test("only the final state uses the positive colour role", () => {
  expect(dockingStatus(0.99).colorRole).toBe("positive");
  expect(dockingStatus(0.6).colorRole).toBe("alt");
  expect(dockingStatus(0.3).colorRole).toBe("primary");
});

test("padTwo zero-pads and takes the magnitude", () => {
  expect(padTwo(4)).toBe("04");
  expect(padTwo(-7.9)).toBe("07");
  expect(padTwo(123)).toBe("123");
});

test("the timecode is mm:ss:cc", () => {
  expect(dockingTimecode(0)).toBe("00:00:00");
  expect(dockingTimecode(65.5)).toBe("01:05:50");
});

test("range counts down to zero as the boot completes", () => {
  expect(dockingTelemetry(0, 0, 0, 0, 390, 844).range).toBe(4820);
  expect(dockingTelemetry(0, 1, 0, 0, 390, 844).range).toBe(0);
});

test("the scan sweep wraps down the viewport once every 1/0.35 s", () => {
  expect(scanSweepY(0, 800)).toBeCloseTo(0);
  expect(scanSweepY(1 / 0.7, 800)).toBeCloseTo(400);
});
```

- [ ] **Step 2: Run and confirm FAIL.**

- [ ] **Step 3: Implement `dockingGeometry.ts`** — one export per numbered element of the source, in the order the source draws them. The pieces, with their web line numbers, so nothing is missed:

| export | source lines | notes |
|---|---|---|
| `DOCKING_WASH` = `"rgba(0,2,4,0.64)"` | 483 | flat backdrop |
| `VIGNETTE_INNER_FACTOR` 0.18 / `VIGNETTE_OUTER_FACTOR` 0.62 / `VIGNETTE_OUTER_ALPHA` 0.55 | 485-496 | radial gradient stops |
| `SCANLINE_PITCH` 3, `SCANLINE_ALPHA` 0.035 | 497-501 | static, precomputed path |
| `dockingShake(elapsedSec, easedProgress)` → `{ x, y }` | 503-508 | `(1 - eased) * 1 + 0.22` amplitude |
| `corridorLines(width, height)` | 514-536 | 13 vertical + 9 horizontal converging on centre; static per size |
| `DOCKING_RING_COUNT` 5, `DOCKING_RING_FACTOR` 0.08, `DOCKING_RING_ALPHA` 0.16 | 540-550 | concentric, shake-tracked |
| `hudGridStep(width)` = `max(1, round(width/16))` | 558 | the infinite-loop floor is load-bearing — keep the comment |
| `dockingTarget(elapsedSec, easedProgress, centerX, centerY)` | 574-576 | includes the shake |
| `craftRadius(easedProgress)` = `12 + eased * 92` | 577 | |
| `craftBodyRects` / `craftGridLines(radius)` | 581-602 | hull slab, 7 struts, 3 rails, 2 pods |
| `RETICLE_SPEC` — hoop radii, 36 spokes, 12 pips, 4 vanes, hub | 604-695 | all as multiples of `radius` |
| `markerOffset(elapsedSec, wobble, radius, width, height)` | 696-701 | the buy-coloured crosshair's drift |
| `RANGE_RADIUS_FACTOR` 0.36 | 716 | |
| `dockingTelemetry(elapsedSec, progress, targetX, targetY, width, height)` | 914-925 | `range`, `closure`, `bearing`, `az`, `el`, `dX`, `dY`, `dZ`, `timecode` — all strings/numbers, no drawing |
| `attitudeReadouts(elapsedSec, wobble)` | 730-772 | the P/Y/R and PITCH side columns |
| `lockPhase(progress)`, `lockBoxSize(lockPhase, craftRadius, minDim)`, `lockBlink(elapsedSec, progress)`, `lockColorRole(progress)` | 802-810 | |
| `LOCK_DASH_INTERVALS` `[8, 7]`, `LOCK_DASH_SPIN` 1.4 rad/s, `LOCK_DASH_UNTIL` 0.6 | 828-840 | |
| `LOCK_CALLOUT_TEXT` `"AC-417 ▸ EUR/USD ESCORT"` + elbow offsets | 842-857 | |
| `CROSSHAIR_GAP` 14 / `CROSSHAIR_ARM` 46 / `CROSSHAIR_HUB_R` 8 | 867-883 | |
| `pipLadder(elapsedSec)` | 884-906 | 4 ticks, ±46px, bobbing |
| `scanSweepY(elapsedSec, height)`, `SCAN_BAND_HALF` 30, `SCAN_BAND_ALPHA` 0.1 | 907-913 | |
| `dockingLabels(telemetry)` | 940-968 | the four corner label blocks, as string arrays |
| `signalBars(elapsedSec)` | 969-975 | 5 bars, lit count from a sine |
| `dockingStatus(progress)` → `{ text, colorRole }`, `dockingStatusBlink(elapsedSec, text)` | 977-1001 | `colorRole` is `"primary" \| "alt" \| "positive"` so the draw site owns token resolution |
| `finalFlashAlpha(progress)` | 1005-1020 | `(progress - 0.92) / 0.08`, 0 before |

`padTwo` and `dockingTimecode` come along too (lines 96-99, 925). Every function that Task 8/9 calls from inside the recorder gets `"worklet"`; the *static per-size* builders (`corridorLines`, `craftGridLines`, scan-line offsets) do **not** — they run in a `useMemo` on the JS thread by design.

- [ ] **Step 4: Run tests + gauntlet. Step 5: Commit**

```
feat(rn-boot): docking scene geometry — camera, craft, lock, telemetry
```

---

## Task 8: `DockingScene` — backdrop, corridor, craft body and reticle

**Files:**
- Create: `packages/client-react-native/src/ui/shell/boot/scenes/DockingScene.tsx`
- Create: `packages/client-react-native/src/ui/shell/boot/scenes/DockingSceneHarness.tsx`
- Test: `packages/client-react-native/src/ui/shell/boot/scenes/DockingScene.test.tsx` (jest)
- Modify: `packages/client-react-native/jest.setup.ts`

**Interfaces:**
- Consumes: `BootSceneProps`, everything from `dockingGeometry.ts`, `bootProgress`/`ease`/`hexToRgba` from `coreGeometry.ts`.
- Produces: `DockingScene(props): JSX.Element` with `testID="boot-scene-docking"`.

**Idiom: imperative `createPicture`, like `CoreScene`.** By the 6a decision test this is not close — the scene is ~90 sequential `ctx` calls with nested `save/translate/rotate/restore` blocks, which transliterates directly into a recorder and decomposes badly into components.

**The static-geometry rule earns its keep here.** Three layers have shapes that depend only on `width`/`height`: the scan-line overlay (~280 one-pixel rects at 844pt), the 22-line perspective corridor, and the HUD grid. All three are built into `SkPath`s in a `useMemo` keyed on the dimensions, captured in the recorder's closure and drawn with a single `drawPath` each. The corridor shakes, so it is drawn inside a `canvas.save()` / `translate(shakeX, shakeY)` / `restore()` pair rather than being rebuilt per frame.

> **Device-verification item (jest is blind):** capturing a `useMemo`'d `SkPath` in a worklet closure is the documented RN Skia pattern, but this repo has not done it before — every existing scene builds its paths inside the worklet. If it red-boxes on device, the fallback is to build the paths inside the recorder and accept the per-frame allocation. Task 11 checks this explicitly; do not assume the jest pass proves it.

- [ ] **Step 1: Write the failing test** — `DockingScene.test.tsx`, modelled on `CoreScene.test.tsx`: mounts with `testID="boot-scene-docking"` and returns a picture; survives an `elapsedSec` sweep `[0, 0.4, 1.1, 2.3, 3.5, 4.2, 6]` crossing every status threshold (0.25, 0.55, 0.8, 0.92, 0.96 of progress); survives drift extremes. Add `DockingSceneHarness.tsx` mirroring `CoreSceneHarness.tsx` exactly (fixed theme provider, `useSharedValue` per render) — it must be its own module because Biome forbids exporting a component from a `*.test.tsx`.

- [ ] **Step 2: Run and confirm FAIL.**

- [ ] **Step 3: Extend the jest Skia mock** — this scene is the first to use canvas state and dash effects:

```ts
      save: () => {},
      restore: () => {},
      translate: () => {},
      rotate: () => {},
      scale: () => {},
      drawOval: () => {},
```

on the mock canvas, and on `Skia`:

```ts
      // Phase 6b-1, Task 8 (DockingScene): the dashed acquiring ring.
      PathEffect: {
        MakeDash: () => {
          return { __mockPathEffect: true };
        },
      },
```

plus `setPathEffect: () => {}` on the mock paint. Widen the interfaces at the top of the file to match.

- [ ] **Step 4: Implement the first half of `DockingScene.tsx`**

Component shell (same shape as `CoreScene`), then the layer helpers in draw order:

```ts
export function DockingScene({
  elapsedSec,
  width,
  height,
  theme,
}: BootSceneProps): JSX.Element {
  const accent = theme.accentPrimary;
  const accentAlt = theme.accent2;
  const buy = theme.accentPositive;
  const sell = theme.accentNegative;

  // Shapes that depend only on the viewport — built once, drawn every frame.
  // Rebuilding these inside the recorder would allocate ~300 path segments
  // per frame for no visual difference (docs/performance.md).
  const scanlines = useMemo(() => {
    return buildScanlinePath(width, height);
  }, [width, height]);
  const corridor = useMemo(() => {
    return buildCorridorPath(width, height);
  }, [width, height]);
  const hudGrid = useMemo(() => {
    return buildHudGridPath(width, height);
  }, [width, height]);

  const picture = useDerivedValue(() => {
    return createPicture(
      (canvas) => {
        const elapsed = elapsedSec.value;
        const progress = bootProgress(elapsed, BOOT_DURATION_MS);
        const eased = ease(progress);
        const centerX = width / 2;
        const centerY = height / 2;
        const shake = dockingShake(elapsed, eased);
        const target = dockingTarget(elapsed, eased, centerX, centerY);
        const radius = craftRadius(eased);

        drawBackdrop(canvas, width, height, centerX, centerY, scanlines, accent);
        drawCorridor(canvas, corridor, shake, centerX, centerY, width, height, accent, accentAlt);
        drawHudGrid(canvas, hudGrid, accent);
        drawCraftBody(canvas, target, radius, accent);
        drawReticle(canvas, target, radius, elapsed, accent, accentAlt);
        drawMarker(canvas, target, radius, eased, elapsed, width, height, buy);
      },
      { width, height },
    );
  });

  const pictureProps = { testID: "boot-scene-docking", picture };
  return <Picture {...pictureProps} />;
}
```

`buildScanlinePath` / `buildCorridorPath` / `buildHudGridPath` are plain (non-worklet) functions returning `SkPath`, built with `Skia.Path.Make()` + `addRect` / `moveTo` / `lineTo` from the tables `dockingGeometry.ts` exports. `drawCorridor` wraps its `drawPath` in `canvas.save()` / `canvas.translate(shake.x, shake.y)` / `canvas.restore()` and also draws the five concentric rings, which shake with it. `drawCraftBody` and `drawReticle` translate to `target` once and draw everything in local coordinates, exactly as the source's `ctx.save(); ctx.translate(targetX, targetY); …` blocks do.

The vignette is a second radial-gradient shader (`Skia.Shader.MakeRadialGradient`, already mocked in Task 1), from transparent at `min(w,h)*0.18` to `rgba(0,0,0,0.55)` at `max(w,h)*0.62`.

- [ ] **Step 5: Run tests + gauntlet.** The scene renders nothing recognisable yet — no lock, no readouts — but it must mount, draw and not throw. Do **not** register it in `BOOT_SCENES` yet; that happens in Task 9 when it is complete, so no intermediate commit can ship a half-drawn scene to a booting device.

- [ ] **Step 6: Worklet audit. Step 7: Commit**

```
feat(rn-boot): docking scene — backdrop, corridor, craft and reticle
```

---

## Task 9: `DockingScene` — lock reticle, readouts, scan sweep, status banner; register the scene

**Files:**
- Modify: `packages/client-react-native/src/ui/shell/boot/scenes/DockingScene.tsx`
- Modify: `packages/client-react-native/src/ui/shell/boot/scenes/DockingScene.test.tsx`
- Modify: `packages/client-react-native/src/ui/shell/boot/bootScene.ts`
- Test: `packages/client-react-native/src/ui/shell/boot/bootScene.test.ts`

**Interfaces:**
- Produces: `BOOT_SCENES.docking`, so `hasBootScene("docking")` becomes `true`.

- [ ] **Step 1: Write the failing test** — extend `bootScene.test.ts`:

```ts
test("docking resolves to a scene now that phase 6b-1 has ported it", () => {
  expect(hasBootScene("docking")).toBe(true);
  expect(BOOT_SCENES.docking).toBeDefined();
});

test("the five scenes deferred to phase 6b-2 still resolve to nothing, without throwing", () => {
  for (const variant of ["hologram", "geo", "layers", "jarvis", "topo"] as const) {
    expect(hasBootScene(variant)).toBe(false);
    expect(BOOT_SCENES[variant]).toBeUndefined();
  }
});
```

The existing "every key of `BOOT_SCENES` is a member of `BOOT_VARIANTS`" assertion must keep passing.

- [ ] **Step 2: Run and confirm FAIL.**

- [ ] **Step 3: Implement the remaining layers**, appended to the recorder in the source's order:

1. `drawRangeRing` — the two concentric range circles at `RANGE_RADIUS_FACTOR`, plus the P/Y/R and PITCH side columns. Skia has no `rotate`-around-text convenience, so the two vertical labels use `canvas.save(); canvas.translate(...); canvas.rotate(...)` — the mock now supports both.
2. `drawRangeReadouts` — RANGE / RANGE RATE captions at 9px plus the two large figures. **Regular weight, where the web is `bold 18px`** — the most visible instance of constraint 3; comment it here.
3. `drawLockReticle` — the four corner brackets at `lockBoxSize`, blinking while acquiring; the dashed spinning ring while `progress < 0.6` (`Skia.PathEffect.MakeDash(LOCK_DASH_INTERVALS, 0)` on a stroke paint, inside a `save/translate/rotate/restore`); the elbow leader line and the `AC-417 ▸ EUR/USD ESCORT` callout; the tether from the target to the mid-point of the centre.
4. `drawCrosshair` — the gapped centre cross, its 8px hub circle, and the bobbing pip ladder.
5. `drawScanSweep` — a full-width band at `scanSweepY`, filled with a **linear** gradient (`Skia.Shader.MakeLinearGradient`, transparent → `accentAlt` at 0.1 → transparent). Add `MakeLinearGradient` to the mocked `Skia.Shader` in the same commit.
6. `drawCornerLabels` — the four label blocks from `dockingLabels`, the `● REC` marker in the sell colour, and the five signal bars.
7. `drawStatusBanner` — `▸ TEXT ◂` at `centerY - 66`, colour resolved from `dockingStatus().colorRole` (`primary` → `accent`, `alt` → `accentAlt`, `positive` → `buy`), blinking while ACQUIRING.
8. `drawFinalFlash` — the radial white/alt wash over the last 8% of progress.

- [ ] **Step 4: Register the scene** in `bootScene.ts`:

```ts
export const BOOT_SCENES: Partial<Record<BootVariant, BootSceneComponent>> = {
  core: CoreScene,
  docking: DockingScene,
  laser: LaserScene,
};
```

and update the map's doc comment: three of eight ported; `hologram`/`geo`/`layers`/`jarvis`/`topo` remain deliberately unported until phase 6b-2, and a missing entry stays an expected state, never an error.

- [ ] **Step 5: Extend `DockingScene.test.tsx`** — sweep progress across every status threshold and assert the scene still resolves; the status ladder itself is asserted in `dockingGeometry.test.ts` under vitest, where the strings are directly readable.

- [ ] **Step 6: Worklet audit. Step 7: Run tests + gauntlet. Step 8: Commit**

```
feat(rn-boot): docking scene — lock, readouts, banner; register the variant
```

---

## Task 10: Visual scenario, docs, integration gauntlet

**Files:**
- Modify: `packages/client-react-native/tests/visual/scenarioIds.ts`
- Modify: `packages/client-react-native/tests/visual/scenarios.tsx`
- Modify: `docs/STATUS.md`

**Read first:** the doc comment at the top of `tests/visual/scenarios.tsx` on scenario determinism, and `tests/visual/fixtures.tsx`'s `BOOT_SCENE_ELAPSED_SEC` rationale.

- [ ] **Step 1: Add the `boot/docking` scenario**

In `scenarioIds.ts`, add `"boot/docking"` next to the existing boot ids with a comment naming this phase. In `scenarios.tsx`, add the entry — it reuses the existing `BootSceneFixture` unchanged, which is the whole point of that fixture:

```tsx
  {
    id: "boot/docking",
    skin: "holo3d",
    mode: "dark",
    build: (): ReactNode => {
      return (
        <VisualScenarioHost skin="holo3d" mode="dark">
          <BootSceneFixture Scene={DockingScene} />
        </VisualScenarioHost>
      );
    },
  },
```

`scenarios.test.tsx` asserts the two lists stay in sync; run it.

- [ ] **Step 2: Note the golden invalidation in `scenarios.tsx`'s header comment** — `boot/core` and `boot/laser` now paint every element of their web sources, so their phase 6a goldens are stale by design and are re-captured in Task 11. Say so, so a future reader does not treat the diff as a regression.

- [ ] **Step 3: Consider whether `BOOT_SCENE_ELAPSED_SEC` still lands well.** At 2.52 s (60% of the boot) the docking scene is mid-`TARGET LOCKED` with the craft at ~80% size and the lock box nearly closed — a good frame. `core` at the same instant now also has arcs in flight and the spotlight on hub 1. If any scene reads as a blank or degenerate frame at 2.52 s, prefer adding a second pinned constant over moving the shared one (moving it invalidates every boot golden at once).

- [ ] **Step 4: Update `docs/STATUS.md`** per the `tracking-workstream-status` skill. In the "RN mobile-v1 UI rehaul" bullet:
  - move `core`'s 7 deferred elements + holo flicker, `laser`'s deferred parts, and the `docking` scene from "Phase 6b (remaining)" into shipped, naming this plan;
  - restate the remaining Phase 6b scope as the five projected 3D scenes (`hologram`, `geo`, `layers`, `jarvis`, `topo`) under the label **Phase 6b-2**, with the split rationale in one clause;
  - carry forward the two documented non-goals (no `shadowBlur` bloom layers; regular-weight Skia text) so they are not rediscovered as bugs;
  - add this plan to the plan link list;
  - bump `Last updated`.

- [ ] **Step 5: FULL gauntlet**

```
pnpm --filter @rtc/client-react-native typecheck
pnpm --filter @rtc/client-react-native test
pnpm --filter @rtc/tests gates
pnpm lint:dead
pnpm exec biome ci packages/client-react-native
pnpm exec eslint packages/client-react-native
pnpm exec eslint packages/client-react-native --config eslint.config.typed.mjs
pnpm check:doc-links
```

- [ ] **Step 6: Commit**

```
feat(rn-boot): boot/docking visual scenario, STATUS update, full gauntlet green
```

---

## Task 11: On-device sign-off + golden re-capture (requires the user + a booted simulator)

**Not executable by a subagent.** Needs a running iOS simulator and human judgement on visual fidelity. The simulator is a single serial resource run by the controller, so this is deliberately the last task and covers every scene at once.

Recipe and traps: the `reference_rn_on_device_sim_automation` memory — dev-client fast path (no native rebuild; this phase adds no native dependency), `idb ui tap` coordinates are screenshot pixels ÷ 3, and the sim auto-shuts-down between sessions.

**Worklet crashes are what this gate exists to catch.** Every red box in this class (PR #334, PR #340) passed jest first. If any scene red-boxes with `Tried to synchronously call a Remote Function` or `Property 'X' doesn't exist`, the cause is an unmarked callee or a module const referenced from a default-parameter position — see Global Constraint 1.

- [ ] Boot repeatedly and confirm the rotation advances `core → laser → docking → …` and persists across cold launches. The five unported variants must still show the chrome-only splash — silently, never an error.
- [ ] **`core`:** confirm all twelve elements read — star backdrop, nucleus glow, mesh, scan ring, both gyro rings, hub pings, spotlight callout, order-flow arcs, calibration ticks, corner telemetry, banner — and that the holo flicker is a subtle wash, not a strobe. If the mesh now reads too bright with the glow restored, the 6a `segmentAlpha` band `[0.28, 0.78]` was a compensation for the missing glow and can go back toward the web's `[0.1, 0.5]` — capture a judgement either way, it is a documented deviation.
- [ ] **`laser`:** confirm the grid, the trace, the completion ticks, the flash, the per-kind content scaling in, and exactly **one** draw-head at a time following the trace.
- [ ] **`docking`:** confirm the corridor shake, the growing craft, the closing lock box, the dashed acquiring ring, the scan sweep, all four corner label blocks, and the status ladder walking ACQUIRING → TRACKING → TARGET LOCKED → DOCKING SEQUENCE → CLAMP ENGAGED.
- [ ] **The `useMemo`'d `SkPath` question (Task 8's flagged unknown):** confirm the docking backdrop/corridor/grid actually paint. If they are missing or the scene red-boxes, move those builders inside the recorder and re-measure.
- [ ] **Perf:** watch for steady-state jank on all three scenes. `core` is now materially denser than the 6a version (arcs allocate two paths per arc per frame) and `docking` is the heaviest scene in the suite. Jank here is the signal that shapes 6b-2's idiom choices — capture it either way.
- [ ] Set power-saver to **Freeze** and confirm no canvas mounts on any of the three. Then enable `forceBootAnimation` and confirm Freeze still wins.
- [ ] Enable OS reduced-motion, confirm the static splash, then enable `forceBootAnimation` and confirm the animation returns.
- [ ] Tilt the device and confirm `core`'s gyro parallax still drifts and recentres (the flicker and glow must not fight it). `laser` and `docking` ignore drift by design.
- [ ] Confirm SKIP short-circuits from all three scenes and the fade-out handoff is clean.
- [ ] **Re-capture the goldens:** `boot/core` and `boot/laser` (both invalidated by this phase) and the new `boot/docking`. Full-bleed scenarios need `fullPage: true` or the capture silently produces zero goldens.
- [ ] Record any fidelity gap that is NOT one of the two documented non-goals as a STATUS follow-up rather than fixing it inside this phase.

---

## References

- Spec: [../specs/2026-07-16-rn-mobile-v1-rehaul-design.md](../specs/2026-07-16-rn-mobile-v1-rehaul-design.md) §5, "Phase 6 — Boot suite + lock screen".
- Predecessor plan: [2026-07-20-rn-mobile-v1-rehaul-phase-6a-boot.md](2026-07-20-rn-mobile-v1-rehaul-phase-6a-boot.md).
- Backlog entry: [../../STATUS.md](../../STATUS.md) → "RN mobile-v1 UI rehaul".
- Rendering doctrine: [../../performance.md](../../performance.md).
- UI logic placement: [../../adr/ADR-005-ui-logic-placement.md](../../adr/ADR-005-ui-logic-placement.md).
