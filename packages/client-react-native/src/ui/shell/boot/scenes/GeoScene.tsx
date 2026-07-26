// packages/client-react-native/src/ui/shell/boot/scenes/GeoScene.tsx
import {
  createPicture,
  PaintStyle,
  Picture,
  type SkCanvas,
  type SkFont,
  Skia,
} from "@shopify/react-native-skia";
import type { JSX } from "react";
import { useDerivedValue } from "react-native-reanimated";

import { BOOT_DURATION_MS } from "@rtc/client-core";

import type { BootSceneProps } from "#/ui/shell/boot/bootScene";
import {
  type Boot3dCamera,
  gyroYawPitch,
  type ProjectedBootPoint,
  projectBootPoint,
} from "#/ui/shell/boot/scenes/boot3dCamera";
import { useBootSceneFonts } from "#/ui/shell/boot/scenes/bootSceneFonts";
import { bootProgress, hexToRgba } from "#/ui/shell/boot/scenes/coreGeometry";
import {
  activeGeoTrades,
  cityBarHeight,
  cityBarPhase,
  cityIsHot,
  cityLabelPhase,
  cityVolumeLabel,
  GEO_CENTER_Y_NUDGE,
  GEO_DOT_STEM_MIN_HEIGHT,
  GEO_GROUND_Y,
  GEO_PERSPECTIVE_K,
  GEO_PITCH,
  GEO_PROJ_SCALE_FACTOR,
  GEO_RING_SEGMENTS,
  GEO_RING_Y,
  GEO_TABLE_RINGS,
  type GeoChordSegment,
  type GeoCityNode,
  type GeoPlanePoly,
  type GeoTerrainDot,
  geoBlinkAlpha,
  geoCityNodes,
  geoCoastlinePhase,
  geoDotRise,
  geoFlicker,
  geoGraticuleChords,
  geoGraticulePhase,
  geoNearness,
  geoPlanePolys,
  geoPointInside,
  geoStatus,
  geoSweepX,
  geoTelemetry,
  geoTerrainDots,
  geoTerrainPhase,
  geoTotalTracePoints,
  geoTracedPointCount,
  geoYaw,
  spawnedTradeCount,
  tradeArcLift,
  tradeArcPoint,
} from "#/ui/shell/boot/scenes/geoGeometry";
import { cachedSceneGeometry } from "#/ui/shell/boot/scenes/sceneGeometryCache";

/**
 * `geo` boot scene — "GEO-FEED · EMEA WEST TACTICAL". A western-Europe
 * tactical map: hand-placed coastlines trace in as glowing polylines, a terrain
 * dot-mesh rises for the Alps/Pyrenees/Highlands, twelve capitals pulse volume
 * bars while buy/sell trades arc city-to-city, plus a graticule and radar
 * sweep.
 *
 * Ported from `packages/boot-splash/src/variants/bootGeo.ts`.
 *
 * PROJECTION. `perspectiveK` 0.22 with **no near-plane clamp** — the camera
 * omits `minPerspectiveDenom` entirely.
 *
 * FOUR TABLES KEPT OUT OF THE WORKLET, and that is the reason this scene is
 * affordable. `geoPointInside` is an even-odd test across 270 coastline
 * points; the web calls it per frame to seed the terrain mesh (~2,800
 * candidates) and to clip the graticule (~640), which is on the order of
 * 930,000 point comparisons every frame. All of those inputs are fixed in
 * world space — only the projection moves — so they are computed in
 * React-land and merely projected per frame in the worklet. Jest cannot see
 * the difference; the simulator would. They are read only inside the
 * `useDerivedValue` closure below, never JSX, so the React Compiler inserts
 * no cache for them (verified against the compiled output) — `world` is
 * cached at module scope instead (`sceneGeometryCache.ts`), which is
 * compiler-independent and, since none of these tables take an input, never
 * needs to recompute at all after the first call.
 *
 * The radar sweep is the deliberate exception: its X position depends on
 * `elapsedSec`, and it is only ~62 `inside` calls, so it stays per-frame and
 * matches the web exactly rather than being approximated on a quantised grid.
 *
 * FLICKER IS A PER-DRAW ALPHA, never `saveLayer` (`docs/performance.md`). The
 * web opens its `ctx.save()` before the table rings, so everything from there
 * on pulses — the backdrop wash does not.
 */
