import { describe, expect, it } from "vitest";

import type { HistoricPosition } from "@rtc/domain";

import {
  buildChart,
  CHART_HEIGHT,
  CHART_WIDTH,
} from "#/ui/analytics/buildChart";

describe("buildChart", () => {
  it("returns nothing to draw for fewer than 2 points", () => {
    expect(buildChart([])).toEqual({ path: "", areaPath: "", zeroY: null });
    expect(buildChart([h(5)])).toEqual({ path: "", areaPath: "", zeroY: null });
  });

  // The line is a Catmull-Rom curve, not a polyline. RN drew straight `L`
  // segments until this port, which at 90 history points reads as a jagged
  // line and a boxy area fill instead of the prototype's smooth glow — the web
  // moved off the polyline for exactly that reason.
  it("builds a smoothed curve through the points, not straight segments", () => {
    // min=0 max=10 range=10; w=384 h=104 step=384; PADDING=8
    const { path } = buildChart([h(0), h(10)]);

    expect(path).toBe("M8.0,112.0 C72.0,94.7 328.0,25.3 392.0,8.0");
    expect(path).not.toContain(" L");
  });

  it("passes exactly through the first and last data points", () => {
    const { path } = buildChart([h(0), h(10)]);

    expect(path.startsWith("M8.0,112.0")).toBe(true);
    expect(path.endsWith("392.0,8.0")).toBe(true);
  });

  // The area closes to the chart FLOOR, matching the web. Closing it to the
  // zero baseline instead would split the fill above and below zero — a
  // different chart, not a tidier version of this one.
  it("closes the area down to the chart floor", () => {
    const { path, areaPath } = buildChart([h(0), h(10)]);

    expect(areaPath.startsWith(path)).toBe(true);
    expect(areaPath).toBe(
      `${path} L${CHART_WIDTH - 8},${CHART_HEIGHT} L8,${CHART_HEIGHT} Z`,
    );
  });

  it("returns null baseline when zero is outside the value range", () => {
    expect(buildChart([h(5), h(10)]).zeroY).toBeNull();
    expect(buildChart([h(-10), h(-5)]).zeroY).toBeNull();
  });

  // The Phase 5 design claimed zero is "always forced into the Y domain". It is
  // not, on either client — and forcing it would rescale every all-positive
  // chart, moving a figure the prototype pins.
  it("does not force zero into the domain when the data never crosses it", () => {
    const { path } = buildChart([h(5), h(10)]);

    expect(path.startsWith("M8.0,112.0")).toBe(true);
  });

  it("places the baseline inside the plot when the data does cross zero", () => {
    expect(buildChart([h(-5), h(5)]).zeroY).toBeCloseTo(60);
  });
});

function h(usdPnl: number): HistoricPosition {
  return { timestamp: `t${usdPnl}`, usdPnl };
}
