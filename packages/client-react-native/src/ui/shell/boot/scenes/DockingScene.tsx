// packages/client-react-native/src/ui/shell/boot/scenes/DockingScene.tsx
import {
  createPicture,
  PaintStyle,
  Picture,
  type SkCanvas,
  type SkFont,
  Skia,
  type SkPaint,
  type SkPath,
  TileMode,
} from "@shopify/react-native-skia";
import type { JSX } from "react";
import { useDerivedValue } from "react-native-reanimated";

import { BOOT_DURATION_MS } from "@rtc/client-core";

import type { BootSceneProps } from "#/ui/shell/boot/bootScene";
import {
  type BootFontSpec,
  useBootSceneFonts,
} from "#/ui/shell/boot/scenes/bootSceneFonts";
import {
  bootProgress,
  ease,
  hexToRgba,
} from "#/ui/shell/boot/scenes/coreGeometry";
import {
  attitudeReadouts,
  CRAFT_BODY_RECTS,
  CROSSHAIR_ARM,
  CROSSHAIR_GAP,
  CROSSHAIR_HUB_R,
  corridorLines,
  craftGridLines,
  craftRadius,
  DOCKING_RING_ALPHA,
  DOCKING_RING_COUNT,
  DOCKING_RING_FACTOR,
  DOCKING_WASH,
  type DockingColorRole,
  type DockingOffset,
  dockingLabels,
  dockingShake,
  dockingStatus,
  dockingStatusBlink,
  dockingTarget,
  dockingTelemetry,
  finalFlashAlpha,
  hudGridStep,
  LOCK_CALLOUT_ARM_DX,
  LOCK_CALLOUT_ELBOW_DX,
  LOCK_CALLOUT_ELBOW_DY,
  LOCK_CALLOUT_TEXT,
  LOCK_CALLOUT_TEXT_DX,
  LOCK_CALLOUT_TEXT_DY,
  LOCK_DASH_INTERVALS,
  LOCK_DASH_SPIN,
  LOCK_DASH_UNTIL,
  lockBlink,
  lockBoxSize,
  lockColorRole,
  lockPhase,
  markerOffset,
  padTwo,
  pipLadder,
  RANGE_RADIUS_FACTOR,
  RETICLE_SPEC,
  SCAN_BAND_ALPHA,
  SCAN_BAND_HALF,
  SCANLINE_ALPHA,
  scanlineOffsets,
  scanSweepY,
  signalBars,
  VIGNETTE_INNER_FACTOR,
  VIGNETTE_OUTER_ALPHA,
  VIGNETTE_OUTER_FACTOR,
} from "#/ui/shell/boot/scenes/dockingGeometry";

/**
 * `docking` boot scene — the "escort craft lock-on" HUD: a shaking
 * perspective corridor with a craft silhouette and a full lock-on reticle at
 * its centre. Imperative Skia (`createPicture` recorder inside a
 * `useDerivedValue` worklet), mirroring `CoreScene.tsx`'s idiom rather than
 * `LaserScene.tsx`'s declarative one — the plan's Task 8 calls this "not
 * close": ~90 sequential `ctx` calls with nested `save/translate/rotate/
 * restore` blocks transliterate directly into a recorder and decompose badly
 * into declarative components.
 *
 * Ported verbatim (formulas/constants unchanged) from `drawBootDocking`,
 * `packages/boot-splash/src/bootCanvas.ts` lines 459-1021. Task 8 landed the
 * first half — backdrop (wash + vignette + scanline overlay), the shaking
 * perspective corridor + its 5 concentric rings, the (unshaken) HUD grid, the
 * craft body (hull/struts/rails/pods), the full lock-on reticle (hoop, 36
 * spokes, inner ring + 12 pips, 4 vanes, crosshair rings + ticks, hub dot)
 * and the buy-coloured drift marker. Task 9 (this change) adds the second
 * half, appended to the recorder in the source's order: the range dial + its
 * P/Y/R and PITCH attitude columns, the RANGE / RANGE RATE readouts, the lock
 * box + dashed acquiring ring + elbow callout + centre tether, the gapped
 * centre crosshair + bobbing pip ladder, the horizontal scan sweep, the four
 * corner telemetry blocks + REC indicator + signal-strength bars, the status
 * banner and the final docking flash — and registers `docking` in
 * `BOOT_SCENES` (`bootScene.ts`), the last step: a half-drawn scene must
 * never reach a booting device, so registration only happens once every
 * layer above is in place.
 *
 * **The static-geometry rule earns its keep here.** Three layers' shapes
 * depend only on `width`/`height` — the scan-line overlay (~280 one-pixel
 * rects), the 22-line perspective corridor, and the HUD grid — so they are
 * built into `SkPath`s once, memoized across renders by the React Compiler
 * (keyed on the same `width`/`height` inputs a manual `useMemo` would have
 * used), captured in the per-frame recorder's closure, and drawn with a
 * single `drawPath` each (docs/performance.md: never rebuild a static point
 * set inside the per-frame worklet). The corridor shakes, so it's drawn
 * inside its own `canvas.save()`/`translate(shake.x, shake.y)`/`restore()`
 * pair rather than rebuilt per frame; the HUD grid does not shake and is
 * drawn in absolute screen space, exactly matching the web's draw order
 * (wash → vignette →
 * scanlines → [save/shake] corridor → rings [restore] → HUD grid → craft →
 * reticle → marker).
 *
 * The craft body's grid (`craftGridLines`) is a fourth "build once" case, but
 * a different shape of it: `dockingGeometry.ts`'s own header documents
 * `craftGridLines` (with `corridorLines`/`scanlineOffsets`) as NOT
 * worklet-marked — geometry meant to be called once "at a fixed unit
 * radius", never from inside a worklet with the live, continuously-growing
 * `craftRadius(...)` (12px → 104px across the boot). `drawCraftBody` below
 * therefore builds `CRAFT_GRID_UNIT` once at module load with a fixed unit
 * radius of 1, then draws it (and `CRAFT_BODY_RECTS`, already unit-space
 * factors) under a per-frame `canvas.scale(radius, radius)` rather than
 * multiplying every coordinate by `radius` in JS the way the web does. The
 * one thing that transform-based scaling changes versus the web: stroke
 * width scales with it too, so every craft-body stroke paint divides its
 * width by `radius` to cancel that out and stay screen-constant — see
 * `drawCraftBody`'s own comment.
 *
 * > **Device-verification item (jest is blind, per the plan's own callout):**
 * > capturing a compiler-memoized `SkPath` in a worklet closure (the three
 * > static layers above) is the documented RN Skia pattern, but no scene in
 * > this repo had exercised it before this task — `CoreScene`/`LaserScene`
 * > build every path fresh inside the worklet or use declarative `<Path>`
 * > with a plain SVG string (a value type, not a host object). This scene
 * > ships with the memoized-closure pattern per the plan's primary
 * > instruction; jest passes either way (its Skia mock is a no-op), so this
 * > is NOT confirmed safe on a real device. If it red-boxes with
 * > `[Worklets] Tried to synchronously call a Remote Function` on-device,
 * > the fallback is to build `scanlines`/`corridor`/`hudGrid` fresh inside
 * > the recorder each frame (same per-frame-allocation trade CoreScene's
 * > `drawGyroRings` already makes for its polyline paths) — Task 11 is the
 * > on-device witness for this, not this file.
 *
 * No `saveLayer` anywhere. `ctx.shadowBlur` bloom (the web reticle/marker
 * have none in this half, but later layers do) is never ported as a
 * `MaskFilter` blur per `docs/performance.md` — where a later task's source
 * uses it, the stroke is ported and the missing bloom is noted there.
 *
 * Every draw helper below carries its own `"worklet"` directive — a plain
 * function called from inside the `useDerivedValue` recorder (itself
 * auto-worklet-ified by the Reanimated Babel plugin) must already be marked,
 * same rule `CoreScene.tsx`/`coreGeometry.ts` follow throughout.
 */
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

  // Shapes that depend only on the viewport — the React Compiler memoizes
  // these calls across renders unless width/height change, so they're still
  // built once and drawn every frame. Rebuilding these inside the recorder
  // would allocate ~300 path segments per frame for no visual difference
  // (docs/performance.md).
  const scanlines = buildScanlinePath(width, height);

  const corridor = buildCorridorPath(width, height);

  const hudGrid = buildHudGridPath(width, height);

  // Null until the bundled faces load. Built here rather than in the recorder
  // — `Skia.Font` is a host-object factory, and the bare `Skia.Font()` this
  // replaces drew no glyphs at all on device (see `bootSceneFonts.ts`).
  const fonts = useBootSceneFonts(DOCKING_FONTS);

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

        drawBackdrop(
          canvas,
          width,
          height,
          centerX,
          centerY,
          scanlines,
          accent,
        );
        drawCorridor(
          canvas,
          corridor,
          shake,
          centerX,
          centerY,
          width,
          height,
          accent,
          accentAlt,
        );
        drawHudGrid(canvas, hudGrid, accent);
        drawCraftBody(canvas, target, radius, accent);
        drawReticle(canvas, target, radius, elapsed, accent, accentAlt);
        drawMarker(canvas, target, radius, eased, elapsed, width, height, buy);
        drawRangeRing(
          canvas,
          centerX,
          centerY,
          width,
          height,
          elapsed,
          eased,
          accent,
          accentAlt,
          buy,
          fonts,
        );
        drawRangeReadouts(
          canvas,
          centerX,
          centerY,
          width,
          height,
          progress,
          eased,
          accent,
          accentAlt,
          fonts,
        );
        drawLockReticle(
          canvas,
          target,
          centerX,
          centerY,
          radius,
          width,
          height,
          progress,
          elapsed,
          accent,
          accentAlt,
          fonts,
        );
        drawCrosshair(canvas, centerX, centerY, elapsed, accent, fonts);
        drawScanSweep(canvas, width, height, elapsed, accentAlt);
        drawCornerLabels(
          canvas,
          width,
          height,
          target,
          elapsed,
          progress,
          accent,
          accentAlt,
          sell,
          fonts,
        );
        drawStatusBanner(
          canvas,
          centerX,
          centerY,
          progress,
          elapsed,
          accent,
          accentAlt,
          buy,
          fonts,
        );
        drawFinalFlash(
          canvas,
          width,
          height,
          centerX,
          centerY,
          progress,
          accentAlt,
        );
      },
      { width, height },
    );
  });

  const pictureProps = { testID: "boot-scene-docking", picture };
  return <Picture {...pictureProps} />;
}