export function GeoScene({
  elapsedSec,
  drift,
  width,
  height,
  theme,
}: BootSceneProps): JSX.Element {
  const accent = theme.accentPrimary;
  const accentAlt = theme.accent2;
  const positive = theme.accentPositive;
  const negative = theme.accentNegative;
  const fonts = useBootSceneFonts(GEO_FONTS);
  // The four tables — see the header. `polys` feeds the other three, so they
  // share one computation rather than four that each rebuild it. None of
  // these functions take any input (they're deterministic, hand-placed
  // world-space data), so `world` has no real dependency to key on — the
  // cache key is empty, meaning the first call ever computes it and every
  // later render (any viewport, any theme) reuses the same object. Read
  // only inside the `useDerivedValue` closure below, never JSX, so the
  // compiler cannot cache it itself — see `sceneGeometryCache.ts`'s header.
  const world = cachedSceneGeometry("geoScene:world", [], () => {
    const polys = geoPlanePolys();

    return {
      polys,
      dots: geoTerrainDots(polys),
      chords: geoGraticuleChords(polys),
      cities: geoCityNodes(),
      tracePoints: geoTotalTracePoints(polys),
    };
  });

  const picture = useDerivedValue(() => {
    return createPicture(
      (canvas) => {
        const elapsed = elapsedSec.value;
        const pointerDrift = drift.value;
        const progress = bootProgress(elapsed, BOOT_DURATION_MS);
        const projScale = Math.min(width, height) * GEO_PROJ_SCALE_FACTOR;
        const nudge = gyroYawPitch(
          pointerDrift,
          GYRO_YAW_RANGE,
          GYRO_PITCH_RANGE,
        );

        const camera: Boot3dCamera = {
          yaw: geoYaw(elapsed) + nudge.yaw,
          pitch: GEO_PITCH + nudge.pitch,
          perspectiveK: GEO_PERSPECTIVE_K,
          centerX: width / 2,
          centerY: height / 2 + GEO_CENTER_Y_NUDGE,
          projScale,
        };
        const flicker = geoFlicker(elapsed);

        drawBackdrop(canvas, width, height);
        drawTableRings(canvas, camera, elapsed, flicker, accent);
        drawGraticule(canvas, camera, world.chords, progress, flicker, accent);
        drawCoastlines(
          canvas,
          camera,
          world.polys,
          world.tracePoints,
          progress,
          flicker,
          accent,
        );
        drawTerrain(
          canvas,
          camera,
          world.dots,
          elapsed,
          progress,
          flicker,
          accent,
        );
        drawRadarSweep(
          canvas,
          camera,
          world.polys,
          elapsed,
          flicker,
          accentAlt,
        );
        drawTrades(
          canvas,
          camera,
          world.cities,
          elapsed,
          flicker,
          positive,
          negative,
        );
        drawCityBars(
          canvas,
          camera,
          world.cities,
          elapsed,
          progress,
          flicker,
          accent,
          accentAlt,
          fonts?.cityLabel ?? null,
        );
        drawTelemetry(
          canvas,
          width,
          world.dots.length,
          camera.yaw,
          elapsed,
          flicker,
          accent,
          accentAlt,
          fonts?.telemetry ?? null,
        );
        drawStatusBanner(
          canvas,
          camera.centerX,
          camera.centerY,
          projScale,
          progress,
          elapsed,
          flicker,
          accent,
          accentAlt,
          positive,
          fonts?.banner ?? null,
        );
      },
      { width, height },
    );
  });

  const pictureProps = { testID: "boot-scene-geo", picture };
  return <Picture {...pictureProps} />;
}

/** The scene's three text sites, matching the web's `ctx.font` strings: city
 * labels (`8px`), corner telemetry (`11px`), status banner (`bold 12px`).
 * Module-level so the memo inside `useBootSceneFonts` sees a stable identity. */
const CITY_LABEL_FONT_SIZE = 8;
const TELEMETRY_FONT_SIZE = 11;
const BANNER_FONT_SIZE = 12;

const GEO_FONTS = {
  cityLabel: { size: CITY_LABEL_FONT_SIZE },
  telemetry: { size: TELEMETRY_FONT_SIZE },
  banner: { size: BANNER_FONT_SIZE, bold: true },
} as const;

