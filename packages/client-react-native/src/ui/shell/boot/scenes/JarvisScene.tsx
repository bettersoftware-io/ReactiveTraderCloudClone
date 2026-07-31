// packages/client-react-native/src/ui/shell/boot/scenes/JarvisScene.tsx
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
  type ProjectedBootPoint,
  projectBootPoint,
} from "#/ui/shell/boot/scenes/boot3dCamera";
import { useBootSceneFonts } from "#/ui/shell/boot/scenes/bootSceneFonts";
import { bootProgress, hexToRgba } from "#/ui/shell/boot/scenes/coreGeometry";
import {
  crossLinkPhase,
  fragmentAlpha,
  fragmentGlitch,
  fragmentIsLunging,
  fragmentLabel,
  fragmentRevealPhase,
  fragmentZ,
  JARVIS_MIN_PERSPECTIVE_DENOM,
  JARVIS_PERSPECTIVE_K,
  JARVIS_PROJ_SCALE_FACTOR,
  JARVIS_RING_LABELS,
  JARVIS_RINGS,
  JARVIS_TOP_ANGLE,
  type JarvisFragment,
  type JarvisParticle,
  type JarvisRing,
  jarvisBlinkAlpha,
  jarvisFlicker,
  jarvisFragments,
  jarvisParticles,
  jarvisPitch,
  jarvisStatus,
  jarvisTelemetry,
  jarvisYaw,
  particleAlpha,
  particleDriftY,
  ringPhase,
  ringZPlane,
  shownFragmentCount,
  sphereBob,
  spherePhase,
  sphereRadius,
  sphereSpin,
  spokesPhase,
  spokeZPlane,
  wedgeStartAngle,
} from "#/ui/shell/boot/scenes/jarvisGeometry";
import { cachedSceneGeometry } from "#/ui/shell/boot/scenes/sceneGeometryCache";

/**
 * `jarvis` boot scene — "HOLO CORE · RT / 3Dx.40A", the densest of the eight.
 * A wireframe core sphere inside six layers of ring machinery (tick dial,
 * counter-rotating segments, pavilion pads, highlighted arcs, a degree ruler),
 * eight radial spoke walkways, a radar wedge, and fourteen depth-scattered
 * blueprint fragments that glitch in, breathe along Z, get tethered to the
 * outer ring, cross-linked, and one lunges at the camera every ~1.6 s.
 *
 * Ported from `packages/boot-splash/src/variants/bootJarvis.ts`.
 *
 * PROJECTION. The steepest `perspectiveK` of the five projected scenes (0.30),
 * with a clamped near plane.
 *
 * NO MUTABLE STATE CROSSES A FRAME — see `jarvisGeometry.ts`'s header. Both of
 * the web's per-frame mutable values (`ringZPlane`, `fragment.currentZ`) are
 * recomputed as pure functions of time here.
 *
 * FLICKER IS A PER-DRAW ALPHA, never `saveLayer` (`docs/performance.md`). The
 * web's `ctx.save()` comes before the backdrop grid, so everything pulses.
 */
