import {
  drawChartScene,
  SPIKE_PALETTE,
  spikeScene,
} from "@ui-visual-shared/canvas/drawChartScene";
import { type ReactElement, useLayoutEffect, useRef } from "react";

const CANVAS_WIDTH = 640;
const CANVAS_HEIGHT = 360;

/**
 * Golden-only host for the renderer-seam proof (spec 2026-08-02): mounts a
 * bare `<canvas>` and draws the shared `spikeScene()` onto it via the
 * framework-free `drawChartScene` engine — the SAME scene + palette the
 * Solid twin (`EquitiesChartCanvasSpike.visual.tsx` in client-solid's tree)
 * draws, so both frameworks' hosts converge on one golden.
 *
 * Uses `useLayoutEffect`, not `useEffect`: a canvas only gets a drawable
 * context once its ref is attached post-mount, so SOME effect is
 * unavoidable — but `useLayoutEffect` flushes synchronously before the
 * browser's first paint, so the very first frame the visual tier can ever
 * screenshot already shows the drawn scene. `VisualScenario.tsx` uses the
 * same hook for exactly this reason (writing the seeded power-saver level
 * before paint). `useEffect` instead would leave a real first-mount-race
 * window: Playwright's golden-generation pass has no baseline to diff
 * against, so it takes a single screenshot as soon as the element is
 * "stable" (steady bounding box across two frames) — a blank canvas is
 * just as stable as a drawn one, so a slow-enough passive effect could get
 * captured blank.
 */
export function EquitiesChartCanvasSpike(): ReactElement {
  const ref = useRef<HTMLCanvasElement | null>(null);

  useLayoutEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");

    if (!canvas || !ctx) {
      return;
    }

    drawChartScene(ctx, spikeScene(), SPIKE_PALETTE, {
      w: canvas.width,
      h: canvas.height,
    });
  }, []);

  return (
    <canvas
      ref={ref}
      width={CANVAS_WIDTH}
      height={CANVAS_HEIGHT}
      data-testid="chart-canvas-spike"
    />
  );
}
