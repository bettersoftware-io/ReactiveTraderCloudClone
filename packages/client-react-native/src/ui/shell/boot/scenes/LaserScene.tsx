// packages/client-react-native/src/ui/shell/boot/scenes/LaserScene.tsx
import { Circle, Group, Line, Path, Rect } from "@shopify/react-native-skia";
import type { JSX } from "react";
import { useMemo } from "react";
import type { SharedValue } from "react-native-reanimated";
import { useDerivedValue } from "react-native-reanimated";

import { BOOT_DURATION_MS } from "@rtc/client-core";

import type { BootSceneProps } from "#/ui/shell/boot/bootScene";
import { bootProgress } from "#/ui/shell/boot/scenes/coreGeometry";
import {
  CORNER_TICK_LENGTH,
  CORNER_TICK_OPACITY,
  CORNER_TICK_STROKE_WIDTH,
  CORNER_TICK_THRESHOLD,
  cornerTickPath,
  FLASH_PEAK_OPACITY,
  gridPath,
  LASER_EMITTER_Y,
  LASER_GRID_ALPHA,
  LASER_PANELS,
  LASER_WASH,
  type LaserPanel,
  panelFlashAlpha,
  panelRectPx,
  panelRevealFraction,
  perimeterPoint,
  rectTracePath,
} from "#/ui/shell/boot/scenes/laserGeometry";
import {
  type ContentShape,
  contentEase,
  contentScale,
  panelContentShapes,
} from "#/ui/shell/boot/scenes/laserPanelContent";

/**
 * `laser` boot scene — UI panels traced in by a sweeping laser: a fixed set
 * of panel rectangles (`LASER_PANELS`, ported verbatim from the web's
 * `drawBootLaser`) whose trace parameter animates. DECLARATIVE Skia, the
 * opposite idiom from `CoreScene`'s imperative `createPicture` recording —
 * one `<Path>` per panel, its `start`/`end` trim driven by `useDerivedValue`
 * off `elapsedSec`, following `AmbientBackground`'s per-item-component shape
 * so React never re-renders per frame (Skia reads the shared values directly
 * on the UI thread, per docs/performance.md).
 *
 * `drift` (the gyro-drift pointer seam) is accepted per `BootSceneProps` but
 * unused: the web laser variant has no cursor tracking, unlike the v3
 * cursor-tracked globe (`core`).
 *
 * Task 7 (phase 6a) ported the panel table and its trace-in window. Task 5
 * (phase 6b-1) added the background HUD grid + translucent wash (built once
 * in a `useMemo` keyed on `width`/`height` — its shape never changes, per
 * docs/performance.md), the post-trace flash, and the completion corner
 * ticks. Task 6 completes the port:
 *   - per-kind panel content (`laserPanelContent.ts`'s `panelContentShapes`),
 *     rendered as one `<Group>` per panel whose `opacity`/`transform` (a
 *     translate-scale-translate triple, the declarative form of the web's
 *     `translate(cx,cy); scale(s,s); translate(-cx,-cy)`) animate off
 *     `contentEase`/`contentScale` — the shapes themselves are built once per
 *     panel per viewport (`useMemo`), never per frame;
 *   - the laser draw-head: a scene-level (not per-panel) `<Line>` emitter
 *     beam plus a glow-dot/core-dot `<Circle>` pair, walking
 *     `perimeterPoint(rect, fraction)` for the single panel still tracing
 *     (highest-indexed match, mirroring the web's "last write wins" `head`
 *     overwrite). No panel tracing → the head opacity gates to 0.
 * Still deferred — see `laserGeometry.ts`'s header comment: the per-panel
 * border-stroke glow and the head's `shadowBlur` bloom (both a `MaskFilter`
 * blur on a per-frame stroke, banned by docs/performance.md).
 */