// --- static (per-viewport) path builders — plain functions, NOT worklets: --
// --- called once on the JS thread (memoized by the React Compiler), never --
// --- from the recorder --------------------------------------------------

/** ~280 one-pixel-tall rects at 844pt, one `SCANLINE_PITCH`-spaced row per
 * `scanlineOffsets(height)` entry — a single path so the per-frame draw is
 * one `drawPath` call, not hundreds of `drawRect`s. */
function buildScanlinePath(width: number, height: number): SkPath {
  const path = Skia.Path.Make();

  for (const y of scanlineOffsets(height)) {
    path.addRect({ x: 0, y, width, height: 1 });
  }

  return path;
}

/** The 22-line converging corridor (`corridorLines`), each segment a
 * `moveTo`+`lineTo` pair — drawn under the live shake translation, never
 * itself rebuilt per frame. */
function buildCorridorPath(width: number, height: number): SkPath {
  const path = Skia.Path.Make();

  for (const line of corridorLines(width, height)) {
    path.moveTo(line.x0, line.y0);
    path.lineTo(line.x1, line.y1);
  }

  return path;
}

/** The screen-space HUD grid, pitched by `hudGridStep(width)` — absolute
 * coordinates, no shake. */
function buildHudGridPath(width: number, height: number): SkPath {
  const path = Skia.Path.Make();
  const step = hudGridStep(width);

  for (let x = 0; x <= width; x += step) {
    path.moveTo(x, 0);
    path.lineTo(x, height);
  }

  for (let y = 0; y <= height; y += step) {
    path.moveTo(0, y);
    path.lineTo(width, y);
  }

  return path;
}

// --- draw helpers — every one worklet-marked: called from the recorder ----

/** Radians → degrees: `SkCanvas.rotate` takes degrees (Skia's native
 * convention), unlike canvas-2D's `ctx.rotate`, which takes radians — every
 * web `ctx.rotate(radians)` call in this scene needs this conversion. */
function toDegrees(radians: number): number {
  "worklet";
  return (radians * 180) / Math.PI;
}

/** Flat wash, radial vignette (transparent inner disc → dark outer ring) and
 * the horizontal scanline overlay — `bootCanvas.ts:483-501`. */
function drawBackdrop(
  canvas: SkCanvas,
  width: number,
  height: number,
  centerX: number,
  centerY: number,
  scanlines: SkPath,
  accent: string,
): void {
  "worklet";
  const washPaint = Skia.Paint();
  washPaint.setColor(Skia.Color(DOCKING_WASH));
  canvas.drawRect({ x: 0, y: 0, width, height }, washPaint);

  // `ctx.createRadialGradient(cx, cy, inner, cx, cy, outer)` (two circles,
  // same centre) has no direct Skia equivalent (`MakeRadialGradient` is a
  // single circle). Reproduced with a 3-stop single-circle gradient: flat
  // transparent out to `inner/outer` (matching the web's solid-inside-the-
  // inner-circle behaviour), then ramping to the outer alpha at the rim —
  // same trick `CoreScene.tsx`'s `drawNucleusGlow` uses for its 3-stop glow.
  const innerRadius = Math.min(width, height) * VIGNETTE_INNER_FACTOR;
  const outerRadius = Math.max(width, height) * VIGNETTE_OUTER_FACTOR;
  const vignetteShader = Skia.Shader.MakeRadialGradient(
    { x: centerX, y: centerY },
    outerRadius,
    [
      Skia.Color("rgba(0,0,0,0)"),
      Skia.Color("rgba(0,0,0,0)"),
      Skia.Color(`rgba(0,0,0,${VIGNETTE_OUTER_ALPHA})`),
    ],
    [0, innerRadius / outerRadius, 1],
    TileMode.Clamp,
  );
  const vignettePaint = Skia.Paint();
  vignettePaint.setShader(vignetteShader);
  canvas.drawRect({ x: 0, y: 0, width, height }, vignettePaint);

  const scanlinePaint = Skia.Paint();
  scanlinePaint.setColor(Skia.Color(hexToRgba(accent, SCANLINE_ALPHA)));
  canvas.drawPath(scanlines, scanlinePaint);
}

