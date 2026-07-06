import { PnlChart } from "@ui-contract/components";
import { cleanupMounted, mount } from "@ui-contract/mount";
import { afterEach, describe, expect, it } from "vitest";

import type { HistoricPosition } from "@rtc/domain";

afterEach(() => {
  cleanupMounted();
});

describe("PnlChart", () => {
  it("smooths a rising history into a single curved line + gradient area, both signed positive", () => {
    const chart = mount(PnlChart, {
      props: { history: series([-500, -100, 300, 900, 1600, 2400]) },
    });

    expect(chart.pathCount()).toBe(2);
    expect(chart.sign()).toBe("positive");

    // Smoothed via Catmull-Rom → cubic Bézier: curve commands, not a polyline
    // of only straight `L` segments.
    const line = chart.linePath();
    expect(line).not.toBeNull();
    expect(line).toMatch(/^M[\d.,]+ (C[\d.,\s]+)+$/);
    expect(line).not.toMatch(/L/);

    // The area path is the same smoothed curve, closed to the bottom edge for
    // the gradient fill.
    const area = chart.areaPath();
    expect(area).not.toBeNull();
    expect(area?.startsWith(line ?? "")).toBe(true);
    expect(area).toMatch(/Z$/);

    expect(chart.areaFill()).toMatch(/^url\(#.+\)$/);
  });

  it("signs the line and area negative when the latest value is a loss", () => {
    const chart = mount(PnlChart, {
      props: { history: series([1000, 400, -200, -900]) },
    });

    expect(chart.sign()).toBe("negative");
    expect(chart.linePath()).toMatch(/C/);
  });

  it("draws a dashed zero baseline only when 0 falls within the value range", () => {
    const crossing = mount(PnlChart, {
      props: { history: series([-300, 200]) },
    });
    expect(crossing.hasZeroLine()).toBe(true);

    const allPositive = mount(PnlChart, {
      props: { history: series([100, 300, 500]) },
    });
    expect(allPositive.hasZeroLine()).toBe(false);
  });

  it("still draws a smooth flat line when every history value is identical", () => {
    const flat = mount(PnlChart, {
      props: { history: series([500, 500, 500]) },
    });

    expect(flat.pathCount()).toBe(2);
    expect(flat.linePath()).toMatch(/C/);
  });

  it("renders nothing but the svg shell for fewer than two history points", () => {
    const empty = mount(PnlChart, { props: { history: [] } });
    expect(empty.hasSvg()).toBe(true);
    expect(empty.pathCount()).toBe(0);
    expect(empty.hasZeroLine()).toBe(false);

    const single = mount(PnlChart, { props: { history: series([42]) } });
    expect(single.pathCount()).toBe(0);
  });

  it("gives each mounted instance its own gradient id (no cross-instance id collisions)", () => {
    const first = mount(PnlChart, { props: { history: series([1, 2, 3]) } });
    const second = mount(PnlChart, { props: { history: series([4, 5, 6]) } });

    const firstFill = first.areaFill();
    const secondFill = second.areaFill();
    expect(firstFill).not.toBeNull();
    expect(firstFill).not.toBe(secondFill);
  });
});

function series(values: readonly number[]): HistoricPosition[] {
  return values.map((usdPnl, i) => {
    return { timestamp: new Date(i * 10_000).toISOString(), usdPnl };
  });
}
