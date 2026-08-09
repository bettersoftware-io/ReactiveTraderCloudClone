import { Canvas, Path, Skia, type SkPath } from "@shopify/react-native-skia";
import type { JSX } from "react";
import { StyleSheet, View, type ViewStyle } from "react-native";

import { useViewModel } from "@rtc/react-bindings";

import {
  buildRowSparkPath,
  ROW_SPARK_HEIGHT,
  ROW_SPARK_WIDTH,
} from "#/ui/equities/markets/buildRowSparkline";
import { useTheme } from "#/ui/theme/useTheme";

/** Inline movers-row sparkline: the symbol's recent candle closes, projected
 * by `sparklinePoints` (via `buildRowSparkPath`) and stroked as a plain Skia
 * path — computed as a derived value on the JS thread during the ordinary
 * re-render (compiler-memoized, ADR-003; no `useMemo`, mirrors `PnlChart`'s
 * doc for the same call), not the `createPicture` recorder `CoreScene` uses
 * for clock-driven geometry. There is no equities tick-history stream, so
 * the series comes from `useCandles(symbol)` closes rather than a
 * `usePriceHistory` equivalent, which doesn't exist.
 *
 * Colour transition only, no per-frame animation: the path redraws when
 * `useCandles` emits a new series — that's the only "motion" here, so there
 * is no `useShellMotionEnabled` gate to thread through.
 *
 * Renders nothing (no wrapping view, no `testID`) below two closes, mirroring
 * `sparklinePoints`'s own guard — a single point has no line to draw. */
export function RowSparkline({
  symbol,
  positive,
}: RowSparklineProps): JSX.Element | null {
  const { useCandles } = useViewModel();
  const candles = useCandles(symbol);
  const theme = useTheme();

  const svgPath = buildRowSparkPath(
    candles.map((candle) => {
      return candle.close;
    }),
  );

  if (svgPath === "") {
    return null;
  }

  const path: SkPath | null = Skia.Path.MakeFromSVGString(svgPath);

  if (path === null) {
    return null;
  }

  const color = positive ? theme.accentPositive : theme.accentNegative;

  return (
    <View testID={`eq-sparkline-${symbol}`} style={styles.box}>
      <Canvas style={styles.box}>
        <Path
          path={path}
          style="stroke"
          strokeWidth={1.25}
          strokeJoin="round"
          strokeCap="round"
          color={color}
        />
      </Canvas>
    </View>
  );
}

export interface RowSparklineProps {
  symbol: string;
  positive: boolean;
}

interface RowSparklineStyles {
  box: ViewStyle;
}

const styles: RowSparklineStyles = StyleSheet.create({
  box: { width: ROW_SPARK_WIDTH, height: ROW_SPARK_HEIGHT },
});
