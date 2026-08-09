import {
  createEffect,
  createSignal,
  type JSX,
  onCleanup,
  onMount,
} from "solid-js";

import type { Canvas2D, CanvasSize, ChartPalette } from "@rtc/motion-core";

import { readChartPalette } from "./readChartPalette";

import styles from "./SceneCanvas.module.css";

/** An absolutely-filling canvas that repaints via the `draw` slot whenever
 * the slot identity, the observed box size, or the device pixel ratio
 * changes — never on a rAF loop, so a quiet stream (and power-saver
 * Freeze) costs zero. The palette is re-read from the CSS cascade on every
 * repaint, so theme switches correct themselves on the next draw. Solid
 * twin of the React `SceneCanvas`: `props.draw` is read INSIDE the effect
 * (not destructured), so a new scene closure from the caller re-runs the
 * paint — the same "slot identity change repaints" contract, expressed as
 * a tracked read instead of a dependency array. */
export function SceneCanvas(props: SceneCanvasProps): JSX.Element {
  let canvas: HTMLCanvasElement | undefined;
  const [box, setBox] = createSignal<CanvasSize | null>(null);

  onMount(() => {
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
    onCleanup(() => {
      observer.disconnect();
    });
  });

  createEffect(() => {
    const size = box();
    const ctx = canvas?.getContext("2d");
    const paint = props.draw;

    if (!canvas || !ctx || !size || size.w === 0 || size.h === 0) {
      return;
    }

    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(size.w * dpr);
    canvas.height = Math.round(size.h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // The real CanvasRenderingContext2D structurally satisfies every method
    // Canvas2D declares, but its `fillStyle` setter's DOM-lib type also
    // accepts CanvasPattern — a case Canvas2D deliberately excludes (see its
    // doc in @rtc/motion-core) — so a direct structural assignment doesn't
    // typecheck. The double assertion is narrowing, not widening: every
    // fillStyle value this codebase ever assigns is a string or a
    // CanvasGradient2D-shaped gradient, never a CanvasPattern.
    paint(ctx as unknown as Canvas2D, readChartPalette(canvas), size);
  });

  return (
    <canvas
      ref={canvas}
      class={styles.canvas}
      data-testid={props.testid}
      {...(props.summary ?? {})}
    />
  );
}

export interface SceneCanvasProps {
  /** Paints one frame — the region binds its scene into this slot, so a
   * new scene object is a new slot identity and the effect repaints. */
  readonly draw: (
    ctx: Canvas2D,
    palette: ChartPalette,
    size: CanvasSize,
  ) => void;
  readonly testid: string;
  /** Substrate-neutral witness attributes (`data-candles` etc.) for the
   * contract tier — jsdom has no 2D context, so counts on the element are
   * the only cross-substrate geometry signal. */
  readonly summary?: Readonly<Record<`data-${string}`, string>>;
}
