# RN mobile-v1 rehaul — Phase 6b-2a (the projected-3D foundation + `hologram` and `layers`) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Establish the shared projected-3D seam every remaining boot scene needs — a parameterised `project3d` camera steered by gyro drift, plus the precompute-once/reproject-per-frame discipline — and prove it by porting the two scenes that carry no bespoke data payload: `hologram` and `layers`.

**Architecture:** A new framework-free `boot3dCamera.ts` in the RN package wraps `@rtc/motion-core`'s `project3d` with the world→screen mapping every web variant open-codes (centre offset, projection scale, per-scene `perspectiveK`, optional near-plane clamp). Each scene then splits the way `core`, `laser` and `docking` already do: a pure, worklet-marked `*Geometry.ts` module holding all numbers and strings, and a `*Scene.tsx` Skia shell that is pure transliteration of the web's draw calls.

**Tech Stack:** React Native 0.86 / Expo SDK 57, `@shopify/react-native-skia` 2.6.2, `react-native-reanimated` 4.x + worklets, `@rtc/motion-core` (`project3d`), vitest + jest.

---

## Scope note — why this is 6b-2**a**, not all of 6b-2

The 6b-1 plan's scope note directed the remaining work to be written as a single
`phase-6b-2-boot-3d-scenes.md`. **Measurement says split it again**, on exactly
the reasoning that justified splitting 6b in the first place.

6b-1 split Phase 6b because the whole was ~4,700 lines of dense canvas-2D and
"cannot be reviewed or signed off as one unit". What 6b-1 actually carved off
was the *smaller* part. The five projected scenes measure:

| scene | web source |
|---|---:|
| `hologram` | 617 |
| `layers` | 638 |
| `topo` | 711 |
| `jarvis` | 894 |
| `geo` | 968 |
| **total** | **3,828** |

That is **81% of the original 4,700** — the reviewability problem is almost
entirely still present. And 6b-1, the smaller half, still needed **11 tasks and
2,683 plan lines**. At the same density the five scenes land at roughly 25-30
tasks and 6,000+ lines.

It splits along a real seam, as 6b-1's did:

- **6b-2a (this plan) — the foundation, proven on the two procedural scenes.**
  `hologram` and `layers` build all their geometry from `hashRandom` and simple
  tables inline. Nothing external, nothing algorithmic.
- **6b-2b (next plan) — the three scenes that each add their own payload.**
  `jarvis` (a fragment field), `topo` (a marching-squares contour table), `geo`
  (embedded coastline tables **and a second projection concept**,
  `lonLatToPlane`, layered on top of `project3d`).

The split is about **where the risk is**. All five share one genuinely new
thing: a `project3d` call site with a gyro-steered camera and precomputed world
geometry rebuilt once per mount, re-projected per frame. That seam is
worklet-reachable, and **jest is structurally blind to the worklet class** — the
simulator is the only witness. Proving it on scenes with no bespoke data means a
failure there is unambiguously the camera. Debugging the same seam inside `geo`
would put three suspects in flight at once.

**Do not start 6b-2b work inside this plan.** If a task appears to need
`jarvis`/`topo`/`geo`, it is out of scope.

### Correction to the 6b-1 scope note — the five scenes do NOT share one projection

6b-1 recorded that all five share "a `project3d` call site with
`minPerspectiveDenom: 0.4`". **That is wrong, and implementing from it would
silently diverge from the web at depth.** Measured from the sources:

| scene | `perspectiveK` | near-plane clamp |
|---|---:|---|
| `hologram` | **0.26** | **none** — `1 / (1 + depth * 0.26)` |
| `geo` | 0.22 | **none** |
| `layers` | **0.24** | `Math.max(0.4, …)` |
| `jarvis` | 0.30 | `Math.max(0.4, …)` |
| `topo` | 0.26 | `Math.max(0.4, …)` |

Every scene has its own `perspectiveK`, and **two of the five have no clamp at
all**. `project3d`'s `minPerspectiveDenom` is already optional (`undefined` ⇒ no
clamp), so the kernel needs no change — but the camera wrapper must carry both
as per-scene parameters and must never default the clamp on.

This is why 6b-2a pairs `hologram` (unclamped) with `layers` (clamped): the
shared seam is forced to parameterise the clamp rather than hardcode it, so
6b-2b inherits a wrapper already proven on both shapes.

---

## Global Constraints

Every task's requirements implicitly include this section. It supersedes the
6b-1 plan's equivalent section; **constraint 3 in particular is a correction, not
a restatement.**

### 1. The Reanimated/Skia worklet rule (the one that has bitten this repo three times)

Any function reached from inside a worklet body must **itself** carry the
`"worklet"` directive as its first statement. Worklet bodies here are:
`useDerivedValue` / `useAnimatedStyle` / `useAnimatedProps` callbacks,
`useFrameCallback` callbacks, gesture-handler callbacks, and the `createPicture`
recorder callback. The rule is transitive — a marked worklet's callees need
marking too, including helpers imported from `@rtc/motion-core` and from the
`*Geometry.ts` modules in this package.

