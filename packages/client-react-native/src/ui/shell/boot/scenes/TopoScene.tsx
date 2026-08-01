// packages/client-react-native/src/ui/shell/boot/scenes/TopoScene.tsx
import {
  createPicture,
  PaintStyle,
  Picture,
  type SkCanvas,
  type SkFont,
  Skia,
} from "@shopify/react-native-skia";
import { type JSX, useRef } from "react";
import { useDerivedValue } from "react-native-reanimated";

import { BOOT_DURATION_MS } from "@rtc/client-core";

import type { BootSceneProps } from "#/ui/shell/boot/bootScene";
import {
  type Boot3dCamera,
  type ProjectedBootPoint,
  projectBootPoint,
} from "#/ui/shell/boot/scenes/boot3dCamera";
import { useBootSceneFonts } from "#/ui/shell/boot/scenes/bootSceneFonts";
import { bootProgress, hexToRgba } from "#/ui/shell/boot/scenes/coreGeometry";
import { cachedSceneGeometry } from "#/ui/shell/boot/scenes/sceneGeometryCache";
import {
  beaconPhase,
  contourPhase,
  moteDrift,
  peakPriceText,
  peakTick,
  routePhase,
  TOPO_CENTER_Y_NUDGE,
  TOPO_GROUND_Y,
  TOPO_HOT_LEVEL_INDEX,
  TOPO_MIN_PERSPECTIVE_DENOM,
  TOPO_PEAKS,
  TOPO_PERSPECTIVE_K,
  TOPO_PROJ_SCALE_FACTOR,
  TOPO_WORLD_MAX_X,
  TOPO_WORLD_MAX_Z,
  TOPO_WORLD_MIN_X,
  TOPO_WORLD_MIN_Z,
  type TopoContour,
  type TopoMeshVertex,
  type TopoMote,
  type TopoPeak,
  topoBlinkAlpha,
  topoContours,
  topoFlicker,
  topoHeightAt,
  topoHeightfield,
  topoMeshLines,
  topoMotes,
  topoPitch,
  topoRise,
  topoStatus,
  topoTelemetry,
  topoTimestamp,
  topoYaw,
} from "#/ui/shell/boot/scenes/topoGeometry";

/**
 * `topo` boot scene — "VOL SURFACE · 3DSCAN". A volatility-terrain survey: six
 * gaussian FX-pair peaks rendered as marching-squares contour topography over a
 * 52×36 heightfield, with summit beacons ticking live prices, a route linking
 * the summits and drifting survey motes.
 *
 * Ported from `packages/boot-splash/src/variants/bootTopo.ts`.
 *
 * THE HEIGHTFIELD AND CONTOURS STAY OUT OF THE WORKLET, and this is the scene
 * where that matters most. Together they are ~1,900 `heightAt` evaluations plus
 * ~20,000 marching-squares cell tests. The web computes them once, before
 * returning its draw closure; doing it inside `createPicture` would repeat all
 * of it every frame at 60 fps — that per-frame repeat is what this component
 * must never do, `useMemo` or not. Jest cannot tell the difference — its mock
 * runs the slow version happily either way — so this is untested by anything
 * except a device. `world` is read only inside the `useDerivedValue` closure
 * below and never flows into JSX, so the React Compiler inserts no cache for
 * it (verified against the compiled output) — it is cached at module scope
 * instead (`sceneGeometryCache.ts`), which is compiler-independent and, since
 * neither `topoHeightfield` nor `topoMotes` take an input, never needs to
 * recompute at all after the first call.
 *
 * PRICE TICKS ARE DERIVED FROM TIME, not accumulated on the peak objects as the
 * web does — see `topoGeometry.ts`'s `peakTick`.
 *
 * THE WALL CLOCK IS READ IN REACT-LAND, NEVER THE WORKLET. The web prints a
 * live timestamp bottom-left. A worklet must not call `new Date()`, and a
 * ticking clock makes a pinned visual golden unreproducible — this repo
 * already dropped `credit/rfq-tiles-empty` for exactly that class of
 * non-determinism. Sampled once per mount via a lazy `useRef` (not a
 * `useMemo`, which the compiler cannot supply memoization for here either —
 * see `world` above — and which React itself never guarantees to retain), so
 * a theme/dimension change mid-boot leaves the footer clock pinned to mount
 * time exactly as before. Already **not enough for a golden** either way: two
 * mounts minutes apart still differ. Registering `boot/topo` as a visual
 * scenario therefore needs the clock pinned, or the scenario left out with
 * that reason recorded.
 *
 * PROJECTION. `perspectiveK` 0.26 with a clamped near plane.
 */