/** Corridor stroke alpha/width and ring alpha — draw-only constants, not
 * shared/testable geometry, so they live here rather than in
 * `dockingGeometry.ts` (same split `CoreScene.tsx`'s `MESH_STROKE_WIDTH` /
 * `HUB_RING_STROKE_WIDTH` uses). */
const CORRIDOR_LINE_ALPHA = 0.1;
const CORRIDOR_STROKE_WIDTH = 1;

/** The shaking perspective corridor plus its 5 concentric rings —
 * `bootCanvas.ts:508-543`. Both live inside the same
 * `save()`/`translate(shake)`/`restore()` pair, matching the web exactly. */
function drawCorridor(
  canvas: SkCanvas,
  corridor: SkPath,
  shake: DockingOffset,
  centerX: number,
  centerY: number,
  width: number,
  height: number,
  accent: string,
  accentAlt: string,
): void {
  "worklet";
  canvas.save();
  canvas.translate(shake.x, shake.y);

  const linePaint = Skia.Paint();
  linePaint.setStyle(PaintStyle.Stroke);
  linePaint.setStrokeWidth(CORRIDOR_STROKE_WIDTH);
  linePaint.setColor(Skia.Color(hexToRgba(accent, CORRIDOR_LINE_ALPHA)));
  canvas.drawPath(corridor, linePaint);

  const ringPaint = Skia.Paint();
  ringPaint.setStyle(PaintStyle.Stroke);
  ringPaint.setStrokeWidth(CORRIDOR_STROKE_WIDTH);
  ringPaint.setColor(Skia.Color(hexToRgba(accentAlt, DOCKING_RING_ALPHA)));
  const minDim = Math.min(width, height);

  for (let ring = 1; ring <= DOCKING_RING_COUNT; ring++) {
    const r = ring * minDim * DOCKING_RING_FACTOR;
    canvas.drawOval(
      { x: centerX - r, y: centerY - r, width: r * 2, height: r * 2 },
      ringPaint,
    );
  }

  canvas.restore();
}

const HUD_GRID_ALPHA = 0.06;
const HUD_GRID_STROKE_WIDTH = 1;

/** The unshaken screen-space HUD grid — `bootCanvas.ts:553-572`. */
function drawHudGrid(canvas: SkCanvas, hudGrid: SkPath, accent: string): void {
  "worklet";
  const paint = Skia.Paint();
  paint.setStyle(PaintStyle.Stroke);
  paint.setStrokeWidth(HUD_GRID_STROKE_WIDTH);
  paint.setColor(Skia.Color(hexToRgba(accent, HUD_GRID_ALPHA)));
  canvas.drawPath(hudGrid, paint);
}

const CRAFT_HULL_FILL = "rgba(8,16,22,0.5)";
const CRAFT_GRID_ALPHA = 0.12;
const CRAFT_GRID_STROKE_WIDTH = 1;
const CRAFT_POD_ALPHA = 0.18;
const CRAFT_POD_STROKE_WIDTH = 1;

/** `craftGridLines` is NOT worklet-marked in `dockingGeometry.ts` — its own
 * header documents it (alongside `corridorLines`/`scanlineOffsets`) as
 * geometry meant to be "built once … at a fixed unit radius", i.e. called
 * exactly once, never from inside a worklet with the live per-frame radius.
 * Calling it there anyway (an earlier draft of this function did) would be
 * the exact class of bug the repo-wide worklet rule warns about — jest can't
 * catch it, only a real device red-boxes. Calling it here, once, at module
 * load with a fixed unit radius of 1, is the correct reading: `drawCraftBody`
 * scales the *canvas* to the live radius instead of scaling each coordinate
 * in JS, so this template never needs rebuilding as the craft grows. */
const CRAFT_GRID_UNIT = craftGridLines(1);

/** The craft's hull slab, internal strut/rail grid and two side pods,
 * translated to `target` then scaled to the live radius —
 * `bootCanvas.ts:576-602`. Unlike the web (which never calls `ctx.scale`,
 * instead multiplying every coordinate by `radius` in JS), this draws
 * `CRAFT_BODY_RECTS`/`CRAFT_GRID_UNIT`'s unit-space coordinates verbatim
 * under a `canvas.scale(radius, radius)` transform — required so
 * `CRAFT_GRID_UNIT` can stay the fixed, once-built template the worklet rule
 * above demands. Stroke widths are divided by `radius` to cancel the
 * transform's effect on line thickness, so they stay hairline-constant on
 * screen exactly like the web's literal `ctx.lineWidth = 1` (a fill, the
 * hull rect, needs no such compensation — its whole silhouette is meant to
 * grow with the craft). */
function drawCraftBody(
  canvas: SkCanvas,
  target: DockingOffset,
  radius: number,
  accent: string,
): void {
  "worklet";
  canvas.save();
  canvas.translate(target.x, target.y);
  canvas.scale(radius, radius);

  const hullPaint = Skia.Paint();
  hullPaint.setColor(Skia.Color(CRAFT_HULL_FILL));
  const hull = CRAFT_BODY_RECTS.hull;
  canvas.drawRect(
    { x: hull.x, y: hull.y, width: hull.w, height: hull.h },
    hullPaint,
  );

  const gridPaint = Skia.Paint();
  gridPaint.setStyle(PaintStyle.Stroke);
  gridPaint.setStrokeWidth(CRAFT_GRID_STROKE_WIDTH / radius);
  gridPaint.setColor(Skia.Color(hexToRgba(accent, CRAFT_GRID_ALPHA)));

  for (const strut of CRAFT_GRID_UNIT.struts) {
    canvas.drawLine(strut.x0, strut.y0, strut.x1, strut.y1, gridPaint);
  }

  for (const rail of CRAFT_GRID_UNIT.rails) {
    canvas.drawLine(rail.x0, rail.y0, rail.x1, rail.y1, gridPaint);
  }

  const podPaint = Skia.Paint();
  podPaint.setStyle(PaintStyle.Stroke);
  podPaint.setStrokeWidth(CRAFT_POD_STROKE_WIDTH / radius);
  podPaint.setColor(Skia.Color(hexToRgba(accent, CRAFT_POD_ALPHA)));
  const podLeft = CRAFT_BODY_RECTS.podLeft;
  canvas.drawRect(
    { x: podLeft.x, y: podLeft.y, width: podLeft.w, height: podLeft.h },
    podPaint,
  );
  const podRight = CRAFT_BODY_RECTS.podRight;
  canvas.drawRect(
    { x: podRight.x, y: podRight.y, width: podRight.w, height: podRight.h },
    podPaint,
  );

  canvas.restore();
}

/** The reticle's whole-assembly wobble — `Math.sin(elapsedSec * 0.2) * 0.05`
 * radians, `bootCanvas.ts:606`. */
const RETICLE_WOBBLE_FREQUENCY = 0.2;
const RETICLE_WOBBLE_AMPLITUDE = 0.05;
const SPOKE_STROKE_WIDTH = 1;