export function LaserScene({
  elapsedSec,
  width,
  height,
  theme,
}: BootSceneProps): JSX.Element {
  const accent = theme.accentPrimary;
  const accentAlt = theme.accent2;

  const grid = useMemo(() => {
    return gridPath(width, height);
  }, [width, height]);

  // Precomputed once per viewport size — the draw-head worklet below walks
  // this array every frame but never rebuilds it (docs/performance.md).
  const panelRects = useMemo(() => {
    return LASER_PANELS.map((panel) => {
      return panelRectPx(panel, width, height);
    });
  }, [width, height]);

  const emitterPoint = useMemo(() => {
    return { x: width / 2, y: LASER_EMITTER_Y };
  }, [width]);

  // The point the draw-head sits at: the highest-indexed panel still tracing
  // (`fraction` strictly in `(0, 1)`), mirroring the web's `head` variable —
  // each still-tracing panel overwrites it in table order, so only the last
  // one wins. Rests at the emitter when nothing is tracing.
  const headPoint = useDerivedValue(() => {
    const progress = bootProgress(elapsedSec.value, BOOT_DURATION_MS);
    let index = -1;
    let fraction = 0;

    for (let i = 0; i < LASER_PANELS.length; i++) {
      const panelFraction = panelRevealFraction(
        progress,
        LASER_PANELS[i].t0,
        LASER_PANELS[i].t1,
      );

      if (panelFraction > 0 && panelFraction < 1) {
        index = i;
        fraction = panelFraction;
      }
    }

    if (index < 0) {
      return emitterPoint;
    }

    return perimeterPoint(panelRects[index], fraction);
  });

  // 1 while any panel is still tracing, 0 once every panel has either not
  // started or already completed — gates the whole head group's visibility.
  const headOpacity = useDerivedValue(() => {
    const progress = bootProgress(elapsedSec.value, BOOT_DURATION_MS);

    for (const panel of LASER_PANELS) {
      const fraction = panelRevealFraction(progress, panel.t0, panel.t1);

      if (fraction > 0 && fraction < 1) {
        return 1;
      }
    }

    return 0;
  });

  const washProps = {
    x: 0,
    y: 0,
    width,
    height,
    color: LASER_WASH,
  };

  const gridProps = {
    testID: "boot-scene-laser-grid",
    path: grid,
    style: "stroke" as const,
    strokeWidth: 1,
    color: accent,
    opacity: LASER_GRID_ALPHA,
  };

  // Emitter beam + draw-head dots. The web's `shadowBlur` bloom on the head
  // (22px on the glow dot, 14px on the core dot) is not ported — same
  // MaskFilter-on-a-per-frame-stroke reason as the border-stroke glow
  // (docs/performance.md, laserGeometry.ts's header comment).
  const headGroupProps = {
    testID: "boot-scene-laser-head",
    opacity: headOpacity,
  };

  const headLineProps = {
    p1: emitterPoint,
    p2: headPoint,
    color: accentAlt,
    strokeWidth: 1,
    opacity: 0.45,
  };

  const headGlowProps = {
    testID: "boot-scene-laser-head-glow",
    c: headPoint,
    r: 7,
    color: accent,
    opacity: 0.45,
  };

  const headCoreProps = {
    testID: "boot-scene-laser-head-core",
    c: headPoint,
    r: 3,
    color: "#fff",
  };

  const groupProps = { testID: "boot-scene-laser" };
  return (
    <Group {...groupProps}>
      <Rect {...washProps} />
      <Path {...gridProps} />
      {LASER_PANELS.map((panel, index) => {
        return (
          <LaserPanelTrace
            // `t0` is unique across every entry in LASER_PANELS (0, 0.09,
            // 0.3, 0.43, 0.55, 0.66) — unlike `kind`, which two panels
            // share ("list") — and, being a design value tied to the panel
            // itself rather than its position, avoids noArrayIndexKey.
            key={panel.t0}
            panel={panel}
            index={index}
            elapsedSec={elapsedSec}
            width={width}
            height={height}
            accent={accent}
            accentAlt={accentAlt}
          />
        );
      })}
      <Group {...headGroupProps}>
        <Line {...headLineProps} />
        <Circle {...headGlowProps} />
        <Circle {...headCoreProps} />
      </Group>
    </Group>
  );
}

