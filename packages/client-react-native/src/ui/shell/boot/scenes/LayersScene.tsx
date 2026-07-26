// packages/client-react-native/src/ui/shell/boot/scenes/LayersScene.tsx
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
  type ProjectedBootPoint,
  projectBootPoint,
} from "#/ui/shell/boot/scenes/boot3dCamera";
import { useBootSceneFonts } from "#/ui/shell/boot/scenes/bootSceneFonts";
import { bootProgress, hexToRgba } from "#/ui/shell/boot/scenes/coreGeometry";
import {
  arcRingStart,
  GHOST_FRAME_MIN_SPREAD,
  LAYER_PANELS,
  LAYER_TAG_MIN_SPREAD,
  LAYERS_ARC_RINGS,
  LAYERS_MIN_PERSPECTIVE_DENOM,
  LAYERS_PERSPECTIVE_K,
  LAYERS_PROJ_SCALE_FACTOR,
  type LayerPanel,
  type LayerWorldRect,
  layersBlinkAlpha,
  layersFlicker,
  layersPitch,
  layersSpread,
  layersStatus,
  layersTelemetry,
  layersYaw,
  PULL_ACTIVE_THRESHOLD,
  PULLABLE_PANELS,
  panelAlpha,
  panelDepthReadout,
  panelDrawPhase,
  panelWorldRect,
  pullActive,
  pullAmount,
  pulledPanelIndex,
  pullScanV,
} from "#/ui/shell/boot/scenes/layersGeometry";

/**
 * `layers` boot scene — "UI COMPOSITOR · LAYER VIEW". The app's own layout
 * decomposed into seven z-separated wireframe layers: dashed ghost frames and
 * corner tethers mark the original flat positions, panels pull toward the
 * camera one at a time with a scan sweep and callout, and everything
 * recomposites flat exactly as the real app reveals.
 *
 * Ported from `packages/boot-splash/src/variants/bootLayers.ts`, drawn into an
 * `SkPicture` inside a `useDerivedValue` worklet like every other scene.
 *
 * PROJECTION. Clamped near plane (`LAYERS_MIN_PERSPECTIVE_DENOM`), unlike
 * `hologram`, which has none — see `layersGeometry.ts`.
 *
 * NO PHASE ENUM: the schedule is one continuous `layersSpread` envelope that
 * scales yaw, pitch, z-separation, ghost frames and layer tags together. That
 * is what makes the stack lie perfectly flat-on at both ends of the boot.
 *
 * FLICKER IS A PER-DRAW ALPHA, never `saveLayer` (`docs/performance.md`).
 * Unlike `hologram`, the web applies it to EVERYTHING here — its `ctx.save()`
 * comes before the arc rings — so every helper takes it, backdrop included.
 *
 * ONE DELIBERATE DEVIATION. The web gives the pulled panel a
 * `ctx.shadowBlur = 18 * pullAmount` glow. Skia's equivalent is a mask-filter
 * blur, which is a per-frame offscreen cost of exactly the kind
 * `docs/performance.md` rules out, and the pulled panel changes every 1.05 s
 * so it could never be cached. The glow is approximated with one extra wider,
 * dimmer stroke pass underneath the border — cheaper than a blur and visually
 * the same read at this scale. Recorded because a reader comparing to the web
 * source will otherwise see a missing `shadowBlur` and assume it was dropped.
 */