/** The full lock-on reticle: hoop pair, 36 spokes, inner ring + 12 pips, 4
 * vanes, crosshair rings + 4 ticks, hub dot — `bootCanvas.ts:604-695`. All
 * translated to `target` and rotated by the shared wobble; each of the 4
 * vanes carries its own additional per-vane rotation, matching the web's
 * nested `save()`/`rotate(angle)`/`restore()`. */
function drawReticle(
  canvas: SkCanvas,
  target: DockingOffset,
  radius: number,
  elapsedSec: number,
  accent: string,
  accentAlt: string,
): void {
  "worklet";
  const spec = RETICLE_SPEC;
  canvas.save();
  canvas.translate(target.x, target.y);
  canvas.rotate(
    toDegrees(
      Math.sin(elapsedSec * RETICLE_WOBBLE_FREQUENCY) *
        RETICLE_WOBBLE_AMPLITUDE,
    ),
    0,
    0,
  );

  const strokePaint = Skia.Paint();
  strokePaint.setStyle(PaintStyle.Stroke);
  strokePaint.setAntiAlias(true);

  strokePaint.setStrokeWidth(spec.hoopInner.lineWidth);
  strokePaint.setColor(Skia.Color(hexToRgba(accent, spec.hoopInner.alpha)));
  canvas.drawCircle(0, 0, radius * spec.hoopInner.radiusFactor, strokePaint);

  strokePaint.setStrokeWidth(spec.hoopOuter.lineWidth);
  strokePaint.setColor(Skia.Color(hexToRgba(accent, spec.hoopOuter.alpha)));
  canvas.drawCircle(0, 0, radius * spec.hoopOuter.radiusFactor, strokePaint);

  const spokeInner = radius * spec.spokeInnerFactor;
  strokePaint.setStrokeWidth(SPOKE_STROKE_WIDTH);

  for (const spoke of spec.spokes) {
    strokePaint.setColor(Skia.Color(hexToRgba(accent, spoke.alpha)));
    const spokeOuter = radius * spoke.outerFactor;
    canvas.drawLine(
      Math.cos(spoke.angle) * spokeInner,
      Math.sin(spoke.angle) * spokeInner,
      Math.cos(spoke.angle) * spokeOuter,
      Math.sin(spoke.angle) * spokeOuter,
      strokePaint,
    );
  }

  strokePaint.setStrokeWidth(spec.innerRing.lineWidth);
  strokePaint.setColor(Skia.Color(hexToRgba(accent, spec.innerRing.alpha)));
  canvas.drawCircle(0, 0, radius * spec.innerRing.radiusFactor, strokePaint);

  const pipPaint = Skia.Paint();
  pipPaint.setAntiAlias(true);
  pipPaint.setColor(Skia.Color(hexToRgba(accent, spec.pipAlpha)));
  const pipPosition = radius * spec.innerRing.radiusFactor;
  const pipDotRadius = radius * spec.pipRadiusFactor;

  for (const pip of spec.pips) {
    canvas.drawCircle(
      Math.cos(pip.angle) * pipPosition,
      Math.sin(pip.angle) * pipPosition,
      pipDotRadius,
      pipPaint,
    );
  }

  const vaneFillPaint = Skia.Paint();
  vaneFillPaint.setAntiAlias(true);
  vaneFillPaint.setColor(Skia.Color(hexToRgba(accentAlt, spec.vaneFillAlpha)));
  const vaneStrokePaint = Skia.Paint();
  vaneStrokePaint.setStyle(PaintStyle.Stroke);
  vaneStrokePaint.setAntiAlias(true);
  vaneStrokePaint.setStrokeWidth(spec.vaneLineWidth);
  vaneStrokePaint.setColor(
    Skia.Color(hexToRgba(accentAlt, spec.vaneStrokeAlpha)),
  );

  for (const vane of spec.vanes) {
    canvas.save();
    canvas.rotate(toDegrees(vane.angle), 0, 0);
    const vanePath = Skia.Path.Make();
    vanePath.moveTo(
      -radius * spec.vaneOuterHalfWidthFactor,
      radius * spec.vaneOuterYFactor,
    );
    vanePath.lineTo(
      radius * spec.vaneOuterHalfWidthFactor,
      radius * spec.vaneOuterYFactor,
    );
    vanePath.lineTo(
      radius * spec.vaneInnerHalfWidthFactor,
      radius * spec.vaneInnerYFactor,
    );
    vanePath.lineTo(
      -radius * spec.vaneInnerHalfWidthFactor,
      radius * spec.vaneInnerYFactor,
    );
    vanePath.close();
    canvas.drawPath(vanePath, vaneFillPaint);
    canvas.drawPath(vanePath, vaneStrokePaint);
    canvas.restore();
  }

  strokePaint.setStrokeWidth(spec.crosshairOuter.lineWidth);
  strokePaint.setColor(
    Skia.Color(hexToRgba(accent, spec.crosshairOuter.alpha)),
  );
  canvas.drawCircle(
    0,
    0,
    radius * spec.crosshairOuter.radiusFactor,
    strokePaint,
  );

  strokePaint.setColor(
    Skia.Color(hexToRgba(accent, spec.crosshairInner.alpha)),
  );
  canvas.drawCircle(
    0,
    0,
    radius * spec.crosshairInner.radiusFactor,
    strokePaint,
  );

  const tickInner = radius * spec.crosshairInner.radiusFactor;
  const tickOuter = radius * spec.crosshairOuter.radiusFactor;
  strokePaint.setColor(Skia.Color(hexToRgba(accent, spec.crosshairTickAlpha)));

  for (const tick of spec.crosshairTicks) {
    canvas.drawLine(
      Math.cos(tick.angle) * tickInner,
      Math.sin(tick.angle) * tickInner,
      Math.cos(tick.angle) * tickOuter,
      Math.sin(tick.angle) * tickOuter,
      strokePaint,
    );
  }

  const hubPaint = Skia.Paint();
  hubPaint.setAntiAlias(true);
  hubPaint.setColor(Skia.Color(hexToRgba(accentAlt, spec.hubAlpha)));
  canvas.drawCircle(0, 0, radius * spec.hubFactor, hubPaint);

  canvas.restore();
}

const MARKER_STROKE_ALPHA = 0.9;
const MARKER_STROKE_WIDTH = 1.6;
const MARKER_RADIUS_FACTOR = 0.15;
const MARKER_ARM_FACTOR = 0.26;

/** The buy-coloured drift marker: a small ring + crosshair offset from the
 * craft centre by `markerOffset(...)` — `bootCanvas.ts:696-716`. Drawn at
 * absolute coordinates rather than via `save`/`translate` (no rotation
 * involved, so a transform pair buys nothing here). */
