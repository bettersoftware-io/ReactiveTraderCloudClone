import type { JSX } from "@solidjs/web";
import { createEffect, createSignal, onSettled } from "solid-js";

import type { Canvas2D, CanvasSize, ChartPalette } from "@rtc/motion-core";

import { readChartPalette } from "./readChartPalette";

import styles from "./SceneCanvas.module.css";

/** An absolutely-filling canvas that repaints `scene` through the `draw`
 * slot whenever the scene, the slot, the observed box size, or the device
 * pixel ratio changes — never on a rAF loop, so a quiet stream (and
 * power-saver Freeze) costs zero. The palette is re-read from the CSS cascade
 * on every repaint, so theme switches correct themselves on the next draw.
 *
 * Solid twin of the React `SceneCanvas`, whose `draw` closure binds the
 * scene, so a new scene is a new slot identity and the effect repaints. Here
 * the scene is its own prop, read in the effect's compute phase beside
 * `draw`: Solid 2 runs the paint in the apply phase, which tracks nothing, so
 * a scene read inside the paint would never repaint on a new scene (and
 * dev-warns). The same "a new scene repaints" contract, expressed as a
 * tracked read instead of a dependency array. */
export function SceneCanvas<S>(props: SceneCanvasProps<S>): JSX.Element {
  let canvas: HTMLCanvasElement | undefined;
  const [box, setBox] = createSignal<CanvasSize | null>(null);

  onSettled(() => {
    if (!canvas) {
      return;
    }

    const observer = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;

      if (rect) {
        setBox({ w: rect.width, h: rect.height });
      }
    });
    observer.observe(canvas);

    return () => {
      observer.disconnect();
    };
  });

  createEffect(
    () => {
      return { size: box(), scene: props.scene, paint: props.draw };
    },
    ({ size, scene, paint }) => {
      const ctx = canvas?.getContext("2d");

      if (!canvas || !ctx || !size || size.w === 0 || size.h === 0) {
        return;
      }

      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.round(size.w * dpr);
      canvas.height = Math.round(size.h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      // The real CanvasRenderingContext2D satisfies Canvas2D structurally —
      // its style properties are covered by Canvas2D's divergent read/write
      // accessor types (see the interface doc in @rtc/motion-core), so this
      // direct pass is also the compile-time pin that keeps the two in sync.
      paint(ctx, scene, readChartPalette(canvas), size);
    },
  );

  return (
    <canvas
      ref={canvas}
      class={styles.canvas}
      data-testid={props.testid}
      {...(props.summary ?? {})}
    />
  );
}

export interface SceneCanvasProps<S> {
  /** The scene to paint; a new scene repaints. */
  readonly scene: S;
  /** Paints `scene` as one frame. */
  readonly draw: (
    ctx: Canvas2D,
    scene: S,
    palette: ChartPalette,
    size: CanvasSize,
  ) => void;
  readonly testid: string;
  /** Substrate-neutral witness attributes (`data-candles` etc.) for the
   * contract tier — jsdom has no 2D context, so counts on the element are
   * the only cross-substrate geometry signal. */
  readonly summary?: Readonly<Record<`data-${string}`, string>>;
}
