// packages/client-react-native/src/ui/shell/boot/scenes/CoreScene.tsx
import {
  createPicture,
  PaintStyle,
  Picture,
  type SkCanvas,
  type SkFont,
  Skia,
  TileMode,
} from "@shopify/react-native-skia";
import type { JSX } from "react";
import { useDerivedValue } from "react-native-reanimated";

import { BOOT_DURATION_MS } from "@rtc/client-core";
import type { Projection3dParams } from "@rtc/motion-core";

import type { BootSceneProps } from "#/ui/shell/boot/bootScene";
import { useBootSceneFonts } from "#/ui/shell/boot/scenes/bootSceneFonts";
import {
  ARC_TAIL_LENGTH,
  ARC_TAIL_SAMPLES,
  ARC_TRAIL_SAMPLES,
  activeFlowArcs,
  arcBulgeVector,
  arcRippleFraction,
  SPOTLIGHT_ELBOW_DX,
  SPOTLIGHT_ELBOW_DY,
  SPOTLIGHT_LABEL_MIN_X,
  SPOTLIGHT_LABEL_RIGHT_INSET,
  SPOTLIGHT_LABEL_WIDTH,
  spotlightFlowRate,
  spotlightIndex,
} from "#/ui/shell/boot/scenes/coreArcs";
import {
  CORE_BACKDROP_WASH,
  CORE_STARS,
  holoFlickerAlpha,
  NUCLEUS_ALPHAS,
  NUCLEUS_BOX_FACTOR,
  NUCLEUS_RADIUS_FACTOR,
  NUCLEUS_STOPS,
  nucleusAlpha,
  STAR_SIZE_PX,
  starTwinkleAlpha,
} from "#/ui/shell/boot/scenes/coreBackdrop";
import {
  bannerBlinkAlpha,
  bootProgress,
  CORE_HUBS,
  coreBootStatus,
  ease,
  GLOBE_PERSPECTIVE_K,
  type GlobeScreenPoint,
  globePitch,
  globeYaw,
  hexToRgba,
  hubVectorFromLatLon,
  MERIDIAN_COUNT,
  meridianLatitudes,
  meridianLongitude,
  meridianRevealPhase,
  nodeAlpha,
  nodeRevealPhase,
  nodesPhase,
  PARALLEL_INDICES,
  parallelLatitude,
  parallelLongitudes,
  parallelRevealPhase,
  pingRingAlpha,
  pingRingFraction,
  pingRingRadius,
  projectGlobePoint,
  projectGlobeVector,
  segmentAlpha,
} from "#/ui/shell/boot/scenes/coreGeometry";
import {
  GYRO_RINGS,
  GYRO_SEGMENT_INDICES,
  gyroPointVector,
  gyroRingSpin,
  gyroSegmentAngles,
  ringsPhase,
  SCAN_RING_SEGMENTS,
  SCAN_RING_STROKE_WIDTH,
  scanRingAlpha,
  scanRingLatitude,
} from "#/ui/shell/boot/scenes/coreRings";
import {
  CALIBRATION_DIM_ALPHA,
  CALIBRATION_INNER_FACTOR,
  CALIBRATION_LIT_ALPHA,
  CALIBRATION_OUTER_FACTOR,
  CALIBRATION_TICK_COUNT,
  calibrationTickLit,
  coreTelemetryLines,
  TELEMETRY_FIRST_BASELINE,
  TELEMETRY_FONT_SIZE,
  TELEMETRY_INSET,
  TELEMETRY_SECOND_BASELINE,
} from "#/ui/shell/boot/scenes/coreTelemetry";

