// packages/client-react-native/src/ui/shell/boot/scenes/DockingScene.tsx
import {
  createPicture,
  PaintStyle,
  Picture,
  type SkCanvas,
  Skia,
  type SkPath,
  TileMode,
} from "@shopify/react-native-skia";
import type { JSX } from "react";
import { useMemo } from "react";
import { useDerivedValue } from "react-native-reanimated";

import { BOOT_DURATION_MS } from "@rtc/client-core";

import type { BootSceneProps } from "#/ui/shell/boot/bootScene";
import {
  bootProgress,
  ease,
  hexToRgba,
} from "#/ui/shell/boot/scenes/coreGeometry";
import {
  CRAFT_BODY_RECTS,
  corridorLines,
  craftGridLines,
  craftRadius,
  DOCKING_RING_ALPHA,
  DOCKING_RING_COUNT,
  DOCKING_RING_FACTOR,
  DOCKING_WASH,
  type DockingOffset,
  dockingShake,
  dockingTarget,
  hudGridStep,
  markerOffset,
  RETICLE_SPEC,
  SCANLINE_ALPHA,
  scanlineOffsets,
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
 * `packages/boot-splash/src/bootCanvas.ts` lines 459-716. This is the FIRST
 * HALF only — backdrop (wash + vignette + scanline overlay), the shaking
 * perspective corridor + its 5 concentric rings, the (unshaken) HUD grid, the
 * craft body (hull/struts/rails/pods), the full lock-on reticle (hoop, 36
 * spokes, inner ring + 12 pips, 4 vanes, crosshair rings + ticks, hub dot)
 * and the buy-coloured drift marker. DEFERRED to Task 9 (same file, same
 * component — see that task's own header once it lands): the range dial +
 * attitude readouts, the lock box + acquiring ring + callout, the centre
 * crosshair + pip ladder, the horizontal scan sweep, the four corner
 * telemetry blocks + REC indicator, the signal-strength bars, the status
 * banner and the final docking flash. `docking` is NOT registered in
 * `BOOT_SCENES` until Task 9 completes the draw — a half-drawn scene must
 * never reach a booting device.
 *
 * **The static-geometry rule earns its keep here.** Three layers' shapes
 * depend only on `width`/`height` — the scan-line overlay (~280 one-pixel
 * rects), the 22-line perspective corridor, and the HUD grid — so they are
 * built into `SkPath`s once in a `useMemo` keyed on the dimensions, captured
 * in the per-frame recorder's closure, and drawn with a single `drawPath`
 * each (docs/performance.md: never rebuild a static point set inside the
 * per-frame worklet). The corridor shakes, so it's drawn inside its own
 * `canvas.save()`/`translate(shake.x, shake.y)`/`restore()` pair rather than
 * rebuilt per frame; the HUD grid does not shake and is drawn in absolute
 * screen space, exactly matching the web's draw order (wash → vignette →
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
 * > capturing a `useMemo`'d `SkPath` in a worklet closure (the three static
 * > layers above) is the documented RN Skia pattern, but no scene in this
 * > repo had exercised it before this task — `CoreScene`/`LaserScene` build
 * > every path fresh inside the worklet or use declarative `<Path>` with a
 * > plain SVG string (a value type, not a host object). This scene ships
 * > with the memoized-closure pattern per the plan's primary instruction;
 * > jest passes either way (its Skia mock is a no-op), so this is NOT
 * > confirmed safe on a real device. If it red-boxes with `[Worklets] Tried
 * > to synchronously call a Remote Function` on-device, the fallback is to
 * > build `scanlines`/`corridor`/`hudGrid` fresh inside the recorder each
 * > frame (same per-frame-allocation trade CoreScene's `drawGyroRings`
 * > already makes for its polyline paths) — Task 11 is the on-device witness
 * > for this, not this file.
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
      },
      { width, height },
    );
  });

  const pictureProps = { testID: "boot-scene-docking", picture };
  return <Picture {...pictureProps} />;
}

// --- static (per-viewport) path builders — plain functions, NOT worklets: --
// --- called once from `useMemo` on the JS thread, never from the recorder --

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
