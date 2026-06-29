import type { ReactElement } from "react";
import { useLayoutEffect, useRef } from "react";

import { useHooks } from "#/ui/hooks/useHooks";

import { drawCandles } from "./drawCandles";

import styles from "./PriceChart.module.css";

interface PriceChartProps {
  symbol: string;
}

/**
 * Candlestick chart rendered on a <canvas>.
 * Pattern mirrors BootSequence.tsx + bootCanvas.ts:
 * - Pure `drawCandles` helper is the only canvas-touching code
 * - Token colours read once via getComputedStyle (canvas cannot use CSS vars)
 * - Redraw triggered by `candles` change in useLayoutEffect — no rAF loop
 */
export function PriceChart({ symbol }: PriceChartProps): ReactElement {
  const { useCandles } = useHooks();
  const candles = useCandles(symbol);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = canvas.offsetWidth;
    canvas.height = canvas.offsetHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return; // jsdom / headless: no GPU context

    const cs = getComputedStyle(document.documentElement);
    const colors = {
      positive: cs.getPropertyValue("--accent-positive").trim() || "#00e676",
      negative: cs.getPropertyValue("--accent-negative").trim() || "#ff1744",
    };
    drawCandles(ctx, candles, canvas.width, canvas.height, colors);
  }, [candles]);

  return (
    <div className={styles.wrapper}>
      <canvas
        ref={canvasRef}
        className={styles.canvas}
        aria-label={`${symbol} price chart`}
      />
      {candles.length === 0 && <div className={styles.empty}>NO DATA</div>}
    </div>
  );
}