- Symptom when violated: `[Worklets] Tried to synchronously call a Remote Function` — a red box the instant the scene mounts on a real device.
- Prior instances: **#334** (`meridianLatitudes`' dropped default parameter), **#340** (`ringDashOffset` in `@rtc/motion-core` was unmarked, red-boxing `LockScreen` on every real device), and one caught pre-merge during 6b-1 (`craftGridLines`, a build-once helper, called per frame from inside a worklet).
- **Never reference a module-level const from a DEFAULT-PARAMETER position inside a worklet.** The Babel plugin captures consts referenced in a worklet's *body* into its closure but silently drops one referenced only in a default-parameter position; on the UI thread that surfaces as `Property 'X' doesn't exist`. Resolve defaults in the body with `??` (not `||`, so an explicit `0` survives) — `coreGeometry.ts`'s `meridianLatitudes` / `parallelLongitudes` show the pattern.
- **jest is structurally blind to this whole class.** Its Reanimated mock runs worklets as plain JS with full module scope, so an unmarked callee passes every unit test. Each task below that adds worklet-reachable math repeats this as an explicit step; **do not treat a green `pnpm --filter @rtc/client-react-native test` as evidence.**
- **This phase raises the stakes.** Both scenes precompute world geometry once per mount and re-project it every frame. Every one of those precompute helpers is a *build-once* function that must **not** be worklet-marked, called from React-land — while every per-frame projector **must** be marked. Each geometry module records which exports are which, in its header. That convention is what caught `craftGridLines` in 6b-1; keep it.

### 2. Banned literal tokens under `src/ui` (CI-enforced by plain grep)

NEVER write the literal tokens `setTimeout`, `setInterval`, `localStorage`,
`fetch`, or `rxjs` anywhere under `src/ui` — **including inside comments and
prose**. `pnpm --filter @rtc/tests gates` greps text, not AST, and this has
reddened CI before. Say "UI-side timers" instead.

### 3. Skia text — CORRECTED; the 6b-1 constraint was false and cost a shipped bug

**6b-1 said:** *"`Skia.Font()` resolves the platform default typeface and no bold
face is bundled, so the web's bold banners render regular here … a known,
accepted cosmetic gap."*

**That was wrong.** `Skia.Font()` with no typeface has **no** typeface, and on
real iOS it draws **zero glyphs**, silently, with no throw. The boot text was not
weak — it was **absent**, and it shipped unnoticed through all of Phase 6a
(**P1**, fixed 2026-07-26 in #362).

What to do now:

- **Get every font from `bootSceneFonts.ts`.** `useBootSceneFonts(specs)` takes a
  record of `{ size, bold? }` and returns one `SkFont` per declared site, built
  from bundled JetBrains Mono — the web boot canvas's own stack — in React-land.
  It returns `null` until the faces load; each text layer must skip itself while
  null.
- **Never call `Skia.Font` inside a worklet.** It is a host-object factory;
  building one per frame allocates per frame. Build in React-land, capture the
  result in the draw closure.
- **Bold is available and real.** The 700 face is bundled, so a web `bold 12px`
  maps to `{ size: 12, bold: true }`. Do **not** reproduce 6b-1's "renders
  regular" note; that gap is closed.
- **Check the cmap before adding any new symbol.** A Skia font has **one**
  typeface and **no per-glyph fallback**; a CSS stack falls through per glyph to
  the system mono. U+25C9 `◉` is in **none** of the four bundled faces and drew a
  tofu box (**P1a**). Shared glyphs live in `bootGlyphs.ts` — reuse
  `BOOT_TELEMETRY_BULLET` rather than writing a literal. **The web rendering a
  glyph is not evidence that Skia will.**
- Skia has no `textAlign`. Centre/right alignment is computed with
  `font.getTextWidth(text)`; `CoreScene`'s banner already does this.

### 4. Motion gating

All boot motion goes through the existing gate, unchanged:
`resolveBootMotionEnabled(reducedMotion, isFreeze, forced)`, wired by
`useBootMotionEnabled()` and consumed by `BootCanvas`. Power-saver **Freeze
always wins** over `forceBootAnimation` and over OS reduced-motion. When motion
is off, `BootCanvas` returns `null` and no `<Canvas>` mounts at all. No task in
this plan changes that gate or adds a second one.

### 5. Performance doctrine (`docs/performance.md`)

Per-frame main-thread work compounds forever in a permanently-animated HUD.
Specific to this phase:

- **Precompute once, re-project per frame.** Both scenes have world geometry
  (hologram's 9×9 column grid and its particle scatter; layers' 7 panels and
  their UV corners) that is constant for the life of the mount. Build it in a
  `useMemo` in React-land and let the worklet project it. Rebuilding a table
  inside `createPicture` is the shape of the `craftGridLines` bug.
- **No `saveLayer`.** 6b-1 threaded `core`'s whole-frame holo flicker as a
  per-draw-call alpha precisely because `saveLayer` allocates an offscreen
  surface every frame. `hologram` has the same whole-frame flicker (its source
  line 225). Thread it the same way.
- **No per-frame `MaskFilter.MakeBlur` on strokes.** The web's `shadowBlur` bloom
  is an accepted non-goal on RN (**P2**).

### 6. The jest Skia mock must be extended for every new Skia API

`jest.setup.ts` hand-mocks the Skia surface. Any API a new scene touches that the
mock does not implement fails at import time with a confusing error. Extend the
mock **in the same task** that introduces the call, and mirror the real
signature — `bootSceneFonts.test.tsx` documents what the mock can and cannot
witness, and is the pattern for recording a mock's blind spots honestly.

### 7. Visual scenarios must be pinned, never live

A free-running boot canvas can never be a stable golden. Every boot scenario
mounts at a fixed `elapsedSec` (`BOOT_SCENE_ELAPSED_SEC`) with motion frozen via
`VisualScenarioHost`'s `forceReduceMotion`. Follow `scenarios.tsx`'s header.

Adding a scenario is **5 edits plus a golden regen** — see
`docs/rn-open-items.md` and the visual-scenario recipe. Note **T9**: the
committed Maestro `flows/` tree is generated and now guarded by a test; run
`pnpm exec tsx tests/visual/maestro/generateFlows.ts` after adding a scenario id
or `generateFlows.test.ts` goes red.

### 8. Repo-wide

- `#/` subpath-alias imports, never `@/`; no `≥2`-up relative imports.
- Mandatory braces on all control statements (Biome `useBlockStatements`).
- Newspaper order: helpers below their callers; `eslint . --fix` will move them.
- One component per file; filename matches the exported component.
- No inline `style={{…}}` (ESLint AST rule).

