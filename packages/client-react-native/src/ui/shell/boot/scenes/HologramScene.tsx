// packages/client-react-native/src/ui/shell/boot/scenes/HologramScene.tsx
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
  calloutPhase,
  columnAssembly,
  columnAssemblyPhase,
  columnHeight,
  columnIsHot,
  columnRisePhase,
  EMITTER_RINGS,
  EMITTER_TICK_COUNT,
  EMITTER_TICK_INNER_RADIUS,
  EMITTER_TICK_OUTER_RADIUS,
  emitterTickAlpha,
  emitterTickAngle,
  GYRO_RINGS,
  GYRO_SEGMENT_COUNT,
  GYRO_SEGMENT_STEPS,
  groundGridPhase,
  gyroRingSpin,
  gyroRingsPhase,
  HOLOGRAM_CALLOUTS,
  HOLOGRAM_CENTER_Y_NUDGE,
  HOLOGRAM_CONE,
  HOLOGRAM_GRID_SIZE,
  HOLOGRAM_PAD_Y,
  HOLOGRAM_PERSPECTIVE_K,
  HOLOGRAM_PITCH,
  HOLOGRAM_PROJ_SCALE_FACTOR,
  type HologramColumn,
  type HologramHexCell,
  type HologramMote,
  hexCellAlpha,
  hologramBlinkAlpha,
  hologramColumns,
  hologramFlicker,
  hologramHexCells,
  hologramMotes,
  hologramStatus,
  hologramTelemetry,
  hologramYaw,
  moteRise,
  SCAN_RING_RADIUS,
  scanRingHeight,
} from "#/ui/shell/boot/scenes/hologramGeometry";

/**
 * `hologram` boot scene — "HOLO-PROJ 01", a volumetric hologram of the market
 * core: a 9x9 bar-column grid that assembles from scattered particles inside a
 * rising light cone, ringed by an emitter pad, gyroscopic segmented rings and
 * dust motes, with floating FX/Risk/Order-flow callout panels on leader lines.
 *
 * Ported from `packages/boot-splash/src/variants/bootHologram.ts`. Drawn
 * imperatively into an `SkPicture` recorded inside a `useDerivedValue` worklet,
 * mirroring `CoreScene` — never a per-frame React state write
 * (`docs/performance.md`).
 *
 * FLICKER IS A PER-DRAW ALPHA, NOT A LAYER. The web wraps its whole draw in
 * `ctx.save(); ctx.globalAlpha = flicker`. Skia's equivalent, `saveLayer()`,
 * allocates an offscreen surface every frame and is banned by
 * `docs/performance.md`, so every helper below takes `flicker` and multiplies
 * it into its own colours instead.
 *
 * ONE SUBTLETY WORTH KEEPING: the web opens its flicker save AFTER the hex
 * backdrop (`bootHologram.ts:181-233`), so the backdrop does NOT flicker while
 * everything in front of it does. That separation is what makes the hologram
 * read as projected onto a steady field rather than the whole screen pulsing.
 * `drawHexField` therefore takes no `flicker` argument at all — the omission is
 * deliberate, not an oversight.
 *
 * PROJECTION. `HOLOGRAM_PERSPECTIVE_K` with NO near-plane clamp, per the web.
 * The camera is built as an object literal inside the recorder because its yaw
 * changes every frame; `bootCameraParams` is the build-once React-land form and
 * must not be called from in here.
 *
 * BUILD-ONCE TABLES. `hologramColumns()`, `hologramHexCells()` and
 * `hologramMotes()` are called in `useMemo` and captured by the recorder.
 * Rebuilding those 81/16/36-entry tables inside `createPicture` is exactly the
 * `craftGridLines` bug 6b-1 caught pre-merge.
 */
