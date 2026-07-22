// packages/client-react-native/src/ui/shell/boot/scenes/LaserScene.tsx
import { Group, Path } from "@shopify/react-native-skia";
import type { JSX } from "react";
import type { SharedValue } from "react-native-reanimated";
import { useDerivedValue } from "react-native-reanimated";

import { BOOT_DURATION_MS } from "@rtc/client-core";

import type { BootSceneProps } from "#/ui/shell/boot/bootScene";
import { bootProgress } from "#/ui/shell/boot/scenes/coreGeometry";
import {
  LASER_PANELS,
  type LaserPanel,
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
 * Task 7 (phase 6a) ports the panel table and its trace-in window only — see
 * `laserGeometry.ts`'s header comment for what's deferred (per-kind panel
 * content, completion corner-ticks, post-trace flash, the laser draw-head,
 * background grid+wash), same "port a slice, document the rest" discipline
 * Task 6 used for `CoreScene`.
 */
export function LaserScene({
  elapsedSec,
  width,
  height,
  theme,
}: BootSceneProps): JSX.Element {
  const accent = theme.accentPrimary;

  const groupProps = { testID: "boot-scene-laser" };
  return (
    <Group {...groupProps}>
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
}

/** Stroke alpha while the trace is still sweeping in — verbatim from the
 * web's `drawFrac < 1` branch. */
const TRACING_OPACITY = 0.98;
/** Stroke alpha once the panel is fully drawn — verbatim from the web's
 * `drawFrac >= 1` branch (the completed outline settles dimmer). */
const COMPLETE_OPACITY = 0.62;
const STROKE_WIDTH = 1.6;

/** One panel's traced rectangle outline. The pixel-space rectangle and its
 * SVG path string depend only on `panel`/`width`/`height` (component props,
 * static for the scene's lifetime) so they're plain per-render values, not
 * worklets; only the trace fraction depends on `elapsedSec` and so is the
 * only piece driven through `useDerivedValue`. */
function LaserPanelTrace({
  panel,
  index,
  elapsedSec,
  width,
  height,
  accent,
}: LaserPanelTraceProps): JSX.Element {
  const path = rectTracePath(
    panel.nx * width,
    panel.ny * height,
    panel.nw * width,
    panel.nh * height,
  );

  const end = useDerivedValue(() => {
    const progress = bootProgress(elapsedSec.value, BOOT_DURATION_MS);
    return panelRevealFraction(progress, panel.t0, panel.t1);
  });

  const opacity = useDerivedValue(() => {
    const progress = bootProgress(elapsedSec.value, BOOT_DURATION_MS);
    const fraction = panelRevealFraction(progress, panel.t0, panel.t1);
    return fraction < 1 ? TRACING_OPACITY : COMPLETE_OPACITY;
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

  return <Path {...pathProps} />;
}