export function LayersScene({
  elapsedSec,
  drift,
  width,
  height,
  theme,
}: BootSceneProps): JSX.Element {
  const accent = theme.accentPrimary;
  const accentAlt = theme.accent2;
  const positive = theme.accentPositive;
  const fonts = useBootSceneFonts(LAYERS_FONTS);

  const picture = useDerivedValue(() => {
    return createPicture(
      (canvas) => {
        const elapsed = elapsedSec.value;
        const pointerDrift = drift.value;
        const progress = bootProgress(elapsed, BOOT_DURATION_MS);
        const spread = layersSpread(progress);
        const yaw = layersYaw(elapsed, pointerDrift.mx, spread);
        const pitch = layersPitch(pointerDrift.my, spread);
        const projScale = Math.min(width, height) * LAYERS_PROJ_SCALE_FACTOR;
        const camera: Boot3dCamera = {
          yaw,
          pitch,
          perspectiveK: LAYERS_PERSPECTIVE_K,
          minPerspectiveDenom: LAYERS_MIN_PERSPECTIVE_DENOM,
          centerX: width / 2,
          centerY: height / 2,
          projScale,
        };
        const flicker = layersFlicker(elapsed);
        const pull = pullAmount(elapsed, progress);
        const pulledIndex = pulledPanelIndex(elapsed);
        const pulledPanel = pullActive(progress)
          ? PULLABLE_PANELS[pulledIndex]
          : null;

        drawBackdrop(canvas, width, height);
        drawArcRings(canvas, camera, projScale, elapsed, flicker, accent);
        drawPanels(
          canvas,
          camera,
          progress,
          elapsed,
          spread,
          pull,
          pulledPanel,
          flicker,
          accent,
          accentAlt,
          fonts?.tag ?? null,
          fonts?.callout ?? null,
        );
        drawTelemetry(
          canvas,
          width,
          spread,
          yaw,
          pitch,
          flicker,
          accent,
          accentAlt,
          fonts?.telemetry ?? null,
        );
        drawStatusBanner(
          canvas,
          width / 2,
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

  const pictureProps = { testID: "boot-scene-layers", picture };
  return <Picture {...pictureProps} />;
}

/** The scene's four text sites, matching the web's `ctx.font` strings: layer
 * id tags (`9px`), the pulled-panel callout (`11px`), corner telemetry
 * (`11px`) and the status banner (`bold 12px`). Module-level so the memo
 * inside `useBootSceneFonts` sees a stable identity. */
const TAG_FONT_SIZE = 9;
const CALLOUT_FONT_SIZE = 11;
const TELEMETRY_FONT_SIZE = 11;
const BANNER_FONT_SIZE = 12;

const LAYERS_FONTS = {
  tag: { size: TAG_FONT_SIZE },
  callout: { size: CALLOUT_FONT_SIZE },
  telemetry: { size: TELEMETRY_FONT_SIZE },
  banner: { size: BANNER_FONT_SIZE, bold: true },
} as const;

/** The web's backdrop wash — slightly heavier than `hologram`'s. */
const LAYERS_BACKDROP = "rgba(0,3,6,0.55)";

/** The panel face fill, verbatim from the web. */
const PANEL_FACE_FILL = "#04141d";

/** Arc-ring sampling: the web draws a `ctx.arc` sweep; Skia needs a polyline. */
const ARC_SAMPLES = 48;

/** Ghost frames and corner tethers are dashed on this pattern. */
const GHOST_DASH = [4, 6];

/** Backdrop-layer grid density — the web steps u/v by 0.125. */
const BG_GRID_STEP = 0.125;

/** Corner grab-point half-size, screen px. */
const GRAB_POINT_HALF = 1.5;

/** Telemetry insets and baselines, verbatim from the web. */
const TELEMETRY_INSET = 20;
const TELEMETRY_FIRST_BASELINE = 28;
const TELEMETRY_SECOND_BASELINE = 44;

/** The banner sits at a fixed screen y here, not relative to centre. */
const BANNER_BASELINE = 72;

/** Callout leader-line geometry, screen px from the panel's top-right corner. */
const CALLOUT_ELBOW_DX = 26;
const CALLOUT_ELBOW_DY = -20;
const CALLOUT_RUN_DX = 190;
const CALLOUT_TEXT_DX = 32;
const CALLOUT_LABEL_DY = -25;
const CALLOUT_DEPTH_DY = -11;

/** The layer id tag sits this far left of the panel's left edge. */
const TAG_GAP = 6;

function drawBackdrop(canvas: SkCanvas, width: number, height: number): void {
  "worklet";
  const paint = Skia.Paint();
  paint.setColor(Skia.Color(LAYERS_BACKDROP));
  canvas.drawRect({ x: 0, y: 0, width, height }, paint);
}

/** The two dashed arc rings drifting behind the stack. */
function drawArcRings(
  canvas: SkCanvas,
  camera: Boot3dCamera,
  projScale: number,
  elapsed: number,
  flicker: number,
  accent: string,
): void {
  "worklet";
  const paint = Skia.Paint();
  paint.setStyle(PaintStyle.Stroke);
  paint.setStrokeWidth(1);
  paint.setAntiAlias(true);
  paint.setColor(Skia.Color(hexToRgba(accent, 0.1 * flicker)));

  for (const ring of LAYERS_ARC_RINGS) {
    paint.setPathEffect(Skia.PathEffect.MakeDash([...ring.dash], 0));
    const radius = projScale * ring.radiusFactor;
    const start = arcRingStart(ring, elapsed);
    const path = Skia.Path.Make();

    for (let sample = 0; sample <= ARC_SAMPLES; sample++) {
      const angle = start + (sample / ARC_SAMPLES) * ring.sweep;
      const x = camera.centerX + Math.cos(angle) * radius;
      const y = camera.centerY + Math.sin(angle) * radius;

      if (sample === 0) {
        path.moveTo(x, y);
      } else {
        path.lineTo(x, y);
      }
    }

    canvas.drawPath(path, paint);
  }
}

/**
 * Every panel, back to front.
 *
 * The painter's sort is on the projected centre's depth and is load-bearing:
 * the whole point of the scene is that the layers occlude one another
 * correctly as the stack rotates.
 */
function drawPanels(
  canvas: SkCanvas,
  camera: Boot3dCamera,
  progress: number,
  elapsed: number,
  spread: number,
  pull: number,
  pulledPanel: LayerPanel | null,
  flicker: number,
  accent: string,
  accentAlt: string,
  tagFont: SkFont | null,
  calloutFont: SkFont | null,
): void {
  "worklet";
  const order: PanelDrawEntry[] = [];

  for (let index = 0; index < LAYER_PANELS.length; index++) {
    const panel = LAYER_PANELS[index];
    const isPulled = panel === pulledPanel;
    const rect = panelWorldRect(panel, spread, isPulled ? pull : 0);
    const centre = projectBootPoint(
      rect.x0 + rect.width / 2,
      rect.y0 + rect.height / 2,
      rect.z,
      camera,
    );
    order.push({ panel, index, rect, centreZ: centre.z, isPulled });
  }

  order.sort((a, b) => {
    return b.centreZ - a.centreZ;
  });

  for (const entry of order) {
    const drawPhase = panelDrawPhase(entry.index, progress);

    if (drawPhase <= 0) {
      continue;
    }

    // "Pulled" means far enough out to earn the glow, sweep and callout — the
    // web's `pullAmount > 0.05`, not merely "is the selected layer".
    const pulled = entry.isPulled && pull > PULL_ACTIVE_THRESHOLD;
    const alpha = panelAlpha(entry.centreZ, drawPhase, pulled);

    if (spread > GHOST_FRAME_MIN_SPREAD && entry.panel.kind !== "bg") {
      drawGhostFrame(canvas, camera, entry.rect, spread, flicker, accent);
    }

    if (entry.panel.kind === "bg") {
      drawBackdropLayer(
        canvas,
        camera,
        entry.rect,
        drawPhase,
        spread,
        flicker,
        accent,
      );
      continue;
    }

    drawPanelFace(
      canvas,
      camera,
      entry.rect,
      alpha,
      pulled,
      pull,
      flicker,
      accent,
      accentAlt,
    );
    drawPanelContent(
      canvas,
      camera,
      entry.rect,
      entry.panel.kind,
      alpha * 0.9,
      elapsed,
      flicker,
      accent,
      accentAlt,
    );

    if (spread > LAYER_TAG_MIN_SPREAD && tagFont !== null) {
      drawLayerTag(
        canvas,
        camera,
        entry.rect,
        entry.panel,
        spread,
        flicker,
        accent,
        tagFont,
      );
    }

    if (pulled) {
      drawPulledOverlay(
        canvas,
        camera,
        entry.rect,
        entry.panel,
        elapsed,
        pull,
        flicker,
        accent,
        accentAlt,
        calloutFont,
      );
    }
  }
}

/** Map a panel-local UV coordinate onto the canvas at that panel's z-depth. */
function panelUv(
  rect: LayerWorldRect,
  u: number,
  v: number,
  z: number,
  camera: Boot3dCamera,
): ProjectedBootPoint {
  "worklet";
  return projectBootPoint(
    rect.x0 + u * rect.width,
    rect.y0 + v * rect.height,
    z,
    camera,
  );
}

/** Build the quad path for a UV sub-rect of a panel. */
function uvQuadPath(
  rect: LayerWorldRect,
  u0: number,
  v0: number,
  u1: number,
  v1: number,
  z: number,
  camera: Boot3dCamera,
): ReturnType<typeof Skia.Path.Make> {
  "worklet";
  const a = panelUv(rect, u0, v0, z, camera);
  const b = panelUv(rect, u1, v0, z, camera);
  const c = panelUv(rect, u1, v1, z, camera);
  const d = panelUv(rect, u0, v1, z, camera);
  const path = Skia.Path.Make();
  path.moveTo(a.x, a.y);
  path.lineTo(b.x, b.y);
  path.lineTo(c.x, c.y);
  path.lineTo(d.x, d.y);
  path.close();
  return path;
}

/** Fill a UV sub-rect of a panel. */
function fillUvQuad(
  canvas: SkCanvas,
  camera: Boot3dCamera,
  rect: LayerWorldRect,
  u0: number,
  v0: number,
  u1: number,
  v1: number,
  color: string,
  alpha: number,
): void {
  "worklet";
  const paint = Skia.Paint();
  paint.setAntiAlias(true);
  paint.setColor(Skia.Color(hexToRgba(color, alpha)));
  canvas.drawPath(uvQuadPath(rect, u0, v0, u1, v1, rect.z, camera), paint);
}

/** Stroke a UV sub-rect of a panel. */
function strokeUvQuad(
  canvas: SkCanvas,
  camera: Boot3dCamera,
  rect: LayerWorldRect,
  u0: number,
  v0: number,
  u1: number,
  v1: number,
  color: string,
  alpha: number,
  lineWidth: number,
): void {
  "worklet";
  const paint = Skia.Paint();
  paint.setStyle(PaintStyle.Stroke);
  paint.setStrokeWidth(lineWidth);
  paint.setAntiAlias(true);
  paint.setColor(Skia.Color(hexToRgba(color, alpha)));
  canvas.drawPath(uvQuadPath(rect, u0, v0, u1, v1, rect.z, camera), paint);
}

/**
 * The dashed frame at the panel's ORIGINAL flat position, plus four tethers
 * back to where it is now — the "this moved" affordance the whole scene rests
 * on. Pinned to `z = 0`, never the panel's exploded z.
 */
function drawGhostFrame(
  canvas: SkCanvas,
  camera: Boot3dCamera,
  rect: LayerWorldRect,
  spread: number,
  flicker: number,
  accent: string,
): void {
  "worklet";
  const framePaint = Skia.Paint();
  framePaint.setStyle(PaintStyle.Stroke);
  framePaint.setStrokeWidth(1);
  framePaint.setAntiAlias(true);
  framePaint.setPathEffect(Skia.PathEffect.MakeDash([...GHOST_DASH], 0));
  framePaint.setColor(Skia.Color(hexToRgba(accent, 0.13 * spread * flicker)));
  canvas.drawPath(uvQuadPath(rect, 0, 0, 1, 1, 0, camera), framePaint);

  const tetherPaint = Skia.Paint();
  tetherPaint.setStyle(PaintStyle.Stroke);
  tetherPaint.setStrokeWidth(1);
  tetherPaint.setAntiAlias(true);
  tetherPaint.setColor(Skia.Color(hexToRgba(accent, 0.1 * spread * flicker)));

  for (const [u, v] of CORNER_UVS) {
    const here = panelUv(rect, u, v, rect.z, camera);
    const flat = panelUv(rect, u, v, 0, camera);
    canvas.drawLine(here.x, here.y, flat.x, flat.y, tetherPaint);
  }
}

/** The four panel corners, in UV. */
const CORNER_UVS: readonly (readonly [number, number])[] = [
  [0, 0],
  [1, 0],
  [1, 1],
  [0, 1],
];

/** The backdrop layer draws as a grid, not a face — and carries no content. */
function drawBackdropLayer(
  canvas: SkCanvas,
  camera: Boot3dCamera,
  rect: LayerWorldRect,
  drawPhase: number,
  spread: number,
  flicker: number,
  accent: string,
): void {
  "worklet";
  const paint = Skia.Paint();
  paint.setStyle(PaintStyle.Stroke);
  paint.setStrokeWidth(1);
  paint.setAntiAlias(true);
  paint.setColor(
    Skia.Color(hexToRgba(accent, 0.08 * drawPhase * spread * flicker)),
  );

  for (let u = 0; u <= 1.001; u += BG_GRID_STEP) {
    const a = panelUv(rect, u, 0, rect.z, camera);
    const b = panelUv(rect, u, 1, rect.z, camera);
    canvas.drawLine(a.x, a.y, b.x, b.y, paint);
  }

  for (let v = 0; v <= 1.001; v += BG_GRID_STEP) {
    const a = panelUv(rect, 0, v, rect.z, camera);
    const b = panelUv(rect, 1, v, rect.z, camera);
    canvas.drawLine(a.x, a.y, b.x, b.y, paint);
  }

  strokeUvQuad(
    canvas,
    camera,
    rect,
    0,
    0,
    1,
    1,
    accent,
    0.15 * drawPhase * spread * flicker,
    1,
  );
}

/** A panel's face, border, pull glow and corner grab-points. */
function drawPanelFace(
  canvas: SkCanvas,
  camera: Boot3dCamera,
  rect: LayerWorldRect,
  alpha: number,
  pulled: boolean,
  pull: number,
  flicker: number,
  accent: string,
  accentAlt: string,
): void {
  "worklet";
  fillUvQuad(
    canvas,
    camera,
    rect,
    0,
    0,
    1,
    1,
    PANEL_FACE_FILL,
    0.42 * alpha * flicker,
  );

  const borderColor = pulled ? accentAlt : accent;

  // The glow the web gets from `shadowBlur` — see the module header for why
  // this is a wider dim stroke rather than a mask-filter blur.
  if (pulled) {
    strokeUvQuad(
      canvas,
      camera,
      rect,
      0,
      0,
      1,
      1,
      borderColor,
      0.18 * pull * flicker,
      6 * pull,
    );
  }

  strokeUvQuad(
    canvas,
    camera,
    rect,
    0,
    0,
    1,
    1,
    borderColor,
    Math.min(1, alpha + 0.25) * flicker,
    pulled ? 1.8 : 1.2,
  );

  const grabPaint = Skia.Paint();
  grabPaint.setAntiAlias(false);
  grabPaint.setColor(Skia.Color(hexToRgba(borderColor, alpha * flicker)));

  for (const [u, v] of CORNER_UVS) {
    const corner = panelUv(rect, u, v, rect.z, camera);
    canvas.drawRect(
      {
        x: corner.x - GRAB_POINT_HALF,
        y: corner.y - GRAB_POINT_HALF,
        width: GRAB_POINT_HALF * 2,
        height: GRAB_POINT_HALF * 2,
      },
      grabPaint,
    );
  }
}

/** Each panel kind's in-plane content, drawn in the panel's own UV space. */
function drawPanelContent(
  canvas: SkCanvas,
  camera: Boot3dCamera,
  rect: LayerWorldRect,
  kind: LayerPanel["kind"],
  contentAlpha: number,
  elapsed: number,
  flicker: number,
  accent: string,
  accentAlt: string,
): void {
  "worklet";

  if (kind === "header") {
    for (let i = 0; i < 5; i++) {
      fillUvQuad(
        canvas,
        camera,
        rect,
        0.02 + i * 0.09,
        0.28,
        0.09 + i * 0.09,
        0.72,
        i === 0 ? accentAlt : accent,
        contentAlpha * 0.5 * flicker,
      );
    }

    fillUvQuad(
      canvas,
      camera,
      rect,
      0.78,
      0.25,
      0.98,
      0.75,
      accent,
      contentAlpha * 0.25 * flicker,
    );
    return;
  }

  if (kind === "main") {
    drawMainContent(
      canvas,
      camera,
      rect,
      contentAlpha,
      elapsed,
      flicker,
      accent,
      accentAlt,
    );
    return;
  }

  if (kind === "list") {
    for (let i = 0; i < 4; i++) {
      fillUvQuad(
        canvas,
        camera,
        rect,
        0.04,
        0.08 + i * 0.24,
        0.04 + (0.9 - i * 0.13) * (0.8 + 0.2 * Math.sin(elapsed * 1.3 + i)),
        0.22 + i * 0.24,
        accent,
        contentAlpha * (0.45 - i * 0.07) * flicker,
      );
    }

    return;
  }

  if (kind === "blotter") {
    drawBlotterContent(
      canvas,
      camera,
      rect,
      contentAlpha,
      flicker,
      accent,
      accentAlt,
    );
    return;
  }

  if (kind === "status") {
    for (let i = 0; i < 9; i++) {
      fillUvQuad(
        canvas,
        camera,
        rect,
        0.02 + i * 0.11,
        0.25,
        0.08 + i * 0.11,
        0.75,
        i % 3 === 0 ? accentAlt : accent,
        contentAlpha * 0.5 * flicker,
      );
    }
  }
}

/** The pricing grid: four cells, each with a header band and a live sparkline. */
function drawMainContent(
  canvas: SkCanvas,
  camera: Boot3dCamera,
  rect: LayerWorldRect,
  contentAlpha: number,
  elapsed: number,
  flicker: number,
  accent: string,
  accentAlt: string,
): void {
  "worklet";
  const sparkPaint = Skia.Paint();
  sparkPaint.setStyle(PaintStyle.Stroke);
  sparkPaint.setStrokeWidth(1.4);
  sparkPaint.setAntiAlias(true);
  sparkPaint.setColor(
    Skia.Color(hexToRgba(accentAlt, contentAlpha * 0.85 * flicker)),
  );

  for (let i = 0; i < 2; i++) {
    for (let j = 0; j < 2; j++) {
      const u0 = 0.03 + i * 0.5;
      const v0 = 0.04 + j * 0.5;
      const u1 = u0 + 0.44;
      const v1 = v0 + 0.42;
      strokeUvQuad(
        canvas,
        camera,
        rect,
        u0,
        v0,
        u1,
        v1,
        accent,
        contentAlpha * 0.6 * flicker,
        1,
      );
      fillUvQuad(
        canvas,
        camera,
        rect,
        u0,
        v0,
        u1,
        v0 + 0.12,
        accent,
        contentAlpha * 0.18 * flicker,
      );

      const path = Skia.Path.Make();

      for (let sample = 0; sample <= 10; sample++) {
        const u = u0 + 0.02 + (u1 - u0 - 0.04) * (sample / 10);
        const v =
          v1 -
          0.06 -
          Math.abs(Math.sin(sample * 0.9 + i * 2 + j + elapsed * 0.7)) *
            (v1 - v0) *
            0.24;
        const point = panelUv(rect, u, v, rect.z, camera);

        if (sample === 0) {
          path.moveTo(point.x, point.y);
        } else {
          path.lineTo(point.x, point.y);
        }
      }

      canvas.drawPath(path, sparkPaint);
    }
  }
}

/** The blotter: a header band and three rows of cells. */
function drawBlotterContent(
  canvas: SkCanvas,
  camera: Boot3dCamera,
  rect: LayerWorldRect,
  contentAlpha: number,
  flicker: number,
  accent: string,
  accentAlt: string,
): void {
  "worklet";
  fillUvQuad(
    canvas,
    camera,
    rect,
    0.02,
    0.06,
    0.98,
    0.24,
    accentAlt,
    contentAlpha * 0.4 * flicker,
  );

  const rulePaint = Skia.Paint();
  rulePaint.setStyle(PaintStyle.Stroke);
  rulePaint.setStrokeWidth(1);
  rulePaint.setAntiAlias(true);
  rulePaint.setColor(
    Skia.Color(hexToRgba(accent, contentAlpha * 0.3 * flicker)),
  );

  for (let i = 1; i < 4; i++) {
    const v = 0.24 + i * 0.24;
    const a = panelUv(rect, 0.02, v, rect.z, camera);
    const b = panelUv(rect, 0.98, v, rect.z, camera);
    canvas.drawLine(a.x, a.y, b.x, b.y, rulePaint);

    for (let cell = 0; cell < 5; cell++) {
      fillUvQuad(
        canvas,
        camera,
        rect,
        0.03 + cell * 0.19,
        v - 0.16,
        0.15 + cell * 0.19,
        v - 0.04,
        accent,
        contentAlpha * 0.3 * flicker,
      );
    }
  }
}

/**
 * The `L0n` tag on a panel's left edge.
 *
 * Right-aligned and vertically centred in the web (`textBaseline = "middle"`).
 * Skia draws from the alphabetic baseline only, so the centring is applied
 * here as a cap-height offset rather than inherited from a baseline mode.
 */
function drawLayerTag(
  canvas: SkCanvas,
  camera: Boot3dCamera,
  rect: LayerWorldRect,
  panel: LayerPanel,
  spread: number,
  flicker: number,
  accent: string,
  font: SkFont,
): void {
  "worklet";
  const anchor = panelUv(rect, -0.005, 0.5, rect.z, camera);
  const text = panel.label.slice(0, 3);
  const paint = Skia.Paint();
  paint.setAntiAlias(true);
  paint.setColor(Skia.Color(hexToRgba(accent, 0.65 * spread * flicker)));
  canvas.drawText(
    text,
    anchor.x - TAG_GAP - font.getTextWidth(text),
    anchor.y + TAG_FONT_SIZE * 0.35,
    paint,
    font,
  );
}

/** The inspected panel's scan sweep and its label/depth callout. */
function drawPulledOverlay(
  canvas: SkCanvas,
  camera: Boot3dCamera,
  rect: LayerWorldRect,
  panel: LayerPanel,
  elapsed: number,
  pull: number,
  flicker: number,
  accent: string,
  accentAlt: string,
  font: SkFont | null,
): void {
  "worklet";
  const scanV = pullScanV(elapsed);
  const scanPaint = Skia.Paint();
  scanPaint.setStyle(PaintStyle.Stroke);
  scanPaint.setStrokeWidth(1.2);
  scanPaint.setAntiAlias(true);
  scanPaint.setColor(Skia.Color(hexToRgba(accentAlt, 0.5 * pull * flicker)));
  const scanA = panelUv(rect, 0, scanV, rect.z, camera);
  const scanB = panelUv(rect, 1, scanV, rect.z, camera);
  canvas.drawLine(scanA.x, scanA.y, scanB.x, scanB.y, scanPaint);

  const topRight = panelUv(rect, 1, 0, rect.z, camera);
  const leaderPaint = Skia.Paint();
  leaderPaint.setStyle(PaintStyle.Stroke);
  leaderPaint.setStrokeWidth(1);
  leaderPaint.setAntiAlias(true);
  leaderPaint.setColor(Skia.Color(hexToRgba(accentAlt, 0.7 * pull * flicker)));
  const leader = Skia.Path.Make();
  leader.moveTo(topRight.x, topRight.y);
  leader.lineTo(topRight.x + CALLOUT_ELBOW_DX, topRight.y + CALLOUT_ELBOW_DY);
  leader.lineTo(topRight.x + CALLOUT_RUN_DX, topRight.y + CALLOUT_ELBOW_DY);
  canvas.drawPath(leader, leaderPaint);

  // Geometry above draws regardless; only the text waits on the font, so a
  // null-font window loses labels but keeps the sweep and leader line.
  if (font === null) {
    return;
  }

  const labelPaint = Skia.Paint();
  labelPaint.setAntiAlias(true);
  labelPaint.setColor(Skia.Color(hexToRgba(accentAlt, 0.95 * pull * flicker)));
  canvas.drawText(
    panel.label,
    topRight.x + CALLOUT_TEXT_DX,
    topRight.y + CALLOUT_LABEL_DY,
    labelPaint,
    font,
  );

  const depthPaint = Skia.Paint();
  depthPaint.setAntiAlias(true);
  depthPaint.setColor(Skia.Color(hexToRgba(accent, 0.7 * pull * flicker)));
  canvas.drawText(
    panelDepthReadout(rect.z),
    topRight.x + CALLOUT_TEXT_DX,
    topRight.y + CALLOUT_DEPTH_DY,
    depthPaint,
    font,
  );
}

/** Corner telemetry: two left-aligned readouts, two right-aligned. */
function drawTelemetry(
  canvas: SkCanvas,
  width: number,
  spread: number,
  yaw: number,
  pitch: number,
  flicker: number,
  accent: string,
  accentAlt: string,
  font: SkFont | null,
): void {
  "worklet";

  if (font === null) {
    return;
  }

  const telemetry = layersTelemetry(spread, yaw, pitch);
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
    telemetry.layers,
    TELEMETRY_INSET,
    TELEMETRY_SECOND_BASELINE,
    paint,
    font,
  );
  canvas.drawText(
    telemetry.orientation,
    width - TELEMETRY_INSET - font.getTextWidth(telemetry.orientation),
    TELEMETRY_FIRST_BASELINE,
    paint,
    font,
  );
  paint.setColor(Skia.Color(hexToRgba(accentAlt, 0.7 * flicker)));
  canvas.drawText(
    telemetry.track,
    width - TELEMETRY_INSET - font.getTextWidth(telemetry.track),
    TELEMETRY_SECOND_BASELINE,
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
  positive: string,
  font: SkFont | null,
): void {
  "worklet";

  if (font === null) {
    return;
  }

  const status = layersStatus(progress, elapsed);
  const blink = layersBlinkAlpha(progress, elapsed);
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
    BANNER_BASELINE,
    paint,
    font,
  );
}

/** One panel's painter-sort entry, with its world rect cached. */
interface PanelDrawEntry {
  panel: LayerPanel;
  index: number;
  rect: LayerWorldRect;
  centreZ: number;
  isPulled: boolean;
}
