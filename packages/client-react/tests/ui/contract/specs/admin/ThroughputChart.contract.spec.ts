/**
 * ThroughputChart contract spec (Phase 5 Task 8).
 *
 * Verifies the chart wrapper renders and shows its "NO DATA" placeholder when
 * no samples are seeded. The canvas draw path early-returns in jsdom (no 2D
 * context), so only DOM-assertable behaviour is tested here; pixel output is
 * owned by the visual (browser) tier.
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
  });

  it("hides the 'NO DATA' placeholder when samples are seeded", () => {
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
  });

  it("renders a canvas element (even though jsdom has no 2D context)", () => {
    const chart = mount(ThroughputChart, {});
    expect(chart.canvas()).not.toBeNull();
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
  });
});
