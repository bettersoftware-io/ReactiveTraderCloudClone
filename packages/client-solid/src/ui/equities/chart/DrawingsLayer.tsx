import { type Accessor, Index, type JSX, Show } from "solid-js";

import type { DrawingHandle, DrawingSceneItem } from "@rtc/motion-core";

import styles from "./DrawingsLayer.module.css";

/**
 * The plot's chart-annotations overlay: trendlines and horizontal levels,
 * pre-projected into plot-percent geometry by `@rtc/motion-core`'s
 * `drawingScene` (vm owns numbers, shell owns markup — the same split as
 * `SvgPathLayer`). Renders nothing when there's nothing to draw rather than
 * an empty `<svg>`, so an inert chart never grows an extra layer node.
 * `pointer-events: none` (module css) keeps the layer out of the plot's own
 * hit-testing — gesture code hit-tests `hitTestDrawings` against pointer
 * coordinates directly, never against this DOM.
 *
 * `items` is a fresh array every call (drawingScene is pure), so `Index`
 * (positional, not `id`-keyed) is the right primitive here — the same
 * convention `SvgPathLayer`/`ChartPlot` already use for other
 * `@rtc/motion-core`-computed geometry arrays. The inner keyed `Show` (not a
 * bare ternary on `item().kind`) is what lets TS narrow the trendline/hline
 * union: `item()` is an accessor, so two separate calls to it don't carry
 * narrowing between them, but `Show`'s `keyed` form resolves it once into a
 * plain value the branches below can narrow on.
 */
export function DrawingsLayer(props: DrawingsLayerProps): JSX.Element {
  return (
    <Show when={props.items.length > 0}>
      <svg
        class={styles.layer}
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <Index each={props.items}>
          {(item: Accessor<DrawingSceneItem>): JSX.Element => {
            return (
              <Show when={item()} keyed>
                {(it: DrawingSceneItem): JSX.Element => {
                  return (
                    <>
                      {it.kind === "hline" ? (
                        <line
                          data-testid="chart-drawing"
                          data-kind="hline"
                          data-selected={String(it.selected)}
                          data-draft={String(it.id === "draft")}
                          class={styles.drawing}
                          x1="0"
                          y1={it.y}
                          x2="100"
                          y2={it.y}
                          fill="none"
                          vector-effect="non-scaling-stroke"
                        />
                      ) : (
                        <line
                          data-testid="chart-drawing"
                          data-kind="trendline"
                          data-selected={String(it.selected)}
                          data-draft={String(it.id === "draft")}
                          class={styles.drawing}
                          x1={it.x1}
                          y1={it.y1}
                          x2={it.x2}
                          y2={it.y2}
                          fill="none"
                          vector-effect="non-scaling-stroke"
                        />
                      )}
                      <Index each={it.handles}>
                        {(h: Accessor<DrawingHandle>): JSX.Element => {
                          return (
                            <circle
                              data-testid="chart-drawing-handle"
                              class={styles.handle}
                              cx={h().x}
                              cy={h().y}
                              r="0.8"
                            />
                          );
                        }}
                      </Index>
                    </>
                  );
                }}
              </Show>
            );
          }}
        </Index>
      </svg>
    </Show>
  );
}

export interface DrawingsLayerProps {
  readonly items: readonly DrawingSceneItem[];
}