### 9. Gauntlet — run before every commit

```bash
pnpm exec biome ci .        # format + import-sort + lint (NOT the same as `pnpm lint`)
pnpm lint:eslint
pnpm typecheck
pnpm --filter @rtc/client-react-native test
```

Full local mirror of CI's `checks` job: `/rtc:gauntlet` (fast) or
`/rtc:gauntlet full`.

---

## File Structure

**New — the shared seam:**

- `packages/client-react-native/src/ui/shell/boot/scenes/boot3dCamera.ts`
  The world→screen wrapper around `@rtc/motion-core`'s `project3d`. Carries
  per-scene `perspectiveK` and an **optional** near-plane clamp, the centre
  offset and projection scale every web variant open-codes, and the gyro-drift →
  yaw/pitch mapping. Worklet-marked (per-frame projector) with a clearly
  separated build-once camera-parameter constructor.
- `packages/client-react-native/src/ui/shell/boot/scenes/boot3dCamera.test.ts`

**New — `hologram`:**

- `.../scenes/hologramGeometry.ts` + `.test.ts` — all numbers and strings: the
  9×9 grid, the particle-scatter start positions, emitter-pad rings, dust motes,
  callout panel table, telemetry strings.
- `.../scenes/HologramScene.tsx` + `.test.tsx` — the Skia shell.
- `.../scenes/HologramSceneHarness.tsx` — mirrors `CoreSceneHarness`.

**New — `layers`:**

- `.../scenes/layersGeometry.ts` + `.test.ts` — the 7 `LayerPanel` table, the
  four-phase schedule, UV mapping, pull selection, per-kind content tables.
- `.../scenes/LayersScene.tsx` + `.test.tsx`
- `.../scenes/LayersSceneHarness.tsx`

**Modified:**

- `.../boot/BootCanvas.tsx` — register `hologram` and `layers` in the variant lookup.
- `packages/client-react-native/jest.setup.ts` — extend the Skia mock as needed.
- `packages/client-react-native/tests/visual/scenarioIds.ts` — `boot/hologram`, `boot/layers`.
- `packages/client-react-native/tests/visual/scenarios.tsx` — register both, pinned.
- `packages/client-react-native/tests/visual/maestro/flows/` — regenerate (T9 guard).
- `docs/rn-open-items.md`, `docs/STATUS.md` — status.

---

## Task 1: `boot3dCamera` — the shared projected-3D seam

**Files:**
- Create: `packages/client-react-native/src/ui/shell/boot/scenes/boot3dCamera.ts`
- Test: `packages/client-react-native/src/ui/shell/boot/scenes/boot3dCamera.test.ts` (vitest)

**Interfaces:**
- Consumes: `project3d`, `type Projection3dParams` from `@rtc/motion-core`.
- Produces:
  - `type Boot3dCamera = { yaw: number; pitch: number; perspectiveK: number; minPerspectiveDenom?: number; centerX: number; centerY: number; projScale: number }`
  - `bootCameraParams(opts): Boot3dCamera` — **build-once**, NOT worklet-marked.
  - `projectBootPoint(x, y, z, camera): { x: number; y: number; z: number; perspective: number }` — **per-frame, worklet-marked.**
  - `gyroYawPitch(drift, yawRange, pitchRange): { yaw: number; pitch: number }` — **worklet-marked.**

**Source to port:** the `project()` closure that every projected variant
open-codes — `packages/boot-splash/src/variants/bootHologram.ts` lines 205-223
and `bootLayers.ts` lines 196-220. **Read both before writing**; they differ in
exactly the two parameters this task exists to capture (`perspectiveK`, and
whether there is a `Math.max(0.4, …)` clamp).

**Why this is its own task.** Five scenes will call it and it is worklet-
reachable, so a defect here red-boxes every one of them on device while passing
every jest test (constraint 1). It is also the only place the clamp-vs-no-clamp
difference can be encoded once instead of five times.

- [ ] **Step 1: Write the failing test**