/**
 * `core` boot scene — the "global market mesh": a rotating wireframe globe of
 * the world's trading hubs, drawn imperatively into an `SkPicture` built
 * inside a `useDerivedValue` worklet (Skia 2.6.2's `createPicture` carries a
 * `"worklet"` directive, so recording stays on the UI thread every frame —
 * never a per-frame React state write, per `docs/performance.md`). Ported
 * from `packages/client-react/src/ui/shell/boot/variants/bootCore.ts`.
 *
 * Task 6 (phase 6a) ports five of the web variant's twelve elements — enough
 * to prove the imperative-Skia pipeline end to end and get real on-device
 * perf evidence before adding density:
 *   - the 3D projection setup (yaw spin + fixed tilt + perspective, via
 *     `@rtc/motion-core`'s `project3d`), folding the gyro-drift pointer seam
 *     in gently (RN has no cursor; the web globe is fixed-tilt);
 *   - the meridian sweep with glowing draw-heads;
 *   - the parallels;
 *   - hub nodes with ping ripples (front-facing hubs only);
 *   - the central status banner (SPINNING UP CORE → LINKING GLOBAL NODES →
 *     MESH ONLINE).
 *
 * Task 1 (phase 6b-1) adds three more, all whole-frame/backdrop layers ported
 * from `packages/boot-splash/src/variants/bootCore.ts`:
 *   - the star-drift backdrop (twinkling starfield behind the globe);
 *   - the nucleus glow (radial gradient wash behind the globe);
 *   - the whole-frame "holo flicker" (a fast carrier sine + occasional glitch
 *     dip). The web applies this as `ctx.globalAlpha` around its entire draw;
 *     Skia's equivalent, `canvas.saveLayer()`, allocates an offscreen surface
 *     every frame and is banned by `docs/performance.md`. Instead every draw
 *     helper below — old and new — takes a `flicker: number` and multiplies
 *     it into the alpha it already passes to `hexToRgba`/`nucleusAlpha`.
 *     Visually identical for these alpha-blended strokes/fills, no per-frame
 *     allocation.
 *
 * Task 2 (phase 6b-1) adds the two ring layers, both projected through the
 * same globe camera as the mesh (`coreRings.ts`, ported from
 * `bootCore.ts` lines 322-402):
 *   - the latitude scan ring, a highlight parallel sweeping south → north;
 *   - the two counter-rotating gyroscopic segmented rings that wrap the
 *     globe, revealed only once boot progress passes 18%.
 *
 * Task 3 (phase 6b-1) adds order-flow arcs and the rotating spotlight callout
 * (`coreArcs.ts`, ported from `bootCore.ts` lines 435-558):
 *   - buy/sell great-circle arcs between hubs, drawn from a closed-form
 *     schedule rather than the web's mutable arc array/seed counter — see
 *     `coreArcs.ts`'s header for why a worklet recorder needs a pure function
 *     of `elapsedSec`;
 *   - the rotating spotlight callout labelling one front-facing hub, cycling
 *     every 2.2s once the hub layer has fully revealed.
 *
 * Task 4 (phase 6b-1) adds the last two elements, both screen-space, not
 * projected through the globe camera (`coreTelemetry.ts`, ported from
 * `bootCore.ts` lines 560-588):
 *   - the 48 calibration ticks ringing the globe, a sweep head lighting the
 *     arc behind it;
 *   - the four corner telemetry strings (CORE SYNC · GLOBAL MESH / NODES ·
 *     UPLINK top-left, YAW / LINKS · LIVE top-right), the latter pair reading
 *     the order-flow arc state Task 3 added.
 *
 * All twelve web elements are now ported. One documented non-goal remains,
 * less a missing element than a mobile-rendering constraint: the
 * `ctx.shadowBlur` bloom the web layers onto the mesh strokes and the
 * arc/ripple draw-heads — a per-frame `MaskFilter.MakeBlur` is the mobile
 * equivalent of the compositing traps `docs/performance.md` catalogues, so
 * the underlying stroke/dot is ported and the glow is not.
 *
 * A second entry stood here until 2026-07-26, claiming the text merely
 * rendered at regular weight because "`Skia.Font()` resolves the platform
 * default typeface". It does not. A font built with no typeface draws ZERO
 * glyphs on real iOS — silently — so the banner, the corner telemetry and
 * the spotlight labels rendered nothing at all, on device and in the pinned
 * golden alike. Fonts now come from `bootSceneFonts.ts` (bundled JetBrains
 * Mono, matching the web's stack, real 700 face for the bold sites) and are
 * built in React-land, never inside the draw worklet.
 * The web's `ctx.clearRect` + translucent background-wash pair (canvas-2D's
 * own persistence workaround) has no counterpart here: `createPicture`
 * always starts a fresh, blank recording, so there is nothing to clear. The
 * `drawBackdropWash` layer below ports only the wash's *colour*, not the
 * clear — `createPicture` needs neither.
 *
 * Every draw helper below carries its own `"worklet"` directive — Reanimated
 * worklet-ifies a function where it's *defined*, so a plain function called
 * from inside the `useDerivedValue` callback (itself a worklet) must already
 * be marked, same as `@rtc/motion-core`'s `project3d`.
 */
