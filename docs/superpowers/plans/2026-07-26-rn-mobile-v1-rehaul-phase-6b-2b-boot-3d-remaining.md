# RN mobile-v1 rehaul — Phase 6b-2b: the last three projected boot scenes

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port `geo`, `jarvis` and `topo` to React Native, taking the boot-scene registry from 5 of 8 variants to **8 of 8** — every variant the preference can select.

**Architecture:** Identical to the 6b-2a scenes that landed: pure geometry/timing/copy in a `*Geometry.ts` module (vitest, unmocked), drawing in a `*Scene.tsx` that records an `SkPicture` inside a `useDerivedValue` worklet, projected through the shared `boot3dCamera` seam. No new infrastructure — 6b-2a built all of it.

**Tech Stack:** React Native 0.86 / Expo SDK 57, `@shopify/react-native-skia`, `react-native-reanimated` worklets, `@rtc/motion-core`'s `project3d`, vitest (geometry) + jest/RNTL (scenes).

---

## Scope note — why this is three tasks, not fifteen

6b-2a was planned as ten tasks that split each scene into "geometry" and
"scene" halves. **That split does not survive contact with CI.** PR #378 was
the `hologram` geometry module alone, exactly as planned, and the `Dead code
(knip)` gate rejected it: nine exports with no consumer. By this repo's own
definition, a geometry module without its scene is dead code.

So the atom here is **one scene = one task = one PR**. That is not a
convenience; it is the smallest unit that can pass the gates.

Source sizes, for honest expectations:

| scene | source | of which data | notes |
|---|---|---|---|
| `geo` | 968 | ~310 | seven coastline polylines + a city table |
| `jarvis` | 894 | ~90 | blueprint-fragment table |
| `topo` | 711 | ~40 | marching-squares edge table |

That is **2,573 lines against 6b-2a's 1,255** — roughly double, across three
scenes rather than two. Each task is correspondingly large, and a reviewer
should expect a ~1,500–2,500 line PR per scene. If any one proves unreviewable
in practice, split it by *scene*, never by geometry-vs-drawing — that boundary
is the one knip already rejected.

---

## Global Constraints

Every task's requirements implicitly include this section.

**1. Worklet marking is transitive, and jest cannot see it.** Any function
reached from inside a `createPicture` recorder must carry `"worklet"` itself —
including functions it in turn calls. The jest Reanimated mock runs worklets as
plain JS, so a missing directive is invisible until the simulator. Record the
build-once/per-frame split **per export** in each module header; that convention
is what caught `craftGridLines` (6b-1) and `columnAssembly` (6b-2a) pre-merge.

**2. Never resolve a value in a default-parameter position inside a worklet.**
The Worklets Babel plugin captures consts referenced in a worklet's *body* but
silently drops one referenced only as a default, surfacing as
`Property 'X' doesn't exist` on device (#334). Resolve in the body.

**3. Check every new glyph against the bundled cmap before using it.** A Skia
font has one typeface and no per-glyph fallback chain, so an uncovered
codepoint draws **nothing** — silently (P1/P1a). `U+25C9 ◉`, which every
variant's telemetry line opens with, is absent from all bundled faces; use
`BOOT_TELEMETRY_BULLET` from `bootGlyphs.ts`. Known-covered:
`· ° ▸ ◂ ● → … × ▲ σ ≡`. Anything else is unverified until checked. The web
rendering it is **not** evidence.

**4. Projection is per scene, and two of five have no clamp.** Read from
source, all five cited:

| scene | `perspectiveK` | near-plane clamp | source |
|---|---|---|---|
| `hologram` | 0.26 | **none** | `bootHologram.ts:216` |
| `geo` | 0.22 | **none** | `bootGeo.ts:528` |
| `layers` | 0.24 | 0.4 | `bootLayers.ts:202` |
| `jarvis` | 0.30 | 0.4 | `bootJarvis.ts:166` |
| `topo` | 0.26 | 0.4 | `bootTopo.ts:381` |

Build the camera as an object literal **inside** the recorder (its yaw changes
per frame); `bootCameraParams` is the build-once React-land form. Omit
`minPerspectiveDenom` entirely for `geo` — never pass `undefined` explicitly and
never default it on.

**5. Flicker is a per-draw-call alpha, never `saveLayer`.** An offscreen
surface per frame is banned by `docs/performance.md`. Note **where** the web
opens its `ctx.save()`: in `hologram` it comes *after* the backdrop, so the
backdrop does not pulse. Check each source rather than assuming.

**6. Build-once tables go in `useMemo`, captured by the recorder.** Rebuilding
one inside `createPicture` is the `craftGridLines` bug. This matters more here
than in 6b-2a — see Task 3's heightfield.

**7. Extend the jest Skia mock in the task that needs it**, mirroring the real
signature. Already covered: `Paint`, `Path.Make`, `drawText`, `getTextWidth`,
`Shader.MakeRadialGradient`, `Shader.MakeLinearGradient`, `PathEffect.MakeDash`.

**8. Visual scenarios are pinned, never live.** A free-running boot canvas
cannot be a stable golden. Use the shared `BOOT_SCENE_ELAPSED_SEC`, and state in
the registration comment what that instant actually shows for that scene.

**9. Transcribe strings and numbers; do not invent them.** Every literal comes
from the source. Where the web's copy is wrong for this platform (`layers`'
"CURSOR TRACK · LIVE" on a device with no cursor), keep it verbatim and flag it
— changing approved copy is a design decision, not a porting one.