```ts
import { expect, test } from "vitest";

import { bootCameraParams, gyroYawPitch, projectBootPoint } from "./boot3dCamera.js";

const UNCLAMPED = bootCameraParams({
  yaw: 0,
  pitch: 0,
  perspectiveK: 0.26,
  centerX: 200,
  centerY: 400,
  projScale: 100,
});

const CLAMPED = bootCameraParams({
  yaw: 0,
  pitch: 0,
  perspectiveK: 0.24,
  minPerspectiveDenom: 0.4,
  centerX: 200,
  centerY: 400,
  projScale: 100,
});

test("a point at the origin lands exactly on the camera centre", () => {
  const p = projectBootPoint(0, 0, 0, UNCLAMPED);
  expect(p.x).toBeCloseTo(200);
  expect(p.y).toBeCloseTo(400);
});

test("world units scale by projScale before the centre offset", () => {
  const p = projectBootPoint(1, 0, 0, UNCLAMPED);
  expect(p.x).toBeCloseTo(300);
});

test("depth shrinks a point toward the centre (perspective divide)", () => {
  const near = projectBootPoint(1, 0, -1, UNCLAMPED);
  const far = projectBootPoint(1, 0, 1, UNCLAMPED);
  expect(far.x - 200).toBeLessThan(near.x - 200);
});

// The correction that motivated this task: hologram and geo have NO clamp, so
// the wrapper must not default one on. An unclamped camera must keep diverging
// past the point a clamped one would pin.
test("an unclamped camera keeps growing where a clamped one saturates", () => {
  const deepUnclamped = projectBootPoint(1, 0, -3.5, UNCLAMPED);
  const deeperUnclamped = projectBootPoint(1, 0, -3.7, UNCLAMPED);
  expect(Math.abs(deeperUnclamped.x - 200)).toBeGreaterThan(
    Math.abs(deepUnclamped.x - 200),
  );
});

test("a clamped camera pins the perspective divide at the near plane", () => {
  const deep = projectBootPoint(1, 0, -10, CLAMPED);
  expect(deep.perspective).toBeCloseTo(1 / 0.4);
});

test("clamping is opt-in — omitting minPerspectiveDenom leaves it undefined", () => {
  expect(UNCLAMPED.minPerspectiveDenom).toBeUndefined();
  expect(CLAMPED.minPerspectiveDenom).toBe(0.4);
});

test("gyro drift maps into bounded yaw and pitch", () => {
  const centred = gyroYawPitch({ x: 0, y: 0 }, 0.5, 0.3);
  expect(centred.yaw).toBeCloseTo(0);
  expect(centred.pitch).toBeCloseTo(0);

  const extreme = gyroYawPitch({ x: 1, y: 1 }, 0.5, 0.3);
  expect(Math.abs(extreme.yaw)).toBeLessThanOrEqual(0.5);
  expect(Math.abs(extreme.pitch)).toBeLessThanOrEqual(0.3);
});

test("gyro drift beyond unit range is clamped, not extrapolated", () => {
  const past = gyroYawPitch({ x: 9, y: -9 }, 0.5, 0.3);
  expect(past.yaw).toBeCloseTo(0.5);
  expect(past.pitch).toBeCloseTo(-0.3);
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
pnpm --filter @rtc/client-react-native exec vitest run src/ui/shell/boot/scenes/boot3dCamera.test.ts
```
Expected: FAIL — `Cannot find module './boot3dCamera.js'`.

- [ ] **Step 3: Implement**

Write `boot3dCamera.ts`. Requirements, in full:

- A file header recording, explicitly, **which exports are per-frame
  (worklet-marked) and which are build-once (deliberately unmarked)** — the
  convention that caught `craftGridLines` in 6b-1.
- `bootCameraParams` is a plain builder: it assembles the struct and does no
  maths. It must **not** carry `"worklet"`; it runs in React-land inside a
  `useMemo`. It must pass `minPerspectiveDenom` straight through, leaving it
  `undefined` when not supplied — never defaulting to `0.4`.
- `projectBootPoint` carries `"worklet"` as its first statement, delegates the
  rotation/perspective maths to `project3d` (already worklet-marked), and then
  applies `projScale` and the centre offset:

```ts
export function projectBootPoint(
  x: number,
  y: number,
  z: number,
  camera: Boot3dCamera,
): ProjectedBootPoint {
  "worklet";

  const projected = project3d(x, y, z, {
    yaw: camera.yaw,
    pitch: camera.pitch,
    perspectiveK: camera.perspectiveK,
    minPerspectiveDenom: camera.minPerspectiveDenom,
  });

  return {
    x: camera.centerX + projected.x * camera.projScale,
    y: camera.centerY + projected.y * camera.projScale,
    z: projected.z,
    perspective: projected.perspective,
  };
}
```

- `gyroYawPitch` carries `"worklet"`, clamps each drift axis to `[-1, 1]` **in
  the body** (never in a default-parameter position — constraint 1), and
  multiplies by the supplied ranges.

- [ ] **Step 4: Run the tests**

```bash
pnpm --filter @rtc/client-react-native exec vitest run src/ui/shell/boot/scenes/boot3dCamera.test.ts
```
Expected: PASS (8 tests).

- [ ] **Step 5: Gauntlet + commit**

```bash
pnpm exec biome ci . && pnpm lint:eslint && pnpm typecheck
git add packages/client-react-native/src/ui/shell/boot/scenes/boot3dCamera.ts packages/client-react-native/src/ui/shell/boot/scenes/boot3dCamera.test.ts
git commit -m "feat(rn): add the shared projected-3D boot camera seam"
```

---

## Task 2: `hologram` — the pure geometry module

**Files:**
- Create: `packages/client-react-native/src/ui/shell/boot/scenes/hologramGeometry.ts`
- Test: `packages/client-react-native/src/ui/shell/boot/scenes/hologramGeometry.test.ts` (vitest)

**Interfaces:**
- Consumes: `clamp01`, `ease`, `hashRandom` from `coreGeometry.ts`; `Boot3dCamera` from `boot3dCamera.ts`.
- Produces: `HOLOGRAM_GRID_SIZE`, `hologramColumns(...)`, `columnAssembly(...)`, `hologramFlicker(elapsedSec)`, `emitterRings(...)`, `lightConeRadius(...)`, `groundGridExtent(...)`, `scanRingHeight(...)`, `gyroRingAngles(...)`, `dustMotes(...)`, `HOLOGRAM_CALLOUTS`, `hologramTelemetry(...)`, `hologramStatus(progress)`.

**Source to port:** `createBootHologram`,
`packages/boot-splash/src/variants/bootHologram.ts` — **read all 617 lines before
writing.** This task ports none of the drawing, only the numbers and strings, so
Tasks 3-4 are pure transliteration with nothing left to work out.

