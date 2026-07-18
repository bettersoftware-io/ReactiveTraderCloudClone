import type { JSX } from "react";
import { StyleSheet, Text, type TextStyle, type ViewStyle } from "react-native";
import Svg, { Circle, Path } from "react-native-svg";

import type { EquityPosition } from "@rtc/domain";

import {
  buildGaugePaths,
  GAUGE_CX,
  GAUGE_CY,
  GAUGE_PAD,
  GAUGE_R,
} from "#/ui/equities/blotters/buildGauge";
import { SurfaceCard } from "#/ui/SurfaceCard";
import type { RnTheme } from "#/ui/theme/tokens";
import { useTheme } from "#/ui/theme/useTheme";
import { useThemedStyles } from "#/ui/theme/useThemedStyles";

/** Lower-arc desk-P&L speedometer. Geometry from pure `buildGaugePaths`.
 * Ported from web `DeskPnlGauge`. */
export function DeskPnlGauge({ positions }: DeskPnlGaugeProps): JSX.Element {
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);

  const totalPnl = positions.reduce((acc, p) => {
    return acc + p.unrealisedPnl;
  }, 0);

  const maxAbsPnl = Math.max(
    ...positions.map((p) => {
      return Math.abs(p.unrealisedPnl);
    }),
    1,
  );
  const isPositive = totalPnl >= 0;
  const arcColor = isPositive ? theme.accentPositive : theme.accentNegative;
  const { track, fill, needleX, needleY } = buildGaugePaths(
    totalPnl,
    maxAbsPnl,
  );

  const displayPnl =
    Math.abs(totalPnl) >= 1000
      ? `${(totalPnl / 1000).toFixed(1)}k`
      : totalPnl.toFixed(0);
  const viewBoxY = GAUGE_CY - GAUGE_PAD;
  const viewBoxH = GAUGE_R + GAUGE_PAD * 2;
  const viewBoxW = GAUGE_CX * 2 + 4;

  return (
    <SurfaceCard variant="panel" testID="desk-pnl-gauge" style={styles.gauge}>
      <Svg
        width={viewBoxW}
        height={viewBoxH}
        viewBox={`0 ${viewBoxY} ${viewBoxW} ${viewBoxH}`}
      >
        <Path
          d={track}
          fill="none"
          stroke={theme.border}
          strokeWidth={6}
          strokeLinecap="round"
        />
        {fill !== null ? (
          <Path
            d={fill}
            fill="none"
            stroke={arcColor}
            strokeWidth={6}
            strokeLinecap="round"
          />
        ) : null}
        <Circle cx={needleX} cy={needleY} r={4} fill={arcColor} />
        <Circle cx={GAUGE_CX} cy={GAUGE_CY} r={3} fill={theme.border} />
      </Svg>
      <Text style={styles.label}>DESK P&amp;L</Text>
      <Text testID="desk-pnl-value" style={[styles.value, { color: arcColor }]}>
        {isPositive ? "+" : ""}
        {displayPnl}
      </Text>
    </SurfaceCard>
  );
}

interface DeskPnlGaugeProps {
  positions: readonly EquityPosition[];
}

interface DeskPnlGaugeStyles {
  gauge: ViewStyle;
  label: TextStyle;
  value: TextStyle;
}

function makeStyles(t: RnTheme): DeskPnlGaugeStyles {
  return StyleSheet.create({
    gauge: { alignItems: "center", paddingVertical: 8, gap: 2 },
    label: { fontSize: 10, color: t.textMuted, fontFamily: t.fontMono },
    value: { fontSize: 18, fontFamily: t.fontDisplay },
  });
}
