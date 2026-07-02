import type { JSX } from "react";
import Svg, { Line, Path } from "react-native-svg";

import type { HistoricPosition } from "@rtc/domain";

import {
  buildChart,
  CHART_HEIGHT,
  CHART_WIDTH,
} from "#/ui/analytics/buildChart";

const POSITIVE = "#3fb68b";
const NEGATIVE = "#e05252";
const BASELINE = "#c8c8c8";

export function PnlChart({ history }: PnlChartProps): JSX.Element {
  const { path, zeroY } = buildChart(history);
  const lastValue = history.length > 0 ? history[history.length - 1].usdPnl : 0;
  const stroke = lastValue >= 0 ? POSITIVE : NEGATIVE;

  return (
    <Svg
      width="100%"
      height={CHART_HEIGHT}
      viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
      preserveAspectRatio="none"
      testID="pnl-chart"
    >
      {zeroY !== null ? (
        <Line
          x1={8}
          x2={CHART_WIDTH - 8}
          y1={zeroY}
          y2={zeroY}
          stroke={BASELINE}
          strokeWidth={0.5}
          strokeDasharray="4 2"
        />
      ) : null}
      {path !== "" ? (
        <Path
          testID="pnl-chart-path"
          d={path}
          fill="none"
          stroke={stroke}
          strokeWidth={1.5}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      ) : null}
    </Svg>
  );
}

interface PnlChartProps {
  history: readonly HistoricPosition[];
}