**Element inventory** (source line → element), so nothing is silently dropped:

| line | element |
|---|---|
| 181 | sparse hex-field backdrop |
| 225 | whole-frame hologram flicker |
| 236 | light cone rising from the emitter pad |
| 255 | emitter-pad rings |
| 318 | ground grid expanding from centre |
| 368 | market columns assembling from particle scatter (far→near) — the centrepiece, `GRID_SIZE = 9` ⇒ 81 columns |
| 439 | vertical scan ring sweeping up through the structure |
| 462 | gyroscopic segmented rings |
| 516 | dust motes rising in the cone |
| 528 | floating callout panels with leader lines |
| 586 | corner telemetry + status banner |

**Build-once vs per-frame.** The 81 columns' grid coordinates and their scatter
start positions are constant for the mount: `hologramColumns()` is **build-once,
unmarked**. `columnAssembly(column, easedProgress)` interpolates scatter→home
every frame and is **worklet-marked**. Record this split in the header
(constraint 1).

- [ ] **Step 1: Write the failing test**

```ts
import { expect, test } from "vitest";

import {
  HOLOGRAM_CALLOUTS,
  HOLOGRAM_GRID_SIZE,
  columnAssembly,
  dustMotes,
  emitterRings,
  gyroRingAngles,
  hologramColumns,
  hologramFlicker,
  hologramStatus,
  lightConeRadius,
  scanRingHeight,
} from "./hologramGeometry.js";

test("the market grid is 9x9, matching the web's GRID_SIZE", () => {
  expect(HOLOGRAM_GRID_SIZE).toBe(9);
  expect(hologramColumns()).toHaveLength(81);
});

test("every column has a stable home position and a scattered start", () => {
  const columns = hologramColumns();
  for (const column of columns) {
    expect(Number.isFinite(column.homeX)).toBe(true);
    expect(Number.isFinite(column.homeZ)).toBe(true);
    expect(
      Math.hypot(column.startX - column.homeX, column.startZ - column.homeZ),
    ).toBeGreaterThan(0);
  }
});

test("hologramColumns is deterministic — two calls agree", () => {
  expect(hologramColumns()).toStrictEqual(hologramColumns());
});

test("columns assemble from scatter to home across the boot", () => {
  const [column] = hologramColumns();
  const early = columnAssembly(column, 0);
  const settled = columnAssembly(column, 1);

  expect(Math.hypot(early.x - column.homeX, early.z - column.homeZ)).toBeGreaterThan(
    Math.hypot(settled.x - column.homeX, settled.z - column.homeZ),
  );
  expect(settled.x).toBeCloseTo(column.homeX);
  expect(settled.z).toBeCloseTo(column.homeZ);
});

test("the whole-frame flicker stays within the web's alpha band", () => {
  for (let i = 0; i < 600; i++) {
    const alpha = hologramFlicker(i / 40);
    expect(alpha).toBeGreaterThan(0);
    expect(alpha).toBeLessThanOrEqual(1);
  }
});

test("the light cone widens as the boot proceeds", () => {
  expect(lightConeRadius(1)).toBeGreaterThan(lightConeRadius(0));
});

test("the ground grid expands from the centre outward", () => {
  expect(groundGridExtentAt(1)).toBeGreaterThan(groundGridExtentAt(0));
});

test("the scan ring sweeps upward and repeats", () => {
  const low = scanRingHeight(0.1);
  const high = scanRingHeight(0.9);
  expect(high).not.toBeCloseTo(low);
});

test("the two gyroscopic rings counter-rotate", () => {
  const angles = gyroRingAngles(2);
  expect(Math.sign(angles.outer - gyroRingAngles(1).outer)).not.toBe(
    Math.sign(angles.inner - gyroRingAngles(1).inner),
  );
});

test("emitter rings are ordered outward and finite", () => {
  const rings = emitterRings(0.5);
  expect(rings.length).toBeGreaterThan(0);
  for (let i = 1; i < rings.length; i++) {
    expect(rings[i].radius).toBeGreaterThan(rings[i - 1].radius);
  }
});

test("dust motes rise and wrap within the cone", () => {
  for (const mote of dustMotes(3)) {
    expect(mote.y).toBeGreaterThanOrEqual(0);
    expect(mote.y).toBeLessThanOrEqual(1);
  }
});

test("the callout panels carry the web's three labels", () => {
  expect(HOLOGRAM_CALLOUTS.map((c) => { return c.label; })).toStrictEqual([
    "FX",
    "RISK",
    "ORDER FLOW",
  ]);
});

test("the status ladder walks its states in order", () => {
  expect(hologramStatus(0).text).not.toBe(hologramStatus(1).text);
});
```

> **Before running:** replace `groundGridExtentAt` with whatever the source
> actually names the ground-grid expansion (source line 318) and correct
> `HOLOGRAM_CALLOUTS`' labels and `hologramStatus`' ladder to the exact strings
> in the source. **Do not invent strings** — every literal must be transcribed,
> and the visual golden will encode whatever is written here.

- [ ] **Step 2: Run it and watch it fail**

```bash
pnpm --filter @rtc/client-react-native exec vitest run src/ui/shell/boot/scenes/hologramGeometry.test.ts
```
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `hologramGeometry.ts`**

Transcribe the numbers and strings from the source. Rules:

