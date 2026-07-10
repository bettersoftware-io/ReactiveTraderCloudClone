import type { JSX } from "react";
import {
  StyleSheet,
  Text,
  type TextStyle,
  View,
  type ViewStyle,
} from "react-native";
import Svg, { G, Line, Rect } from "react-native-svg";

import { useViewModel } from "@rtc/react-bindings";

import {
  buildCandles,
  CANDLE_HEIGHT,
  CANDLE_WIDTH,
} from "#/ui/equities/trade/buildCandles";
import { SurfaceCard } from "#/ui/SurfaceCard";
import type { RnTheme } from "#/ui/theme/tokens";
import { useTheme } from "#/ui/theme/useTheme";
import { useThemedStyles } from "#/ui/theme/useThemedStyles";

/** SVG candlestick chart. Geometry from the pure `buildCandles`; colours from
 * the theme. Ported from web canvas `PriceChart`. */
export function PriceChart({ symbol }: PriceChartProps): JSX.Element {
  const { useCandles } = useViewModel();
  const candles = useCandles(symbol);
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);
  const geoms = buildCandles(candles);

  return (
    <SurfaceCard variant="panel" style={styles.wrapper}>
      <View style={styles.inner}>
        <Svg
          testID="price-chart"
          width="100%"
          height={CANDLE_HEIGHT}
          viewBox={`0 0 ${CANDLE_WIDTH} ${CANDLE_HEIGHT}`}
          preserveAspectRatio="none"
        >
          {candles.map((candle, i) => {
            const g = geoms[i];
            if (!g) return null;
            const color = g.up ? theme.accentPositive : theme.accentNegative;
            return (
              <G key={candle.time}>
                <Line
                  x1={g.x}
                  y1={g.wickTop}
                  x2={g.x}
                  y2={g.wickBottom}
                  stroke={color}
                  strokeWidth={1}
                />
                <Rect
                  x={g.x - g.barW / 2}
                  y={g.bodyY}
                  width={g.barW}
                  height={g.bodyH}
                  fill={color}
                />
              </G>
            );
          })}
        </Svg>
        {candles.length === 0 ? (
          <Text testID="price-chart-empty" style={styles.empty}>
            NO DATA
          </Text>
        ) : null}
      </View>
    </SurfaceCard>
  );
}

interface PriceChartProps {
  symbol: string;
}

interface PriceChartStyles {
  wrapper: ViewStyle;
  inner: ViewStyle;
  empty: TextStyle;
}

function makeStyles(t: RnTheme): PriceChartStyles {
  return StyleSheet.create({
    // No `overflow: hidden` here — SurfaceCard's card view carries the iOS
    // drop shadow, and `overflow: hidden` (clipsToBounds) clips a layer's
    // own shadow. The corner-clip lives on `inner` instead.
    wrapper: {
      height: CANDLE_HEIGHT,
    },
    inner: {
      flex: 1,
      borderRadius: 5,
      overflow: "hidden",
      justifyContent: "center",
    },
    empty: {
      position: "absolute",
      alignSelf: "center",
      color: t.textMuted,
      fontFamily: t.fontMono,
      fontSize: 12,
    },
  });
}
