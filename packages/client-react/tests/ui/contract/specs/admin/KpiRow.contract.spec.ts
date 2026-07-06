/**
 * KpiRow contract spec (v2 Parity E Task 2).
 *
 * Verifies the 4-up KPI strip renders throughput / P99-latency / error-rate /
 * active-sessions cards from the shared kpisVm (client-core), fed by
 * useMetrics + useSessionCountSeries — values, units, deltas, warn flags and
 * sparklines all derive from seeded fake metric data.
 */

import { KpiRow } from "@ui-contract/components";
import { cleanupMounted, mount } from "@ui-contract/mount";
import { afterEach, describe, expect, it } from "vitest";

afterEach(() => {
  cleanupMounted();
});

describe("KpiRow", () => {
  it("renders the row wrapper and all 4 KPI cards", () => {
    const row = mount(KpiRow, {});
    expect(row.isPresent()).toBe(true);
    expect(row.hasAllCards()).toBe(true);
  });

  it("shows zeroed values when no metric samples are seeded", () => {
    const row = mount(KpiRow, {});
    expect(row.value("tput")).toBe("0.00");
    expect(row.value("lat")).toBe("0");
    expect(row.value("err")).toBe("0.00");
    expect(row.value("sess")).toBe("0");
  });

  it("formats the throughput KPI in k msg/s from the latest sample", () => {
    const row = mount(KpiRow, {
      admin: {
        metrics: {
          throughput: [
            { t: 1000, value: 1200 },
            { t: 2000, value: 2500 },
          ],
        },
      },
    });
    expect(row.value("tput")).toBe("2.50");
    expect(row.unit("tput")).toBe("k msg/s");
  });

  it("flags the latency KPI as warn when the latest sample exceeds 60ms", () => {
    const row = mount(KpiRow, {
      admin: {
        metrics: {
          latency: [
            { t: 1000, value: 20 },
            { t: 2000, value: 75 },
          ],
        },
      },
    });
    expect(row.value("lat")).toBe("75");
    expect(row.isWarn("lat")).toBe(true);
  });

  it("does not flag the latency KPI as warn at or below the 60ms threshold", () => {
    const row = mount(KpiRow, {
      admin: {
        metrics: {
          latency: [{ t: 1000, value: 60 }],
        },
      },
    });
    expect(row.isWarn("lat")).toBe(false);
  });

  it("flags the error-rate KPI as warn when the latest sample exceeds 0.8%", () => {
    const row = mount(KpiRow, {
      admin: {
        metrics: {
          errorRate: [
            { t: 1000, value: 0.2 },
            { t: 2000, value: 0.95 },
          ],
        },
      },
    });
    expect(row.value("err")).toBe("0.95");
    expect(row.isWarn("err")).toBe(true);
  });

  it("reflects the active-sessions KPI from the session-count series", () => {
    const row = mount(KpiRow, {
      admin: {
        sessionCountSeries: [
          { t: 1000, value: 10 },
          { t: 2000, value: 25 },
        ],
      },
    });
    expect(row.value("sess")).toBe("25");
    expect(row.delta("sess")).toMatch(/^▲ \+/);
  });

  it("renders a non-empty sparkline for a multi-sample series", () => {
    const row = mount(KpiRow, {
      admin: {
        metrics: {
          throughput: [
            { t: 1000, value: 100 },
            { t: 2000, value: 200 },
            { t: 3000, value: 150 },
          ],
        },
      },
    });
    expect(row.sparkPoints("tput")).not.toBe("");
  });

  it("re-renders when metric samples are pushed", () => {
    const row = mount(KpiRow, {});
    expect(row.value("tput")).toBe("0.00");

    row.setMetrics({
      throughput: [{ t: 1000, value: 3000 }],
    });

    expect(row.value("tput")).toBe("3.00");
  });

  it("re-renders when the session-count series is pushed", () => {
    const row = mount(KpiRow, {});
    expect(row.value("sess")).toBe("0");

    row.setSessionCountSeries([{ t: 1000, value: 42 }]);

    expect(row.value("sess")).toBe("42");
  });
});