- Header records the build-once/per-frame split per export.
- Build-once helpers (`hologramColumns`, `HOLOGRAM_CALLOUTS`) are **unmarked**.
- Per-frame helpers (`columnAssembly`, `hologramFlicker`, `scanRingHeight`,
  `gyroRingAngles`, `emitterRings`, `dustMotes`, `lightConeRadius`) carry
  `"worklet"`.
- Reuse `hashRandom` from `coreGeometry.ts` — do not re-implement it; the web's
  determinism depends on the exact sequence.
- Any bullet/symbol glyph comes from `bootGlyphs.ts`, and any **new** symbol has
  its codepoint checked against the bundled cmap first (constraint 3).

- [ ] **Step 4: Run the tests** — Expected: PASS.

- [ ] **Step 5: Gauntlet + commit**

```bash
pnpm exec biome ci . && pnpm lint:eslint && pnpm typecheck && pnpm --filter @rtc/client-react-native test
git add packages/client-react-native/src/ui/shell/boot/scenes/hologramGeometry.*
git commit -m "feat(rn): port the hologram boot scene's geometry"
```

---

## Task 3: `HologramScene` — backdrop, cone, emitter pad, ground grid

**Files:**
- Create: `packages/client-react-native/src/ui/shell/boot/scenes/HologramScene.tsx`
- Create: `packages/client-react-native/src/ui/shell/boot/scenes/HologramSceneHarness.tsx`
- Test: `.../HologramScene.test.tsx` (jest + RNTL)
- Modify: `packages/client-react-native/jest.setup.ts` (only if a new Skia API is touched)

**Interfaces:**
- Consumes: `bootCameraParams`, `projectBootPoint`, `gyroYawPitch` (Task 1); `hologramFlicker`, `lightConeRadius`, `emitterRings`, the ground-grid export (Task 2); `useBootSceneFonts` from `bootSceneFonts.ts`; `useGyroDrift`.
- Produces: `HologramScene` (not yet registered — Task 5 registers it).

**Source to port:** `bootHologram.ts` lines 181-367 (hex-field backdrop, flicker,
light cone, emitter-pad rings, ground grid).

**Pattern to follow:** `CoreScene.tsx` — it is the existing scene that already
projects through `@rtc/motion-core` and folds in the gyro-drift seam. Mirror its
structure exactly: `useBootSceneFonts(SCENE_FONTS)` in React-land, camera params
in a `useMemo`, everything else inside the `createPicture` recorder.

- [ ] **Step 1: Declare the fonts and the camera**

```ts
const TELEMETRY_FONT_SIZE = 10;
const BANNER_FONT_SIZE = 12;

const HOLOGRAM_FONTS = {
  telemetry: { size: TELEMETRY_FONT_SIZE },
  callout: { size: TELEMETRY_FONT_SIZE },
  banner: { size: BANNER_FONT_SIZE, bold: true },
} as const;
```

`banner` is `bold: true` — the 700 face is bundled and real (constraint 3). Do
not carry 6b-1's "renders regular" note.

- [ ] **Step 2: Write the failing test**

```tsx
import { render } from "@testing-library/react-native";
import React from "react";

import { HologramScene } from "./HologramScene";

test("renders without touching the network or a live clock", () => {
  const view = render(<HologramScene elapsedSec={2.4} width={390} height={844} />);
  expect(view).toBeTruthy();
});

test("draws nothing but does not throw before the fonts resolve", () => {
  // bootSceneFonts returns null until both faces load; every text layer must
  // skip itself rather than draw with a typeface-less font (P1).
  const view = render(<HologramScene elapsedSec={0} width={390} height={844} />);
  expect(view).toBeTruthy();
});
```

- [ ] **Step 3: Run it and watch it fail** — Expected: FAIL, module not found.

- [ ] **Step 4: Implement the four elements** — transliterate the source. Thread
  the whole-frame flicker as a **per-draw-call alpha**, never `saveLayer`
  (constraint 5).

- [ ] **Step 5: Run the tests** — Expected: PASS.

- [ ] **Step 6: Extend the jest Skia mock if needed**, in this task, mirroring the
  real signature (constraint 6).

- [ ] **Step 7: Gauntlet + commit**

---

## Task 4: `HologramScene` — columns, scan ring, gyroscopic rings, dust motes

**Files:**
- Modify: `.../HologramScene.tsx`, `.../HologramScene.test.tsx`

**Source to port:** `bootHologram.ts` lines 368-527 — the assembling market
columns (the centrepiece), the vertical scan ring, the gyroscopic segmented
rings, the dust motes.

**The performance-critical task in this plan.** 81 columns, each projected per
frame, each with a scatter→home interpolation. The grid and scatter tables come
from `hologramColumns()` **once, in a `useMemo`**; the worklet projects them.
Rebuilding that table inside `createPicture` is precisely the `craftGridLines`
bug 6b-1 caught pre-merge (constraint 5).

- [ ] **Step 1: Write the failing test** — assert the column count reaches the
  recorder, and that a mid-boot frame differs from a settled frame.
- [ ] **Step 2: Run it and watch it fail.**
- [ ] **Step 3: Implement**, with the painter's-algorithm far→near sort the source
  uses (line 368) — drawing order is load-bearing for the depth illusion.
- [ ] **Step 4: Run the tests** — Expected: PASS.
- [ ] **Step 5: Gauntlet + commit.**

---

## Task 5: `HologramScene` — callouts, telemetry, banner; register the scene

**Files:**
- Modify: `.../HologramScene.tsx`, `.../HologramScene.test.tsx`
- Modify: `packages/client-react-native/src/ui/shell/boot/BootCanvas.tsx`

**Source to port:** `bootHologram.ts` lines 528-615 — floating callout panels with
leader lines, corner telemetry, status banner.