**10. `pnpm exec biome ci .`, not `pnpm lint`.** The local `lint` script is
lint-only; CI additionally enforces formatting and import order. This bit
6b-2a's `layers` commit after an un-export changed a type alias's line width.

---

## File Structure

Per scene, mirroring what 6b-2a landed:

```
packages/client-react-native/src/ui/shell/boot/scenes/
  geoCoastlines.ts        # DATA ONLY — the seven polylines + city table
  geoGeometry.ts          # pure geometry/timing/copy   + .test.ts (vitest)
  GeoScene.tsx            # drawing                     + .test.tsx (jest)
  GeoSceneHarness.tsx     # test-only, mirrors CoreSceneHarness (reads drift)

  jarvisGeometry.ts / JarvisScene.tsx / JarvisSceneHarness.tsx  (+ tests)
  topoGeometry.ts   / TopoScene.tsx   / TopoSceneHarness.tsx    (+ tests)
```

`geoCoastlines.ts` is separate because it is ~310 lines of coordinate data with
no logic; keeping it out of `geoGeometry.ts` leaves the latter reviewable.

Registration in `bootScene.ts` + `bootScene.test.tsx` happens in each scene's
own task, so the registry test never sits red between tasks.

---

## Task 1: `geo` — the tactical world map

**Files:**
- Create: `scenes/geoCoastlines.ts`, `scenes/geoGeometry.ts` (+ `.test.ts`),
  `scenes/GeoScene.tsx`, `scenes/GeoSceneHarness.tsx` (+ `GeoScene.test.tsx`)
- Modify: `shell/boot/bootScene.ts`, `shell/boot/bootScene.test.tsx`

**Source:** `packages/boot-splash/src/variants/bootGeo.ts` — **read all 968 lines.**

**Camera:** `perspectiveK: 0.22`, **no clamp** — omit `minPerspectiveDenom`.

**Element inventory** (source line → element), so nothing is silently dropped:

| line | element |
|---|---|
| 438 | terrain dot mesh with ridge heights (Alps / Pyrenees / Highlands) |
| 547 | tactical table ring under the map |
| 587 | graticule chords clipped to the landmass |
| 641 | coastlines trace themselves in — glow pass + core pass |
| 692 | terrain dot mesh rises out of the plane |
| 720 | radar sweep line across the plane |
| 748 | trades: spawn + arc flight between cities |
| 849 | city bars pulse up and down (far → near) |
| 930 | corner telemetry + status banner |

**The data is the risk here.** `MAIN`, `GB`, `IRE`, `DKZ`, `SIC`, `SAR`, `COR`
(lines 73-370) are lon/lat polylines and `CITY` is a `[lon, lat, weight, name]`
table. A single transposed digit is a coastline with a spike in it, and no unit
test will notice. Transcribe them mechanically, then assert **counts and
bounds** rather than eyeballing:

