/**
 * LatencyHistogram contract spec (Phase 5 Task 8).
 *
 * Verifies the histogram renders its wrapper and SVG bars from seeded latency
 * samples, and shows the "NO DATA" placeholder when the series is empty.
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
  });

  it("hides 'NO DATA' and renders bars when latency samples are seeded", () => {
    const hist = mount(LatencyHistogram, {
      admin: {
        metrics: {
          latency: [
            { t: 1000, value: 20 },
            { t: 2000, value: 35 },
            { t: 3000, value: 50 },
          ],
        },
      },
    });

    expect(hist.isEmpty()).toBe(false);
    expect(hist.barCount()).toBe(3);
  });

  it("shows the peak latency in the header", () => {
    const hist = mount(LatencyHistogram, {
      admin: {
        metrics: {
          latency: [
            { t: 1000, value: 20 },
            { t: 2000, value: 75 },
          ],
        },
      },
    });

    const peak = hist.peakText();
    expect(peak).toMatch(/75/);
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
    expect(hist.barCount()).toBe(2);
  });
});
