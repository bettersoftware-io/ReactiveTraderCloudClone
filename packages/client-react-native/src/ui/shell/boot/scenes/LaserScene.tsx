// packages/client-react-native/src/ui/shell/boot/scenes/LaserScene.tsx
import { Group, Path, Rect } from "@shopify/react-native-skia";
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
  LASER_GRID_ALPHA,
  LASER_PANELS,
  LASER_WASH,
  type LaserPanel,
  panelFlashAlpha,
  panelRectPx,
  panelRevealFraction,
  rectTracePath,
} from "#/ui/shell/boot/scenes/laserGeometry";

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
 * (phase 6b-1) adds the background HUD grid + translucent wash (built once
 * in a `useMemo` keyed on `width`/`height` — its shape never changes, per
 * docs/performance.md), the post-trace flash, and the completion corner
 * ticks. Still deferred — see `laserGeometry.ts`'s header comment: per-kind
 * panel content (Task 6), the laser draw-head, and the per-panel border-
 * stroke glow.
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

/** One panel's traced rectangle outline, post-trace flash and completion
 * corner ticks. The pixel-space rectangle and the two SVG path strings
 * depend only on `panel`/`width`/`height` (component props, static for the
 * scene's lifetime) so they're plain per-render values, not worklets; only
 * the trace fraction, flash and tick opacities depend on `elapsedSec` and so
 * are the only pieces driven through `useDerivedValue`. */
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

  return (
    <Group>
      <Path {...pathProps} />
      <Rect {...flashProps} />
      <Path {...tickProps} />
    </Group>
  );
}