- [ ] **Step 1: Write the failing test for the data module**

```ts
import { expect, test } from "vitest";

import { GEO_CITIES, GEO_LANDMASSES } from "./geoCoastlines";

test("every landmass is a closed-ish polyline of lon/lat pairs", () => {
  expect(GEO_LANDMASSES.length).toBeGreaterThan(0);
  for (const landmass of GEO_LANDMASSES) {
    expect(landmass.points.length).toBeGreaterThan(2);
    for (const [lon, lat] of landmass.points) {
      expect(lon).toBeGreaterThanOrEqual(-180);
      expect(lon).toBeLessThanOrEqual(180);
      expect(lat).toBeGreaterThanOrEqual(-90);
      expect(lat).toBeLessThanOrEqual(90);
    }
  }
});

// A transposed digit shows up as a point far outside the region the map covers.
// This is the cheapest guard that would actually catch it.
test("every coastline point sits inside the western-Europe frame the map draws", () => {
  for (const landmass of GEO_LANDMASSES) {
    for (const [lon, lat] of landmass.points) {
      expect(lon).toBeGreaterThan(-30);
      expect(lon).toBeLessThan(45);
      expect(lat).toBeGreaterThan(25);
      expect(lat).toBeLessThan(75);
    }
  }
});

test("cities carry a name and a weight, and sit on the mapped frame", () => {
  expect(GEO_CITIES.length).toBeGreaterThan(0);
  for (const city of GEO_CITIES) {
    expect(city.name.length).toBeGreaterThan(0);
    expect(city.weight).toBeGreaterThan(0);
  }
});
```

> **Before running:** replace the frame bounds above with the actual extent of
> the transcribed data, computed once and then pinned. Do NOT widen a bound to
> make a failing point pass — a point outside the frame is a transcription
> error, which is exactly what this catches.

- [ ] **Step 2: Run it and watch it fail** — module not found.

```bash
pnpm --filter @rtc/client-react-native exec vitest run src/ui/shell/boot/scenes/geoCoastlines.test.ts
```

- [ ] **Step 3: Transcribe `geoCoastlines.ts`.** Data only, no logic, no
  `"worklet"` — nothing here is called per frame.

- [ ] **Step 4: Run the test** — Expected: PASS.

- [ ] **Step 5: Write `geoGeometry.test.ts`**, covering: lon/lat → world vector,
  the coastline trace-in schedule, terrain-dot rise, radar sweep angle, the
  trade-arc spawn schedule and flight interpolation, city-bar pulse, telemetry
  strings and the status ladder. Follow `hologramGeometry.test.ts` for shape —
  every literal transcribed, every correction commented with its source line.

- [ ] **Step 6: Run it and watch it fail.**

- [ ] **Step 7: Implement `geoGeometry.ts`.** Header records the
  build-once/per-frame split per export (constraint 1). The trade schedule is
  seeded from `hashRandom` — reuse it from `coreGeometry.ts`, never
  re-implement, or the sequence diverges from the web.

- [ ] **Step 8: Run the tests** — Expected: PASS.

- [ ] **Step 9: Write `GeoScene.test.tsx` + `GeoSceneHarness.tsx`**, mirroring
  `HologramSceneHarness` (it reads drift, so `mx`/`my` are parameters). Cover:
  mount + picture, an `elapsedSec` sweep across every status threshold, a drift
  sweep past the clamp, and a frame mid trade-flight where arcs and city bars
  draw together.

- [ ] **Step 10: Implement `GeoScene.tsx`.** Coastlines are a glow pass then a
  core pass — two strokes of the same path at different widths/alphas, drawn in
  that order. Painter-sort the city bars far→near as the source does.

- [ ] **Step 11: Register in `bootScene.ts`** and update `bootScene.test.tsx`
  (6 registered, 2 deferred).

- [ ] **Step 12: Gauntlet + commit**