/** How far the gyro seam may swing the orbit, radians. The map already spins,
 * so this reads as parallax rather than steering. */
const GYRO_YAW_RANGE = 0.24;
const GYRO_PITCH_RANGE = 0.1;

/** The web's backdrop wash. */
const GEO_BACKDROP = "rgba(0,3,6,0.5)";

/** Coastlines draw twice: a wide dim glow, then a narrow bright core. */
const COASTLINE_GLOW_WIDTH = 4;
const COASTLINE_GLOW_ALPHA = 0.16;
const COASTLINE_CORE_WIDTH = 1.5;
const COASTLINE_CORE_ALPHA = 0.85;

/** The bright dot at the head of a coastline still tracing in. */
const TRACE_HEAD_RADIUS = 2.6;
const TRACE_HEAD_COLOR = "#fff";

/** Terrain dots draw as tiny squares. */
const TERRAIN_DOT_SIZE = 1.6;

/** Trade arc sampling: the full path, then a brighter recent tail. */
const ARC_SAMPLES = 22;
const ARC_TAIL_SAMPLES = 8;
const ARC_TAIL_LENGTH = 0.14;
const ARC_HEAD_RADIUS = 2.2;

/** Telemetry insets and baselines, verbatim from the web. */
const TELEMETRY_INSET = 20;
const TELEMETRY_FIRST_BASELINE = 28;
const TELEMETRY_SECOND_BASELINE = 44;

/** The banner sits this many `projScale` above the scene centre. */
const BANNER_RISE = 1.18;

/** City label leader-line geometry, screen px from the bar top. */
const LABEL_ELBOW_DX = 12;
const LABEL_ELBOW_DY = -14;
const LABEL_RUN_DX = 70;
const LABEL_TEXT_DX = 14;
const LABEL_NAME_DY = -18;
const LABEL_VOLUME_DY = -8;

function drawBackdrop(canvas: SkCanvas, width: number, height: number): void {
  "worklet";
  const paint = Skia.Paint();
  paint.setColor(Skia.Color(GEO_BACKDROP));
  canvas.drawRect({ x: 0, y: 0, width, height }, paint);
}

/** The three tactical table rings under the map. */
function drawTableRings(
  canvas: SkCanvas,
  camera: Boot3dCamera,
  elapsed: number,
  flicker: number,
  accent: string,
): void {
  "worklet";

  for (const ring of GEO_TABLE_RINGS) {
    const paint = Skia.Paint();
    paint.setStyle(PaintStyle.Stroke);
    paint.setStrokeWidth(ring.lineWidth);
    paint.setAntiAlias(true);
    paint.setColor(Skia.Color(hexToRgba(accent, ring.alpha * flicker)));

    if (ring.dash !== undefined) {
      paint.setPathEffect(Skia.PathEffect.MakeDash([...ring.dash], 0));
    }

    const rotation =
      ring.rotationRate === undefined ? 0 : ring.rotationRate * elapsed;
    const path = Skia.Path.Make();

    for (let step = 0; step <= GEO_RING_SEGMENTS; step++) {
      const angle = (step / GEO_RING_SEGMENTS) * 6.283 + rotation;
      const point = projectBootPoint(
        Math.cos(angle) * ring.radius,
        GEO_RING_Y,
        Math.sin(angle) * ring.radius,
        camera,
      );

      if (step === 0) {
        path.moveTo(point.x, point.y);
      } else {
        path.lineTo(point.x, point.y);
      }
    }

    canvas.drawPath(path, paint);
  }
}

