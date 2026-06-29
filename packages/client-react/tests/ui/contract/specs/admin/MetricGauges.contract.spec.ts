/**
 * MetricGauges contract spec (Phase 5 Task 8).
 *
 * Verifies that MetricGauges renders three radial gauges (throughput, latency,
 * errorRate), reflecting the latest sample value from each metric series.
 *
 * NOTE: Individual gauge divs carry data-metric but NOT data-testid="metric-<metric>"
 * — the page object uses [data-metric] selectors (reported gap; component not
 * modified per task constraint).
 */

import { MetricGauges } from "@ui-contract/components";
import { cleanupMounted, mount } from "@ui-contract/mount";
import { afterEach, describe, expect, it } from "vitest";

afterEach(() => {
  cleanupMounted();
});

describe("MetricGauges", () => {
  it("renders all three gauge elements", () => {
    const gauges = mount(MetricGauges, {});
    expect(gauges.hasGauge("throughput")).toBe(true);
    expect(gauges.hasGauge("latency")).toBe(true);
    expect(gauges.hasGauge("errorRate")).toBe(true);
  });

  it("shows 0 values when no metric samples are seeded", () => {
    const gauges = mount(MetricGauges, {});
    // 0 throughput → "0/s", 0 latency → "0ms", 0 errorRate → "0.00"
    expect(gauges.gaugeValue("throughput")).toBe("0/s");
    expect(gauges.gaugeValue("latency")).toBe("0ms");
    expect(gauges.gaugeValue("errorRate")).toBe("0.00");
  });

  it("reflects the latest throughput sample value", () => {
    const gauges = mount(MetricGauges, {
      admin: {
        metrics: {
          throughput: [
            { t: 1000, value: 100 },
            { t: 2000, value: 250 },
          ],
        },
      },
    });
    // Latest value is 250 → "250/s"
    expect(gauges.gaugeValue("throughput")).toBe("250/s");
  });

  it("reflects the latest latency sample value", () => {
    const gauges = mount(MetricGauges, {
      admin: {
        metrics: {
          latency: [
            { t: 1000, value: 20 },
            { t: 2000, value: 45 },
          ],
        },
      },
    });
    expect(gauges.gaugeValue("latency")).toBe("45ms");
  });

  it("reflects the latest error-rate sample value", () => {
    const gauges = mount(MetricGauges, {
      admin: {
        metrics: {
          errorRate: [
            { t: 1000, value: 0.03 },
            { t: 2000, value: 0.07 },
          ],
        },
      },
    });
    expect(gauges.gaugeValue("errorRate")).toBe("0.07");
  });

  it("re-renders when the metrics$ subject is updated", () => {
    const gauges = mount(MetricGauges, {});

    expect(gauges.gaugeValue("throughput")).toBe("0/s");

    gauges.setMetrics({
      throughput: [{ t: 1000, value: 300 }],
    });

    expect(gauges.gaugeValue("throughput")).toBe("300/s");
  });

  it("all three gauges update when new metric samples arrive", () => {
    const gauges = mount(MetricGauges, {});

    gauges.setMetrics({
      throughput: [{ t: 1000, value: 150 }],
      latency: [{ t: 1000, value: 30 }],
      errorRate: [{ t: 1000, value: 0.02 }],
    });

    expect(gauges.gaugeValue("throughput")).toBe("150/s");
    expect(gauges.gaugeValue("latency")).toBe("30ms");
    expect(gauges.gaugeValue("errorRate")).toBe("0.02");
  });
});