```bash
pnpm exec biome ci . && pnpm lint:eslint && pnpm typecheck && \
  pnpm lint:dead && pnpm --filter @rtc/client-react-native test
git add packages/client-react-native/src/ui/shell/boot
git commit -m "feat(rn): port the geo boot scene (6b-2b Task 1)"
```

---

## Task 2: `jarvis` — the assistant core

**Files:**
- Create: `scenes/jarvisGeometry.ts` (+ `.test.ts`), `scenes/JarvisScene.tsx`,
  `scenes/JarvisSceneHarness.tsx` (+ `JarvisScene.test.tsx`)
- Modify: `shell/boot/bootScene.ts`, `shell/boot/bootScene.test.tsx`

**Source:** `packages/boot-splash/src/variants/bootJarvis.ts` — **read all 894 lines.**

**Camera:** `perspectiveK: 0.30`, clamp `0.4`.

**Element inventory:**

| line | element |
|---|---|
| 90 | floating blueprint fragments at varied depth (build-once table) |
| 175 | shared Z-plane wobble, read by `projectPolar` |
| 200 | dotted backdrop grid, deep parallax |
| 210 | core glow |
| 230 | radar wedge sweep |
| 255 | wireframe core sphere |
| 322 | ring machinery, each ring sweeps in |
| 510 | radial spokes |
| 542 | blueprint fragments |
| 822 | cross-links between fragments |
| 843 | drifting particles |
| 859 | corner telemetry + banner |

**The hazard in this scene is `ringZPlane`.** The source has:

```ts
// shared Z-plane wobble read by projectPolar when no explicit z is passed
let ringZPlane = 0;

function projectPolar(angle: number, radius: number, z?: number): ProjectedPoint {
  return project(Math.cos(angle) * radius, Math.sin(angle) * radius,
                 z === undefined ? ringZPlane : z);
}
```

Two things to get right, and they pull in opposite directions:

- The `z === undefined ? … : …` resolution is **in the body**, which is the safe
  form under constraint 2. Keep it that way; do not "tidy" it into
  `z = ringZPlane` as a default parameter — that is precisely the #334 defect.
- `ringZPlane` is **mutable closure state, reassigned between rings**. A worklet
  must not depend on that implicit coupling. Port it as an **explicit
  parameter**: `projectJarvisPolar(angle, radius, zPlane, camera)`, with each
  caller passing the plane it means. Losing the wobble entirely is the failure
  mode to watch for — assert it.

- [ ] **Step 1: Write `jarvisGeometry.test.ts`.** Include, specifically:

```ts
// The ring machinery shares one wobbling Z-plane. Porting the mutable closure
// variable as an explicit parameter is correct; silently pinning it to 0 is the
// failure mode, and it would look almost right — the rings would simply sit
// flat instead of breathing.
test("the shared ring Z-plane wobbles rather than sitting flat", () => {
  const samples = Array.from({ length: 120 }, (_, i) => {
    return ringZPlane(i / 20);
  });

  expect(Math.max(...samples)).toBeGreaterThan(0);
  expect(Math.min(...samples)).toBeLessThan(0);
});
```

  Plus: fragment table determinism and depth spread, backdrop-grid parallax,
  radar-wedge angle, sphere latitude/longitude sets, per-ring sweep-in schedule,
  spoke angles, cross-link pair selection, particle drift, telemetry and status.

- [ ] **Step 2: Run it and watch it fail.**

- [ ] **Step 3: Implement `jarvisGeometry.ts`.** `projectJarvisPolar` takes the
  z-plane explicitly. Header records the split per export.

- [ ] **Step 4: Run the tests** — Expected: PASS.

- [ ] **Step 5: Write `JarvisScene.test.tsx` + harness.** Add one test that
  sweeps a full ring-sweep-in window, since each ring enters on its own
  schedule and a single frame reaches only one of them.

- [ ] **Step 6: Implement `JarvisScene.tsx`.**

- [ ] **Step 7: Register** (7 registered, 1 deferred).

- [ ] **Step 8: Gauntlet + commit.**

---

## Task 3: `topo` — the volatility survey

**Files:**
- Create: `scenes/topoGeometry.ts` (+ `.test.ts`), `scenes/TopoScene.tsx`,
  `scenes/TopoSceneHarness.tsx` (+ `TopoScene.test.tsx`)