export function TopoScene({
  elapsedSec,
  drift,
  width,
  height,
  theme,
  now: pinnedNow,
}: BootSceneProps): JSX.Element {
  const accent = theme.accentPrimary;
  const accentAlt = theme.accent2;
  const positive = theme.accentPositive;
  const negative = theme.accentNegative;
  const fonts = useBootSceneFonts(TOPO_FONTS);
  // The expensive tables — see the header. Kept out of the worklet, never
  // rebuilt inside `createPicture`. `topoHeightfield`/`topoMotes` take no
  // input (deterministic world-space data), so `world` has no real
  // dependency to key on — an empty cache key means the first call computes
  // it and every later render reuses the same object. Read only inside the
  // `useDerivedValue` closure below, never JSX, so the React Compiler cannot
  // cache it itself — see `sceneGeometryCache.ts`'s header.
  const world = cachedSceneGeometry("topoScene:world", [], () => {
    const heights = topoHeightfield();

    return {
      contours: topoContours(heights),
      meshLines: topoMeshLines(heights),
      motes: topoMotes(),
    };
  });

  // Read in React-land, never inside the worklet — see the header. This is
  // a BUILD-ONCE-PER-MOUNT value, not a geometry cache: the footer clock
  // must stay pinned to the moment this scene mounted, so a lazy ref (the
  // same idiom `useMachine.ts`/`InspectorApp.tsx` use for a build-once
  // instance) captures `Date.now()` exactly once and every later render
  // reads the same captured value, regardless of how many times the
  // component re-renders in between.
  // A pinned `now` (the visual harness) wins outright and is never sampled
  // from, so a capture is reproducible; production passes nothing and gets the
  // mount-time sample.
  const mountTimeRef = useRef<Date | null>(null);

  if (mountTimeRef.current === null) {
    mountTimeRef.current = new Date();
  }

  const now = pinnedNow ?? mountTimeRef.current;
  const stamp = topoTimestamp(
    now.getFullYear(),
    now.getMonth() + 1,
    now.getDate(),
    now.getHours(),
    now.getMinutes(),
    now.getSeconds(),
  );

  const picture = useDerivedValue(() => {
    return createPicture(
      (canvas) => {
        const elapsed = elapsedSec.value;
        const pointerDrift = drift.value;
        const progress = bootProgress(elapsed, BOOT_DURATION_MS);
        const projScale = Math.min(width, height) * TOPO_PROJ_SCALE_FACTOR;
        const yaw = topoYaw(elapsed, pointerDrift.mx);
        const camera: Boot3dCamera = {
          yaw,
          pitch: topoPitch(elapsed, pointerDrift.my),
          perspectiveK: TOPO_PERSPECTIVE_K,
          minPerspectiveDenom: TOPO_MIN_PERSPECTIVE_DENOM,
          centerX: width / 2,
          centerY: height / 2 + TOPO_CENTER_Y_NUDGE,
          projScale,
        };
        const flicker = topoFlicker(elapsed);
        const rise = topoRise(progress);

        drawBackdrop(canvas, width, height);
        drawTableFrame(canvas, camera, flicker, accent, accentAlt);
        drawMesh(canvas, camera, world.meshLines, rise, flicker, accent);
        drawContours(
          canvas,
          camera,
          world.contours,
          rise,
          progress,
          flicker,
          accent,
          accentAlt,
        );
        drawRoute(canvas, camera, rise, progress, flicker, accentAlt);
        drawBeacons(
          canvas,
          camera,
          elapsed,
          progress,
          rise,
          flicker,
          accent,
          accentAlt,
          positive,
          negative,
          fonts?.pair ?? null,
          fonts?.price ?? null,
        );
        drawMotes(canvas, camera, world.motes, elapsed, rise, flicker, accent);
        drawTelemetry(
          canvas,
          width,
          height,
          progress,
          yaw,
          stamp,
          flicker,
          accent,
          accentAlt,
          fonts?.telemetry ?? null,
        );
        drawStatusBanner(
          canvas,
          camera.centerX,
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

  const pictureProps = { testID: "boot-scene-topo", picture };
  return <Picture {...pictureProps} />;
}

/** The scene's four text sites, matching the web's `ctx.font` strings: pair
 * labels (`10px`), prices (`bold 12px`), telemetry (`11px`), banner
 * (`bold 12px`). */
const PAIR_FONT_SIZE = 10;
const PRICE_FONT_SIZE = 12;
const TELEMETRY_FONT_SIZE = 11;
const BANNER_FONT_SIZE = 12;

const TOPO_FONTS = {
  pair: { size: PAIR_FONT_SIZE },
  price: { size: PRICE_FONT_SIZE, bold: true },
  telemetry: { size: TELEMETRY_FONT_SIZE },
  banner: { size: BANNER_FONT_SIZE, bold: true },
} as const;

const TOPO_BACKDROP = "rgba(0,3,6,0.55)";

/** Telemetry insets and baselines, verbatim from the web. */
const TELEMETRY_INSET = 20;
const TELEMETRY_FIRST_BASELINE = 28;
const TELEMETRY_SECOND_BASELINE = 44;
const LEGEND_FIRST_BASELINE = 58;
const LEGEND_ROW_HEIGHT = 7;
const LEGEND_LINE_START = 20;
const LEGEND_LINE_END = 46;
const FOOTER_INSET = 20;
const BANNER_BASELINE = 72;

/** The halo ring drawn on the terrain under each summit. */
const HALO_RADIUS = 0.1;
const HALO_SEGMENTS = 36;

/** The white dot marking a summit. */
const SUMMIT_DOT_COLOR = "#ffffff";

function drawBackdrop(canvas: SkCanvas, width: number, height: number): void {
  "worklet";
  const paint = Skia.Paint();
  paint.setColor(Skia.Color(TOPO_BACKDROP));
  canvas.drawRect({ x: 0, y: 0, width, height }, paint);
}

/** The dashed survey table frame, with a bracket at each corner. */
function drawTableFrame(
  canvas: SkCanvas,
  camera: Boot3dCamera,
  flicker: number,
  accent: string,
  accentAlt: string,
): void {
  "worklet";
  const corners = [
    [TOPO_WORLD_MIN_X, TOPO_WORLD_MIN_Z],
    [TOPO_WORLD_MAX_X, TOPO_WORLD_MIN_Z],
    [TOPO_WORLD_MAX_X, TOPO_WORLD_MAX_Z],
    [TOPO_WORLD_MIN_X, TOPO_WORLD_MAX_Z],
  ];
  const framePaint = Skia.Paint();
  framePaint.setStyle(PaintStyle.Stroke);
  framePaint.setStrokeWidth(1);
  framePaint.setAntiAlias(true);
  framePaint.setPathEffect(Skia.PathEffect.MakeDash([6, 8], 0));
  framePaint.setColor(Skia.Color(hexToRgba(accent, 0.28 * flicker)));
  const path = Skia.Path.Make();
  const projected: ProjectedBootPoint[] = [];

  for (let i = 0; i < corners.length; i++) {
    const point = projectBootPoint(
      corners[i][0],
      TOPO_GROUND_Y,
      corners[i][1],
      camera,
    );
    projected.push(point);

    if (i === 0) {
      path.moveTo(point.x, point.y);
    } else {
      path.lineTo(point.x, point.y);
    }
  }

  path.close();
  canvas.drawPath(path, framePaint);

  const bracketPaint = Skia.Paint();
  bracketPaint.setStyle(PaintStyle.Stroke);
  bracketPaint.setStrokeWidth(1.4);
  bracketPaint.setAntiAlias(true);
  bracketPaint.setColor(Skia.Color(hexToRgba(accentAlt, 0.7 * flicker)));

  for (const point of projected) {
    const bracket = Skia.Path.Make();
    bracket.moveTo(point.x - 7, point.y);
    bracket.lineTo(point.x, point.y);
    bracket.lineTo(point.x, point.y - 7);
    canvas.drawPath(bracket, bracketPaint);
  }
}

/** The sparse wireframe mesh under the contours. */
function drawMesh(
  canvas: SkCanvas,
  camera: Boot3dCamera,
  meshLines: readonly (readonly TopoMeshVertex[])[],
  rise: number,
  flicker: number,
  accent: string,
): void {
  "worklet";
  const paint = Skia.Paint();
  paint.setStyle(PaintStyle.Stroke);
  paint.setStrokeWidth(1);
  paint.setAntiAlias(true);
  paint.setColor(Skia.Color(hexToRgba(accent, 0.1 * rise * flicker)));

  for (const line of meshLines) {
    const path = Skia.Path.Make();

    for (let i = 0; i < line.length; i++) {
      const point = projectBootPoint(
        line[i][0],
        TOPO_GROUND_Y - line[i][1] * rise,
        line[i][2],
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
 * The contour levels, revealed bottom-up.
 *
 * The newest level in each frame draws brighter and thicker — that leading edge
 * is what makes the terrain read as being surveyed rather than simply fading
 * in. The web adds a `shadowBlur` glow to it; that is a per-frame offscreen
 * cost (`docs/performance.md`), so the brightness and width carry the emphasis
 * instead. Same call as `layers`' pull glow.
 */
function drawContours(
  canvas: SkCanvas,
  camera: Boot3dCamera,
  contours: readonly TopoContour[],
  rise: number,
  progress: number,
  flicker: number,
  accent: string,
  accentAlt: string,
): void {
  "worklet";

  for (let li = 0; li < contours.length; li++) {
    const contour = contours[li];
    const phase = contourPhase(li, progress);

    if (phase <= 0 || contour.segments.length === 0) {
      continue;
    }

    const newest = phase < 1;
    const hot = li >= TOPO_HOT_LEVEL_INDEX;
    const paint = Skia.Paint();
    paint.setStyle(PaintStyle.Stroke);
    paint.setStrokeWidth(newest ? 1.8 : hot ? 1.3 : 1);
    paint.setAntiAlias(true);
    paint.setColor(
      Skia.Color(
        hexToRgba(
          hot ? accentAlt : accent,
          (newest ? 0.95 : 0.22 + li * 0.045) * Math.max(phase, 0.4) * flicker,
        ),
      ),
    );

    const contourY = TOPO_GROUND_Y - contour.level * rise;
    const path = Skia.Path.Make();

    for (let s = 0; s < contour.segments.length; s += 4) {
      const a = projectBootPoint(
        contour.segments[s],
        contourY,
        contour.segments[s + 1],
        camera,
      );

      const b = projectBootPoint(
        contour.segments[s + 2],
        contourY,
        contour.segments[s + 3],
        camera,
      );
      path.moveTo(a.x, a.y);
      path.lineTo(b.x, b.y);
    }

    canvas.drawPath(path, paint);
  }
}

/** A peak's summit, projected. */
function summitPoint(
  camera: Boot3dCamera,
  peak: TopoPeak,
  rise: number,
): ProjectedBootPoint {
  "worklet";
  return projectBootPoint(
    peak.x,
    TOPO_GROUND_Y - topoHeightAt(peak.x, peak.z) * rise,
    peak.z,
    camera,
  );
}

/** The route linking the summits, in peak order. */
function drawRoute(
  canvas: SkCanvas,
  camera: Boot3dCamera,
  rise: number,
  progress: number,
  flicker: number,
  accentAlt: string,
): void {
  "worklet";
  const phase = routePhase(progress);

  if (phase <= 0) {
    return;
  }

  const paint = Skia.Paint();
  paint.setStyle(PaintStyle.Stroke);
  paint.setStrokeWidth(1.2);
  paint.setAntiAlias(true);
  paint.setColor(Skia.Color(hexToRgba(accentAlt, 0.4 * phase * flicker)));
  const path = Skia.Path.Make();

  for (let i = 0; i < TOPO_PEAKS.length; i++) {
    const point = summitPoint(camera, TOPO_PEAKS[i], rise);

    if (i === 0) {
      path.moveTo(point.x, point.y);
    } else {
      path.lineTo(point.x, point.y);
    }
  }

  canvas.drawPath(path, paint);
}

/**
 * One beacon's pair label and ticking price.
 *
 * The mast and stem above draw unconditionally; only the text waits on a font,
 * so a null-font window keeps the beacons and loses the readouts.
 */
function drawBeaconReadout(
  canvas: SkCanvas,
  top: ProjectedBootPoint,
  peak: TopoPeak,
  elapsed: number,
  phase: number,
  flicker: number,
  accent: string,
  accentAlt: string,
  positive: string,
  negative: string,
  pairFont: SkFont | null,
  priceFont: SkFont | null,
): void {
  "worklet";
  const stem = Skia.Paint();
  stem.setStyle(PaintStyle.Stroke);
  stem.setStrokeWidth(1);
  stem.setAntiAlias(true);
  stem.setColor(Skia.Color(hexToRgba(accent, 0.4 * phase * flicker)));
  canvas.drawLine(top.x, top.y - 8, top.x, top.y - 21, stem);

  if (priceFont === null) {
    return;
  }

  const tick = peakTick(peak, elapsed);
  const priceText = peakPriceText(peak, tick.value);
  const tickColor = tick.rising ? positive : negative;
  const priceWidth = priceFont.getTextWidth(priceText);

  // The flash behind a fresh tick — this is what reads as "the price moved".
  if (tick.flash > 0) {
    const flashPaint = Skia.Paint();
    flashPaint.setAntiAlias(true);
    flashPaint.setColor(
      Skia.Color(hexToRgba(tickColor, 0.22 * tick.flash * phase * flicker)),
    );
    canvas.drawRect(
      {
        x: top.x - priceWidth / 2 - 5,
        y: top.y - 36,
        width: priceWidth + 10,
        height: 14,
      },
      flashPaint,
    );
  }

  const pricePaint = Skia.Paint();
  pricePaint.setAntiAlias(true);
  pricePaint.setColor(Skia.Color(hexToRgba(tickColor, 0.95 * phase * flicker)));
  canvas.drawText(
    priceText,
    top.x - priceWidth / 2,
    top.y - 25,
    pricePaint,
    priceFont,
  );

  if (pairFont === null) {
    return;
  }

  const pairPaint = Skia.Paint();
  pairPaint.setAntiAlias(true);
  pairPaint.setColor(Skia.Color(hexToRgba(accentAlt, 0.85 * phase * flicker)));
  canvas.drawText(
    peak.pair,
    top.x - pairFont.getTextWidth(peak.pair) / 2,
    top.y - 40,
    pairPaint,
    pairFont,
  );
}

/** Summit beacons, pair labels and ticking prices, drawn far→near. */
function drawBeacons(
  canvas: SkCanvas,
  camera: Boot3dCamera,
  elapsed: number,
  progress: number,
  rise: number,
  flicker: number,
  accent: string,
  accentAlt: string,
  positive: string,
  negative: string,
  pairFont: SkFont | null,
  priceFont: SkFont | null,
): void {
  "worklet";
  const order: BeaconEntry[] = [];

  for (const peak of TOPO_PEAKS) {
    const summit = summitPoint(camera, peak, rise);
    order.push({
      peak,
      summitX: summit.x,
      summitY: summit.y,
      summitZ: summit.z,
    });
  }

  order.sort((a, b) => {
    return b.summitZ - a.summitZ;
  });

  for (const entry of order) {
    const peak = entry.peak;
    const phase = beaconPhase(peak, progress);

    if (phase <= 0) {
      continue;
    }

    const terrainY = TOPO_GROUND_Y - topoHeightAt(peak.x, peak.z) * rise;

    // Dashed halo ring on the terrain, rotating.
    const haloPaint = Skia.Paint();
    haloPaint.setStyle(PaintStyle.Stroke);
    haloPaint.setStrokeWidth(1);
    haloPaint.setAntiAlias(true);
    haloPaint.setPathEffect(Skia.PathEffect.MakeDash([3, 5], 0));
    haloPaint.setColor(Skia.Color(hexToRgba(accent, 0.45 * phase * flicker)));
    const halo = Skia.Path.Make();

    for (let step = 0; step <= HALO_SEGMENTS; step++) {
      const angle = (step / HALO_SEGMENTS) * 6.283 + elapsed * 0.5;
      const point = projectBootPoint(
        peak.x + Math.cos(angle) * HALO_RADIUS,
        terrainY,
        peak.z + Math.sin(angle) * HALO_RADIUS,
        camera,
      );

      if (step === 0) {
        halo.moveTo(point.x, point.y);
      } else {
        halo.lineTo(point.x, point.y);
      }
    }

    canvas.drawPath(halo, haloPaint);

    // The beacon mast and its diamond head.
    const top = projectBootPoint(
      peak.x,
      terrainY - 0.3 * phase,
      peak.z,
      camera,
    );
    const mast = Skia.Paint();
    mast.setStyle(PaintStyle.Stroke);
    mast.setStrokeWidth(1.4);
    mast.setAntiAlias(true);
    mast.setColor(Skia.Color(hexToRgba(accentAlt, 0.75 * phase * flicker)));
    canvas.drawLine(entry.summitX, entry.summitY, top.x, top.y, mast);

    const head = Skia.Paint();
    head.setAntiAlias(true);
    head.setColor(Skia.Color(hexToRgba(accentAlt, 0.9 * phase * flicker)));
    const diamond = Skia.Path.Make();
    diamond.moveTo(top.x, top.y - 4);
    diamond.lineTo(top.x + 4, top.y);
    diamond.lineTo(top.x, top.y + 4);
    diamond.lineTo(top.x - 4, top.y);
    diamond.close();
    canvas.drawPath(diamond, head);

    const dot = Skia.Paint();
    dot.setAntiAlias(true);
    dot.setColor(
      Skia.Color(hexToRgba(SUMMIT_DOT_COLOR, 0.8 * phase * flicker)),
    );
    canvas.drawCircle(entry.summitX, entry.summitY, 1.8, dot);

    drawBeaconReadout(
      canvas,
      top,
      peak,
      elapsed,
      phase,
      flicker,
      accent,
      accentAlt,
      positive,
      negative,
      pairFont,
      priceFont,
    );
  }
}

/** The drifting survey motes. */
function drawMotes(
  canvas: SkCanvas,
  camera: Boot3dCamera,
  motes: readonly TopoMote[],
  elapsed: number,
  rise: number,
  flicker: number,
  accent: string,
): void {
  "worklet";
  const paint = Skia.Paint();
  paint.setAntiAlias(false);

  for (const mote of motes) {
    const drift = moteDrift(mote, elapsed);
    const point = projectBootPoint(
      mote.x,
      TOPO_GROUND_Y - topoHeightAt(mote.x, mote.z) * rise - drift * 0.22,
      mote.z,
      camera,
    );
    paint.setColor(
      Skia.Color(hexToRgba(accent, 0.3 * (1 - drift) * rise * flicker)),
    );
    canvas.drawRect({ x: point.x, y: point.y, width: 1.4, height: 1.4 }, paint);
  }
}

/** Corner telemetry, the contour legend, and the footer stamps. */
function drawTelemetry(
  canvas: SkCanvas,
  width: number,
  height: number,
  progress: number,
  yaw: number,
  stamp: string,
  flicker: number,
  accent: string,
  accentAlt: string,
  font: SkFont | null,
): void {
  "worklet";

  if (font === null) {
    return;
  }

  const telemetry = topoTelemetry(progress, yaw);
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
    telemetry.grid,
    TELEMETRY_INSET,
    TELEMETRY_SECOND_BASELINE,
    paint,
    font,
  );

  // The four-step contour legend under the grid line.
  const legendPaint = Skia.Paint();
  legendPaint.setStyle(PaintStyle.Stroke);
  legendPaint.setStrokeWidth(1.6);
  legendPaint.setAntiAlias(true);

  for (let i = 0; i < 4; i++) {
    legendPaint.setColor(
      Skia.Color(
        hexToRgba(i > 2 ? accentAlt : accent, (0.3 + i * 0.18) * flicker),
      ),
    );
    const y = LEGEND_FIRST_BASELINE + i * LEGEND_ROW_HEIGHT;
    canvas.drawLine(LEGEND_LINE_START, y, LEGEND_LINE_END, y, legendPaint);
  }

  canvas.drawText(
    telemetry.yaw,
    width - TELEMETRY_INSET - font.getTextWidth(telemetry.yaw),
    TELEMETRY_FIRST_BASELINE,
    paint,
    font,
  );
  paint.setColor(Skia.Color(hexToRgba(accentAlt, 0.7 * flicker)));
  canvas.drawText(
    telemetry.peaks,
    width - TELEMETRY_INSET - font.getTextWidth(telemetry.peaks),
    TELEMETRY_SECOND_BASELINE,
    paint,
    font,
  );

  paint.setColor(Skia.Color(hexToRgba(accent, 0.5 * flicker)));
  canvas.drawText(stamp, FOOTER_INSET, height - FOOTER_INSET, paint, font);
  canvas.drawText(
    telemetry.footer,
    width - FOOTER_INSET - font.getTextWidth(telemetry.footer),
    height - FOOTER_INSET,
    paint,
    font,
  );
}

/** The centred status banner, at a fixed screen y. */
function drawStatusBanner(
  canvas: SkCanvas,
  centerX: number,
  progress: number,
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

  const status = topoStatus(progress);
  const blink = topoBlinkAlpha(progress, elapsed);
  const text = `▸ ${status.text} ◂`;
  const paint = Skia.Paint();
  paint.setAntiAlias(true);
  paint.setColor(
    Skia.Color(
      hexToRgba(
        status.useAltAccent ? accentAlt : accent,
        0.9 * blink * flicker,
      ),
    ),
  );
  canvas.drawText(
    text,
    centerX - font.getTextWidth(text) / 2,
    BANNER_BASELINE,
    paint,
    font,
  );
}

/** One beacon's summit projection, cached for the painter's sort. */
interface BeaconEntry {
  peak: TopoPeak;
  summitX: number;
  summitY: number;
  summitZ: number;
}
