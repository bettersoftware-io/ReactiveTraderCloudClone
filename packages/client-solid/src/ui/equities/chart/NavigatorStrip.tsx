import { type JSX, Show } from "solid-js";

import type { NavigatorVm } from "@rtc/motion-core";

import type { NavigatorStripProps as BrushProps } from "./createNavigatorBrush";

import styles from "./NavigatorStrip.module.css";

/**
 * The chart navigator (mini-map / range brush): the full candle history as
 * one dimmed polyline with a shaded, draggable window marking exactly where
 * the plot's viewport sits. Pure presentational leaf — the vm owns every
 * number (motion-core `navigatorVm`), the brush primitive owns every
 * gesture; omitting `brushProps` yields a static mount (the visual tier's
 * forced-state wrappers). Renders nothing for an empty series (the
 * solid-bindings placeholder before the first candle emission).
 */
export function NavigatorStrip(
  props: NavigatorStripComponentProps,
): JSX.Element {
  const pointsAttr = (): string => {
    return props.nav.linePoints
      .map((p) => {
        return `${p.x},${p.y}`;
      })
      .join(" ");
  };

  return (
    <Show when={props.nav.linePoints.length > 0}>
      <div
        class={styles.strip}
        data-testid="chart-navigator"
        role="group"
        aria-label="Chart navigator"
        // eslint-disable-next-line solid/reactivity -- native event-handler binding of a props callback is a live reference in Solid JSX
        onPointerDown={props.brushProps?.onPointerDown}
        // eslint-disable-next-line solid/reactivity -- native event-handler binding of a props callback is a live reference in Solid JSX
        onPointerMove={props.brushProps?.onPointerMove}
        // eslint-disable-next-line solid/reactivity -- native event-handler binding of a props callback is a live reference in Solid JSX
        onPointerUp={props.brushProps?.onPointerUp}
        // eslint-disable-next-line solid/reactivity -- native event-handler binding of a props callback is a live reference in Solid JSX
        onPointerCancel={props.brushProps?.onPointerCancel}
      >
        <svg
          class={styles.mini}
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <polyline class={styles.line} fill="none" points={pointsAttr()} />
        </svg>
        <div class={styles.overlay} style={props.nav.windowStyle}>
          <div class={styles.window} data-testid="navigator-window" />
          <div
            class={`${styles.handle} ${styles.handleStart}`}
            data-nav-edge="start"
            data-testid="navigator-handle-left"
          />
          <div
            class={`${styles.handle} ${styles.handleEnd}`}
            data-nav-edge="end"
            data-testid="navigator-handle-right"
          />
        </div>
      </div>
    </Show>
  );
}

export interface NavigatorStripComponentProps {
  readonly nav: NavigatorVm;
  /** Omit for a static/brush-free mount — see the component doc above. */
  readonly brushProps?: BrushProps;
}