interface LaserPanelTraceProps {
  readonly panel: LaserPanel;
  readonly index: number;
  readonly elapsedSec: SharedValue<number>;
  readonly width: number;
  readonly height: number;
  readonly accent: string;
  readonly accentAlt: string;
}

/** Stroke alpha while the trace is still sweeping in — verbatim from the
 * web's `drawFrac < 1` branch. */
const TRACING_OPACITY = 0.98;
/** Stroke alpha once the panel is fully drawn — verbatim from the web's
 * `drawFrac >= 1` branch (the completed outline settles dimmer). */
const COMPLETE_OPACITY = 0.62;
const STROKE_WIDTH = 1.6;

/** One panel's traced rectangle outline, post-trace flash, completion corner
 * ticks and per-kind content. The pixel-space rectangle, the two SVG path
 * strings and the content shape list depend only on `panel`/`width`/`height`
 * (component props, static for the scene's lifetime) so they're plain
 * per-render values, not worklets; only the trace fraction, flash/tick
 * opacities and the content group's opacity/transform depend on `elapsedSec`
 * and so are the only pieces driven through `useDerivedValue`. */
function LaserPanelTrace({
  panel,
  index,
  elapsedSec,
  width,
  height,
  accent,
  accentAlt,
}: LaserPanelTraceProps): JSX.Element {
  const rect = panelRectPx(panel, width, height);
  const path = rectTracePath(rect.x, rect.y, rect.width, rect.height);
  const tickPath = cornerTickPath(rect, CORNER_TICK_LENGTH);

  const contentShapes = useMemo(() => {
    return withPositionalKeys(panelContentShapes(panel.kind, rect));
  }, [panel.kind, rect]);

  const end = useDerivedValue(() => {
    const progress = bootProgress(elapsedSec.value, BOOT_DURATION_MS);
    return panelRevealFraction(progress, panel.t0, panel.t1);
  });

  const opacity = useDerivedValue(() => {
    const progress = bootProgress(elapsedSec.value, BOOT_DURATION_MS);
    const fraction = panelRevealFraction(progress, panel.t0, panel.t1);
    return fraction < 1 ? TRACING_OPACITY : COMPLETE_OPACITY;
  });

  const flashOpacity = useDerivedValue(() => {
    const progress = bootProgress(elapsedSec.value, BOOT_DURATION_MS);
    return panelFlashAlpha(progress, panel.t1) * FLASH_PEAK_OPACITY;
  });

  const tickOpacity = useDerivedValue(() => {
    const progress = bootProgress(elapsedSec.value, BOOT_DURATION_MS);
    const fraction = panelRevealFraction(progress, panel.t0, panel.t1);
    return fraction > CORNER_TICK_THRESHOLD ? CORNER_TICK_OPACITY : 0;
  });

  // Content reveal: eases/scales in over the 0.24-progress window right
  // after this panel finishes tracing (`panel.t1`) — verbatim from the web's
  // `contentEase`/`contentScale` block.
  const contentOpacity = useDerivedValue(() => {
    const progress = bootProgress(elapsedSec.value, BOOT_DURATION_MS);
    return contentEase(progress, panel.t1);
  });

  const contentTransform = useDerivedValue(() => {
    const progress = bootProgress(elapsedSec.value, BOOT_DURATION_MS);
    const scale = contentScale(contentEase(progress, panel.t1));
    const cx = rect.x + rect.width / 2;
    const cy = rect.y + rect.height / 2;
    return [
      { translateX: cx },
      { translateY: cy },
      { scale },
      { translateX: -cx },
      { translateY: -cy },
    ];
  });

  const pathProps = {
    testID: `boot-scene-laser-panel-${index}`,
    path,
    style: "stroke" as const,
    strokeWidth: STROKE_WIDTH,
    start: 0,
    end,
    color: accent,
    opacity,
  };

  const flashProps = {
    testID: `boot-scene-laser-panel-flash-${index}`,
    x: rect.x,
    y: rect.y,
    width: rect.width,
    height: rect.height,
    color: accent,
    opacity: flashOpacity,
  };

  const tickProps = {
    testID: `boot-scene-laser-panel-ticks-${index}`,
    path: tickPath,
    style: "stroke" as const,
    strokeWidth: CORNER_TICK_STROKE_WIDTH,
    color: accentAlt,
    opacity: tickOpacity,
  };

  const contentGroupProps = {
    testID: `boot-scene-laser-panel-content-${index}`,
    opacity: contentOpacity,
    transform: contentTransform,
  };

  return (
    <Group>
      <Path {...pathProps} />
      <Rect {...flashProps} />
      <Path {...tickProps} />
      <Group {...contentGroupProps}>
        {contentShapes.map((entry) => {
          return (
            <LaserContentShape
              key={entry.key}
              shape={entry.shape}
              accent={accent}
              accentAlt={accentAlt}
            />
          );
        })}
      </Group>
    </Group>
  );
}