/** The graticule — precomputed chord runs, projected. */
function drawGraticule(
  canvas: SkCanvas,
  camera: Boot3dCamera,
  chords: readonly GeoChordSegment[],
  progress: number,
  flicker: number,
  accent: string,
): void {
  "worklet";
  const phase = geoGraticulePhase(progress);

  if (phase <= 0) {
    return;
  }

  const paint = Skia.Paint();
  paint.setStyle(PaintStyle.Stroke);
  paint.setStrokeWidth(1);
  paint.setAntiAlias(true);
  paint.setColor(Skia.Color(hexToRgba(accent, 0.13 * phase * flicker)));

  for (const chord of chords) {
    const path = Skia.Path.Make();

    for (let i = 0; i < chord.points.length; i++) {
      const point = projectBootPoint(
        chord.points[i].x,
        GEO_GROUND_Y,
        chord.points[i].z,
        camera,
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

/**
 * The coastlines, tracing themselves in.
 *
 * Two passes of the same path — a wide dim glow then a narrow bright core — in
 * that order, which is what gives the line its bloom without a blur filter.
 */
function drawCoastlines(
  canvas: SkCanvas,
  camera: Boot3dCamera,
  polys: readonly GeoPlanePoly[],
  totalTracePoints: number,
  progress: number,
  flicker: number,
  accent: string,
): void {
  "worklet";
  const phase = geoCoastlinePhase(progress);
  let remaining = Math.max(2, Math.floor(phase * totalTracePoints));

  const glowPaint = Skia.Paint();
  glowPaint.setStyle(PaintStyle.Stroke);
  glowPaint.setStrokeWidth(COASTLINE_GLOW_WIDTH);
  glowPaint.setAntiAlias(true);
  glowPaint.setColor(
    Skia.Color(hexToRgba(accent, COASTLINE_GLOW_ALPHA * flicker)),
  );

  const corePaint = Skia.Paint();
  corePaint.setStyle(PaintStyle.Stroke);
  corePaint.setStrokeWidth(COASTLINE_CORE_WIDTH);
  corePaint.setAntiAlias(true);
  corePaint.setColor(
    Skia.Color(hexToRgba(accent, COASTLINE_CORE_ALPHA * flicker)),
  );

  const headPaint = Skia.Paint();
  headPaint.setAntiAlias(true);
  headPaint.setColor(Skia.Color(TRACE_HEAD_COLOR));

  for (const poly of polys) {
    const points = poly.points;
    const count = geoTracedPointCount(points.length, remaining);

    if (count >= 2) {
      const path = Skia.Path.Make();

      for (let i = 0; i < count; i++) {
        const vertex = points[i % points.length];
        const point = projectBootPoint(
          vertex.x,
          GEO_GROUND_Y,
          vertex.z,
          camera,
        );

        if (i === 0) {
          path.moveTo(point.x, point.y);
        } else {
          path.lineTo(point.x, point.y);
        }
      }

      canvas.drawPath(path, glowPaint);
      canvas.drawPath(path, corePaint);

      // Still tracing: mark the drawing head.
      if (count < points.length + 1) {
        const head = points[(count - 1) % points.length];
        const point = projectBootPoint(head.x, GEO_GROUND_Y, head.z, camera);
        canvas.drawCircle(point.x, point.y, TRACE_HEAD_RADIUS, headPaint);
      }
    }

    remaining -= points.length + 1;
  }
}

/** The terrain dot-mesh rising out of the plane. */
function drawTerrain(
  canvas: SkCanvas,
  camera: Boot3dCamera,
  dots: readonly GeoTerrainDot[],
  elapsed: number,
  progress: number,
  flicker: number,
  accent: string,
): void {
  "worklet";
  const phase = geoTerrainPhase(progress);

  if (phase <= 0) {
    return;
  }

  const stemPaint = Skia.Paint();
  stemPaint.setStyle(PaintStyle.Stroke);
  stemPaint.setStrokeWidth(1);
  stemPaint.setAntiAlias(true);
  const dotPaint = Skia.Paint();
  dotPaint.setAntiAlias(false);

  for (const dot of dots) {
    const raised = geoDotRise(dot, phase, elapsed);
    const point = projectBootPoint(dot.x, GEO_GROUND_Y - raised, dot.z, camera);
    const alpha = (0.12 + 0.5 * geoNearness(point.z)) * phase;

    if (dot.height > GEO_DOT_STEM_MIN_HEIGHT) {
      const base = projectBootPoint(dot.x, GEO_GROUND_Y, dot.z, camera);
      stemPaint.setColor(Skia.Color(hexToRgba(accent, alpha * 0.5 * flicker)));
      canvas.drawLine(base.x, base.y, point.x, point.y, stemPaint);
    }

    dotPaint.setColor(Skia.Color(hexToRgba(accent, alpha * flicker)));
    canvas.drawRect(
      {
        x: point.x - TERRAIN_DOT_SIZE / 2,
        y: point.y - TERRAIN_DOT_SIZE / 2,
        width: TERRAIN_DOT_SIZE,
        height: TERRAIN_DOT_SIZE,
      },
      dotPaint,
    );
  }
}

/**
 * The radar sweep.
 *
 * The one per-frame `geoPointInside` caller — see the module header for why
 * this one is not precomputed.
 */
function drawRadarSweep(
  canvas: SkCanvas,
  camera: Boot3dCamera,
  polys: readonly GeoPlanePoly[],
  elapsed: number,
  flicker: number,
  accentAlt: string,
): void {
  "worklet";
  const sweepX = geoSweepX(elapsed);
  const paint = Skia.Paint();
  paint.setStyle(PaintStyle.Stroke);
  paint.setStrokeWidth(1.4);
  paint.setAntiAlias(true);
  paint.setColor(Skia.Color(hexToRgba(accentAlt, 0.5 * flicker)));

  let path = Skia.Path.Make();
  let drawing = false;

  for (let z = -1.15; z <= 1.301; z += 0.04) {
    if (geoPointInside(polys, sweepX, z)) {
      const point = projectBootPoint(sweepX, GEO_GROUND_Y, z, camera);

      if (drawing) {
        path.lineTo(point.x, point.y);
      } else {
        path.moveTo(point.x, point.y);
      }

      drawing = true;
      continue;
    }

    if (drawing) {
      canvas.drawPath(path, paint);
      path = Skia.Path.Make();
      drawing = false;
    }
  }

  if (drawing) {
    canvas.drawPath(path, paint);
  }
}

/** Buy/sell trades arcing between capitals. */
function drawTrades(
  canvas: SkCanvas,
  camera: Boot3dCamera,
  cities: readonly GeoCityNode[],
  elapsed: number,
  flicker: number,
  positive: string,
  negative: string,
): void {
  "worklet";

  for (const trade of activeGeoTrades(elapsed)) {
    const from = cities[trade.fromIndex];
    const to = cities[trade.toIndex];
    const lift = tradeArcLift(from, to);
    const color = trade.buy ? positive : negative;

    const trailPaint = Skia.Paint();
    trailPaint.setStyle(PaintStyle.Stroke);
    trailPaint.setStrokeWidth(1);
    trailPaint.setAntiAlias(true);
    trailPaint.setColor(Skia.Color(hexToRgba(color, 0.2 * flicker)));
    const trail = Skia.Path.Make();

    for (let step = 0; step <= ARC_SAMPLES; step++) {
      const point = projectArc(camera, from, to, lift, step / ARC_SAMPLES);

      if (step === 0) {
        trail.moveTo(point.x, point.y);
      } else {
        trail.lineTo(point.x, point.y);
      }
    }

    canvas.drawPath(trail, trailPaint);

    const headTrailPaint = Skia.Paint();
    headTrailPaint.setStyle(PaintStyle.Stroke);
    headTrailPaint.setStrokeWidth(1.8);
    headTrailPaint.setAntiAlias(true);
    headTrailPaint.setColor(Skia.Color(hexToRgba(color, 0.75 * flicker)));
    const headTrail = Skia.Path.Make();
    const tailStart = Math.max(0, trade.flightFrac - ARC_TAIL_LENGTH);

    for (let step = 0; step <= ARC_TAIL_SAMPLES; step++) {
      const frac =
        tailStart + (trade.flightFrac - tailStart) * (step / ARC_TAIL_SAMPLES);
      const point = projectArc(camera, from, to, lift, frac);

      if (step === 0) {
        headTrail.moveTo(point.x, point.y);
      } else {
        headTrail.lineTo(point.x, point.y);
      }
    }

    canvas.drawPath(headTrail, headTrailPaint);

    const head = projectArc(camera, from, to, lift, trade.flightFrac);
    const headPaint = Skia.Paint();
    headPaint.setAntiAlias(true);
    headPaint.setColor(Skia.Color(TRACE_HEAD_COLOR));
    canvas.drawCircle(head.x, head.y, ARC_HEAD_RADIUS, headPaint);

    // Landing ripple over the last tenth of the flight.
    if (trade.flightFrac > 0.9) {
      const landing = projectArc(camera, from, to, lift, 1);
      const ringFrac = (trade.flightFrac - 0.9) / 0.1;
      const ringPaint = Skia.Paint();
      ringPaint.setStyle(PaintStyle.Stroke);
      ringPaint.setStrokeWidth(1.4);
      ringPaint.setAntiAlias(true);
      ringPaint.setColor(
        Skia.Color(hexToRgba(color, 0.7 * (1 - ringFrac) * flicker)),
      );
      canvas.drawCircle(landing.x, landing.y, 3 + ringFrac * 12, ringPaint);
    }
  }
}

/** Project a point along a trade arc. */
function projectArc(
  camera: Boot3dCamera,
  from: GeoCityNode,
  to: GeoCityNode,
  lift: number,
  frac: number,
): ProjectedBootPoint {
  "worklet";
  const world = tradeArcPoint(from, to, lift, frac);
  return projectBootPoint(world.x, world.y, world.z, camera);
}

/** The capitals' pulsing volume bars, drawn far→near. */
function drawCityBars(
  canvas: SkCanvas,
  camera: Boot3dCamera,
  cities: readonly GeoCityNode[],
  elapsed: number,
  progress: number,
  flicker: number,
  accent: string,
  accentAlt: string,
  labelFont: SkFont | null,
): void {
  "worklet";
  const order: CityDrawEntry[] = [];

  for (const city of cities) {
    const base = projectBootPoint(city.x, GEO_GROUND_Y, city.z, camera);
    order.push({
      city,
      baseX: base.x,
      baseY: base.y,
      baseZ: base.z,
      basePerspective: base.perspective,
    });
  }

  // Painter's order — far capitals first, so near bars overdraw them.
  order.sort((a, b) => {
    return b.baseZ - a.baseZ;
  });

  for (let index = 0; index < order.length; index++) {
    const entry = order[index];
    const phase = cityBarPhase(index, progress);

    if (phase <= 0) {
      continue;
    }

    const city = entry.city;
    const barHeight = cityBarHeight(city, phase, elapsed);
    const top = projectBootPoint(
      city.x,
      GEO_GROUND_Y - barHeight,
      city.z,
      camera,
    );
    const alpha = 0.3 + 0.6 * geoNearness(entry.baseZ);
    const hot = cityIsHot(city);
    const stemColor = hot ? accentAlt : accent;

    const dotPaint = Skia.Paint();
    dotPaint.setAntiAlias(true);
    dotPaint.setColor(Skia.Color(hexToRgba(accent, alpha * 0.8 * flicker)));
    canvas.drawCircle(
      entry.baseX,
      entry.baseY,
      2.4 * entry.basePerspective,
      dotPaint,
    );

    const pulsePaint = Skia.Paint();
    pulsePaint.setStyle(PaintStyle.Stroke);
    pulsePaint.setStrokeWidth(1);
    pulsePaint.setAntiAlias(true);
    pulsePaint.setColor(Skia.Color(hexToRgba(accent, alpha * 0.35 * flicker)));
    canvas.drawCircle(
      entry.baseX,
      entry.baseY,
      (5 + 2 * Math.sin(elapsed * 2 + city.phase)) * entry.basePerspective,
      pulsePaint,
    );

    const stemPaint = Skia.Paint();
    stemPaint.setStyle(PaintStyle.Stroke);
    stemPaint.setStrokeWidth(Math.max(1.2, 2.6 * entry.basePerspective));
    stemPaint.setAntiAlias(true);
    stemPaint.setColor(Skia.Color(hexToRgba(stemColor, alpha * flicker)));
    canvas.drawLine(entry.baseX, entry.baseY, top.x, top.y, stemPaint);

    const capPaint = Skia.Paint();
    capPaint.setAntiAlias(true);
    capPaint.setColor(
      Skia.Color(hexToRgba(stemColor, Math.min(1, alpha + 0.2) * flicker)),
    );
    canvas.drawCircle(top.x, top.y, 2 * top.perspective, capPaint);

    if (hot && progress > 0.55) {
      drawCityLabel(
        canvas,
        top,
        city,
        elapsed,
        cityLabelPhase(progress) * flicker,
        accent,
        accentAlt,
        labelFont,
      );
    }
  }
}

/**
 * A hot capital's leader line and label.
 *
 * The leader draws unconditionally; only the two text sites wait on the font,
 * so a null-font window loses labels but keeps the geometry.
 */
function drawCityLabel(
  canvas: SkCanvas,
  top: ProjectedBootPoint,
  city: GeoCityNode,
  elapsed: number,
  alpha: number,
  accent: string,
  accentAlt: string,
  font: SkFont | null,
): void {
  "worklet";
  const leaderPaint = Skia.Paint();
  leaderPaint.setStyle(PaintStyle.Stroke);
  leaderPaint.setStrokeWidth(1);
  leaderPaint.setAntiAlias(true);
  leaderPaint.setColor(Skia.Color(hexToRgba(accent, 0.4 * alpha)));
  const leader = Skia.Path.Make();
  leader.moveTo(top.x, top.y);
  leader.lineTo(top.x + LABEL_ELBOW_DX, top.y + LABEL_ELBOW_DY);
  leader.lineTo(top.x + LABEL_RUN_DX, top.y + LABEL_ELBOW_DY);
  canvas.drawPath(leader, leaderPaint);

  if (font === null) {
    return;
  }

  const namePaint = Skia.Paint();
  namePaint.setAntiAlias(true);
  namePaint.setColor(Skia.Color(hexToRgba(accentAlt, 0.9 * alpha)));
  canvas.drawText(
    city.label,
    top.x + LABEL_TEXT_DX,
    top.y + LABEL_NAME_DY,
    namePaint,
    font,
  );

  const volumePaint = Skia.Paint();
  volumePaint.setAntiAlias(true);
  volumePaint.setColor(Skia.Color(hexToRgba(accent, 0.7 * alpha)));
  canvas.drawText(
    cityVolumeLabel(city, elapsed),
    top.x + LABEL_TEXT_DX,
    top.y + LABEL_VOLUME_DY,
    volumePaint,
    font,
  );
}

/** Corner telemetry: two left-aligned readouts, two right-aligned. */
function drawTelemetry(
  canvas: SkCanvas,
  width: number,
  dotCount: number,
  yaw: number,
  elapsed: number,
  flicker: number,
  accent: string,
  accentAlt: string,
  font: SkFont | null,
): void {
  "worklet";

  if (font === null) {
    return;
  }

  const telemetry = geoTelemetry(
    dotCount,
    yaw,
    spawnedTradeCount(elapsed),
    activeGeoTrades(elapsed).length,
  );
  const paint = Skia.Paint();
  paint.setAntiAlias(true);
  paint.setColor(Skia.Color(hexToRgba(accent, 0.7 * flicker)));
  canvas.drawText(
    telemetry.title,
    TELEMETRY_INSET,
    TELEMETRY_FIRST_BASELINE,
    paint,
    font,
  );
  canvas.drawText(
    telemetry.mesh,
    TELEMETRY_INSET,
    TELEMETRY_SECOND_BASELINE,
    paint,
    font,
  );
  canvas.drawText(
    telemetry.yaw,
    width - TELEMETRY_INSET - font.getTextWidth(telemetry.yaw),
    TELEMETRY_FIRST_BASELINE,
    paint,
    font,
  );
  paint.setColor(Skia.Color(hexToRgba(accentAlt, 0.7 * flicker)));
  canvas.drawText(
    telemetry.routes,
    width - TELEMETRY_INSET - font.getTextWidth(telemetry.routes),
    TELEMETRY_SECOND_BASELINE,
    paint,
    font,
  );
}

/** The centred status banner. */
function drawStatusBanner(
  canvas: SkCanvas,
  centerX: number,
  centerY: number,
  projScale: number,
  progress: number,
  elapsed: number,
  flicker: number,
  accent: string,
  accentAlt: string,
  positive: string,
  font: SkFont | null,
): void {
  "worklet";

  if (font === null) {
    return;
  }

  const status = geoStatus(progress);
  const blink = geoBlinkAlpha(progress, elapsed);
  const text = `▸ ${status.text} ◂`;
  let color = accent;

  if (status.tone === "accentAlt") {
    color = accentAlt;
  } else if (status.tone === "positive") {
    color = positive;
  }

  const paint = Skia.Paint();
  paint.setAntiAlias(true);
  paint.setColor(Skia.Color(hexToRgba(color, 0.9 * blink * flicker)));
  canvas.drawText(
    text,
    centerX - font.getTextWidth(text) / 2,
    centerY - projScale * BANNER_RISE,
    paint,
    font,
  );
}

/** One capital's base projection, cached for the painter's sort. */
interface CityDrawEntry {
  city: GeoCityNode;
  baseX: number;
  baseY: number;
  baseZ: number;
  basePerspective: number;
}
