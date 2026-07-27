import type { ReactElement } from "react";

import type { NavigatorVm } from "@rtc/motion-core";

import type { NavigatorStripProps as BrushProps } from "./useNavigatorBrush";

import styles from "./NavigatorStrip.module.css";

/**
 * The chart navigator (mini-map / range brush): the full candle history as
 * one dimmed polyline with a shaded, draggable window marking exactly where
 * the plot's viewport sits. Pure presentational leaf — the vm owns every
 * number (motion-core `navigatorVm`), the brush hook owns every gesture;
 * omitting `brushProps` yields a static mount (the visual tier's
 * forced-state wrappers). Renders nothing for an empty series (the
 * react-rxjs placeholder before the first candle emission).
 */
export function NavigatorStrip({
  nav,
  brushProps,
}: NavigatorStripComponentProps): ReactElement | null {
  if (nav.linePoints.length === 0) {
    return null;
  }

  const pointsAttr = nav.linePoints
    .map((p) => {
      return `${p.x},${p.y}`;
    })
    .join(" ");

  return (
    <div
      className={styles.strip}
      data-testid="chart-navigator"
      role="group"
      aria-label="Chart navigator"
      {...brushProps}
    >
      <svg
        className={styles.mini}
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <polyline className={styles.line} fill="none" points={pointsAttr} />
      </svg>
      <div className={styles.overlay} style={nav.windowStyle}>
        <div className={styles.window} data-testid="navigator-window" />
        <div
          className={`${styles.handle} ${styles.handleStart}`}
          data-nav-edge="start"
          data-testid="navigator-handle-left"
        />
        <div
          className={`${styles.handle} ${styles.handleEnd}`}
          data-nav-edge="end"
          data-testid="navigator-handle-right"
        />
      </div>
    </div>
  );
}

export interface NavigatorStripComponentProps {
  readonly nav: NavigatorVm;
  /** Omit for a static/brush-free mount — see the component doc above. */
  readonly brushProps?: BrushProps;
}
