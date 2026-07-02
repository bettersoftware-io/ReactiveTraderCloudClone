import { describe, expect, it } from "vitest";

import type { HistoricPosition } from "@rtc/domain";

import { buildChart } from "#/ui/analytics/buildChart";

describe("buildChart", () => {
  it("returns an empty path and null baseline for fewer than 2 points", () => {
    expect(buildChart([])).toEqual({ path: "", zeroY: null });
    expect(buildChart([h(5)])).toEqual({ path: "", zeroY: null });
  });

  it("builds an M…L path and a zero baseline inside the value range", () => {
    // min=0 max=10 range=10; w=384 h=104 step=384; PADDING=8
    expect(buildChart([h(0), h(10)])).toEqual({
      path: "M8.0,112.0 L392.0,8.0",
      zeroY: 112,
    });
  });

  it("returns null baseline when zero is outside the value range", () => {
    const { zeroY } = buildChart([h(5), h(10)]);
    expect(zeroY).toBeNull();
  });
});

function h(usdPnl: number): HistoricPosition {
  return { timestamp: `t${usdPnl}`, usdPnl };
}
