import {
  drawChartScene,
  SPIKE_PALETTE,
  spikeScene,
} from "@ui-visual-shared/canvas/drawChartScene";
import type { JSX } from "solid-js";
import { onMount } from "solid-js";

const CANVAS_WIDTH = 640;
const CANVAS_HEIGHT = 360;

/**
 * Golden-only host for the renderer-seam proof (spec 2026-08-02): mounts a
 * bare `<canvas>` and draws the shared `spikeScene()` onto it via the
 * framework-free `drawChartScene` engine — the SAME scene + palette the
 * React twin (`EquitiesChartCanvasSpike.visual.tsx` in client-react's tree)
 * draws, so both frameworks' hosts converge on one golden.
 *
 * Draws in `onMount` (a plain ref variable, Solid idiom — no ref callback
 * needed since the element is captured directly). Unlike React's
 * `useEffect`, Solid's initial-render `onMount` runs synchronously within
 * the same render pass, before the browser's first paint — the same
 * "reflected in the very first frame" property the react host has to reach
 * for `useLayoutEffect` to get (see that file's doc comment for the
 * first-mount-race this avoids), so no special effect-timing choice is
 * needed here.
 */
export function EquitiesChartCanvasSpike(): JSX.Element {
  let canvas: HTMLCanvasElement | undefined;

  onMount(() => {
    const ctx = canvas?.getContext("2d");

    if (!canvas || !ctx) {
      return;
    }

    drawChartScene(ctx, spikeScene(), SPIKE_PALETTE, {
      w: canvas.width,
      h: canvas.height,
    });
  });

  return (
    <canvas
      ref={canvas}
      width={CANVAS_WIDTH}
      height={CANVAS_HEIGHT}
      data-testid="chart-canvas-spike"
    />
  );
}