Follow `CoreScene`'s `drawSpotlight`: draw the leader line unconditionally and
guard **only** the label on the font being non-null, so a null font window loses
text but keeps geometry.

- [ ] **Step 1: Write the failing test** — assert `hologram` resolves from the
  variant lookup and renders.
- [ ] **Step 2: Run it and watch it fail.**
- [ ] **Step 3: Implement + register** in `BootCanvas`'s lookup.
- [ ] **Step 4: Run the tests** — Expected: PASS. **4 of 8 variants now resolve.**
- [ ] **Step 5: Gauntlet + commit.**

---

## Task 6: `layers` — the pure geometry module

**Files:**
- Create: `.../scenes/layersGeometry.ts` + `.test.ts`

**Interfaces:**
- Produces: `LAYER_PANELS`, `type LayerPanel`, `type PanelKind`, `layersPhase(progress)`, `panelExplodeZ(panel, phase)`, `pulledPanelIndex(progress)`, `panelUv(panel, u, v, camera)`, `ghostFrameCorners(panel)`, `panelContent(kind)`, `layersTelemetry(...)`, `layersStatus(progress)`.

**Source to port:** `createBootLayers`,
`packages/boot-splash/src/variants/bootLayers.ts` — **read all 638 lines.**

**Element inventory:**