function drawMarker(
  canvas: SkCanvas,
  target: DockingOffset,
  radius: number,
  easedProgress: number,
  elapsedSec: number,
  width: number,
  height: number,
  buy: string,
): void {
  "worklet";
  const wobble = 1 - easedProgress;
  const offset = markerOffset(elapsedSec, wobble, radius, width, height);
  const x = target.x + offset.x;
  const y = target.y + offset.y;

  const paint = Skia.Paint();
  paint.setStyle(PaintStyle.Stroke);
  paint.setAntiAlias(true);
  paint.setStrokeWidth(MARKER_STROKE_WIDTH);
  paint.setColor(Skia.Color(hexToRgba(buy, MARKER_STROKE_ALPHA)));

  canvas.drawCircle(x, y, radius * MARKER_RADIUS_FACTOR, paint);
  const arm = radius * MARKER_ARM_FACTOR;
  canvas.drawLine(x, y - arm, x, y + arm, paint);
  canvas.drawLine(x - arm, y, x + arm, y, paint);
}

// --- Task 9: range dial, lock reticle, crosshair, sweep, labels, banner ----

/** Resolves a `DockingColorRole` to its theme token — the one mapping shared
 * by every status-driven element below (`dockingStatus`, `dockingLabels`'
 * blocks, `lockColorRole`'s "primary"/"alt" pair): `primary` → `accent`,
 * `alt` → `accentAlt`, `positive` → `buy`, `negative` → `sell`. No hardcoded
 * colours anywhere in this scene (repo-wide constraint 8). */
function resolveDockingColor(
  role: DockingColorRole,
  accent: string,
  accentAlt: string,
  buy: string,
  sell: string,
): string {
  "worklet";

  switch (role) {
    case "alt":
      return accentAlt;
    case "positive":
      return buy;
    case "negative":
      return sell;
    default:
      return accent;
  }
}

const RANGE_RING_STROKE_WIDTH = 1.6;
const RANGE_OUTER_RING_OFFSET = 8;
const RANGE_ATTITUDE_FONT_SIZE = 11;

/** The two concentric range circles at `RANGE_RADIUS_FACTOR`, plus the P/Y/R
 * and PITCH side columns — `bootCanvas.ts:716-772`. The web sets
 * `textBaseline = "middle"` for the three numeric rows in each column
 * (`bootCanvas.ts:729`); Skia has no baseline modes (only the default,
 * roughly "alphabetic"), so these draw with the same baseline-anchored
 * `drawText` every other label in this scene uses — a minor, accepted
 * vertical-position gap (open item P3). */
function drawRangeRing(
  canvas: SkCanvas,
  centerX: number,
  centerY: number,
  width: number,
  height: number,
  elapsedSec: number,
  easedProgress: number,
  accent: string,
  accentAlt: string,
  buy: string,
  fonts: DockingFonts | null,
): void {
  "worklet";
  const rangeRadius = Math.min(width, height) * RANGE_RADIUS_FACTOR;
  const wobble = 1 - easedProgress;

  const ringPaint = Skia.Paint();
  ringPaint.setStyle(PaintStyle.Stroke);
  ringPaint.setStrokeWidth(RANGE_RING_STROKE_WIDTH);
  ringPaint.setColor(Skia.Color(hexToRgba(accent, 0.5)));
  canvas.drawCircle(centerX, centerY, rangeRadius, ringPaint);
  ringPaint.setColor(Skia.Color(hexToRgba(accent, 0.2)));
  canvas.drawCircle(
    centerX,
    centerY,
    rangeRadius + RANGE_OUTER_RING_OFFSET,
    ringPaint,
  );

  // The two rings above are geometry and always draw; the attitude columns
  // wait on the typeface.
  if (fonts === null) {
    return;
  }

  const readouts = attitudeReadouts(elapsedSec, wobble);
  const font = fonts.attitude;
  const textPaint = Skia.Paint();
  textPaint.setAntiAlias(true);
  textPaint.setColor(Skia.Color(hexToRgba(buy, 0.85)));
  const columnX = centerX - rangeRadius + 20;
  canvas.drawText(readouts.pyr[0], columnX, centerY - 14, textPaint, font);
  canvas.drawText(readouts.pyr[1], columnX, centerY, textPaint, font);
  canvas.drawText(readouts.pyr[2], columnX, centerY + 14, textPaint, font);

  canvas.save();
  canvas.translate(centerX - rangeRadius + 8, centerY);
  canvas.rotate(-90, 0, 0);
  const pyrLabel = "P Y R";
  textPaint.setColor(Skia.Color(hexToRgba(accent, 0.5)));
  canvas.drawText(
    pyrLabel,
    -font.getTextWidth(pyrLabel) / 2,
    0,
    textPaint,
    font,
  );
  canvas.restore();

  textPaint.setColor(Skia.Color(hexToRgba(buy, 0.85)));
  canvas.drawText(
    readouts.pitchAngle,
    centerX + rangeRadius - 18 - font.getTextWidth(readouts.pitchAngle),
    centerY - 8,
    textPaint,
    font,
  );
  textPaint.setColor(Skia.Color(hexToRgba(accentAlt, 0.7)));
  canvas.drawText(
    readouts.pitchRate,
    centerX + rangeRadius - 18 - font.getTextWidth(readouts.pitchRate),
    centerY + 8,
    textPaint,
    font,
  );

  canvas.save();
  canvas.translate(centerX + rangeRadius - 6, centerY);
  canvas.rotate(90, 0, 0);
  const pitchLabel = "P I T C H";
  textPaint.setColor(Skia.Color(hexToRgba(accent, 0.5)));
  canvas.drawText(
    pitchLabel,
    -font.getTextWidth(pitchLabel) / 2,
    0,
    textPaint,
    font,
  );
  canvas.restore();
}

const RANGE_CAPTION_FONT_SIZE = 9;
const RANGE_FIGURE_FONT_SIZE = 18;
const RANGE_METERS_BASE = 4820;
const RANGE_RATE_BASE = 34;
const RANGE_RATE_PROGRESS_FACTOR = 6;

/** RANGE / RANGE RATE captions at 9px plus the two large figures —
 * `bootCanvas.ts:773-799`. The figures render `bold 18px` like the web: the
 * real JetBrains Mono 700 face is loaded alongside the 400 (`bootSceneFonts
 * .ts`), so no weight is synthesized. This helper is entirely text, so it
 * draws nothing at all until the faces load. */
function drawRangeReadouts(
  canvas: SkCanvas,
  centerX: number,
  centerY: number,
  width: number,
  height: number,
  progress: number,
  easedProgress: number,
  accent: string,
  accentAlt: string,
  fonts: DockingFonts | null,
): void {
  "worklet";

  if (fonts === null) {
    return;
  }

  const rangeRadius = Math.min(width, height) * RANGE_RADIUS_FACTOR;
  const rangeMeters = Math.max(
    0,
    Math.round(RANGE_METERS_BASE * (1 - easedProgress)),
  );
  const rangeRateText = `-0.${padTwo(RANGE_RATE_BASE - Math.round(progress * RANGE_RATE_PROGRESS_FACTOR))} m/s`;

  const captionFont = fonts.caption;
  const captionPaint = Skia.Paint();
  captionPaint.setAntiAlias(true);
  captionPaint.setColor(Skia.Color(hexToRgba(accent, 0.5)));

  const rangeLabel = "RANGE";
  canvas.drawText(
    rangeLabel,
    centerX - rangeRadius * 0.42 - captionFont.getTextWidth(rangeLabel) / 2,
    centerY + rangeRadius - 28,
    captionPaint,
    captionFont,
  );
  const rangeRateLabel = "RANGE RATE";
  canvas.drawText(
    rangeRateLabel,
    centerX + rangeRadius * 0.42 - captionFont.getTextWidth(rangeRateLabel) / 2,
    centerY + rangeRadius - 28,
    captionPaint,
    captionFont,
  );

  const figureFont = fonts.figure;
  const figurePaint = Skia.Paint();
  figurePaint.setAntiAlias(true);
  figurePaint.setColor(Skia.Color(hexToRgba(accent, 0.95)));
  const rangeText = `${rangeMeters} m`;
  canvas.drawText(
    rangeText,
    centerX - rangeRadius * 0.42 - figureFont.getTextWidth(rangeText) / 2,
    centerY + rangeRadius - 9,
    figurePaint,
    figureFont,
  );
  figurePaint.setColor(Skia.Color(hexToRgba(accentAlt, 0.95)));
  canvas.drawText(
    rangeRateText,
    centerX + rangeRadius * 0.42 - figureFont.getTextWidth(rangeRateText) / 2,
    centerY + rangeRadius - 9,
    figurePaint,
    figureFont,
  );
}