- Modify: `shell/boot/bootScene.ts`, `shell/boot/bootScene.test.tsx`

**Source:** `packages/boot-splash/src/variants/bootTopo.ts` — **read all 711 lines.**

**Camera:** `perspectiveK: 0.26`, clamp `0.4`.

**Element inventory:**

| line | element |
|---|---|
| 112 | volatility peaks = FX pairs |
| 226 | heightfield + marching-squares contours (precomputed, world space) |
| 307 | sparse mesh polylines |
| 401 | survey table frame |
| 435 | sparse wireframe mesh |
| 452 | contour levels, revealed bottom-up |
| 497 | route linking the summits |
| 520 | summit beacons + pair labels + ticking prices |
| 645 | drifting survey motes |
| 657 | legend + telemetry |

**This is the one task where constraint 6 is load-bearing rather than
hygienic.** The source precomputes a **52 × 36 heightfield** — 1,872 `heightAt`
evaluations — then runs marching squares over it per contour level, all
**before** the draw closure is returned:

```ts
const gridCols = 52;
const gridRows = 36;
…
for (let i = 0; i < gridCols; i++) {
  heights[i] = [];
  for (let j = 0; j < gridRows; j++) {
    heights[i][j] = heightAt(worldMinX + i * stepX, worldMinZ + j * stepZ);
  }
}
```

Doing that inside `createPicture` would run it **every frame at 60 fps**. It is
the `craftGridLines` bug at roughly a hundred times the cost, and — as with
`craftGridLines` — jest would stay green throughout, because the mock happily
executes it. Build it in a `useMemo` and capture the result.

`MARCHING_SQUARES` (line 54) is a static edge-case lookup table; transcribe it
as a module constant, not a computed structure.

- [ ] **Step 1: Write `topoGeometry.test.ts`.** Include, specifically:

```ts
// The heightfield is 52x36 = 1872 samples and must be computed ONCE. This test
// does not prove it is memoised — nothing in jest can — but it does pin the
// shape and determinism the memo depends on.
test("the heightfield is a stable 52x36 grid", () => {
  const field = topoHeightfield();

  expect(field.length).toBe(52);
  expect(field[0].length).toBe(36);
  expect(field).toStrictEqual(topoHeightfield());
});

test("contours close over the heightfield and rise with their level", () => {
  const contours = topoContours(topoHeightfield());

  expect(contours.length).toBeGreaterThan(1);
  for (const contour of contours) {
    expect(contour.segments.length).toBeGreaterThan(0);
  }
});
```

  Plus: the FX-pair peak table, mesh polyline sets, contour reveal schedule,
  route ordering across summits, beacon/price formatting, mote drift, legend and
  telemetry strings.

- [ ] **Step 2: Run it and watch it fail.**

- [ ] **Step 3: Implement `topoGeometry.ts`.** `topoHeightfield()` and
  `topoContours()` are **BUILD-ONCE and deliberately unmarked** — say so in the
  header, next to the per-frame exports.

- [ ] **Step 4: Run the tests** — Expected: PASS.

- [ ] **Step 5: Write `TopoScene.test.tsx` + harness.**

- [ ] **Step 6: Implement `TopoScene.tsx`**, building the heightfield and
  contours in a `useMemo` and capturing them.

- [ ] **Step 7: Register** — **8 of 8. `BOOT_SCENES` is now total.** Replace the
  "deferred variants" test with one asserting **every** `BootVariant` resolves,
  and keep `hasBootScene`'s contract intact: `BOOT_SCENES` stays `Partial` in
  type, because `BootCanvas`'s fallback path must remain reachable and tested.

- [ ] **Step 8: Gauntlet + commit.**

---

## Task 4: Visual scenarios, docs, integration gauntlet

**Files:**
- Modify: `tests/visual/scenarioIds.ts`, `tests/visual/scenarios.tsx`
- Regenerate: `tests/visual/maestro/flows/`
- Modify: `docs/rn-open-items.md`, `docs/STATUS.md`