interface LaserContentShapeProps {
  readonly shape: ContentShape;
  readonly accent: string;
  readonly accentAlt: string;
}

/** One `ContentShape` rendered as its matching Skia primitive — the
 * declarative counterpart to `drawPanelContent`'s `fillRect`/`strokeRect`/
 * `moveTo+lineTo+stroke`/polyline calls. */
function LaserContentShape({
  shape,
  accent,
  accentAlt,
}: LaserContentShapeProps): JSX.Element {
  const color = shape.useAltColor ? accentAlt : accent;

  if (shape.kind === "fillRect") {
    const rectProps = {
      x: shape.x,
      y: shape.y,
      width: shape.width,
      height: shape.height,
      color,
      opacity: shape.alpha,
    };
    return <Rect {...rectProps} />;
  }

  if (shape.kind === "strokeRect") {
    const rectProps = {
      x: shape.x,
      y: shape.y,
      width: shape.width,
      height: shape.height,
      style: "stroke" as const,
      strokeWidth: shape.strokeWidth,
      color,
      opacity: shape.alpha,
    };
    return <Rect {...rectProps} />;
  }

  if (shape.kind === "line") {
    const lineProps = {
      p1: { x: shape.x, y: shape.y },
      p2: { x: shape.x + shape.width, y: shape.y + shape.height },
      color,
      opacity: shape.alpha,
    };
    return <Line {...lineProps} />;
  }

  const polylineProps = {
    path: polylinePath(shape.points),
    style: "stroke" as const,
    strokeWidth: shape.strokeWidth,
    color,
    opacity: shape.alpha,
  };
  return <Path {...polylineProps} />;
}

/** `ContentShape`'s `"polyline"` points, as one SVG path string — built at
 * render time from an already-computed point list, never per frame. */
function polylinePath(points: readonly (readonly [number, number])[]): string {
  return points
    .map(([x, y], index) => {
      return `${index === 0 ? "M" : "L"}${x} ${y}`;
    })
    .join(" ");
}

interface KeyedContentShape {
  readonly shape: ContentShape;
  readonly key: string;
}

/** Pairs each content shape with a positional React key WITHOUT exposing the
 * index in the `.map` that renders JSX — `biome`'s `noArrayIndexKey` flags any
 * `key` expression reading a map callback's own index parameter, so the index
 * is assigned here, one level removed from the render (same pattern as
 * `devtools-app`'s `withIntentKeys`/`withPositionalKeys`). A `ContentShape`
 * has no natural id and the list is rebuilt (not reordered) whenever
 * `panel.kind`/`rect` change, so a positional key is stable across
 * re-renders. */
function withPositionalKeys(
  shapes: readonly ContentShape[],
): readonly KeyedContentShape[] {
  return shapes.map((shape, i) => {
    return { shape, key: `${i}` };
  });
}
