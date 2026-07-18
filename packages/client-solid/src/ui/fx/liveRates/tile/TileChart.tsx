import type { JSX } from "solid-js";
import { createMemo, Show } from "solid-js";

import type { PriceTick } from "@rtc/domain";

import styles from "./TileChart.module.css";

export function TileChart(props: TileChartProps): JSX.Element {
  const path = createMemo((): string => {
    return buildPath(props.history);
  });

  const isUp = createMemo((): boolean => {
    const history = props.history;
    const lastTick = history.length > 1 ? history[history.length - 1] : null;
    const prevTick = history.length > 1 ? history[history.length - 2] : null;
    return lastTick && prevTick ? lastTick.mid > prevTick.mid : true;
  });

  return (
    <svg
      data-testid="sparkline"
      width="100%"
      height={CHART_HEIGHT}
      viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
      preserveAspectRatio="none"
      class={styles.chartWrapper}
    >
      <title>Price history chart</title>
      <Show when={path()}>
        <path
          d={path()}
          fill="none"
          stroke={isUp() ? "var(--accent-positive)" : "var(--accent-negative)"}
          stroke-width={1.5}
          stroke-linejoin="round"
          stroke-linecap="round"
          opacity={0.75}
        />
      </Show>
    </svg>
  );
}

interface TileChartProps {
  history: readonly PriceTick[];
}

const CHART_WIDTH = 200;
const CHART_HEIGHT = 48;
const PADDING = 2;

function buildPath(history: readonly PriceTick[]): string {
  if (history.length < 2) {
    return "";
  }

  const mids = history.map((t) => {
    return t.mid;
  });
  const min = Math.min(...mids);
  const max = Math.max(...mids);
  const range = max - min || 1;

  const w = CHART_WIDTH - PADDING * 2;
  const h = CHART_HEIGHT - PADDING * 2;
  const step = w / (mids.length - 1);

  return mids
    .map((mid, i) => {
      const x = PADDING + i * step;
      const y = PADDING + h - ((mid - min) / range) * h;
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}