export function HologramScene({
  elapsedSec,
  drift,
  width,
  height,
  theme,
}: BootSceneProps): JSX.Element {
  const accent = theme.accentPrimary;
  const accentAlt = theme.accent2;
  // Null until the bundled faces load; text layers sit that window out while
  // the geometry draws normally.
  const fonts = useBootSceneFonts(HOLOGRAM_FONTS);
  const columns = hologramColumns();
  const hexCells = hologramHexCells();
  const motes = hologramMotes();

  const picture = useDerivedValue(() => {
    return createPicture(
      (canvas) => {
        const elapsed = elapsedSec.value;
        const pointerDrift = drift.value;
        const progress = bootProgress(elapsed, BOOT_DURATION_MS);
        const centerX = width / 2;
        const centerY = height / 2 + HOLOGRAM_CENTER_Y_NUDGE;
        const projScale = Math.min(width, height) * HOLOGRAM_PROJ_SCALE_FACTOR;
        // The web globe is fixed-tilt and mouse-driven; RN has no cursor, so
        // the gyro seam nudges the orbit the same gentle way `CoreScene` does.
        const nudge = gyroYawPitch(
          pointerDrift,
          GYRO_YAW_RANGE,
          GYRO_PITCH_RANGE,
        );

        const camera: Boot3dCamera = {
          yaw: hologramYaw(elapsed) + nudge.yaw,
          pitch: HOLOGRAM_PITCH + nudge.pitch,
          perspectiveK: HOLOGRAM_PERSPECTIVE_K,
          centerX,
          centerY,
          projScale,
        };
        const flicker = hologramFlicker(elapsed);

        drawBackdrop(canvas, width, height);
        drawHexField(canvas, hexCells, width, height, elapsed, accent);
        drawLightCone(canvas, camera, projScale, flicker, accent);
        drawEmitterPad(canvas, camera, elapsed, flicker, accent);
        drawGroundGrid(canvas, camera, columns, progress, flicker, accent);
        drawColumns(
          canvas,
          camera,
          columns,
          elapsed,
          progress,
          flicker,
          accent,
          accentAlt,
        );
        drawScanRing(canvas, camera, elapsed, flicker, accentAlt);
        drawGyroRings(
          canvas,
          camera,
          elapsed,
          progress,
          flicker,
          accent,
          accentAlt,
        );
        drawMotes(canvas, camera, motes, elapsed, flicker, accent);
        drawCallouts(
          canvas,
          camera,
          columns,
          elapsed,
          progress,
          flicker,
          accent,
          accentAlt,
          fonts?.calloutLabel ?? null,
          fonts?.calloutValue ?? null,
        );
        drawTelemetry(
          canvas,
          width,
          progress,
          camera.yaw,
          flicker,
          accent,
          accentAlt,
          fonts?.telemetry ?? null,
        );
        drawStatusBanner(
          canvas,
          centerX,
          centerY,
          projScale,
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

  const pictureProps = { testID: "boot-scene-hologram", picture };
  return <Picture {...pictureProps} />;
}

/** The scene's four text sites, each matching its web `ctx.font` string in
 * `bootHologram.ts`: callout labels (`8px`), callout values (`bold 13px`),
 * corner telemetry (`11px`) and the status banner (`bold 12px`). Module-level
 * so the memo inside `useBootSceneFonts` sees a stable identity. */
const CALLOUT_LABEL_FONT_SIZE = 8;
const CALLOUT_VALUE_FONT_SIZE = 13;
const TELEMETRY_FONT_SIZE = 11;
const BANNER_FONT_SIZE = 12;

const HOLOGRAM_FONTS = {
  calloutLabel: { size: CALLOUT_LABEL_FONT_SIZE },
  calloutValue: { size: CALLOUT_VALUE_FONT_SIZE, bold: true },
  telemetry: { size: TELEMETRY_FONT_SIZE },
  banner: { size: BANNER_FONT_SIZE, bold: true },
} as const;

/** How far the gyro seam may swing the orbit, radians. Deliberately small: the
 * scene already spins, so this reads as parallax rather than steering. */
const GYRO_YAW_RANGE = 0.28;
const GYRO_PITCH_RANGE = 0.12;

/** The web's opaque backdrop wash behind the whole scene. */
const HOLOGRAM_BACKDROP = "rgba(0,3,6,0.5)";

/** Vertices per full circle — the web's `vertex <= 60` ring loops. */
const RING_SEGMENTS = 60;

/** Panel geometry for the floating callouts, in screen px (web: 116x44). */
const CALLOUT_PANEL_WIDTH = 116;
const CALLOUT_PANEL_HEIGHT = 44;
const CALLOUT_PANEL_FILL = "rgba(0,10,16,0.65)";
const CALLOUT_CORNER_TICK = 10;
const CALLOUT_LABEL_DX = 9;
const CALLOUT_LABEL_DY = 15;
const CALLOUT_VALUE_DY = 33;
const CALLOUT_LEADER_DX = 58;
const CALLOUT_ANCHOR_RADIUS = 2.2;

/** Where each callout panel sits, as multiples of `projScale` from centre —
 * verbatim from the web's two positional arrays. */
const CALLOUT_PANEL_OFFSETS = [
  { x: -2.55, y: -1.0 },
  { x: 1.55, y: -1.2 },
  { x: 1.75, y: 0.35 },
] as const;

/** Telemetry insets and baselines, verbatim from the web. */
const TELEMETRY_INSET = 20;
const TELEMETRY_FIRST_BASELINE = 28;
const TELEMETRY_SECOND_BASELINE = 44;

/** The status banner sits this many `projScale` above centre. */
const BANNER_RISE = 1.42;

function drawBackdrop(canvas: SkCanvas, width: number, height: number): void {
  "worklet";
  const paint = Skia.Paint();
  paint.setColor(Skia.Color(HOLOGRAM_BACKDROP));
  canvas.drawRect({ x: 0, y: 0, width, height }, paint);
}

/**
 * The sparse hex-field backdrop.
 *
 * Takes no `flicker` on purpose — see the module header. These sit behind the
 * hologram and stay steady while it pulses.
 */
function drawHexField(
  canvas: SkCanvas,
  cells: readonly HologramHexCell[],
  width: number,
  height: number,
  elapsed: number,
  accent: string,
): void {
  "worklet";
  const paint = Skia.Paint();
  paint.setStyle(PaintStyle.Stroke);
  paint.setStrokeWidth(1);
  paint.setAntiAlias(true);

  for (const cell of cells) {
    paint.setColor(Skia.Color(hexToRgba(accent, hexCellAlpha(cell, elapsed))));
    const path = Skia.Path.Make();

    for (let vertex = 0; vertex <= 6; vertex++) {
      const angle = (vertex / 6) * 6.283 + 0.52;
      const vx = cell.x * width + Math.cos(angle) * cell.radius;
      const vy = cell.y * height + Math.sin(angle) * cell.radius;

      if (vertex === 0) {
        path.moveTo(vx, vy);
      } else {
        path.lineTo(vx, vy);
      }
    }

    canvas.drawPath(path, paint);
  }
}

/** The light cone rising from the emitter pad — fixed geometry, no progress. */
function drawLightCone(
  canvas: SkCanvas,
  camera: Boot3dCamera,
  projScale: number,
  flicker: number,
  accent: string,
): void {
  "worklet";
  const pad = projectBootPoint(0, HOLOGRAM_PAD_Y, 0, camera);
  const topY = camera.centerY - projScale * HOLOGRAM_CONE.topRise;
  const shader = Skia.Shader.MakeLinearGradient(
    { x: 0, y: pad.y },
    { x: 0, y: topY },
    [Skia.Color(hexToRgba(accent, 0.1 * flicker)), Skia.Color("rgba(0,0,0,0)")],
    [0, 1],
    TileMode.Clamp,
  );
  const paint = Skia.Paint();
  paint.setShader(shader);
  const path = Skia.Path.Make();
  const padHalf = projScale * HOLOGRAM_CONE.padHalfWidth;
  const topHalf = projScale * HOLOGRAM_CONE.topHalfWidth;
  path.moveTo(pad.x - padHalf, pad.y);
  path.lineTo(camera.centerX - topHalf, topY);
  path.lineTo(camera.centerX + topHalf, topY);
  path.lineTo(pad.x + padHalf, pad.y);
  path.close();
  canvas.drawPath(path, paint);
}

/** The emitter pad: three rings (the outermost dashed) plus 48 tick marks. */
function drawEmitterPad(
  canvas: SkCanvas,
  camera: Boot3dCamera,
  elapsed: number,
  flicker: number,
  accent: string,
): void {
  "worklet";

  for (const ring of EMITTER_RINGS) {
    const paint = Skia.Paint();
    paint.setStyle(PaintStyle.Stroke);
    paint.setAntiAlias(true);
    paint.setStrokeWidth(ring.lineWidth);
    paint.setColor(Skia.Color(hexToRgba(accent, ring.alpha * flicker)));

    if (ring.dash !== undefined) {
      paint.setPathEffect(Skia.PathEffect.MakeDash([...ring.dash], 0));
    }

    const rotation =
      ring.rotationRate === undefined ? 0 : ring.rotationRate * elapsed;
    const path = Skia.Path.Make();

    for (let vertex = 0; vertex <= RING_SEGMENTS; vertex++) {
      const angle = (vertex / RING_SEGMENTS) * 6.283 + rotation;
      const point = projectBootPoint(
        Math.cos(angle) * ring.radius,
        ring.y,
        Math.sin(angle) * ring.radius,
        camera,
      );

      if (vertex === 0) {
        path.moveTo(point.x, point.y);
      } else {
        path.lineTo(point.x, point.y);
      }
    }

    canvas.drawPath(path, paint);
  }

  const tickPaint = Skia.Paint();
  tickPaint.setStyle(PaintStyle.Stroke);
  tickPaint.setStrokeWidth(1);
  tickPaint.setAntiAlias(true);

  for (let tick = 0; tick < EMITTER_TICK_COUNT; tick++) {
    const angle = emitterTickAngle(tick, elapsed);
    const inner = projectBootPoint(
      Math.cos(angle) * EMITTER_TICK_INNER_RADIUS,
      HOLOGRAM_PAD_Y,
      Math.sin(angle) * EMITTER_TICK_INNER_RADIUS,
      camera,
    );

    const outer = projectBootPoint(
      Math.cos(angle) * EMITTER_TICK_OUTER_RADIUS,
      HOLOGRAM_PAD_Y,
      Math.sin(angle) * EMITTER_TICK_OUTER_RADIUS,
      camera,
    );
    tickPaint.setColor(
      Skia.Color(hexToRgba(accent, emitterTickAlpha(tick) * flicker)),
    );
    canvas.drawLine(inner.x, inner.y, outer.x, outer.y, tickPaint);
  }
}

/** The ground grid, expanding outward from the centre as the boot proceeds. */
function drawGroundGrid(
  canvas: SkCanvas,
  camera: Boot3dCamera,
  columns: readonly HologramColumn[],
  progress: number,
  flicker: number,
  accent: string,
): void {
  "worklet";
  const phase = groundGridPhase(progress);

  if (phase <= 0) {
    return;
  }

  const paint = Skia.Paint();
  paint.setStyle(PaintStyle.Stroke);
  paint.setStrokeWidth(1);
  paint.setAntiAlias(true);
  paint.setColor(Skia.Color(hexToRgba(accent, 0.14 * phase * flicker)));

  for (let gx = 0; gx < HOLOGRAM_GRID_SIZE; gx++) {
    const path = Skia.Path.Make();

    for (let gz = 0; gz < HOLOGRAM_GRID_SIZE; gz++) {
      const point = gridPoint(columns, camera, gx, gz, phase);

      if (gz === 0) {
        path.moveTo(point.x, point.y);
      } else {
        path.lineTo(point.x, point.y);
      }
    }

    canvas.drawPath(path, paint);
  }

  for (let gz = 0; gz < HOLOGRAM_GRID_SIZE; gz++) {
    const path = Skia.Path.Make();

    for (let gx = 0; gx < HOLOGRAM_GRID_SIZE; gx++) {
      const point = gridPoint(columns, camera, gx, gz, phase);

      if (gx === 0) {
        path.moveTo(point.x, point.y);
      } else {
        path.lineTo(point.x, point.y);
      }
    }

    canvas.drawPath(path, paint);
  }
}

/** One ground-grid vertex, scaled by the expansion phase. */
function gridPoint(
  columns: readonly HologramColumn[],
  camera: Boot3dCamera,
  gx: number,
  gz: number,
  phase: number,
): ProjectedBootPoint {
  "worklet";
  const column = columns[gx * HOLOGRAM_GRID_SIZE + gz];
  return projectBootPoint(
    column.normX * phase,
    HOLOGRAM_PAD_Y,
    column.normZ * phase,
    camera,
  );
}

/**
 * The 81 market columns — the centrepiece.
 *
 * Drawn far→near (painter's algorithm). The sort is load-bearing for the depth
 * illusion: near columns must overdraw far ones, so this cannot be reordered
 * for tidiness.
 */
function drawColumns(
  canvas: SkCanvas,
  camera: Boot3dCamera,
  columns: readonly HologramColumn[],
  elapsed: number,
  progress: number,
  flicker: number,
  accent: string,
  accentAlt: string,
): void {
  "worklet";
  const order: ColumnDrawEntry[] = [];

  for (const column of columns) {
    const base = projectBootPoint(
      column.normX,
      HOLOGRAM_PAD_Y,
      column.normZ,
      camera,
    );
    order.push({
      column,
      baseX: base.x,
      baseY: base.y,
      baseZ: base.z,
      basePerspective: base.perspective,
    });
  }

  order.sort((a, b) => {
    return b.baseZ - a.baseZ;
  });

  const fillPaint = Skia.Paint();
  fillPaint.setAntiAlias(true);
  const strokePaint = Skia.Paint();
  strokePaint.setStyle(PaintStyle.Stroke);
  strokePaint.setAntiAlias(true);

  for (const entry of order) {
    const column = entry.column;
    const assemble = columnAssemblyPhase(column, progress);

    if (assemble <= 0) {
      continue;
    }

    const height = columnHeight(column, elapsed);
    const color = columnIsHot(column) ? accentAlt : accent;

    if (assemble < 1) {
      const particle = columnAssembly(column, assemble, height);
      const point = projectBootPoint(
        particle.x,
        particle.y,
        particle.z,
        camera,
      );
      fillPaint.setColor(
        Skia.Color(hexToRgba(color, (0.35 + 0.5 * assemble) * flicker)),
      );
      canvas.drawCircle(
        point.x,
        point.y,
        1.6 * point.perspective + 1,
        fillPaint,
      );
    }

    const rise = columnRisePhase(assemble);

    if (rise <= 0) {
      continue;
    }

    const top = projectBootPoint(
      column.normX,
      HOLOGRAM_PAD_Y - height * rise,
      column.normZ,
      camera,
    );
    const nearness = Math.max(0, Math.min(1, (0.9 - entry.baseZ) / 1.8));
    const alpha = 0.15 + 0.55 * nearness;
    strokePaint.setStrokeWidth(Math.max(1, 2.2 * entry.basePerspective));
    strokePaint.setColor(Skia.Color(hexToRgba(color, alpha * flicker)));
    canvas.drawLine(entry.baseX, entry.baseY, top.x, top.y, strokePaint);

    const markerSize = Math.max(1.4, 2.6 * top.perspective);
    fillPaint.setColor(
      Skia.Color(hexToRgba(color, Math.min(0.9, alpha + 0.25) * flicker)),
    );
    const diamond = Skia.Path.Make();
    diamond.moveTo(top.x, top.y - markerSize);
    diamond.lineTo(top.x + markerSize, top.y);
    diamond.lineTo(top.x, top.y + markerSize);
    diamond.lineTo(top.x - markerSize, top.y);
    diamond.close();
    canvas.drawPath(diamond, fillPaint);
  }
}

/** The vertical scan ring sweeping through the structure. */
function drawScanRing(
  canvas: SkCanvas,
  camera: Boot3dCamera,
  elapsed: number,
  flicker: number,
  accentAlt: string,
): void {
  "worklet";
  const y = scanRingHeight(elapsed);
  const paint = Skia.Paint();
  paint.setStyle(PaintStyle.Stroke);
  paint.setStrokeWidth(1.4);
  paint.setAntiAlias(true);
  paint.setColor(Skia.Color(hexToRgba(accentAlt, 0.38 * flicker)));
  const path = Skia.Path.Make();

  for (let vertex = 0; vertex <= RING_SEGMENTS; vertex++) {
    const angle = (vertex / RING_SEGMENTS) * 6.283;
    const point = projectBootPoint(
      Math.cos(angle) * SCAN_RING_RADIUS,
      y,
      Math.sin(angle) * SCAN_RING_RADIUS,
      camera,
    );

    if (vertex === 0) {
      path.moveTo(point.x, point.y);
    } else {
      path.lineTo(point.x, point.y);
    }
  }

  canvas.drawPath(path, paint);
}

/** The two counter-rotating gyroscopic rings, 6 of 8 segments each. */
function drawGyroRings(
  canvas: SkCanvas,
  camera: Boot3dCamera,
  elapsed: number,
  progress: number,
  flicker: number,
  accent: string,
  accentAlt: string,
): void {
  "worklet";
  const phase = gyroRingsPhase(progress);

  if (phase <= 0) {
    return;
  }

  const spin = gyroRingSpin(elapsed);
  const paint = Skia.Paint();
  paint.setStyle(PaintStyle.Stroke);
  paint.setAntiAlias(true);

  for (let ringIndex = 0; ringIndex < GYRO_RINGS.length; ringIndex++) {
    const ring = GYRO_RINGS[ringIndex];
    const spinAngle = ringIndex === 0 ? spin.outer : spin.inner;
    const cosTilt = Math.cos(ring.tilt);
    const sinTilt = Math.sin(ring.tilt);
    const cosSpin = Math.cos(spinAngle);
    const sinSpin = Math.sin(spinAngle);
    paint.setStrokeWidth(ring.lineWidth);
    paint.setColor(
      Skia.Color(
        hexToRgba(
          ring.useAltAccent ? accentAlt : accent,
          ring.alpha * phase * flicker,
        ),
      ),
    );

    for (let seg = 0; seg < GYRO_SEGMENT_COUNT; seg++) {
      // The web skips every fourth segment, leaving the rings visibly
      // segmented machinery rather than solid circles.
      if (seg % 4 === 3) {
        continue;
      }

      const path = Skia.Path.Make();

      for (let vertex = 0; vertex <= GYRO_SEGMENT_STEPS; vertex++) {
        const angle =
          ((seg * GYRO_SEGMENT_STEPS + vertex) /
            (GYRO_SEGMENT_COUNT * GYRO_SEGMENT_STEPS)) *
          6.283;
        const x = Math.cos(angle) * ring.radius;
        const z = Math.sin(angle) * ring.radius;
        const tiltedY = -z * sinTilt;
        const tiltedZ = z * cosTilt;
        const point = projectBootPoint(
          x * cosSpin - tiltedY * sinSpin,
          x * sinSpin + tiltedY * cosSpin + 0.02,
          tiltedZ,
          camera,
        );

        if (vertex === 0) {
          path.moveTo(point.x, point.y);
        } else {
          path.lineTo(point.x, point.y);
        }
      }

      canvas.drawPath(path, paint);
    }
  }
}

/** Dust motes rising through the cone, fading as they go. */
function drawMotes(
  canvas: SkCanvas,
  camera: Boot3dCamera,
  motes: readonly HologramMote[],
  elapsed: number,
  flicker: number,
  accent: string,
): void {
  "worklet";
  const paint = Skia.Paint();
  paint.setAntiAlias(false);

  for (const mote of motes) {
    const rise = moteRise(mote, elapsed);
    const point = projectBootPoint(rise.x, rise.y, rise.z, camera);
    paint.setColor(Skia.Color(hexToRgba(accent, rise.alpha * flicker)));
    canvas.drawRect({ x: point.x, y: point.y, width: 1.5, height: 1.5 }, paint);
  }
}

/**
 * The floating callout panels with leader lines.
 *
 * Geometry draws unconditionally; only the two text sites are guarded on their
 * font, so a null-font window loses labels but keeps the panels — the same
 * shape as `CoreScene`'s spotlight.
 */
function drawCallouts(
  canvas: SkCanvas,
  camera: Boot3dCamera,
  columns: readonly HologramColumn[],
  elapsed: number,
  progress: number,
  flicker: number,
  accent: string,
  accentAlt: string,
  labelFont: SkFont | null,
  valueFont: SkFont | null,
): void {
  "worklet";

  for (let index = 0; index < HOLOGRAM_CALLOUTS.length; index++) {
    const callout = HOLOGRAM_CALLOUTS[index];
    const phase = calloutPhase(callout, progress);

    if (phase <= 0) {
      continue;
    }

    const alpha = flicker * phase;
    const column = columns[callout.gridIndex];
    const height = columnHeight(column, elapsed);
    const anchor = projectBootPoint(
      column.normX,
      HOLOGRAM_PAD_Y - height,
      column.normZ,
      camera,
    );
    const offset = CALLOUT_PANEL_OFFSETS[index];
    const panelX = camera.centerX + camera.projScale * offset.x;
    const panelY = camera.centerY + camera.projScale * offset.y;

    const dotPaint = Skia.Paint();
    dotPaint.setAntiAlias(true);
    dotPaint.setColor(Skia.Color(hexToRgba(accentAlt, 0.9 * alpha)));
    canvas.drawCircle(anchor.x, anchor.y, CALLOUT_ANCHOR_RADIUS, dotPaint);

    const leaderPaint = Skia.Paint();
    leaderPaint.setStyle(PaintStyle.Stroke);
    leaderPaint.setStrokeWidth(1);
    leaderPaint.setAntiAlias(true);
    leaderPaint.setColor(Skia.Color(hexToRgba(accent, 0.45 * alpha)));
    canvas.drawLine(
      anchor.x,
      anchor.y,
      panelX + CALLOUT_LEADER_DX,
      panelY + (panelY < camera.centerY ? 50 : -6),
      leaderPaint,
    );

    const panelRect = {
      x: panelX,
      y: panelY,
      width: CALLOUT_PANEL_WIDTH,
      height: CALLOUT_PANEL_HEIGHT,
    };
    const panelPaint = Skia.Paint();
    panelPaint.setColor(Skia.Color(CALLOUT_PANEL_FILL));
    canvas.drawRect(panelRect, panelPaint);

    const borderPaint = Skia.Paint();
    borderPaint.setStyle(PaintStyle.Stroke);
    borderPaint.setStrokeWidth(1);
    borderPaint.setAntiAlias(true);
    borderPaint.setColor(Skia.Color(hexToRgba(accent, 0.5 * alpha)));
    canvas.drawRect(panelRect, borderPaint);

    const cornerPaint = Skia.Paint();
    cornerPaint.setStyle(PaintStyle.Stroke);
    cornerPaint.setStrokeWidth(1.4);
    cornerPaint.setAntiAlias(true);
    cornerPaint.setColor(Skia.Color(hexToRgba(accentAlt, 0.8 * alpha)));
    canvas.drawLine(
      panelX,
      panelY,
      panelX,
      panelY + CALLOUT_CORNER_TICK,
      cornerPaint,
    );
    canvas.drawLine(
      panelX,
      panelY,
      panelX + CALLOUT_CORNER_TICK,
      panelY,
      cornerPaint,
    );

    if (labelFont !== null) {
      const labelPaint = Skia.Paint();
      labelPaint.setAntiAlias(true);
      labelPaint.setColor(Skia.Color(hexToRgba(accentAlt, 0.85 * alpha)));
      canvas.drawText(
        callout.label,
        panelX + CALLOUT_LABEL_DX,
        panelY + CALLOUT_LABEL_DY,
        labelPaint,
        labelFont,
      );
    }

    if (valueFont !== null) {
      const valuePaint = Skia.Paint();
      valuePaint.setAntiAlias(true);
      valuePaint.setColor(Skia.Color(hexToRgba(accent, 0.95 * alpha)));
      canvas.drawText(
        callout.value,
        panelX + CALLOUT_LABEL_DX,
        panelY + CALLOUT_VALUE_DY,
        valuePaint,
        valueFont,
      );
    }
  }
}

/** Corner telemetry: two left-aligned readouts, two right-aligned. */
function drawTelemetry(
  canvas: SkCanvas,
  width: number,
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

  const telemetry = hologramTelemetry(progress, yaw);
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
    telemetry.particles,
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
    telemetry.assembly,
    width - TELEMETRY_INSET - font.getTextWidth(telemetry.assembly),
    TELEMETRY_SECOND_BASELINE,
    paint,
    font,
  );
}

/** One column's base projection, cached so the painter's sort does not
 * re-project 81 points on every comparison. */
interface ColumnDrawEntry {
  column: HologramColumn;
  baseX: number;
  baseY: number;
  baseZ: number;
  basePerspective: number;
}

/** The centred status banner, blinking until handoff. */
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
  font: SkFont | null,
): void {
  "worklet";

  if (font === null) {
    return;
  }

  const status = hologramStatus(progress);
  const blink = hologramBlinkAlpha(progress, elapsed);
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
    centerY - projScale * BANNER_RISE,
    paint,
    font,
  );
}