export function CoreScene({
  elapsedSec,
  drift,
  width,
  height,
  theme,
}: BootSceneProps): JSX.Element {
  const accent = theme.accentPrimary;
  const accentAlt = theme.accent2;
  const buyColor = theme.accentPositive;
  const sellColor = theme.accentNegative;
  // Null until the bundled faces load; the text layers below sit that window
  // out while the geometry draws normally. Built here, outside the recorder
  // worklet, and captured by it — see `bootSceneFonts.ts`.
  const fonts = useBootSceneFonts(CORE_FONTS);

  const picture = useDerivedValue(() => {
    return createPicture(
      (canvas) => {
        const elapsed = elapsedSec.value;
        const pointerDrift = drift.value;
        const centerX = width / 2;
        const centerY = height / 2 - GLOBE_CENTER_Y_LIFT;
        const radius = Math.min(width, height) * GLOBE_RADIUS_FACTOR;
        const progress = bootProgress(elapsed, BOOT_DURATION_MS);
        // ease() clamps internally, so this matches the web's
        // `ease(progress / 0.32)` even once progress saturates at 1.
        const reveal = ease(progress / REVEAL_FRACTION);
        const params: Projection3dParams = {
          yaw: globeYaw(elapsed, pointerDrift.mx),
          pitch: globePitch(pointerDrift.my),
          perspectiveK: GLOBE_PERSPECTIVE_K,
        };
        const flicker = holoFlickerAlpha(elapsed);

        drawBackdropWash(canvas, width, height);
        drawStars(canvas, width, height, elapsed, flicker, accent);
        drawNucleusGlow(canvas, centerX, centerY, radius, flicker, accent);
        drawMeridians(
          canvas,
          params,
          centerX,
          centerY,
          radius,
          reveal,
          flicker,
          accent,
          accentAlt,
        );
        drawParallels(
          canvas,
          params,
          centerX,
          centerY,
          radius,
          reveal,
          flicker,
          accent,
        );
        drawScanRing(
          canvas,
          params,
          centerX,
          centerY,
          radius,
          elapsed,
          flicker,
          accentAlt,
        );
        drawGyroRings(
          canvas,
          params,
          centerX,
          centerY,
          radius,
          elapsed,
          progress,
          flicker,
          accent,
          accentAlt,
        );
        drawHubNodes(
          canvas,
          params,
          centerX,
          centerY,
          radius,
          elapsed,
          progress,
          flicker,
          accentAlt,
        );
        drawFlowArcs(
          canvas,
          params,
          centerX,
          centerY,
          radius,
          elapsed,
          flicker,
          buyColor,
          sellColor,
        );
        drawSpotlight(
          canvas,
          params,
          centerX,
          centerY,
          radius,
          width,
          elapsed,
          progress,
          flicker,
          accent,
          accentAlt,
          fonts?.spotlight ?? null,
        );
        drawCalibrationTicks(
          canvas,
          centerX,
          centerY,
          radius,
          elapsed,
          flicker,
          accent,
        );
        drawTelemetry(
          canvas,
          width,
          elapsed,
          progress,
          params.yaw,
          flicker,
          accent,
          accentAlt,
          fonts?.telemetry ?? null,
        );
        drawStatusBanner(
          canvas,
          centerX,
          progress,
          elapsed,
          flicker,
          accent,
          accentAlt,
          fonts?.banner ?? null,
        );
      },
      { width, height },
    );
  });

  const pictureProps = { testID: "boot-scene-core", picture };
  return <Picture {...pictureProps} />;
}

/** `bootCore.ts`'s `10px ${MONO}` spotlight label and `bold 12px ${MONO}`
 * status banner. The telemetry pair's `11px` already had a name, next to the
 * insets it is laid out with (`coreTelemetry.ts`). */
const SPOTLIGHT_LABEL_FONT_SIZE = 10;
const BANNER_FONT_SIZE = 12;

/** The scene's three text sites, each matching its web `ctx.font` string in
 * `bootCore.ts`: the spotlight labels (`10px`), the corner telemetry
 * (`11px`), and the status banner (`bold 12px`). Module-level so the memo
 * inside `useBootSceneFonts` sees a stable identity. */
const CORE_FONTS = {
  spotlight: { size: SPOTLIGHT_LABEL_FONT_SIZE },
  telemetry: { size: TELEMETRY_FONT_SIZE },
  banner: { size: BANNER_FONT_SIZE, bold: true },
} as const;

/** Screen-space tuning, verbatim from the web variant: the globe sits
 * slightly above true centre, sized off the smaller viewport dimension. */
const GLOBE_CENTER_Y_LIFT = 20;
const GLOBE_RADIUS_FACTOR = 0.24;