const LOCK_CORNERS: readonly [number, number][] = [
  [-1, -1],
  [1, -1],
  [-1, 1],
  [1, 1],
];
const LOCK_CORNER_TICK_MIN = 10;
const LOCK_CORNER_TICK_FACTOR = 0.22;
const LOCK_CORNER_STROKE_WIDTH = 1.8;
const LOCK_DASH_STROKE_WIDTH = 1.2;
const LOCK_DASH_RADIUS_FACTOR = 1.25;
const LOCK_ELBOW_STROKE_WIDTH = 1;
const LOCK_CALLOUT_FONT_SIZE = 11;
const LOCK_TETHER_STROKE_WIDTH = 1.4;

/** The lock box's 4 corner brackets (blinking while acquiring), the dashed
 * spinning acquiring ring while `progress < LOCK_DASH_UNTIL`, the elbow
 * leader line + `AC-417 ▸ EUR/USD ESCORT` callout, and the tether from the
 * target to the mid-point of screen centre — `bootCanvas.ts:800-866`.
 * `lockColorRole` only ever returns `"primary"`/`"alt"` (never
 * `"positive"`/`"negative"`), so this resolves the 2-way swap directly
 * rather than through `resolveDockingColor`'s full 4-way switch. */
function drawLockReticle(
  canvas: SkCanvas,
  target: DockingOffset,
  centerX: number,
  centerY: number,
  radius: number,
  width: number,
  height: number,
  progress: number,
  elapsedSec: number,
  accent: string,
  accentAlt: string,
  fonts: DockingFonts | null,
): void {
  "worklet";
  const minDim = Math.min(width, height);
  const currentLockPhase = lockPhase(progress);
  const lockBox = lockBoxSize(currentLockPhase, radius, minDim);
  const blink = lockBlink(elapsedSec, progress);
  const lockColor = lockColorRole(progress) === "alt" ? accentAlt : accent;

  const tickLen = Math.max(
    LOCK_CORNER_TICK_MIN,
    lockBox * LOCK_CORNER_TICK_FACTOR,
  );
  const cornerPaint = Skia.Paint();
  cornerPaint.setStyle(PaintStyle.Stroke);
  cornerPaint.setStrokeWidth(LOCK_CORNER_STROKE_WIDTH);
  cornerPaint.setColor(Skia.Color(hexToRgba(lockColor, 0.92 * blink)));

  for (const [dx, dy] of LOCK_CORNERS) {
    const cornerX = target.x + dx * lockBox;
    const cornerY = target.y + dy * lockBox;
    canvas.drawLine(
      cornerX,
      cornerY - dy * tickLen,
      cornerX,
      cornerY,
      cornerPaint,
    );
    canvas.drawLine(
      cornerX,
      cornerY,
      cornerX - dx * tickLen,
      cornerY,
      cornerPaint,
    );
  }

  if (progress < LOCK_DASH_UNTIL) {
    canvas.save();
    canvas.translate(target.x, target.y);
    canvas.rotate(toDegrees(elapsedSec * LOCK_DASH_SPIN), 0, 0);
    const dashPaint = Skia.Paint();
    dashPaint.setStyle(PaintStyle.Stroke);
    dashPaint.setStrokeWidth(LOCK_DASH_STROKE_WIDTH);
    dashPaint.setColor(Skia.Color(hexToRgba(accent, 0.5 * blink)));
    dashPaint.setPathEffect(
      Skia.PathEffect.MakeDash([...LOCK_DASH_INTERVALS], 0),
    );
    canvas.drawCircle(0, 0, lockBox * LOCK_DASH_RADIUS_FACTOR, dashPaint);
    canvas.restore();
  }

  const elbowPaint = Skia.Paint();
  elbowPaint.setStyle(PaintStyle.Stroke);
  elbowPaint.setStrokeWidth(LOCK_ELBOW_STROKE_WIDTH);
  elbowPaint.setColor(Skia.Color(hexToRgba(lockColor, 0.5)));
  const elbowStartX = target.x + lockBox;
  const elbowStartY = target.y - lockBox;
  const elbowMidX = elbowStartX + LOCK_CALLOUT_ELBOW_DX;
  const elbowMidY = elbowStartY + LOCK_CALLOUT_ELBOW_DY;
  canvas.drawLine(elbowStartX, elbowStartY, elbowMidX, elbowMidY, elbowPaint);
  canvas.drawLine(
    elbowMidX,
    elbowMidY,
    elbowStartX + LOCK_CALLOUT_ARM_DX,
    elbowMidY,
    elbowPaint,
  );

  // Brackets, ring, elbow and tether are geometry and always draw; only the
  // callout text waits on the typeface.
  if (fonts === null) {
    return;
  }

  const calloutFont = fonts.callout;
  const calloutPaint = Skia.Paint();
  calloutPaint.setAntiAlias(true);
  calloutPaint.setColor(Skia.Color(hexToRgba(lockColor, 0.9)));
  canvas.drawText(
    LOCK_CALLOUT_TEXT,
    elbowStartX + LOCK_CALLOUT_TEXT_DX,
    elbowStartY + LOCK_CALLOUT_TEXT_DY,
    calloutPaint,
    calloutFont,
  );

  const tetherPaint = Skia.Paint();
  tetherPaint.setStyle(PaintStyle.Stroke);
  tetherPaint.setStrokeWidth(LOCK_TETHER_STROKE_WIDTH);
  tetherPaint.setColor(Skia.Color(hexToRgba(accentAlt, 0.55)));
  canvas.drawLine(
    target.x,
    target.y,
    target.x + (centerX - target.x) * 0.5,
    target.y + (centerY - target.y) * 0.5,
    tetherPaint,
  );
}

const CROSSHAIR_STROKE_WIDTH = 1.4;
const CROSSHAIR_HUB_ALPHA = 0.3;
const PIP_TICK_INNER = 32;
const PIP_TICK_OUTER = 72;
const PIP_LABEL_X = -92;
const PIP_LABEL_Y_OFFSET = 3;
const PIP_FONT_SIZE = 9;
const PIP_STROKE_WIDTH = 1;

