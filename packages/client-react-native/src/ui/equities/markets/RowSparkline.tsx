import { Canvas, Path, Skia, type SkPath } from "@shopify/react-native-skia";
import type { JSX } from "react";
import { StyleSheet, View, type ViewStyle } from "react-native";

import type { Candle } from "@rtc/domain";

import {
  buildRowSparkPath,
  ROW_SPARK_HEIGHT,
  ROW_SPARK_WIDTH,
} from "#/ui/equities/markets/buildRowSparkline";
import { useTheme } from "#/ui/theme/useTheme";

/** Inline movers-row sparkline: the symbol's recent candle closes, projected
 * by `sparklinePoints` (via `buildRowSparkPath`) and stroked as a plain Skia
 * path — computed as a derived value on the JS thread during the ordinary
 * re-render (compiler-memoized, ADR-003; verified via
 * `scripts/react-compiler-healthcheck.mjs`, `path` tracked — the compiler
 * fuses `svgPath`'s computation into the same memo block as the
 * `Skia.Path.MakeFromSVGString` call it feeds, keyed on `candles`), not the
 * `createPicture` recorder `CoreScene` uses for clock-driven geometry.
 * There is no equities tick-history stream, so the series is `candles`'
 * closes rather than a `usePriceHistory` equivalent, which doesn't exist.
 * `candles` arrives as a prop rather than this component reading
 * `useCandles(symbol)` itself off the ViewModel seam — the seam read lives
 * in `MoversBoard`'s `MoversBoardRow` (which already bails on the seam for
 * `useEquityQuote`), specifically so THIS leaf stays plain-props and
 * therefore compiler-memoizable; a seam read here would bail every row's
 * `SkPath` allocation on every tick of any symbol (`MoversBoard` hoists all
 * quotes into one `useState`).
 *
 * Colour transition only, no per-frame animation: the path redraws when
 * `candles` changes — that's the only "motion" here, so there is no
 * `useShellMotionEnabled` gate to thread through.
 *
 * Renders nothing (no wrapping view, no `testID`) below two closes, mirroring
 * `sparklinePoints`'s own guard — a single point has no line to draw. */
export function RowSparkline({
  symbol,
  positive,
  candles,
}: RowSparklineProps): JSX.Element | null {
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
  candles: readonly Candle[];
}

interface RowSparklineStyles {
  box: ViewStyle;
}

const styles: RowSparklineStyles = StyleSheet.create({
  box: { width: ROW_SPARK_WIDTH, height: ROW_SPARK_HEIGHT },
});
