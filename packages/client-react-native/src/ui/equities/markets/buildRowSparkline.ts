import { sparklinePoints } from "#/ui/equities/markets/moversVm";

/** Sparkline geometry box — the movers row's sparkline column between the name
 * block and the price block, matching the design's `viewBox="0 0 64 20"`
 * (dc.html ~L341). */
export const ROW_SPARK_WIDTH = 64;
export const ROW_SPARK_HEIGHT = 20;

/** Last prices -> an SVG path `d` string tracing the sparkline (a plain line
 * strip through `sparklinePoints`'s projected points), or `""` when there
 * are too few prices to draw — mirrors `sparklinePoints`'s own < 2 guard.
 * Kept framework/Skia-free like `buildChart`/`buildCandles`: `RowSparkline`
 * turns the string into an `SkPath` via `Skia.Path.MakeFromSVGString`. */
export function buildRowSparkPath(prices: readonly number[]): string {
  const points = sparklinePoints(prices, ROW_SPARK_WIDTH, ROW_SPARK_HEIGHT);

  if (points.length === 0) {
    return "";
  }

  const [head, ...rest] = points;
  const segments = rest.map((point) => {
    return `L${point.x},${point.y}`;
  });

  return [`M${head.x},${head.y}`, ...segments].join(" ");
}