/** The gapped centre cross, its 8px hub circle, and the bobbing pip ladder
 * — `bootCanvas.ts:867-906`. The ladder is drawn in its own bobbing local
 * space (`save`/`translate(centerX, centerY + ladder.offsetY)`), matching
 * every other local-space assembly in this scene. */
function drawCrosshair(
  canvas: SkCanvas,
  centerX: number,
  centerY: number,
  elapsedSec: number,
  accent: string,
  fonts: DockingFonts | null,
): void {
  "worklet";
  const crossPaint = Skia.Paint();
  crossPaint.setStyle(PaintStyle.Stroke);
  crossPaint.setStrokeWidth(CROSSHAIR_STROKE_WIDTH);
  crossPaint.setColor(Skia.Color(hexToRgba(accent, 0.6)));
  canvas.drawLine(
    centerX - CROSSHAIR_ARM,
    centerY,
    centerX - CROSSHAIR_GAP,
    centerY,
    crossPaint,
  );
  canvas.drawLine(
    centerX + CROSSHAIR_GAP,
    centerY,
    centerX + CROSSHAIR_ARM,
    centerY,
    crossPaint,
  );
  canvas.drawLine(
    centerX,
    centerY - CROSSHAIR_ARM,
    centerX,
    centerY - CROSSHAIR_GAP,
    crossPaint,
  );
  canvas.drawLine(
    centerX,
    centerY + CROSSHAIR_GAP,
    centerX,
    centerY + CROSSHAIR_ARM,
    crossPaint,
  );

  const hubPaint = Skia.Paint();
  hubPaint.setStyle(PaintStyle.Stroke);
  hubPaint.setColor(Skia.Color(hexToRgba(accent, CROSSHAIR_HUB_ALPHA)));
  canvas.drawCircle(centerX, centerY, CROSSHAIR_HUB_R, hubPaint);

  const ladder = pipLadder(elapsedSec);
  const ladderStrokePaint = Skia.Paint();
  ladderStrokePaint.setStyle(PaintStyle.Stroke);
  ladderStrokePaint.setStrokeWidth(PIP_STROKE_WIDTH);
  ladderStrokePaint.setColor(Skia.Color(hexToRgba(accent, 0.22)));
  const ladderTextPaint = Skia.Paint();
  ladderTextPaint.setAntiAlias(true);
  ladderTextPaint.setColor(Skia.Color(hexToRgba(accent, 0.4)));
  const ladderFont = fonts?.pip ?? null;

  canvas.save();
  canvas.translate(centerX, centerY + ladder.offsetY);

  for (const tick of ladder.ticks) {
    canvas.drawLine(
      -PIP_TICK_OUTER,
      tick.y,
      -PIP_TICK_INNER,
      tick.y,
      ladderStrokePaint,
    );
    canvas.drawLine(
      PIP_TICK_INNER,
      tick.y,
      PIP_TICK_OUTER,
      tick.y,
      ladderStrokePaint,
    );

    if (ladderFont !== null) {
      canvas.drawText(
        tick.label,
        PIP_LABEL_X,
        tick.y + PIP_LABEL_Y_OFFSET,
        ladderTextPaint,
        ladderFont,
      );
    }
  }

  canvas.restore();
}

/** A full-width band at `scanSweepY`, filled with a linear gradient
 * (transparent → `accentAlt` at 0.1 → transparent) — `bootCanvas.ts:907-913`.
 * The web's `createLinearGradient` (two same-x points, differing only in y)
 * ports directly to `Skia.Shader.MakeLinearGradient`, unlike the two-circle
 * radial gradient `drawBackdrop`/`drawFinalFlash` have to approximate. */
function drawScanSweep(
  canvas: SkCanvas,
  width: number,
  height: number,
  elapsedSec: number,
  accentAlt: string,
): void {
  "worklet";
  const bandCenterY = scanSweepY(elapsedSec, height);
  const shader = Skia.Shader.MakeLinearGradient(
    { x: 0, y: bandCenterY - SCAN_BAND_HALF },
    { x: 0, y: bandCenterY + SCAN_BAND_HALF },
    [
      Skia.Color("rgba(0,0,0,0)"),
      Skia.Color(hexToRgba(accentAlt, SCAN_BAND_ALPHA)),
      Skia.Color("rgba(0,0,0,0)"),
    ],
    [0, 0.5, 1],
    TileMode.Clamp,
  );
  const paint = Skia.Paint();
  paint.setShader(shader);
  canvas.drawRect(
    {
      x: 0,
      y: bandCenterY - SCAN_BAND_HALF,
      width,
      height: SCAN_BAND_HALF * 2,
    },
    paint,
  );
}

const CORNER_LABEL_FONT_SIZE = 11;
const CORNER_LABEL_LINE_HEIGHT = 15;
const CORNER_LABEL_ALPHA = 0.85;
const CORNER_INSET = 20;
const CORNER_REC_Y = 73;
const CORNER_TOP_Y = 28;
const CORNER_BOTTOM_OFFSET = 58;
const SIGNAL_BAR_WIDTH = 6;
const SIGNAL_BAR_BASELINE_OFFSET = 26;

/** One label block, left- or right-aligned — `bootCanvas.ts`'s inline
 * `drawLabel` closure, hoisted to a top-level worklet since Skia's recorder
 * has no closures to reuse across calls. Right alignment subtracts
 * `font.getTextWidth` per line (Skia has no `textAlign`), the same idiom
 * `CoreScene.tsx`'s `drawTelemetry` and this file's `drawRangeReadouts` use. */
function drawLabelBlock(
  canvas: SkCanvas,
  x: number,
  y: number,
  lines: readonly string[],
  align: "left" | "right",
  color: string,
  font: SkFont,
  paint: SkPaint,
): void {
  "worklet";
  paint.setColor(Skia.Color(hexToRgba(color, CORNER_LABEL_ALPHA)));

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineX = align === "right" ? x - font.getTextWidth(line) : x;
    canvas.drawText(line, lineX, y + i * CORNER_LABEL_LINE_HEIGHT, paint, font);
  }
}

/** The four corner telemetry blocks (`dockingLabels`), the `● REC` marker in
 * the sell colour, and the five signal-strength bars (`signalBars`) —
 * `bootCanvas.ts:914-975`. */
