import type { JSX } from "react";
import Svg, { Line, Path } from "react-native-svg";

import {
  buildSparkPath,
  SPARK_HALF_W,
  SPARK_HEIGHT,
  SPARK_PAD,
  SPARK_WIDTH,
} from "#/ui/equities/blotters/buildSparkline";
import { useTheme } from "#/ui/theme/useTheme";

/** Mini per-position P&L bar sparkline. Geometry from pure `buildSparkPath`.
 * Ported from web `PnlSparkline`. */
export function PnlSparkline({
  pnl,
  maxAbsPnl,
}: PnlSparklineProps): JSX.Element {
  const theme = useTheme();
  const safe = maxAbsPnl !== undefined ? maxAbsPnl : Math.abs(pnl);
  const path = buildSparkPath(pnl, safe);
  const color = pnl >= 0 ? theme.accentPositive : theme.accentNegative;
  return (
    <Svg
      testID="pnl-sparkline"
      width={SPARK_WIDTH}
      height={SPARK_HEIGHT}
      viewBox={`0 0 ${SPARK_WIDTH} ${SPARK_HEIGHT}`}
    >
      <Line
        x1={SPARK_PAD + SPARK_HALF_W}
        y1={SPARK_PAD}
        x2={SPARK_PAD + SPARK_HALF_W}
        y2={SPARK_HEIGHT - SPARK_PAD}
        stroke={theme.border}
        strokeWidth={1}
      />
      <Path d={path} fill={color} opacity={0.7} />
    </Svg>
  );
}

interface PnlSparklineProps {
  pnl: number;
  maxAbsPnl?: number;
}