/** Verbatim from the web `reveal = ease(progress / 0.32)`: the meridian/
 * parallel draw-in completes at 32% of the boot progress. */
const REVEAL_FRACTION = 0.32;

/** Mesh + ring stroke widths, raised from the web's 1px. On-device (3× retina)
 * a 1px Skia stroke is physically thin and, without the deferred glow/bloom
 * layers, the wireframe barely reads; 1.5px restores presence. Ring is kept a
 * touch thinner so the ping ripple stays secondary to the node dot. Pairs with
 * the raised `segmentAlpha` band in coreGeometry.ts. */
const MESH_STROKE_WIDTH = 1.5;
const HUB_RING_STROKE_WIDTH = 1.25;
/** Draw-head dot radius (web 1.8), nudged up with the wider strokes. */
const DRAW_HEAD_RADIUS = 2.2;

function drawMeridians(
  canvas: SkCanvas,
  params: Projection3dParams,
  centerX: number,
  centerY: number,
  radius: number,
  reveal: number,
  flicker: number,
  accent: string,
  accentAlt: string,
): void {
  "worklet";
  const linePaint = Skia.Paint();
  linePaint.setStyle(PaintStyle.Stroke);
  linePaint.setStrokeWidth(MESH_STROKE_WIDTH);
  linePaint.setAntiAlias(true);
  const headPaint = Skia.Paint();
  headPaint.setAntiAlias(true);

  for (let meridian = 0; meridian < MERIDIAN_COUNT; meridian++) {
    const phase = meridianRevealPhase(reveal, MERIDIAN_COUNT, meridian);

    if (phase <= 0) {
      break;
    }

    const lon = meridianLongitude(meridian, MERIDIAN_COUNT);
    const lats = meridianLatitudes(phase);
    let prev: GlobeScreenPoint | null = null;

    for (const lat of lats) {
      const point = projectGlobePoint(
        lat,
        lon,
        params,
        centerX,
        centerY,
        radius,
      );

      if (prev !== null) {
        linePaint.setColor(
          Skia.Color(
            hexToRgba(accent, segmentAlpha((point.z + prev.z) / 2) * flicker),
          ),
        );
        canvas.drawLine(prev.x, prev.y, point.x, point.y, linePaint);
      }

      prev = point;
    }

    if (phase < 1 && prev !== null) {
      headPaint.setColor(Skia.Color(hexToRgba(accentAlt, 0.9 * flicker)));
      canvas.drawCircle(prev.x, prev.y, DRAW_HEAD_RADIUS, headPaint);
    }
  }
}

function drawParallels(
  canvas: SkCanvas,
  params: Projection3dParams,
  centerX: number,
  centerY: number,
  radius: number,
  reveal: number,
  flicker: number,
  accent: string,
): void {
  "worklet";
  const linePaint = Skia.Paint();
  linePaint.setStyle(PaintStyle.Stroke);
  linePaint.setStrokeWidth(MESH_STROKE_WIDTH);
  linePaint.setAntiAlias(true);

  for (const parallelIndex of PARALLEL_INDICES) {
    const phase = parallelRevealPhase(reveal, parallelIndex);

    if (phase <= 0) {
      continue;
    }

    const lat = parallelLatitude(parallelIndex);
    const lons = parallelLongitudes(phase);
    let prev: GlobeScreenPoint | null = null;

    for (const lon of lons) {
      const point = projectGlobePoint(
        lat,
        lon,
        params,
        centerX,
        centerY,
        radius,
      );

      if (prev !== null) {
        linePaint.setColor(
          Skia.Color(
            hexToRgba(
              accent,
              segmentAlpha((point.z + prev.z) / 2) * 0.85 * flicker,
            ),
          ),
        );
        canvas.drawLine(prev.x, prev.y, point.x, point.y, linePaint);
      }

      prev = point;
    }
  }
}

/** The highlight parallel sweeping south → north across the globe — a second,
 * brighter ring layered over the static mesh. */
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

/** The two counter-rotating gyroscopic segmented rings that wrap the globe,
 * drawn as machinery — 6 of 8 segments per ring, each a short polyline. */
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

/** Front-facing hubs only (`z < 0.12`, same cutoff as the web), each a dot
 * plus an expanding ping-ripple ring. */