function drawCornerLabels(
  canvas: SkCanvas,
  width: number,
  height: number,
  target: DockingOffset,
  elapsedSec: number,
  progress: number,
  accent: string,
  accentAlt: string,
  sell: string,
  fonts: DockingFonts | null,
): void {
  "worklet";

  if (fonts === null) {
    return;
  }

  const telemetry = dockingTelemetry(
    elapsedSec,
    progress,
    target.x,
    target.y,
    width,
    height,
  );
  const labels = dockingLabels(telemetry);
  const font = fonts.cornerLabel;
  const paint = Skia.Paint();
  paint.setAntiAlias(true);

  drawLabelBlock(
    canvas,
    CORNER_INSET,
    CORNER_TOP_Y,
    labels.topLeft.lines,
    "left",
    resolveDockingColor(
      labels.topLeft.colorRole,
      accent,
      accentAlt,
      accent,
      sell,
    ),
    font,
    paint,
  );
  drawLabelBlock(
    canvas,
    CORNER_INSET,
    CORNER_REC_Y,
    labels.rec.lines,
    "left",
    resolveDockingColor(labels.rec.colorRole, accent, accentAlt, accent, sell),
    font,
    paint,
  );
  drawLabelBlock(
    canvas,
    width - CORNER_INSET,
    CORNER_TOP_Y,
    labels.topRight.lines,
    "right",
    resolveDockingColor(
      labels.topRight.colorRole,
      accent,
      accentAlt,
      accent,
      sell,
    ),
    font,
    paint,
  );
  drawLabelBlock(
    canvas,
    width - CORNER_INSET,
    CORNER_REC_Y,
    labels.topRightAlt.lines,
    "right",
    resolveDockingColor(
      labels.topRightAlt.colorRole,
      accent,
      accentAlt,
      accent,
      sell,
    ),
    font,
    paint,
  );
  drawLabelBlock(
    canvas,
    width - CORNER_INSET,
    height - CORNER_BOTTOM_OFFSET,
    labels.bottomRight.lines,
    "right",
    resolveDockingColor(
      labels.bottomRight.colorRole,
      accent,
      accentAlt,
      accent,
      sell,
    ),
    font,
    paint,
  );
  drawLabelBlock(
    canvas,
    CORNER_INSET,
    height - CORNER_BOTTOM_OFFSET,
    labels.bottomLeft.lines,
    "left",
    resolveDockingColor(
      labels.bottomLeft.colorRole,
      accent,
      accentAlt,
      accent,
      sell,
    ),
    font,
    paint,
  );

  const barPaint = Skia.Paint();

  for (const bar of signalBars(elapsedSec)) {
    barPaint.setColor(
      Skia.Color(hexToRgba(bar.lit ? accentAlt : accent, bar.lit ? 0.85 : 0.2)),
    );
    canvas.drawRect(
      {
        x: width - CORNER_INSET - bar.xOffsetFromRight,
        y: height - SIGNAL_BAR_BASELINE_OFFSET,
        width: SIGNAL_BAR_WIDTH,
        height: bar.height,
      },
      barPaint,
    );
  }
}

const STATUS_BANNER_FONT_SIZE = 13;
const STATUS_BANNER_Y_OFFSET = -66;
const STATUS_BANNER_ALPHA = 0.95;

/** `▸ TEXT ◂` at `centerY - 66`, colour resolved from `dockingStatus()`'s
 * `colorRole` (`primary` → `accent`, `alt` → `accentAlt`, `positive` →
 * `buy`), blinking while ACQUIRING (`dockingStatusBlink`) —
 * `bootCanvas.ts:977-1004`. Regular weight, where the web is `bold 13px` —
 * same accepted gap as `drawRangeReadouts`. */
function drawStatusBanner(
  canvas: SkCanvas,
  centerX: number,
  centerY: number,
  progress: number,
  elapsedSec: number,
  accent: string,
  accentAlt: string,
  buy: string,
  fonts: DockingFonts | null,
): void {
  "worklet";

  if (fonts === null) {
    return;
  }

  const status = dockingStatus(progress);
  const color = resolveDockingColor(
    status.colorRole,
    accent,
    accentAlt,
    buy,
    accent,
  );
  const blink = dockingStatusBlink(elapsedSec, status.text);
  const text = `▸ ${status.text} ◂`;
  const font = fonts.banner;
  const paint = Skia.Paint();
  paint.setAntiAlias(true);
  paint.setColor(Skia.Color(hexToRgba(color, STATUS_BANNER_ALPHA * blink)));
  const textWidth = font.getTextWidth(text);
  canvas.drawText(
    text,
    centerX - textWidth / 2,
    centerY + STATUS_BANNER_Y_OFFSET,
    paint,
    font,
  );
}

const FLASH_WHITE_ALPHA = 0.4;
const FLASH_ALT_ALPHA = 0.3;
const FLASH_RADIUS_FACTOR = 0.5;

/** The radial white/alt wash over the last 8% of the boot
 * (`finalFlashAlpha`) — `bootCanvas.ts:1005-1020`. Same 3-stop single-circle
 * approximation of the web's two-circle `createRadialGradient` that
 * `drawBackdrop`'s vignette already uses (Skia's radial gradient factory
 * takes one circle, not two). */
function drawFinalFlash(
  canvas: SkCanvas,
  width: number,
  height: number,
  centerX: number,
  centerY: number,
  progress: number,
  accentAlt: string,
): void {
  "worklet";
  const fadeAlpha = finalFlashAlpha(progress);

  if (fadeAlpha <= 0) {
    return;
  }

  const shader = Skia.Shader.MakeRadialGradient(
    { x: centerX, y: centerY },
    Math.max(width, height) * FLASH_RADIUS_FACTOR,
    [
      Skia.Color(hexToRgba("#ffffff", FLASH_WHITE_ALPHA * fadeAlpha)),
      Skia.Color(hexToRgba(accentAlt, FLASH_ALT_ALPHA * fadeAlpha)),
      Skia.Color("rgba(0,0,0,0)"),
    ],
    [0, 0.35, 1],
    TileMode.Clamp,
  );
  const paint = Skia.Paint();
  paint.setShader(shader);
  canvas.drawRect({ x: 0, y: 0, width, height }, paint);
}

/**
 * The scene's seven text sites, each matching its web `ctx.font` string in
 * `bootCanvas.ts`: the P/Y/R attitude columns (`11px`), the RANGE captions
 * (`9px`) and figures (`bold 18px`), the lock callout (`11px`), the pip
 * ladder (`9px`), the four corner blocks (`11px`) and the status banner
 * (`bold 13px`).
 *
 * Declared last, after every `*_FONT_SIZE` it reads — a module-level `const`
 * initializer runs in source order, so hoisting this to the top would hit
 * the temporal dead zone. It is still a module constant by the time
 * `DockingScene` first renders, which is what `useBootSceneFonts`'s memo
 * needs for a stable identity.
 */
/** A `type`, not an `interface`, on purpose: only type aliases get an
 * implicit index signature, which `useBootSceneFonts`'s
 * `Record<string, BootFontSpec>` constraint requires. */
type DockingFontSites = {
  attitude: BootFontSpec;
  caption: BootFontSpec;
  figure: BootFontSpec;
  callout: BootFontSpec;
  pip: BootFontSpec;
  cornerLabel: BootFontSpec;
  banner: BootFontSpec;
};

const DOCKING_FONTS: DockingFontSites = {
  attitude: { size: RANGE_ATTITUDE_FONT_SIZE },
  caption: { size: RANGE_CAPTION_FONT_SIZE },
  figure: { size: RANGE_FIGURE_FONT_SIZE, bold: true },
  callout: { size: LOCK_CALLOUT_FONT_SIZE },
  pip: { size: PIP_FONT_SIZE },
  cornerLabel: { size: CORNER_LABEL_FONT_SIZE },
  banner: { size: STATUS_BANNER_FONT_SIZE, bold: true },
};

/** Named so a mistyped site (`fonts.corner`) is a type error rather than an
 * `undefined` handed to `drawText` — which Skia would take without
 * complaint. */
type DockingFonts = Readonly<Record<keyof DockingFontSites, SkFont>>;