| line | element |
|---|---|
| 85 | the 7-panel `LayerPanel` table (the app's own layout, z-separated) |
| 181 | the four-phase schedule: draw-in → explode → orbit/pull → recomposite |
| 221 | arc rings behind the stack |
| 246 | which panel is pulled out right now |
| 256 | world mapping + painter sort |
| 295 | panel-local UV → canvas at that panel's z-depth |
| 352 | ghost frame + corner tethers back to the flat plane (`z = 0`) |
| 396 | panel face + border |
| 441 | corner grab-points |
| 455 | panel content, drawn in-plane |
| 556 | layer id tag on the left edge |
| 566 | pulled panel: scan sweep + callout |
| 600 | corner telemetry + status banner |

**Note the clamp.** `layers` uses `1 / Math.max(0.4, 1 + z2 * 0.24)` — so its
camera is built with `perspectiveK: 0.24, minPerspectiveDenom: 0.4`, unlike
`hologram`'s unclamped `0.26`. This pair is the reason Task 1 parameterises both.

**The four-phase schedule is the spine.** Get `layersPhase(progress)` exactly
right first — every other export keys off it.

- [ ] **Step 1: Write the failing test**

```ts
import { expect, test } from "vitest";

import {
  LAYER_PANELS,
  layersPhase,
  panelExplodeZ,
  pulledPanelIndex,
} from "./layersGeometry.js";

test("there are 7 z-separated layers", () => {
  expect(LAYER_PANELS).toHaveLength(7);
});

test("every panel has a normalised rect and a distinct z", () => {
  const zs = new Set<number>();
  for (const panel of LAYER_PANELS) {
    expect(panel.x).toBeGreaterThanOrEqual(0);
    expect(panel.x + panel.w).toBeLessThanOrEqual(1);
    expect(panel.y).toBeGreaterThanOrEqual(0);
    expect(panel.y + panel.h).toBeLessThanOrEqual(1);
    zs.add(panel.z);
  }
  expect(zs.size).toBe(LAYER_PANELS.length);
});

test("the boot walks draw-in -> explode -> orbit -> recomposite in order", () => {
  expect(layersPhase(0.02).name).toBe("draw-in");
  expect(layersPhase(0.3).name).toBe("explode");
  expect(layersPhase(0.6).name).toBe("orbit");
  expect(layersPhase(0.97).name).toBe("recomposite");
});

test("panels are flat during draw-in and flat again once recomposited", () => {
  const panel = LAYER_PANELS[3];
  expect(panelExplodeZ(panel, layersPhase(0.02))).toBeCloseTo(0);
  expect(panelExplodeZ(panel, layersPhase(1))).toBeCloseTo(0);
});

test("panels are z-separated at the height of the explode phase", () => {
  const separations = LAYER_PANELS.map((p) => {
    return Math.abs(panelExplodeZ(p, layersPhase(0.45)));
  });
  expect(Math.max(...separations)).toBeGreaterThan(0);
});

test("only panels flagged pull are ever selected, and selection advances", () => {
  const pullable = LAYER_PANELS.filter((p) => { return p.pull; });
  const seen = new Set<number>();
  for (let i = 0; i <= 100; i++) {
    const index = pulledPanelIndex(i / 100);
    if (index >= 0) {
      expect(LAYER_PANELS[index].pull).toBe(true);
      seen.add(index);
    }
  }
  expect(seen.size).toBeGreaterThan(1);
  expect(seen.size).toBeLessThanOrEqual(pullable.length);
});
```

> **Before running:** correct the phase names and boundaries to the source's
> exact schedule (line 181). The names above are placeholders for the *shape*;
> transcribe the real ones.

- [ ] **Step 2: Run it and watch it fail.**
- [ ] **Step 3: Implement**, recording the build-once/per-frame split in the header.
- [ ] **Step 4: Run the tests** — Expected: PASS.
- [ ] **Step 5: Gauntlet + commit.**

---

## Task 7: `LayersScene` — panels, ghost frames, UV mapping

**Files:**
- Create: `.../scenes/LayersScene.tsx`, `.../scenes/LayersSceneHarness.tsx`, `.../LayersScene.test.tsx`

**Source to port:** `bootLayers.ts` lines 221-454 — arc rings, world mapping +
painter sort, the UV mapper, ghost frames + corner tethers, panel face/border,
corner grab-points.

**The UV mapper is the subtle part.** `panelUv(panel, u, v, camera)` maps a
panel-local coordinate onto the canvas at that panel's z-depth; the ghost frame
uses the **same mapper pinned to `z = 0`** (source line 354). Implement it once
and pass the depth, rather than writing two mappers that can drift apart.

- [ ] **Step 1: Write the failing test.**
- [ ] **Step 2: Run it and watch it fail.**
- [ ] **Step 3: Implement**, honouring the painter sort (line 256) — back-to-front.
- [ ] **Step 4: Run the tests** — Expected: PASS.
- [ ] **Step 5: Gauntlet + commit.**

---

## Task 8: `LayersScene` — content, pull ceremony, telemetry; register

**Files:**
- Modify: `.../LayersScene.tsx`, `.../LayersScene.test.tsx`, `.../BootCanvas.tsx`

**Source to port:** `bootLayers.ts` lines 455-638 — per-kind panel content, the
left-edge layer id tag, the pulled panel's scan sweep + callout, corner telemetry
+ status banner.

- [ ] **Step 1: Write the failing test** — assert `layers` resolves from the lookup.
- [ ] **Step 2: Run it and watch it fail.**
- [ ] **Step 3: Implement + register.**
- [ ] **Step 4: Run the tests** — Expected: PASS. **5 of 8 variants now resolve.**
- [ ] **Step 5: Gauntlet + commit.**

---

## Task 9: Visual scenarios, docs, integration gauntlet

**Files:**
- Modify: `packages/client-react-native/tests/visual/scenarioIds.ts` — add `boot/hologram`, `boot/layers`
- Modify: `packages/client-react-native/tests/visual/scenarios.tsx` — register both, pinned to `BOOT_SCENE_ELAPSED_SEC`
- Regenerate: `packages/client-react-native/tests/visual/maestro/flows/`
- Modify: `docs/rn-open-items.md`, `docs/STATUS.md`

- [ ] **Step 1: Register both scenarios**, pinned — never live (constraint 7).

- [ ] **Step 2: Regenerate the Maestro flows** — the committed tree is guarded by
  a test as of T9, so adding a scenario id without this turns
  `generateFlows.test.ts` red:

```bash
pnpm --filter @rtc/client-react-native exec tsx tests/visual/maestro/generateFlows.ts
```

- [ ] **Step 3: Confirm `scenarios.test.tsx` still passes** — it asserts the
  registry and `SCENARIO_IDS` stay in sync.

- [ ] **Step 4: Update the docs.** In `rn-open-items.md`, note 5 of 8 variants
  resolve and that 6b-2b covers `jarvis`/`topo`/`geo`. **Record the projection
  correction** (the per-scene `perspectiveK` table above) so 6b-2b does not
  re-derive it.

- [ ] **Step 5: Full gauntlet**

```bash
/rtc:gauntlet full
```

- [ ] **Step 6: Commit.**

---

## Task 10: On-device sign-off + golden capture (requires the user + a booted simulator)

**This task cannot be completed by an agent alone.** It needs a Mac with a booted
iPhone 17 / iOS 26.5 simulator, the dev client installed, Metro running with
`EXPO_PUBLIC_VISUAL_HARNESS=1`, and **a human looking at the screen**.

- [ ] **Step 1: Run both scenes on device**, cycling the boot variant preference
  to `hologram` and then `layers`.

- [ ] **Step 2: Watch for the worklet crash class specifically.** A red box
  reading `[Worklets] Tried to synchronously call a Remote Function` the instant
  the scene mounts means an unmarked callee — jest cannot see it, and this is the
  first phase where the shared camera makes one defect break *both* scenes at
  once (constraint 1).

- [ ] **Step 3: Confirm the text renders.** Every readout should be present and
  the banner genuinely bold. Absent text means a font regression against P1;
  a tofu box means an unchecked glyph (P1a) — check the codepoint against the
  bundled cmap, do not "fix" it by changing the size.

- [ ] **Step 4: Judge fidelity against the web** at `docs/design/web/v5`. Note
  any gap in `rn-open-items.md` rather than silently accepting it.

- [ ] **Step 5: Capture the goldens**

```bash
RTC_VISUAL_UDID=<udid> RTC_VISUAL_METRO_PORT=8083 RTC_VISUAL_IDB=$(command -v idb) \
  pnpm --filter @rtc/client-react-native test:rn:visual:simctl:update
```

- [ ] **Step 6: Eyeball every regenerated PNG, then run the verify pass.** It must
  report `pass` for all scenarios. A golden that cannot reproduce itself is a
  flake — fix the scenario, never pin the flake. Note that `:update` in a bad
  state will happily pin a screenshot of the Expo launcher as the baseline.

- [ ] **Step 7: Commit the goldens** and close the phase in `docs/STATUS.md`.

---

## References

- 6b-1 plan (the precedent for structure, and the source of the corrected constraint 3): `docs/superpowers/plans/2026-07-25-rn-mobile-v1-rehaul-phase-6b-boot-scenes.md`
- 6a plan (the `project3d` kernel's introduction): `docs/superpowers/plans/2026-07-20-rn-mobile-v1-rehaul-phase-6a-boot.md`
- Open items, incl. P1/P1a/P2/T9: `docs/rn-open-items.md`
- Performance doctrine: `docs/performance.md`
- UI logic placement: `docs/adr/ADR-005-ui-logic-placement.md`
- Web sources: `packages/boot-splash/src/variants/bootHologram.ts`, `packages/boot-splash/src/variants/bootLayers.ts`
