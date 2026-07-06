/**
 * LatencyHistogram contract spec (v2 Parity E Task 2).
 *
 * Verifies the histogram renders 6 fixed latency buckets (via the shared
 * latencyBuckets vm, client-core) from seeded latency samples, flags the
 * modal (highest-count) bucket with data-accent, and shows the "NO DATA"
 * placeholder when the series is empty. Unlike the prototype's static
 * jittered seed, the bucket heights and the accent bucket are computed from
 * the actual sample distribution — this tier pins the UI wiring; bucket-math
 * edge cases are covered by adminKpisVm.test.ts in client-core.
 */

import { LatencyHistogram } from "@ui-contract/components";
import { cleanupMounted, mount } from "@ui-contract/mount";
import { afterEach, describe, expect, it } from "vitest";

afterEach(() => {
  cleanupMounted();
});

describe("LatencyHistogram", () => {
  it("renders the histogram wrapper element", () => {
    const hist = mount(LatencyHistogram, {});
    expect(hist.isPresent()).toBe(true);
  });

  it("shows 'NO DATA' placeholder when no samples are seeded", () => {
    const hist = mount(LatencyHistogram, {});
    expect(hist.isEmpty()).toBe(true);
    expect(hist.barCount()).toBe(0);
  });

  it("hides 'NO DATA' and renders all 6 fixed buckets when latency samples are seeded", () => {
    const hist = mount(LatencyHistogram, {
      admin: {
        metrics: {
          latency: [
            { t: 1000, value: 5 },
            { t: 2000, value: 35 },
            { t: 3000, value: 200 },
          ],
        },
      },
    });

    expect(hist.isEmpty()).toBe(false);
    expect(hist.barCount()).toBe(6);
    expect(hist.labels()).toEqual([
      "<10",
      "10-25",
      "25-50",
      "50-80",
      "80-150",
      "150+",
    ]);
  });

  it("flags the modal (highest-count) bucket with data-accent", () => {
    const hist = mount(LatencyHistogram, {
      admin: {
        metrics: {
          latency: [
            { t: 1000, value: 5 },
            { t: 2000, value: 6 },
            { t: 3000, value: 7 },
            { t: 4000, value: 200 },
          ],
        },
      },
    });

    // 3 samples land in "<10" vs 1 in "150+" → "<10" is the modal bucket.
    expect(hist.accentLabel()).toBe("<10");
  });

  it("re-renders when latency samples are pushed", () => {
    const hist = mount(LatencyHistogram, {});

    expect(hist.isEmpty()).toBe(true);

    hist.setMetrics({
      latency: [
        { t: 1000, value: 30 },
        { t: 2000, value: 45 },
      ],
    });

    expect(hist.isEmpty()).toBe(false);
    expect(hist.barCount()).toBe(6);
  });
});
