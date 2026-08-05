import { Fragment, type ReactElement } from "react";

import type { DrawingSceneItem } from "@rtc/motion-core";

import styles from "./DrawingsLayer.module.css";

/**
 * The plot's chart-annotations overlay: trendlines and horizontal levels,
 * pre-projected into plot-percent geometry by `@rtc/motion-core`'s
 * `drawingScene` (vm owns numbers, shell owns markup — the same split as
 * `SvgPathLayer`). Renders `null` when there's nothing to draw rather than
 * an empty `<svg>`, so an inert chart never grows an extra layer node.
 * `pointer-events: none` (module css) keeps the layer out of the plot's own
 * hit-testing — gesture code (Task 5+) hit-tests `hitTestDrawings` against
 * pointer coordinates directly, never against this DOM.
 */
export function DrawingsLayer({
  items,
}: DrawingsLayerProps): ReactElement | null {
  if (items.length === 0) {
    return null;
  }

  return (
    <svg
      className={styles.layer}
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      {items.map((item) => {
        const [handleA, handleB] = item.handles;
        return (
          <Fragment key={item.id}>
            {item.kind === "hline" ? (
              <line
                data-testid="chart-drawing"
                data-kind="hline"
                data-selected={String(item.selected)}
                data-draft={String(item.id === "draft")}
                className={styles.drawing}
                x1="0"
                y1={item.y}
                x2="100"
                y2={item.y}
                fill="none"
                vectorEffect="non-scaling-stroke"
              />
            ) : (
              <line
                data-testid="chart-drawing"
                data-kind="trendline"
                data-selected={String(item.selected)}
                data-draft={String(item.id === "draft")}
                className={styles.drawing}
                x1={item.x1}
                y1={item.y1}
                x2={item.x2}
                y2={item.y2}
                fill="none"
                vectorEffect="non-scaling-stroke"
              />
            )}
            {/* `item.handles` is already empty for unselected items
                (drawingScene), so no extra `item.selected` guard is needed —
                a trendline yields up to two handles (its two anchors), an
                hline yields at most one (its midpoint). */}
            {handleA ? (
              <circle
                data-testid="chart-drawing-handle"
                className={styles.handle}
                cx={handleA.x}
                cy={handleA.y}
                r="0.8"
              />
            ) : null}
            {handleB ? (
              <circle
                data-testid="chart-drawing-handle"
                className={styles.handle}
                cx={handleB.x}
                cy={handleB.y}
                r="0.8"
              />
            ) : null}
          </Fragment>
        );
      })}
    </svg>
  );
}

export interface DrawingsLayerProps {
  readonly items: readonly DrawingSceneItem[];
}
