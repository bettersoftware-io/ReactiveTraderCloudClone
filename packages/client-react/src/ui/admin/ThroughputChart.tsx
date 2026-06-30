import type { ReactElement } from "react";
import { useLayoutEffect, useRef } from "react";

import type { MetricSample } from "@rtc/domain";

import { useHooks } from "#/ui/hooks/useHooks";

import styles from "./ThroughputChart.module.css";

/**
 * Pure canvas draw — no React, no DOM state. Mirrors drawCandles.ts: an exported
 * helper called from a useLayoutEffect when `samples` change. Redraw-on-data,
 * not a continuous rAF loop, so there is no timer to leak.
 */
function drawLine(
  ctx: CanvasRenderingContext2D,
  samples: readonly MetricSample[],
  w: number,
  h: number,
  color: string,
): void {
  ctx.clearRect(0, 0, w, h);
  if (samples.length < 2) return;

  const values = samples.map((s) => {
    return s.value;
  });
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;

  const pad = 4;
  const plotW = w - pad * 2;
  const plotH = h - pad * 2;
  const step = plotW / (values.length - 1);

  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  ctx.lineJoin = "round";
  ctx.beginPath();

  for (let i = 0; i < values.length; i++) {
    const x = pad + i * step;
    const y = pad + plotH - ((values[i] - min) / range) * plotH;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }

  ctx.stroke();
}

/**
 * Throughput line chart on a <canvas>. Pattern mirrors PriceChart.tsx:
 * - the pure `drawLine` helper is the only canvas-touching code
 * - the token colour is read once via getComputedStyle (canvas cannot use vars)
 * - redraw is triggered by `samples` change in useLayoutEffect — no rAF loop
 */
export function ThroughputChart(): ReactElement {
  const { useMetrics } = useHooks();
  const { throughput } = useMetrics();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = canvas.offsetWidth;
    canvas.height = canvas.offsetHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return; // jsdom / headless: no GPU context

    const cs = getComputedStyle(document.documentElement);
    const color = cs.getPropertyValue("--accent-primary").trim() || "#3b82f6";
    drawLine(ctx, throughput, canvas.width, canvas.height, color);
  }, [throughput]);

  return (
    <div data-testid="admin-throughput-chart" className={styles.wrapper}>
      <canvas
        ref={canvasRef}
        className={styles.canvas}
        aria-label="Throughput chart"
      />
      {throughput.length === 0 && <div className={styles.empty}>NO DATA</div>}
    </div>
  );
}
