import { Canvas, Rect } from "@shopify/react-native-skia";
import type { JSX } from "react";
import { useEffect, useState } from "react";
import {
  type LayoutChangeEvent,
  StyleSheet,
  Text,
  type TextStyle,
  View,
  type ViewStyle,
} from "react-native";
import type { SharedValue } from "react-native-reanimated";
import {
  Easing,
  useDerivedValue,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

import type { Candle } from "@rtc/domain";

import {
  type BodyGeometry,
  bodyGeometriesBySlot,
  buildCandleScene,
  type CandleBar,
  lerpBodyGeometries,
} from "#/ui/equities/trade/candleScene";
import { useShellMotionEnabled } from "#/ui/shell/hud/useShellMotionEnabled";
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
 * Chrome-less since the mobile-v1 fidelity pass (2026-08-29): the chart sits
 * INSIDE `InstrumentCard`'s tile, under the header row, at the design's
 * 128px, over the design's faint horizontal rules every 32px (drawn as
 * hairline `<Rect>`s on the same canvas — no second layer).
 *
 * THE BODY MORPH. The prototype transitions each slot's body `top`/`height`
 * over 0.5s (dc.html:378) — on the web those are layout properties; here
 * they are Skia draw parameters, so the same motion is legal under the perf
 * doctrine: a Reanimated progress value drives per-slot `useDerivedValue`
 * interpolation on the UI thread, running only for the 0.5s after a data
 * change (no continuous clock — the "no recorder" rule stands). Wicks, slot
 * x and colour snap, exactly as in the design (its `transition` names only
 * `top` and `height`). Gated by `useShellMotionEnabled`: with motion off the
 * morph state pins to the target and every frame is the plain snap this
 * component drew before 2026-09-02 (identical pixels — the freeze goldens
 * don't move).
 */
export function CandleChart({ candles }: CandleChartProps): JSX.Element {
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);
  const motionEnabled = useShellMotionEnabled();
  const [width, setWidth] = useState(CANDLE_CHART_WIDTH);
  const bars = buildCandleScene(candles, width, CANDLE_CHART_HEIGHT, BAR_WIDTH);
  // Keyed by SLOT (newest bar = slot 0), not by candle time: the body morph
  // pairs geometries by screen position the way the design's fixed slot divs
  // do (dc.html:377), so the element at a slot must survive data changes for
  // its derived values to interpolate across them.
  const keyedBars = bars.map((bar, i) => {
    return { slot: bars.length - 1 - i, bar };
  });
  const progress = useSharedValue(1);
  const morph = useSharedValue<BodyMorph>({ from: [], to: [] });

  // Retarget the morph AFTER commit: the first painted frame of a data change
  // still shows the previous targets (morph/progress are untouched during
  // render), then this glides the bodies to the new ones — CSS-transition
  // semantics, including starting from mid-flight geometry on retarget.
  useEffect(() => {
    const targets = bodyGeometriesBySlot(
      buildCandleScene(candles, width, CANDLE_CHART_HEIGHT, BAR_WIDTH),
    );
    const prior = morph.value;

    if (!motionEnabled || prior.to.length === 0) {
      morph.value = { from: targets, to: targets };
      progress.value = 1;
      return;
    }

    morph.value = {
      from: lerpBodyGeometries(prior.from, prior.to, progress.value),
      to: targets,
    };
    progress.value = 0;
    progress.value = withTiming(1, {
      duration: BODY_MORPH_MS,
      easing: BODY_MORPH_EASING,
    });
  }, [candles, width, motionEnabled, morph, progress]);

  return (
    <View style={styles.wrapper}>
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
            {GRID_ROWS.map((y) => {
              return (
                <Rect
                  key={y}
                  x={0}
                  y={y}
                  width={width}
                  height={1}
                  color={theme.borderSubtle}
                />
              );
            })}
            {keyedBars.map((entry) => {
              return (
                <CandleBarShapes
                  key={entry.slot}
                  slot={entry.slot}
                  bar={entry.bar}
                  morph={morph}
                  progress={progress}
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
  );
}

/** Plot width before the wrapping `View` reports its real measured width, so
 * the first frame draws at natural size instead of blank. Plot height is
 * fixed — unlike width, nothing measures it. */
const CANDLE_CHART_WIDTH = 300;
const CANDLE_CHART_HEIGHT = 128;

/** The design's horizontal rules: `repeating-linear-gradient` every 32px,
 * i.e. three interior lines across the 128px plot. */
const GRID_ROWS: readonly number[] = [32, 64, 96];

/** Horizontal space each candle's slot occupies. Fixed rather than derived
 * from the candle count (unlike the SVG version's `slotW`): a live series
 * keeps a stable px-per-candle scale, and `buildCandleScene` right-aligns the
 * newest bar to the plot's edge so growth scrolls older bars off the left. */
const BAR_WIDTH = 8;
const BODY_WIDTH: number = BAR_WIDTH * 0.6;
const WICK_WIDTH = 1.5;

/** The design's body transition: `transition:top 0.5s, height 0.5s`
 * (dc.html:378), CSS's default `ease` curve. */
const BODY_MORPH_MS = 500;
const BODY_MORPH_EASING = Easing.bezier(0.25, 0.1, 0.25, 1);

/** The morph's endpoints, slot-indexed (see `bodyGeometriesBySlot`). Held in
 * one shared value so a retarget swaps both ends atomically for the UI
 * thread. */
interface BodyMorph {
  readonly from: readonly BodyGeometry[];
  readonly to: readonly BodyGeometry[];
}

/** One candle's body + wick, both declarative `<Rect>`s per the "no
 * recorder" rule — Skia has no `<Line>` requirement here, and a thin `<Rect>`
 * draws a wick identically. The wick snaps to `bar` directly; only the body's
 * `y`/`height` read the morph (the design transitions only those two — its
 * wick div has no `transition` at all). Before the mount effect seeds the
 * morph, `to[slot]` is absent and the body falls back to `bar`'s target
 * geometry, so the first frame ever painted is already correct. */
function CandleBarShapes({
  slot,
  bar,
  morph,
  progress,
  color,
}: CandleBarShapesProps): JSX.Element {
  const bodyY = useDerivedValue(() => {
    const to = morph.value.to[slot];

    if (to === undefined) {
      return bar.bodyTop;
    }

    const from = morph.value.from[slot] ?? to;

    return from.top + (to.top - from.top) * progress.value;
  });

  const bodyHeight = useDerivedValue(() => {
    const to = morph.value.to[slot];

    if (to === undefined) {
      return bar.bodyHeight;
    }

    const from = morph.value.from[slot] ?? to;

    return from.height + (to.height - from.height) * progress.value;
  });

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
        y={bodyY}
        width={BODY_WIDTH}
        height={bodyHeight}
        color={color}
      />
    </>
  );
}

interface CandleBarShapesProps {
  readonly slot: number;
  readonly bar: CandleBar;
  readonly morph: SharedValue<BodyMorph>;
  readonly progress: SharedValue<number>;
  readonly color: string;
}

interface CandleChartProps {
  candles: readonly Candle[];
}

interface CandleChartStyles {
  wrapper: ViewStyle;
  canvasHost: ViewStyle;
  empty: TextStyle;
}

function makeStyles(t: RnTheme): CandleChartStyles {
  return StyleSheet.create({
    wrapper: {
      height: CANDLE_CHART_HEIGHT,
      marginTop: 9,
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