function drawHubNodes(
  canvas: SkCanvas,
  params: Projection3dParams,
  centerX: number,
  centerY: number,
  radius: number,
  elapsedSec: number,
  progress: number,
  flicker: number,
  accentAlt: string,
): void {
  "worklet";
  const phase = nodesPhase(progress);

  if (phase <= 0) {
    return;
  }

  const nodePaint = Skia.Paint();
  nodePaint.setAntiAlias(true);
  const ringPaint = Skia.Paint();
  ringPaint.setStyle(PaintStyle.Stroke);
  ringPaint.setStrokeWidth(HUB_RING_STROKE_WIDTH);
  ringPaint.setAntiAlias(true);

  for (let i = 0; i < CORE_HUBS.length; i++) {
    const hub = CORE_HUBS[i];
    const nodePhase = nodeRevealPhase(phase, i, CORE_HUBS.length);

    if (nodePhase <= 0) {
      continue;
    }

    const point = projectGlobePoint(
      hub.lat,
      hub.lon,
      params,
      centerX,
      centerY,
      radius,
    );

    if (point.z > 0.12) {
      continue;
    }

    nodePaint.setColor(
      Skia.Color(hexToRgba(accentAlt, nodeAlpha(nodePhase, point.z) * flicker)),
    );
    canvas.drawCircle(point.x, point.y, 2 * point.perspective, nodePaint);
    const ringFraction = pingRingFraction(elapsedSec, hub.phase);
    ringPaint.setColor(
      Skia.Color(
        hexToRgba(accentAlt, pingRingAlpha(ringFraction, nodePhase) * flicker),
      ),
    );
    canvas.drawCircle(
      point.x,
      point.y,
      pingRingRadius(point.perspective, ringFraction),
      ringPaint,
    );
  }
}

/** Buy/sell order-flow arcs between hubs, drawn from the closed-form schedule
 * in `coreArcs.ts` — see that file's header for why the web's mutable arc
 * bookkeeping (a pushed/spliced array, a seed counter) had to become a pure
 * function of `elapsedSec`. */
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

/** Rotating callout labelling one front-facing hub, cycling every 2.2s. Gated
 * on the same `nodesPhase` ramp as `drawHubNodes` so the label never appears
 * before the hub dots themselves have fully revealed. */
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
  font: SkFont | null,
): void {
  "worklet";

  if (nodesPhase(progress) < 1) {
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
  leader.lineTo(labelX + SPOTLIGHT_LABEL_WIDTH, point.y + SPOTLIGHT_ELBOW_DY);
  const linePaint = Skia.Paint();
  linePaint.setStyle(PaintStyle.Stroke);
  linePaint.setStrokeWidth(1);
  linePaint.setAntiAlias(true);
  linePaint.setColor(Skia.Color(hexToRgba(accent, 0.45 * flicker)));
  canvas.drawPath(leader, linePaint);

  // The leader line above is geometry and always draws; only the label waits
  // on the typeface.
  if (font === null) {
    return;
  }

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

/** The 48 screen-space calibration ticks ringing the globe, a fixed head
 * sweeping the ring once per ~3.43s (`coreTelemetry.ts`'s
 * `calibrationTickLit`). Screen space, not projected through the globe
 * camera — the web draws these after the arcs/spotlight, so this does too. */
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

/** The four corner telemetry strings (`coreTelemetry.ts`'s
 * `coreTelemetryLines`) — CORE SYNC / NODES-UPLINK top-left, YAW / LINKS-LIVE
 * top-right. Skia has no `textAlign`, so the right-aligned pair subtracts
 * `font.getTextWidth`, same as `drawStatusBanner` below. */
function drawTelemetry(
  canvas: SkCanvas,
  width: number,
  elapsed: number,
  progress: number,
  yaw: number,
  flicker: number,
  accent: string,
  accentAlt: string,
  font: SkFont | null,
): void {
  "worklet";

  if (font === null) {
    return;
  }

  const lines = coreTelemetryLines(elapsed, progress, yaw);
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

function drawStatusBanner(
  canvas: SkCanvas,
  centerX: number,
  progress: number,
  elapsedSec: number,
  flicker: number,
  accent: string,
  accentAlt: string,
  font: SkFont | null,
): void {
  "worklet";

  if (font === null) {
    return;
  }

  const status = coreBootStatus(progress);
  const color = status.useAltColor ? accentAlt : accent;
  const blink = bannerBlinkAlpha(progress, elapsedSec);
  const text = `▸ ${status.text} ◂`;
  const textWidth = font.getTextWidth(text);
  const textPaint = Skia.Paint();
  textPaint.setAntiAlias(true);
  textPaint.setColor(Skia.Color(hexToRgba(color, 0.9 * blink * flicker)));
  canvas.drawText(text, centerX - textWidth / 2, 72, textPaint, font);
}

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
