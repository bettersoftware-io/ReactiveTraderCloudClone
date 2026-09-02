import {
  Canvas,
  DashPathEffect,
  Group,
  LinearGradient,
  Path,
  Skia,
  vec,
} from "@shopify/react-native-skia";
import type { JSX } from "react";
import { useState } from "react";
import { type LayoutChangeEvent, StyleSheet, View } from "react-native";

import type { HistoricPosition } from "@rtc/domain";

import {
  buildChart,
  CHART_HEIGHT,
  CHART_WIDTH,
} from "#/ui/analytics/buildChart";
import { useTheme } from "#/ui/theme/useTheme";

/**
 * The P&L history as a Skia line + area chart.
 *
 * WHY NOT THE `createPicture` RECORDER. The boot scenes record an `SkPicture`
 * inside a `useDerivedValue` worklet because they redraw at 60 fps from a
 * clock. This surface gains one point every **10 seconds** and is ~90 point
 * operations. The paths are therefore built as a plain derived value (compiler-
 * memoized, ADR-003 — verified this component keys the cache on `history` and
 * the two theme colours below) on the JS thread during the ordinary re-render,
 * and handed to declarative `<Path>` elements. Restated here because the boot
 * scenes make the recorder look like
 * the house style, and it is the wrong tool at this cadence.
 *
 * WIDTH. `buildChart` works in a fixed `CHART_WIDTH` coordinate space, which
 * the previous `react-native-svg` version stretched via
 * `preserveAspectRatio="none"`. Skia has no viewBox, so the paths are scaled
 * horizontally by a `Group` transform once the real width is measured. Width
 * defaults to `CHART_WIDTH` rather than 0, so the first frame draws at natural
 * size instead of blank.
 *
 * NO PER-PATH `testID`. Skia elements are not React Native views and do not
 * accept one — the previous `react-native-svg` version could, which is why its
 * test queried `pnl-chart-path`. The decision of *whether* a line or area is
 * drawn is a pure function of the history and is asserted directly in
 * `buildChart.test.ts`; this component's own test proves it mounts and draws
 * across every history shape without throwing.
 */
export function PnlChart({ history }: PnlChartProps): JSX.Element {
  const theme = useTheme();
  const [width, setWidth] = useState(CHART_WIDTH);
  const { path, areaPath, zeroY } = buildChart(history);
  const lastValue = history.length > 0 ? history[history.length - 1].usdPnl : 0;
  const stroke = lastValue >= 0 ? theme.accentPositive : theme.accentNegative;

  const paths = {
    line: path === "" ? null : Skia.Path.MakeFromSVGString(path),
    area: areaPath === "" ? null : Skia.Path.MakeFromSVGString(areaPath),
    baseline: zeroY === null ? null : zeroBaseline(zeroY),
  };

  return (
    // The measuring `onLayout` sits on a plain View, NOT on the Canvas: Skia's
    // `<Canvas onLayout>` is deprecated and silently does nothing on the new
    // architecture — no throw, no warning in jest, just a width frozen at
    // `CHART_WIDTH`. Caught only by running this on a device, where Skia logs
    // the deprecation. Skia's replacements (`onSize`, `useCanvasSize`) return a
    // SharedValue, which is right for UI-thread consumers; this width is read
    // during an ordinary React render, so measure on the JS thread.
    <View
      testID="pnl-chart"
      style={styles.container}
      onLayout={(event: LayoutChangeEvent): void => {
        setWidth(event.nativeEvent.layout.width);
      }}
    >
      <Canvas style={StyleSheet.absoluteFill}>
        <Group transform={[{ scaleX: width / CHART_WIDTH }]}>
          {paths.baseline === null ? null : (
            <Path
              path={paths.baseline}
              style="stroke"
              strokeWidth={0.5}
              color={theme.textMuted}
            >
              <DashPathEffect intervals={[4, 2]} />
            </Path>
          )}
          {paths.area === null ? null : (
            <Path path={paths.area} style="fill">
              <LinearGradient
                start={vec(0, 0)}
                end={vec(0, CHART_HEIGHT)}
                colors={[withAlpha(stroke, AREA_TOP_ALPHA), TRANSPARENT]}
              />
            </Path>
          )}
          {paths.line === null ? null : (
            <Path
              path={paths.line}
              style="stroke"
              strokeWidth={1.5}
              strokeJoin="round"
              strokeCap="round"
              color={stroke}
            />
          )}
        </Group>
      </Canvas>
    </View>
  );
}

// The measuring container's size is fixed at compile time (CHART_HEIGHT is a
// module-level constant, not runtime-computed), so it belongs entirely in
// StyleSheet.create rather than the array-form dynamic member.
const styles = StyleSheet.create({
  container: { width: "100%", height: CHART_HEIGHT },
});

/** The web's area gradient runs from 32% of the line colour to transparent. */
const AREA_TOP_ALPHA = 0.32;
const TRANSPARENT = "rgba(0,0,0,0)";

/** Horizontal inset of the zero baseline, matching the chart's own padding. */
const BASELINE_INSET = 8;

/** The dashed zero baseline, as a one-segment path. */
function zeroBaseline(y: number): ReturnType<typeof Skia.Path.Make> {
  const path = Skia.Path.Make();
  path.moveTo(BASELINE_INSET, y);
  path.lineTo(CHART_WIDTH - BASELINE_INSET, y);
  return path;
}

/**
 * A theme colour at a given alpha.
 *
 * Local rather than shared: the repo has no `withAlpha()` helper yet — it is a
 * tracked open item (#301), and doing it properly means a branded hex type,
 * which is out of this task's scope.
 */
function withAlpha(hex: string, alpha: number): string {
  const normalized = hex.replace("#", "");
  const full =
    normalized.length === 3
      ? normalized
          .split("")
          .map((channel) => {
            return channel + channel;
          })
          .join("")
      : normalized;

  return `rgba(${Number.parseInt(full.slice(0, 2), 16)},${Number.parseInt(full.slice(2, 4), 16)},${Number.parseInt(full.slice(4, 6), 16)},${alpha})`;
}

interface PnlChartProps {
  history: readonly HistoricPosition[];
}
