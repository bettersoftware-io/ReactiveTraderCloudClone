// packages/client-react-native/src/ui/shell/boot/scenes/CoreScene.tsx
import {
  createPicture,
  PaintStyle,
  Picture,
  type SkCanvas,
  Skia,
} from "@shopify/react-native-skia";
import type { JSX } from "react";
import { useDerivedValue } from "react-native-reanimated";

import { BOOT_DURATION_MS } from "@rtc/client-core";
import type { Projection3dParams } from "@rtc/motion-core";

import type { BootSceneProps } from "#/ui/shell/boot/bootScene";
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
  MERIDIAN_COUNT,
  meridianLatitudes,
  meridianLongitude,
  meridianRevealPhase,
  nodeAlpha,
  nodeRevealPhase,
  PARALLEL_INDICES,
  parallelLatitude,
  parallelLongitudes,
  parallelRevealPhase,
  pingRingAlpha,
  pingRingFraction,
  pingRingRadius,
  projectGlobePoint,
  segmentAlpha,
} from "#/ui/shell/boot/scenes/coreGeometry";

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
 * DEFERRED to phase 6b (each a distinct visual layer in the web source, left
 * out here rather than half-ported):
 *   - star-drift backdrop (twinkling starfield behind the globe);
 *   - nucleus glow (radial gradient wash behind the globe);
 *   - latitude scan ring (a second sweeping ring, south → north);
 *   - the two counter-rotating gyroscopic segmented rings;
 *   - the rotating spotlight callout labelling one front-facing hub;
 *   - order-flow arcs (buy/sell great-circle arcs between hubs);
 *   - screen-space calibration ticks and the corner telemetry readout (CORE
 *     SYNC / NODES / YAW / LINKS — the last two read `arcs`/`arcCount`,
 *     which don't exist without the deferred arcs);
 *   - the web's whole-frame "holo flicker" (a `globalAlpha` wash over
 *     everything, sourced from a per-frame sine + occasional glitch dip) —
 *     since it modulates the entire draw, not one layer, it's deferred as a
 *     unit with the other unported elements rather than applied partially.
 * The web's `ctx.clearRect` + translucent background-wash pair (canvas-2D's
 * own persistence workaround) has no counterpart here: `createPicture`
 * always starts a fresh, blank recording, so there is nothing to clear.
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

        drawMeridians(
          canvas,
          params,
          centerX,
          centerY,
          radius,
          reveal,
          accent,
          accentAlt,
        );
        drawParallels(canvas, params, centerX, centerY, radius, reveal, accent);
        drawHubNodes(
          canvas,
          params,
          centerX,
          centerY,
          radius,
          elapsed,
          progress,
          accentAlt,
        );
        drawStatusBanner(canvas, centerX, progress, elapsed, accent, accentAlt);
      },
      { width, height },
    );
  });

  const pictureProps = { testID: "boot-scene-core", picture };
  return <Picture {...pictureProps} />;
}

/** Screen-space tuning, verbatim from the web variant: the globe sits
 * slightly above true centre, sized off the smaller viewport dimension. */
const GLOBE_CENTER_Y_LIFT = 20;
const GLOBE_RADIUS_FACTOR = 0.24;

/** Verbatim from the web `reveal = ease(progress / 0.32)`: the meridian/
 * parallel draw-in completes at 32% of the boot progress. */
const REVEAL_FRACTION = 0.32;

function drawMeridians(
  canvas: SkCanvas,
  params: Projection3dParams,
  centerX: number,
  centerY: number,
  radius: number,
  reveal: number,
  accent: string,
  accentAlt: string,
): void {
  "worklet";
  const linePaint = Skia.Paint();
  linePaint.setStyle(PaintStyle.Stroke);
  linePaint.setStrokeWidth(1);
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
          Skia.Color(hexToRgba(accent, segmentAlpha((point.z + prev.z) / 2))),
        );
        canvas.drawLine(prev.x, prev.y, point.x, point.y, linePaint);
      }

      prev = point;
    }

    if (phase < 1 && prev !== null) {
      headPaint.setColor(Skia.Color(hexToRgba(accentAlt, 0.9)));
      canvas.drawCircle(prev.x, prev.y, 1.8, headPaint);
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
  accent: string,
): void {
  "worklet";
  const linePaint = Skia.Paint();
  linePaint.setStyle(PaintStyle.Stroke);
  linePaint.setStrokeWidth(1);
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
            hexToRgba(accent, segmentAlpha((point.z + prev.z) / 2) * 0.85),
          ),
        );
        canvas.drawLine(prev.x, prev.y, point.x, point.y, linePaint);
      }

      prev = point;
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
  accentAlt: string,
): void {
  "worklet";
  const nodesPhase = ease(Math.max(0, Math.min(1, (progress - 0.28) / 0.22)));

  if (nodesPhase <= 0) {
    return;
  }

  const nodePaint = Skia.Paint();
  nodePaint.setAntiAlias(true);
  const ringPaint = Skia.Paint();
  ringPaint.setStyle(PaintStyle.Stroke);
  ringPaint.setStrokeWidth(1);
  ringPaint.setAntiAlias(true);

  for (let i = 0; i < CORE_HUBS.length; i++) {
    const hub = CORE_HUBS[i];
    const nodePhase = nodeRevealPhase(nodesPhase, i, CORE_HUBS.length);

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
      Skia.Color(hexToRgba(accentAlt, nodeAlpha(nodePhase, point.z))),
    );
    canvas.drawCircle(point.x, point.y, 2 * point.perspective, nodePaint);
    const ringFraction = pingRingFraction(elapsedSec, hub.phase);
    ringPaint.setColor(
      Skia.Color(hexToRgba(accentAlt, pingRingAlpha(ringFraction, nodePhase))),
    );
    canvas.drawCircle(
      point.x,
      point.y,
      pingRingRadius(point.perspective, ringFraction),
      ringPaint,
    );
  }
}

function drawStatusBanner(
  canvas: SkCanvas,
  centerX: number,
  progress: number,
  elapsedSec: number,
  accent: string,
  accentAlt: string,
): void {
  "worklet";
  const status = coreBootStatus(progress);
  const color = status.useAltColor ? accentAlt : accent;
  const blink = bannerBlinkAlpha(progress, elapsedSec);
  const text = `▸ ${status.text} ◂`;
  // Default typeface at regular weight (no bold synthesis — the web banner is
  // `bold 12px`; a deliberate minor cosmetic gap, not one of the deferred
  // elements above). Build with no args + setSize rather than
  // `Skia.Font(undefined, 12)`: passing `undefined` explicitly as the typeface
  // throws "Value is undefined, expected an Object" on real iOS Skia (the jest
  // mock tolerates it), firing every frame from this draw.
  const font = Skia.Font();
  font.setSize(12);
  const textWidth = font.getTextWidth(text);
  const textPaint = Skia.Paint();
  textPaint.setAntiAlias(true);
  textPaint.setColor(Skia.Color(hexToRgba(color, 0.9 * blink)));
  canvas.drawText(text, centerX - textWidth / 2, 72, textPaint, font);
}
