/**
 * ThroughputChart contract spec (v2 Parity E Task 2).
 *
 * Verifies the SVG gradient-glow area chart renders its smoothed area+line
 * paths (Catmull-Rom `d` strings from the shared throughputPaths vm,
 * client-core) once throughput samples are seeded, and shows the "NO DATA"
 * placeholder when the series is empty. The chart was ported from a <canvas>
 * draw to SVG, so pixel output is owned by the visual (browser) tier; this
 * tier only asserts the DOM-visible paths.
 */

import { ThroughputChart } from "@ui-contract/components";
import { cleanupMounted, mount } from "@ui-contract/mount";
import { afterEach, describe, expect, it } from "vitest";

afterEach(() => {
  cleanupMounted();
});

describe("ThroughputChart", () => {
  it("renders the chart wrapper element", () => {
    const chart = mount(ThroughputChart, {});
    expect(chart.isPresent()).toBe(true);
  });

  it("shows 'NO DATA' placeholder when no samples are seeded", () => {
    const chart = mount(ThroughputChart, {});
    expect(chart.isEmpty()).toBe(true);
    expect(chart.svg()).toBeNull();
  });

  it("hides the 'NO DATA' placeholder and renders the SVG when samples are seeded", () => {
    const chart = mount(ThroughputChart, {
      admin: {
        metrics: {
          throughput: [
            { t: 1000, value: 100 },
            { t: 2000, value: 150 },
          ],
        },
      },
    });
    expect(chart.isEmpty()).toBe(false);
    expect(chart.svg()).not.toBeNull();
  });

  it("renders the gradient area path closed to the chart's bottom edge", () => {
    const chart = mount(ThroughputChart, {
      admin: {
        metrics: {
          throughput: [
            { t: 1000, value: 100 },
            { t: 2000, value: 150 },
          ],
        },
      },
    });
    expect(chart.areaPath()).toMatch(/^M0\.0,/);
    expect(chart.areaPath()).toMatch(/L300,96 L0,96 Z$/);
  });

  it("renders the glow line as a smoothed cubic-Bézier path", () => {
    const chart = mount(ThroughputChart, {
      admin: {
        metrics: {
          throughput: [
            { t: 1000, value: 100 },
            { t: 2000, value: 150 },
          ],
        },
      },
    });
    expect(chart.linePath()).toMatch(/^M/);
    expect(chart.linePath()).toContain(" C");
  });

  it("re-renders when throughput samples are pushed", () => {
    const chart = mount(ThroughputChart, {});

    expect(chart.isEmpty()).toBe(true);

    chart.setMetrics({
      throughput: [
        { t: 1000, value: 80 },
        { t: 2000, value: 120 },
      ],
    });

    expect(chart.isEmpty()).toBe(false);
    expect(chart.svg()).not.toBeNull();
  });
});