- [ ] **Step 1: Register `boot/geo`, `boot/jarvis`, `boot/topo`**, pinned to the
  shared `BOOT_SCENE_ELAPSED_SEC` (constraint 8). State per scene what that
  instant shows — if it lands somewhere uninformative for one of them, say so in
  the comment rather than quietly adding a second constant.

- [ ] **Step 2: Regenerate the Maestro flows.** The committed tree is guarded, so
  adding scenario ids without this turns `generateFlows.test.ts` red:

```bash
pnpm --filter @rtc/client-react-native exec tsx tests/visual/maestro/generateFlows.ts
```

- [ ] **Step 3: Confirm `scenarios.test.tsx` passes** — registry and
  `SCENARIO_IDS` stay in sync.

- [ ] **Step 4: Update the docs.** `rn-open-items.md`: 8 of 8 variants resolve;
  6b-2 is complete. `STATUS.md`: close the 6b-2b entry, and **leave the device
  sign-off open** — it is a separate, unmet condition.

- [ ] **Step 5: Full gauntlet** — `/rtc:gauntlet full`.

- [ ] **Step 6: Commit.**

---

## Task 5: On-device sign-off + golden capture (requires the user + a booted simulator)

**This task cannot be completed by an agent alone.** It needs a Mac with a
booted iPhone 17 / iOS 26.5 simulator, the dev client installed, Metro running
with `EXPO_PUBLIC_VISUAL_HARNESS=1`, and **a human looking at the screen**.

It also covers the 6b-2a scenes if they have not been signed off yet —
`hologram` and `layers` shipped with the same "device-unverified" caveat.

- [ ] **Step 1: Run all five projected scenes on device**, cycling the boot
  variant preference through `hologram`, `layers`, `geo`, `jarvis`, `topo`.

- [ ] **Step 2: Watch for the worklet crash class specifically.** A red box
  reading `[Worklets] Tried to synchronously call a Remote Function` the instant
  a scene mounts means an unmarked callee. Jest cannot see it, and the shared
  camera means one such defect breaks **every** projected scene at once.

- [ ] **Step 3: Confirm the text renders**, and that `bold` sites are genuinely
  bold. Absent text is a P1 regression; a tofu box is an unchecked glyph (P1a) —
  check the codepoint against the bundled cmap, do not "fix" it by changing the
  font size.

- [ ] **Step 4: Judge fidelity against the web** at `docs/design/web/v5`. Record
  any gap in `rn-open-items.md` rather than silently accepting it. Expect at
  least one: `topo`'s contour density and `geo`'s coastline weight are the two
  most likely to read differently at phone scale.

- [ ] **Step 5: Capture the goldens**

```bash
RTC_VISUAL_UDID=<udid> RTC_VISUAL_METRO_PORT=8083 RTC_VISUAL_IDB=$(command -v idb) \
  pnpm --filter @rtc/client-react-native test:rn:visual:simctl:update
```

- [ ] **Step 6: Eyeball every regenerated PNG, then run the verify pass.** It
  must report `pass` for all scenarios. A golden that cannot reproduce itself is
  a flake — fix the scenario, never pin the flake. `:update` in a bad state will
  happily pin a screenshot of the Expo launcher as the baseline.

- [ ] **Step 7: Commit the goldens** and close phase 6b in `docs/STATUS.md`.

---

## References

- Phase 6b-2a plan (the pattern these three follow):
  [2026-07-26-rn-mobile-v1-rehaul-phase-6b-2a-boot-3d-foundation.md](2026-07-26-rn-mobile-v1-rehaul-phase-6b-2a-boot-3d-foundation.md)
- Shared camera seam:
  `packages/client-react-native/src/ui/shell/boot/scenes/boot3dCamera.ts`
- Reference implementations that landed:
  `hologramGeometry.ts` / `HologramScene.tsx`, `layersGeometry.ts` / `LayersScene.tsx`
- Open items, incl. the projection table and the P1/P1a font findings:
  [../../rn-open-items.md](../../rn-open-items.md)
- Performance rules (why `saveLayer` and per-frame table building are banned):
  [../../performance.md](../../performance.md)