export function JarvisScene({
  elapsedSec,
  drift,
  width,
  height,
  theme,
}: BootSceneProps): JSX.Element {
  const accent = theme.accentPrimary;
  const accentAlt = theme.accent2;
  const positive = theme.accentPositive;
  const fonts = useBootSceneFonts(JARVIS_FONTS);
  // `jarvisFragments`/`jarvisParticles` take no input (deterministic,
  // hand-placed world-space data), so `world` has no real dependency to key
  // on — an empty cache key means the first call computes it and every
  // later render reuses the same object. Read only inside the
  // `useDerivedValue` closure below, never JSX, so the React Compiler
  // cannot cache it itself — see `sceneGeometryCache.ts`'s header.
  const world = cachedSceneGeometry("jarvisScene:world", [], () => {
    return { fragments: jarvisFragments(), particles: jarvisParticles() };
  });

  const picture = useDerivedValue(() => {
    return createPicture(
      (canvas) => {
        const elapsed = elapsedSec.value;
        const pointerDrift = drift.value;
        const progress = bootProgress(elapsed, BOOT_DURATION_MS);
        const projScale = Math.min(width, height) * JARVIS_PROJ_SCALE_FACTOR;
        const yaw = jarvisYaw(elapsed, pointerDrift.mx);
        const pitch = jarvisPitch(elapsed, pointerDrift.my);
        const camera: Boot3dCamera = {
          yaw,
          pitch,
          perspectiveK: JARVIS_PERSPECTIVE_K,
          minPerspectiveDenom: JARVIS_MIN_PERSPECTIVE_DENOM,
          centerX: width / 2,
          centerY: height / 2,
          projScale,
        };
        const flicker = jarvisFlicker(elapsed);

        drawBackdrop(canvas, width, height);
        drawBackdropGrid(canvas, camera, flicker, accent);
        drawCoreGlow(canvas, camera, projScale, flicker, accent);
        drawRadarWedge(canvas, camera, elapsed, flicker, accent);
        drawCoreSphere(canvas, camera, elapsed, progress, flicker, accent);
        drawRingMachinery(
          canvas,
          camera,
          elapsed,
          progress,
          flicker,
          accent,
          accentAlt,
          fonts?.ringLabel ?? null,
          fonts?.ruler ?? null,
        );
        drawSpokes(canvas, camera, elapsed, progress, flicker, accent);
        drawFragments(
          canvas,
          camera,
          world.fragments,
          elapsed,
          progress,
          flicker,
          accent,
          accentAlt,
          positive,
          fonts?.ruler ?? null,
        );
        drawCrossLinks(
          canvas,
          camera,
          world.fragments,
          elapsed,
          progress,
          flicker,
          accent,
        );
        drawParticles(
          canvas,
          camera,
          world.particles,
          elapsed,
          flicker,
          accent,
        );
        drawTelemetry(
          canvas,
          width,
          shownFragmentCount(world.fragments, progress),
          yaw,
          pitch,
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

  const pictureProps = { testID: "boot-scene-jarvis", picture };
  return <Picture {...pictureProps} />;
}

/** The scene's four text sites, matching the web's `ctx.font` strings: ring
 * labels (`8px`), ruler ticks and fragment labels (`7px`), corner telemetry
 * (`11px`), status banner (`bold 12px`). */
const RING_LABEL_FONT_SIZE = 8;
const RULER_FONT_SIZE = 7;
const TELEMETRY_FONT_SIZE = 11;
const BANNER_FONT_SIZE = 12;

const JARVIS_FONTS = {
  ringLabel: { size: RING_LABEL_FONT_SIZE },
  ruler: { size: RULER_FONT_SIZE },
  telemetry: { size: TELEMETRY_FONT_SIZE },
  banner: { size: BANNER_FONT_SIZE, bold: true },
} as const;

const JARVIS_BACKDROP = "rgba(0,3,6,0.55)";

/** Telemetry insets and baselines, verbatim from the web. */
const TELEMETRY_INSET = 20;
const TELEMETRY_FIRST_BASELINE = 28;
const TELEMETRY_SECOND_BASELINE = 44;
const BANNER_BASELINE = 72;

/** The white core dot at the centre of the sphere. */
const CORE_DOT_COLOR = "#ffffff";
const CORE_DOT_RADIUS = 2.4;

function drawBackdrop(canvas: SkCanvas, width: number, height: number): void {
  "worklet";
  const paint = Skia.Paint();
  paint.setColor(Skia.Color(JARVIS_BACKDROP));
  canvas.drawRect({ x: 0, y: 0, width, height }, paint);
}

/** Project a polar coordinate onto the canvas at an explicit Z plane. */
function projectPolar(
  angle: number,
  radius: number,
  zPlane: number,
  camera: Boot3dCamera,
): ProjectedBootPoint {
  "worklet";
  return projectBootPoint(
    Math.cos(angle) * radius,
    Math.sin(angle) * radius,
    zPlane,
    camera,
  );
}

/** The dotted parallax grid far behind everything. */
function drawBackdropGrid(
  canvas: SkCanvas,
  camera: Boot3dCamera,
  flicker: number,
  accent: string,
): void {
  "worklet";
  const paint = Skia.Paint();
  paint.setAntiAlias(false);
  paint.setColor(Skia.Color(hexToRgba(accent, 0.06 * flicker)));

  for (let gx = -7; gx <= 7; gx++) {
    for (let gy = -4; gy <= 4; gy++) {
      const point = projectBootPoint(gx * 0.22, gy * 0.22, 0.85, camera);
      canvas.drawRect(
        { x: point.x - 0.6, y: point.y - 0.6, width: 1.2, height: 1.2 },
        paint,
      );
    }
  }
}

/** The radial wash behind the core sphere. */
function drawCoreGlow(
  canvas: SkCanvas,
  camera: Boot3dCamera,
  projScale: number,
  flicker: number,
  accent: string,
): void {
  "worklet";
  const centre = projectBootPoint(0, 0, 0, camera);
  const shader = Skia.Shader.MakeRadialGradient(
    { x: centre.x, y: centre.y },
    projScale * 0.3,
    [Skia.Color(hexToRgba(accent, 0.2 * flicker)), Skia.Color("rgba(0,0,0,0)")],
    [0, 1],
    TileMode.Clamp,
  );
  const paint = Skia.Paint();
  paint.setShader(shader);
  const box = projScale * 0.32;
  canvas.drawRect(
    { x: centre.x - box, y: centre.y - box, width: box * 2, height: box * 2 },
    paint,
  );
}

/** The slowly sweeping radar wedge. */
function drawRadarWedge(
  canvas: SkCanvas,
  camera: Boot3dCamera,
  elapsed: number,
  flicker: number,
  accent: string,
): void {
  "worklet";
  const start = wedgeStartAngle(elapsed);
  const paint = Skia.Paint();
  paint.setAntiAlias(true);
  paint.setColor(Skia.Color(hexToRgba(accent, 0.045 * flicker)));
  const path = Skia.Path.Make();

  for (let step = 0; step <= 10; step++) {
    const point = projectPolar(start + (step / 10) * 0.55, 0.3, 0, camera);

    if (step === 0) {
      path.moveTo(point.x, point.y);
    } else {
      path.lineTo(point.x, point.y);
    }
  }

  for (let step = 10; step >= 0; step--) {
    const point = projectPolar(start + (step / 10) * 0.55, 0.95, 0, camera);
    path.lineTo(point.x, point.y);
  }

  path.close();
  canvas.drawPath(path, paint);
}

/** One point on the spinning, bobbing core sphere. */
function projectSpherePoint(
  lat: number,
  lon: number,
  radius: number,
  spin: number,
  bob: number,
  camera: Boot3dCamera,
): ProjectedBootPoint {
  "worklet";
  return projectBootPoint(
    Math.cos(lat) * Math.cos(lon + spin) * radius,
    Math.sin(lat) * radius,
    Math.cos(lat) * Math.sin(lon + spin) * radius + bob,
    camera,
  );
}

/** The wireframe core sphere — latitude rings, longitude meridians, core dot. */
function drawCoreSphere(
  canvas: SkCanvas,
  camera: Boot3dCamera,
  elapsed: number,
  progress: number,
  flicker: number,
  accent: string,
): void {
  "worklet";
  const phase = spherePhase(progress);

  if (phase <= 0) {
    return;
  }

  const radius = sphereRadius(progress);
  const spin = sphereSpin(elapsed);
  const bob = sphereBob(elapsed);
  const paint = Skia.Paint();
  paint.setStyle(PaintStyle.Stroke);
  paint.setStrokeWidth(1);
  paint.setAntiAlias(true);

  paint.setColor(Skia.Color(hexToRgba(accent, 0.4 * phase * flicker)));

  for (let lat = -60; lat <= 60; lat += 30) {
    const path = Skia.Path.Make();

    for (let lon = 0; lon <= 360; lon += 15) {
      const point = projectSpherePoint(
        (lat * Math.PI) / 180,
        (lon * Math.PI) / 180,
        radius,
        spin,
        bob,
        camera,
      );

      if (lon === 0) {
        path.moveTo(point.x, point.y);
      } else {
        path.lineTo(point.x, point.y);
      }
    }

    canvas.drawPath(path, paint);
  }

  paint.setColor(Skia.Color(hexToRgba(accent, 0.3 * phase * flicker)));

  for (let lon = 0; lon < 360; lon += 30) {
    const path = Skia.Path.Make();

    for (let lat = -80; lat <= 80; lat += 10) {
      const point = projectSpherePoint(
        (lat * Math.PI) / 180,
        (lon * Math.PI) / 180,
        radius,
        spin,
        bob,
        camera,
      );

      if (lat === -80) {
        path.moveTo(point.x, point.y);
      } else {
        path.lineTo(point.x, point.y);
      }
    }

    canvas.drawPath(path, paint);
  }

  const core = projectBootPoint(0, 0, bob, camera);
  const corePaint = Skia.Paint();
  corePaint.setAntiAlias(true);
  corePaint.setColor(
    Skia.Color(hexToRgba(CORE_DOT_COLOR, 0.75 * phase * flicker)),
  );
  canvas.drawCircle(core.x, core.y, CORE_DOT_RADIUS, corePaint);
}

/** Stroke an arc of a ring at its breathing Z plane. */
function strokeRingArc(
  canvas: SkCanvas,
  camera: Boot3dCamera,
  zPlane: number,
  radius: number,
  startAngle: number,
  endAngle: number,
  color: string,
  alpha: number,
  lineWidth: number,
  dash: readonly number[] | null,
): void {
  "worklet";
  const segments = Math.max(6, Math.floor((endAngle - startAngle) * 26));
  const paint = Skia.Paint();
  paint.setStyle(PaintStyle.Stroke);
  paint.setStrokeWidth(lineWidth);
  paint.setAntiAlias(true);
  paint.setColor(Skia.Color(hexToRgba(color, alpha)));

  if (dash !== null) {
    paint.setPathEffect(Skia.PathEffect.MakeDash([...dash], 0));
  }

  const path = Skia.Path.Make();

  for (let step = 0; step <= segments; step++) {
    const angle = startAngle + ((endAngle - startAngle) * step) / segments;
    const point = projectPolar(angle, radius, zPlane, camera);

    if (step === 0) {
      path.moveTo(point.x, point.y);
    } else {
      path.lineTo(point.x, point.y);
    }
  }

  canvas.drawPath(path, paint);
}

/** Draw a radial tick between two radii. */
function drawRadialTick(
  canvas: SkCanvas,
  camera: Boot3dCamera,
  zPlane: number,
  angle: number,
  innerRadius: number,
  outerRadius: number,
  color: string,
  alpha: number,
): void {
  "worklet";
  const paint = Skia.Paint();
  paint.setStyle(PaintStyle.Stroke);
  paint.setStrokeWidth(1);
  paint.setAntiAlias(true);
  paint.setColor(Skia.Color(hexToRgba(color, alpha)));
  const inner = projectPolar(angle, innerRadius, zPlane, camera);
  const outer = projectPolar(angle, outerRadius, zPlane, camera);
  canvas.drawLine(inner.x, inner.y, outer.x, outer.y, paint);
}

/** One ring layer, dispatched on its kind. */
function drawRingLayer(
  canvas: SkCanvas,
  camera: Boot3dCamera,
  ring: JarvisRing,
  zPlane: number,
  phase: number,
  sweep: number,
  elapsed: number,
  flicker: number,
  accent: string,
  accentAlt: string,
  labelFont: SkFont | null,
  rulerFont: SkFont | null,
): void {
  "worklet";
  const top = JARVIS_TOP_ANGLE;

  if (ring.kind === "ticks") {
    strokeRingArc(
      canvas,
      camera,
      zPlane,
      ring.radius,
      top,
      top + sweep,
      accent,
      0.6 * flicker,
      1.3,
      null,
    );

    for (let i = 0; i < 60 * phase; i++) {
      const angle = top + (i / 60) * 6.283 + elapsed * 0.05;
      const major = i % 5 === 0;
      drawRadialTick(
        canvas,
        camera,
        zPlane,
        angle,
        ring.radius - 0.012,
        ring.radius + (major ? 0.022 : 0.01),
        accent,
        (major ? 0.55 : 0.25) * flicker,
      );
    }

    return;
  }

  if (ring.kind === "segs") {
    const rotation = elapsed * 0.14;

    for (let segment = 0; segment < 12 * phase; segment++) {
      const angle = top + rotation + (segment / 12) * 6.283;
      const highlighted = segment % 4 === 0;
      strokeRingArc(
        canvas,
        camera,
        zPlane,
        ring.radius,
        angle,
        angle + 0.38,
        highlighted ? accentAlt : accent,
        (highlighted ? 0.7 : 0.4) * flicker,
        highlighted ? 2 : 1.2,
        null,
      );
    }

    return;
  }

  if (ring.kind === "dash") {
    strokeRingArc(
      canvas,
      camera,
      zPlane,
      ring.radius,
      top,
      top + sweep,
      accent,
      0.35 * flicker,
      1,
      [3, 8],
    );

    // Labels only once the ring has fully swept in.
    if (phase < 1 || labelFont === null) {
      return;
    }

    const rotation = -elapsed * 0.1;
    const paint = Skia.Paint();
    paint.setAntiAlias(true);
    paint.setColor(Skia.Color(hexToRgba(accent, 0.55 * flicker)));

    for (let i = 0; i < JARVIS_RING_LABELS.length; i++) {
      const label = JARVIS_RING_LABELS[i];
      const point = projectPolar(
        rotation + i * 2.094,
        ring.radius + 0.035,
        zPlane,
        camera,
      );
      canvas.drawText(
        label,
        point.x - labelFont.getTextWidth(label) / 2,
        point.y + RING_LABEL_FONT_SIZE * 0.35,
        paint,
        labelFont,
      );
    }

    return;
  }

  if (ring.kind === "pads") {
    strokeRingArc(
      canvas,
      camera,
      zPlane,
      ring.radius - 0.008,
      top,
      top + sweep,
      accent,
      0.4 * flicker,
      1,
      null,
    );
    strokeRingArc(
      canvas,
      camera,
      zPlane,
      ring.radius + 0.008,
      top,
      top + sweep,
      accent,
      0.4 * flicker,
      1,
      null,
    );
    const rotation = elapsed * 0.03;

    for (let segment = 0; segment < 8 * phase; segment++) {
      const angle = top + rotation + (segment / 8) * 6.283;
      const highlighted = segment % 3 === 0;
      const color = highlighted ? accentAlt : accent;
      const path = Skia.Path.Make();
      const corners = [
        projectPolar(angle - 0.1, ring.radius - 0.026, zPlane, camera),
        projectPolar(angle + 0.1, ring.radius - 0.026, zPlane, camera),
        projectPolar(angle + 0.1, ring.radius + 0.026, zPlane, camera),
        projectPolar(angle - 0.1, ring.radius + 0.026, zPlane, camera),
      ];
      path.moveTo(corners[0].x, corners[0].y);

      for (const corner of corners) {
        path.lineTo(corner.x, corner.y);
      }

      path.close();
      const fill = Skia.Paint();
      fill.setAntiAlias(true);
      fill.setColor(Skia.Color(hexToRgba(color, 0.14 * flicker)));
      canvas.drawPath(path, fill);
      const stroke = Skia.Paint();
      stroke.setStyle(PaintStyle.Stroke);
      stroke.setStrokeWidth(1);
      stroke.setAntiAlias(true);
      stroke.setColor(Skia.Color(hexToRgba(color, 0.6 * flicker)));
      canvas.drawPath(path, stroke);
    }

    return;
  }

  if (ring.kind === "arcs") {
    strokeRingArc(
      canvas,
      camera,
      zPlane,
      ring.radius,
      top,
      top + sweep,
      accent,
      0.3 * flicker,
      1,
      null,
    );

    for (let i = 0; i < 4 * phase; i++) {
      const angle = -elapsed * 0.07 + i * 1.571;
      strokeRingArc(
        canvas,
        camera,
        zPlane,
        ring.radius,
        angle,
        angle + 0.7,
        accentAlt,
        0.55 * flicker,
        2.2,
        null,
      );
    }

    for (let i = 0; i < 36 * phase; i++) {
      const angle = (i / 36) * 6.283 - elapsed * 0.07;
      drawRadialTick(
        canvas,
        camera,
        zPlane,
        angle,
        ring.radius + 0.006,
        ring.radius + 0.02,
        accent,
        0.3 * flicker,
      );
    }

    return;
  }

  // ruler
  strokeRingArc(
    canvas,
    camera,
    zPlane,
    ring.radius,
    top,
    top + sweep,
    accent,
    0.22 * flicker,
    1,
    null,
  );
  const rulerPaint = Skia.Paint();
  rulerPaint.setAntiAlias(true);
  rulerPaint.setColor(Skia.Color(hexToRgba(accent, 0.45 * flicker)));

  for (let i = 0; i < 120 * phase; i++) {
    const angle = (i / 120) * 6.283;
    const major = i % 10 === 0;
    drawRadialTick(
      canvas,
      camera,
      zPlane,
      angle,
      ring.radius - (major ? 0.02 : 0.008),
      ring.radius,
      accent,
      (major ? 0.5 : 0.2) * flicker,
    );

    if (i % 30 === 0 && phase >= 1 && rulerFont !== null) {
      const label = String(i * 3).padStart(3, "0");
      const point = projectPolar(angle, ring.radius + 0.03, zPlane, camera);
      canvas.drawText(
        label,
        point.x - rulerFont.getTextWidth(label) / 2,
        point.y + RULER_FONT_SIZE * 0.35,
        rulerPaint,
        rulerFont,
      );
    }
  }
}

/** The six ring layers. */
function drawRingMachinery(
  canvas: SkCanvas,
  camera: Boot3dCamera,
  elapsed: number,
  progress: number,
  flicker: number,
  accent: string,
  accentAlt: string,
  labelFont: SkFont | null,
  rulerFont: SkFont | null,
): void {
  "worklet";

  for (let ringIndex = 0; ringIndex < JARVIS_RINGS.length; ringIndex++) {
    const ring = JARVIS_RINGS[ringIndex];
    const phase = ringPhase(ring, progress);

    if (phase <= 0) {
      continue;
    }

    // Each ring breathes on its own plane — the web's shared mutable
    // `ringZPlane`, recomputed rather than carried.
    const zPlane = ringZPlane(elapsed, ringIndex);
    const sweep = phase * 6.283;

    drawRingLayer(
      canvas,
      camera,
      ring,
      zPlane,
      phase,
      sweep,
      elapsed,
      flicker,
      accent,
      accentAlt,
      labelFont,
      rulerFont,
    );
  }
}

/** The eight radial spoke walkways. */
function drawSpokes(
  canvas: SkCanvas,
  camera: Boot3dCamera,
  elapsed: number,
  progress: number,
  flicker: number,
  accent: string,
): void {
  "worklet";
  const phase = spokesPhase(progress);

  if (phase <= 0) {
    return;
  }

  const zPlane = spokeZPlane(elapsed);
  const rotation = elapsed * 0.03;
  const outerRadius = 0.33 + (0.6 - 0.33) * phase;
  const fill = Skia.Paint();
  fill.setAntiAlias(true);
  fill.setColor(Skia.Color(hexToRgba(accent, 0.06 * flicker)));
  const stroke = Skia.Paint();
  stroke.setStyle(PaintStyle.Stroke);
  stroke.setStrokeWidth(1);
  stroke.setAntiAlias(true);
  stroke.setColor(Skia.Color(hexToRgba(accent, 0.35 * flicker)));

  for (let i = 0; i < 8; i++) {
    const angle = rotation + (i / 8) * 6.283 + 0.3927;
    const corners = [
      projectPolar(angle - 0.03, 0.33, zPlane, camera),
      projectPolar(angle + 0.03, 0.33, zPlane, camera),
      projectPolar(angle + 0.018, outerRadius, zPlane, camera),
      projectPolar(angle - 0.018, outerRadius, zPlane, camera),
    ];
    const path = Skia.Path.Make();
    path.moveTo(corners[0].x, corners[0].y);

    for (const corner of corners) {
      path.lineTo(corner.x, corner.y);
    }

    path.close();
    canvas.drawPath(path, fill);
    canvas.drawPath(path, stroke);
  }
}

/** Map a fragment-local UV coordinate onto the canvas. */
function projectFragmentUv(
  camera: Boot3dCamera,
  fragment: JarvisFragment,
  z: number,
  glitch: number,
  u: number,
  v: number,
): ProjectedBootPoint {
  "worklet";
  return projectBootPoint(
    fragment.baseX + u * fragment.scale + glitch * 0.001,
    fragment.baseY + v * fragment.scale,
    z,
    camera,
  );
}

/** Stroke one segment in fragment-local UV space. */
function strokeFragmentSeg(
  canvas: SkCanvas,
  camera: Boot3dCamera,
  fragment: JarvisFragment,
  z: number,
  glitch: number,
  u0: number,
  v0: number,
  u1: number,
  v1: number,
  color: string,
  alpha: number,
  lineWidth: number,
): void {
  "worklet";
  const a = projectFragmentUv(camera, fragment, z, glitch, u0, v0);
  const b = projectFragmentUv(camera, fragment, z, glitch, u1, v1);
  const paint = Skia.Paint();
  paint.setStyle(PaintStyle.Stroke);
  paint.setStrokeWidth(lineWidth);
  paint.setAntiAlias(true);
  paint.setColor(Skia.Color(hexToRgba(color, alpha)));
  canvas.drawLine(a.x, a.y, b.x, b.y, paint);
}

/** Fragment kind 0 — a data card with rows and corner brackets. */
function drawDataCard(
  canvas: SkCanvas,
  camera: Boot3dCamera,
  fragment: JarvisFragment,
  z: number,
  glitch: number,
  alpha: number,
  accent: string,
  accentAlt: string,
): void {
  "worklet";
  const edges = [
    [-1, -0.7, 1, -0.7],
    [1, -0.7, 1, 0.7],
    [1, 0.7, -1, 0.7],
    [-1, 0.7, -1, -0.7],
  ];

  for (const edge of edges) {
    strokeFragmentSeg(
      canvas,
      camera,
      fragment,
      z,
      glitch,
      edge[0],
      edge[1],
      edge[2],
      edge[3],
      accent,
      alpha,
      1,
    );
  }

  strokeFragmentSeg(
    canvas,
    camera,
    fragment,
    z,
    glitch,
    -1,
    -0.42,
    1,
    -0.42,
    accent,
    alpha * 0.8,
    1,
  );

  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 4; col++) {
      strokeFragmentSeg(
        canvas,
        camera,
        fragment,
        z,
        glitch,
        -0.85 + col * 0.48,
        -0.18 + row * 0.32,
        -0.6 + col * 0.48,
        -0.18 + row * 0.32,
        accent,
        alpha * 0.5,
        2.4,
      );
    }
  }

  // Corner brackets, drawn in screen space off each corner.
  const corners = [
    [-1, -0.7, 1, 1],
    [1, -0.7, -1, 1],
    [-1, 0.7, 1, -1],
    [1, 0.7, -1, -1],
  ];
  const paint = Skia.Paint();
  paint.setStyle(PaintStyle.Stroke);
  paint.setStrokeWidth(1.2);
  paint.setAntiAlias(true);
  paint.setColor(Skia.Color(hexToRgba(accentAlt, alpha)));

  for (const corner of corners) {
    const a = projectFragmentUv(
      camera,
      fragment,
      z,
      glitch,
      corner[0],
      corner[1],
    );
    const path = Skia.Path.Make();
    path.moveTo(a.x, a.y - corner[3] * 5);
    path.lineTo(a.x, a.y);
    path.lineTo(a.x + corner[2] * 5, a.y);
    canvas.drawPath(path, paint);
  }
}

/** Fragment kind 1 — a dial with a sweeping needle arc. */
function drawDial(
  canvas: SkCanvas,
  camera: Boot3dCamera,
  fragment: JarvisFragment,
  z: number,
  glitch: number,
  alpha: number,
  elapsed: number,
  accent: string,
  accentAlt: string,
): void {
  "worklet";
  const rim = Skia.Paint();
  rim.setStyle(PaintStyle.Stroke);
  rim.setStrokeWidth(1);
  rim.setAntiAlias(true);
  rim.setColor(Skia.Color(hexToRgba(accent, alpha)));
  const path = Skia.Path.Make();

  for (let step = 0; step <= 24; step++) {
    const point = projectFragmentUv(
      camera,
      fragment,
      z,
      glitch,
      Math.cos((step / 24) * 6.283),
      Math.sin((step / 24) * 6.283),
    );

    if (step === 0) {
      path.moveTo(point.x, point.y);
    } else {
      path.lineTo(point.x, point.y);
    }
  }

  canvas.drawPath(path, rim);
  strokeFragmentSeg(
    canvas,
    camera,
    fragment,
    z,
    glitch,
    -1,
    0,
    1,
    0,
    accent,
    alpha * 0.6,
    1,
  );
  strokeFragmentSeg(
    canvas,
    camera,
    fragment,
    z,
    glitch,
    0,
    -1,
    0,
    1,
    accent,
    alpha * 0.6,
    1,
  );

  const needle = Skia.Paint();
  needle.setStyle(PaintStyle.Stroke);
  needle.setStrokeWidth(2);
  needle.setAntiAlias(true);
  needle.setColor(Skia.Color(hexToRgba(accentAlt, alpha)));
  const needlePath = Skia.Path.Make();

  for (let step = 0; step <= 8; step++) {
    const angle = elapsed * 1.2 + fragment.phase + (step / 8) * 1.4;
    const point = projectFragmentUv(
      camera,
      fragment,
      z,
      glitch,
      Math.cos(angle) * 0.8,
      Math.sin(angle) * 0.8,
    );

    if (step === 0) {
      needlePath.moveTo(point.x, point.y);
    } else {
      needlePath.lineTo(point.x, point.y);
    }
  }

  canvas.drawPath(needlePath, needle);
}

/** Fragment kind 2 — a hex cluster with one live pulsing node. */
function drawHexCluster(
  canvas: SkCanvas,
  camera: Boot3dCamera,
  fragment: JarvisFragment,
  z: number,
  glitch: number,
  alpha: number,
  elapsed: number,
  accent: string,
  positive: string,
): void {
  "worklet";
  const centres = [
    [0, 0],
    [0.95, 0.55],
    [0.95, -0.55],
    [-0.95, 0.55],
    [0, 1.1],
  ];

  for (let hexIndex = 0; hexIndex < centres.length; hexIndex++) {
    const centre = centres[hexIndex];
    const path = Skia.Path.Make();

    for (let step = 0; step <= 6; step++) {
      const angle = (step / 6) * 6.283 + 0.5236;
      const point = projectFragmentUv(
        camera,
        fragment,
        z,
        glitch,
        centre[0] + Math.cos(angle) * 0.55,
        centre[1] + Math.sin(angle) * 0.55,
      );

      if (step === 0) {
        path.moveTo(point.x, point.y);
      } else {
        path.lineTo(point.x, point.y);
      }
    }

    // The second hex is the "live" node — filled and pulsing.
    const live = hexIndex === 1;

    if (live) {
      const fill = Skia.Paint();
      fill.setAntiAlias(true);
      fill.setColor(
        Skia.Color(
          hexToRgba(
            positive,
            alpha * (0.35 + 0.25 * Math.sin(elapsed * 2.5 + fragment.phase)),
          ),
        ),
      );
      canvas.drawPath(path, fill);
    }

    const stroke = Skia.Paint();
    stroke.setStyle(PaintStyle.Stroke);
    stroke.setStrokeWidth(1);
    stroke.setAntiAlias(true);
    stroke.setColor(Skia.Color(hexToRgba(live ? positive : accent, alpha)));
    canvas.drawPath(path, stroke);
  }
}

/** Fragment kind 3 — a vertical meter with a moving level. */
function drawMeter(
  canvas: SkCanvas,
  camera: Boot3dCamera,
  fragment: JarvisFragment,
  z: number,
  glitch: number,
  alpha: number,
  elapsed: number,
  accent: string,
  accentAlt: string,
): void {
  "worklet";
  const edges = [
    [-0.45, -1, 0.45, -1],
    [0.45, -1, 0.45, 1],
    [0.45, 1, -0.45, 1],
    [-0.45, 1, -0.45, -1],
  ];

  for (const edge of edges) {
    strokeFragmentSeg(
      canvas,
      camera,
      fragment,
      z,
      glitch,
      edge[0],
      edge[1],
      edge[2],
      edge[3],
      accent,
      alpha,
      1,
    );
  }

  const level = 0.5 + 0.4 * Math.sin(elapsed * 1.1 + fragment.phase);
  const path = Skia.Path.Make();
  const a = projectFragmentUv(
    camera,
    fragment,
    z,
    glitch,
    -0.32,
    1 - level * 1.7,
  );

  const b = projectFragmentUv(
    camera,
    fragment,
    z,
    glitch,
    0.32,
    1 - level * 1.7,
  );

  const bottomRight = projectFragmentUv(
    camera,
    fragment,
    z,
    glitch,
    0.32,
    0.85,
  );

  const bottomLeft = projectFragmentUv(
    camera,
    fragment,
    z,
    glitch,
    -0.32,
    0.85,
  );
  path.moveTo(a.x, a.y);
  path.lineTo(b.x, b.y);
  path.lineTo(bottomRight.x, bottomRight.y);
  path.lineTo(bottomLeft.x, bottomLeft.y);
  path.close();
  const fill = Skia.Paint();
  fill.setAntiAlias(true);
  fill.setColor(Skia.Color(hexToRgba(accentAlt, alpha * 0.4)));
  canvas.drawPath(path, fill);

  for (let i = 0; i < 4; i++) {
    strokeFragmentSeg(
      canvas,
      camera,
      fragment,
      z,
      glitch,
      0.45,
      -0.8 + i * 0.5,
      0.62,
      -0.8 + i * 0.5,
      accent,
      alpha * 0.5,
      1,
    );
  }
}

/** Fragment kind 4 — a waveform between two rails. */
function drawWaveform(
  canvas: SkCanvas,
  camera: Boot3dCamera,
  fragment: JarvisFragment,
  z: number,
  glitch: number,
  alpha: number,
  elapsed: number,
  accent: string,
  accentAlt: string,
): void {
  "worklet";
  const rails = [
    [-1.1, -0.55, 1.1, -0.55],
    [-1.1, 0.55, 1.1, 0.55],
  ];

  for (const rail of rails) {
    strokeFragmentSeg(
      canvas,
      camera,
      fragment,
      z,
      glitch,
      rail[0],
      rail[1],
      rail[2],
      rail[3],
      accent,
      alpha * 0.5,
      1,
    );
  }

  const paint = Skia.Paint();
  paint.setStyle(PaintStyle.Stroke);
  paint.setStrokeWidth(1.3);
  paint.setAntiAlias(true);
  paint.setColor(Skia.Color(hexToRgba(accentAlt, alpha)));
  const path = Skia.Path.Make();

  for (let step = 0; step <= 16; step++) {
    const u = -1 + step / 8;
    const point = projectFragmentUv(
      camera,
      fragment,
      z,
      glitch,
      u,
      Math.sin(u * 4 + elapsed * 2 + fragment.phase) * 0.38,
    );

    if (step === 0) {
      path.moveTo(point.x, point.y);
    } else {
      path.lineTo(point.x, point.y);
    }
  }

  canvas.drawPath(path, paint);
}

/** One fragment's card art, dispatched on its kind. */
function drawFragmentCard(
  canvas: SkCanvas,
  camera: Boot3dCamera,
  fragment: JarvisFragment,
  z: number,
  glitch: number,
  alpha: number,
  elapsed: number,
  accent: string,
  accentAlt: string,
  positive: string,
): void {
  "worklet";

  if (fragment.kind === 0) {
    drawDataCard(canvas, camera, fragment, z, glitch, alpha, accent, accentAlt);
    return;
  }

  if (fragment.kind === 1) {
    drawDial(
      canvas,
      camera,
      fragment,
      z,
      glitch,
      alpha,
      elapsed,
      accent,
      accentAlt,
    );
    return;
  }

  if (fragment.kind === 2) {
    drawHexCluster(
      canvas,
      camera,
      fragment,
      z,
      glitch,
      alpha,
      elapsed,
      accent,
      positive,
    );
    return;
  }

  if (fragment.kind === 3) {
    drawMeter(
      canvas,
      camera,
      fragment,
      z,
      glitch,
      alpha,
      elapsed,
      accent,
      accentAlt,
    );
    return;
  }

  drawWaveform(
    canvas,
    camera,
    fragment,
    z,
    glitch,
    alpha,
    elapsed,
    accent,
    accentAlt,
  );
}

/** The fourteen blueprint fragments. */
function drawFragments(
  canvas: SkCanvas,
  camera: Boot3dCamera,
  fragments: readonly JarvisFragment[],
  elapsed: number,
  progress: number,
  flicker: number,
  accent: string,
  accentAlt: string,
  positive: string,
  labelFont: SkFont | null,
): void {
  "worklet";

  for (let index = 0; index < fragments.length; index++) {
    const fragment = fragments[index];
    const reveal = fragmentRevealPhase(fragment, progress);

    if (reveal <= 0) {
      continue;
    }

    const z = fragmentZ(fragment, index, elapsed, progress);
    const glitch = fragmentGlitch(index, reveal, elapsed);
    const lunging = fragmentIsLunging(index, elapsed, progress);
    const alpha = fragmentAlpha(z, reveal, lunging, elapsed) * flicker;

    // Leader back to the outer ring.
    const anchor = projectPolar(fragment.angle, 0.95, 0, camera);
    const origin = projectFragmentUv(camera, fragment, z, glitch, 0, 0);
    const leaderPaint = Skia.Paint();
    leaderPaint.setStyle(PaintStyle.Stroke);
    leaderPaint.setStrokeWidth(1);
    leaderPaint.setAntiAlias(true);
    leaderPaint.setColor(Skia.Color(hexToRgba(accent, 0.1 * reveal * flicker)));
    const leader = Skia.Path.Make();
    leader.moveTo(anchor.x, anchor.y);
    leader.lineTo((anchor.x + origin.x) / 2, origin.y);
    leader.lineTo(origin.x, origin.y);
    canvas.drawPath(leader, leaderPaint);

    drawFragmentCard(
      canvas,
      camera,
      fragment,
      z,
      glitch,
      alpha,
      elapsed,
      accent,
      accentAlt,
      positive,
    );

    if (reveal >= 1 && labelFont !== null) {
      const label = fragmentLabel(fragment, z);
      const point = projectFragmentUv(camera, fragment, z, glitch, 0, 1.5);
      const paint = Skia.Paint();
      paint.setAntiAlias(true);
      paint.setColor(Skia.Color(hexToRgba(accent, 0.5 * flicker)));
      canvas.drawText(
        label,
        point.x - labelFont.getTextWidth(label) / 2,
        point.y + RULER_FONT_SIZE * 0.35,
        paint,
        labelFont,
      );
    }
  }
}

/**
 * Faint links between every third fragment and one five along.
 *
 * Reads `fragmentZ` for BOTH endpoints regardless of reveal state, matching the
 * web — which reads the `currentZ` written during the fragment pass, including
 * the `baseZ` reset for fragments that have not revealed.
 */
function drawCrossLinks(
  canvas: SkCanvas,
  camera: Boot3dCamera,
  fragments: readonly JarvisFragment[],
  elapsed: number,
  progress: number,
  flicker: number,
  accent: string,
): void {
  "worklet";

  if (progress <= 0.6) {
    return;
  }

  const phase = crossLinkPhase(progress);
  const paint = Skia.Paint();
  paint.setStyle(PaintStyle.Stroke);
  paint.setStrokeWidth(1);
  paint.setAntiAlias(true);
  paint.setColor(Skia.Color(hexToRgba(accent, 0.07 * phase * flicker)));

  for (let i = 0; i < fragments.length; i += 3) {
    const otherIndex = (i + 5) % 14;
    const from = fragments[i];
    const to = fragments[otherIndex];
    const a = projectBootPoint(
      from.baseX,
      from.baseY,
      fragmentZ(from, i, elapsed, progress),
      camera,
    );

    const b = projectBootPoint(
      to.baseX,
      to.baseY,
      fragmentZ(to, otherIndex, elapsed, progress),
      camera,
    );
    canvas.drawLine(a.x, a.y, b.x, b.y, paint);
  }
}

/** The drifting dust particles. */
function drawParticles(
  canvas: SkCanvas,
  camera: Boot3dCamera,
  particles: readonly JarvisParticle[],
  elapsed: number,
  flicker: number,
  accent: string,
): void {
  "worklet";
  const paint = Skia.Paint();
  paint.setAntiAlias(false);

  for (const particle of particles) {
    const point = projectBootPoint(
      particle.x,
      particleDriftY(particle, elapsed),
      particle.z,
      camera,
    );
    paint.setColor(
      Skia.Color(hexToRgba(accent, particleAlpha(particle, elapsed) * flicker)),
    );
    canvas.drawRect({ x: point.x, y: point.y, width: 1.4, height: 1.4 }, paint);
  }
}

/** Corner telemetry: two left-aligned readouts, two right-aligned. */
function drawTelemetry(
  canvas: SkCanvas,
  width: number,
  shownCount: number,
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

  const telemetry = jarvisTelemetry(shownCount, yaw, pitch);
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
    telemetry.elements,
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
  font: SkFont | null,
): void {
  "worklet";

  if (font === null) {
    return;
  }

  const status = jarvisStatus(progress);
  const blink = jarvisBlinkAlpha(progress, elapsed);
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
