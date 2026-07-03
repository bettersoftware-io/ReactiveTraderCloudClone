import { describe, expect, it } from "vitest";

import { buildSparkPath, SPARK_HALF_W } from "#/ui/equities/blotters/buildSparkline";

describe("buildSparkPath", () => {
  it("extends the bar rightward for positive P&L", () => {
    const cx = 2 + SPARK_HALF_W;
    expect(buildSparkPath(5, 10)).toBe(`M${cx},4 h${0.5 * SPARK_HALF_W} v8 h-${0.5 * SPARK_HALF_W} Z`);
  });
  it("extends the bar leftward for negative P&L and clamps at maxAbs", () => {
    const cx = 2 + SPARK_HALF_W;
    expect(buildSparkPath(-20, 10)).toBe(`M${cx},4 h-${SPARK_HALF_W} v8 h${SPARK_HALF_W} Z`);
  });
});
