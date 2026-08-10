import { Canvas, Rect } from "@shopify/react-native-skia";
import type { JSX } from "react";
import { useState } from "react";
import {
  type LayoutChangeEvent,
  StyleSheet,
  Text,
  type TextStyle,
  View,
  type ViewStyle,
} from "react-native";

import type { Candle } from "@rtc/domain";

import {
  buildCandleScene,
  type CandleBar,
} from "#/ui/equities/trade/candleScene";
import { SurfaceCard } from "#/ui/SurfaceCard";
import type { RnTheme } from "#/ui/theme/tokens";
import { useTheme } from "#/ui/theme/useTheme";
import { useThemedStyles } from "#/ui/theme/useThemedStyles";

/**
 * The Skia candlestick chart. Geometry from the pure `buildCandleScene` —
 * written as a plain derived value, recomputed during the ordinary re-render
 * — and handed to one declarative `<Rect>` per body and per wick.
 * Compiler-memoized, ADR-003; verified via
 * `scripts/react-compiler-healthcheck.mjs`, whole-function form: the
 * compiler fuses `bars` and `keyedBars` into the same memo block as the JSX
 * they feed, keyed on `candles`/`styles`/`theme`/`width`, so no single
 * binding is worth tracking on its own — only that the fused block memoized
 * something. `candles` arrives as a prop rather than
 * this component reading `useCandles(symbol)` off the ViewModel seam itself
 * — the seam read lives in `TradeView` (which already has to special-case
 * the "no symbol selected" state), specifically so THIS component stays
 * plain-props and therefore compiler-memoizable.
 *
 * NO `createPicture` RECORDER. Like `PnlChart`, this surface redraws on
 * ordinary candle ticks, not a 60fps clock — a plain derived value on the JS
 * thread during the normal re-render is the right tool; the boot scenes'
 * `useDerivedValue` recorder is for clock-driven geometry.
 *
 * ONLY THE LAST BAR ANIMATES, AND EVEN THAT ISN'T A TWEEN. The prototype
 * grows the last candle's `top`/`height` — RN layout properties, banned by
 * the perf doctrine. Here bar geometry is a Skia draw parameter recomputed
 * per candle update, which is legal and needs no `useShellMotionEnabled`
 * gate: there is no continuous animation to gate, only a snap to the new
 * geometry each time `candles` changes (mirrors `PnlChart`, which is the
 * same "redraw on data, not on a clock" shape and is likewise ungated).
 */
export function CandleChart({ candles }: CandleChartProps): JSX.Element {
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);
  const [width, setWidth] = useState(CANDLE_CHART_WIDTH);
  const bars = buildCandleScene(candles, width, CANDLE_CHART_HEIGHT, BAR_WIDTH);
  // Keyed by each candle's own `time`, not the map index: a right-aligned
  // scene reflows every bar's `x` as the series grows, so the index at a
  // given array position stops meaning the same candle across renders.
  const keyedBars = bars.map((bar, i) => {
    return { time: candles[i]?.time ?? i, bar };
  });

  return (
    <SurfaceCard variant="panel" style={styles.wrapper}>
      <View style={styles.inner}>
        {bars.length === 0 ? (
          <Text testID="eq-candle-empty" style={styles.empty}>
            NO DATA
          </Text>
        ) : (
          // The measuring `onLayout` sits on this plain View, not the Canvas —
          // Skia's `<Canvas onLayout>` is deprecated and silently a no-op on
          // the new architecture (see `PnlChart`'s identical note).
          <View
            testID="eq-candle-chart"
            style={styles.canvasHost}
            onLayout={(event: LayoutChangeEvent): void => {
              setWidth(event.nativeEvent.layout.width);
            }}
          >
            <Canvas style={StyleSheet.absoluteFill}>
              {keyedBars.map((entry) => {
                return (
                  <CandleBarShapes
                    key={entry.time}
                    bar={entry.bar}
                    color={
                      entry.bar.rising
                        ? theme.accentPositive
                        : theme.accentNegative
                    }
                  />
                );
              })}
            </Canvas>
          </View>
        )}
      </View>
    </SurfaceCard>
  );
}

/** Plot width before the wrapping `View` reports its real measured width, so
 * the first frame draws at natural size instead of blank. Plot height is
 * fixed — unlike width, nothing measures it. */
const CANDLE_CHART_WIDTH = 300;
const CANDLE_CHART_HEIGHT = 160;

/** Horizontal space each candle's slot occupies. Fixed rather than derived
 * from the candle count (unlike the SVG version's `slotW`): a live series
 * keeps a stable px-per-candle scale, and `buildCandleScene` right-aligns the
 * newest bar to the plot's edge so growth scrolls older bars off the left. */
const BAR_WIDTH = 8;
const BODY_WIDTH: number = BAR_WIDTH * 0.6;
const WICK_WIDTH = 1.5;

/** One candle's body + wick, both declarative `<Rect>`s per the "no
 * recorder" rule — Skia has no `<Line>` requirement here, and a thin `<Rect>`
 * draws a wick identically. */
function CandleBarShapes({ bar, color }: CandleBarShapesProps): JSX.Element {
  return (
    <>
      <Rect
        x={bar.x - WICK_WIDTH / 2}
        y={bar.wickTop}
        width={WICK_WIDTH}
        height={bar.wickHeight}
        color={color}
      />
      <Rect
        x={bar.x - BODY_WIDTH / 2}
        y={bar.bodyTop}
        width={BODY_WIDTH}
        height={bar.bodyHeight}
        color={color}
      />
    </>
  );
}

interface CandleBarShapesProps {
  readonly bar: CandleBar;
  readonly color: string;
}

interface CandleChartProps {
  candles: readonly Candle[];
}

interface CandleChartStyles {
  wrapper: ViewStyle;
  inner: ViewStyle;
  canvasHost: ViewStyle;
  empty: TextStyle;
}

function makeStyles(t: RnTheme): CandleChartStyles {
  return StyleSheet.create({
    // No `overflow: hidden` here — SurfaceCard's card view carries the iOS
    // drop shadow, and `overflow: hidden` (clipsToBounds) clips a layer's own
    // shadow. The corner-clip lives on `inner` instead.
    wrapper: {
      height: CANDLE_CHART_HEIGHT,
    },
    inner: {
      flex: 1,
      borderRadius: 5,
      overflow: "hidden",
      justifyContent: "center",
    },
    canvasHost: {
      flex: 1,
    },
    empty: {
      alignSelf: "center",
      color: t.textMuted,
      fontFamily: t.fontMono,
      fontSize: 12,
    },
  });
}
