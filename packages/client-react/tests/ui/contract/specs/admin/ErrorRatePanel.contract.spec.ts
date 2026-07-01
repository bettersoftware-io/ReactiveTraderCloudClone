/**
 * ErrorRatePanel contract spec (Phase 5 Task 8).
 *
 * Verifies the panel renders its severity level badge correctly (ok/warn/error)
 * based on the latest value relative to the window peak, and shows the "NO DATA"
 * placeholder when no samples exist.
 */

import { ErrorRatePanel } from "@ui-contract/components";
import { cleanupMounted, mount } from "@ui-contract/mount";
import { afterEach, describe, expect, it } from "vitest";

afterEach(() => {
  cleanupMounted();
});

describe("ErrorRatePanel", () => {
  it("renders the panel element", () => {
    const panel = mount(ErrorRatePanel, {});
    expect(panel.isPresent()).toBe(true);
  });

  it("shows 'NO DATA' when no errorRate samples are seeded", () => {
    const panel = mount(ErrorRatePanel, {});
    expect(panel.isEmpty()).toBe(true);
  });

  it("shows 'ok' level when error rate is in the bottom third", () => {
    // peak = 1.0, latest = 0.2, fraction = 0.2 → ok
    const panel = mount(ErrorRatePanel, {
      admin: {
        metrics: {
          errorRate: [
            { t: 1000, value: 1.0 },
            { t: 2000, value: 0.2 },
          ],
        },
      },
    });
    expect(panel.level()).toBe("ok");
  });

  it("shows 'warn' level when error rate is in the middle third", () => {
    // peak = 1.0, latest = 0.5, fraction = 0.5 → warn
    const panel = mount(ErrorRatePanel, {
      admin: {
        metrics: {
          errorRate: [
            { t: 1000, value: 1.0 },
            { t: 2000, value: 0.5 },
          ],
        },
      },
    });
    expect(panel.level()).toBe("warn");
  });

  it("shows 'error' level when error rate is in the top third", () => {
    // peak = 1.0, latest = 0.8, fraction = 0.8 → error
    const panel = mount(ErrorRatePanel, {
      admin: {
        metrics: {
          errorRate: [
            { t: 1000, value: 1.0 },
            { t: 2000, value: 0.8 },
          ],
        },
      },
    });
    expect(panel.level()).toBe("error");
  });

  it("re-renders level when errorRate samples are updated", () => {
    const panel = mount(ErrorRatePanel, {});

    expect(panel.isEmpty()).toBe(true);

    panel.setMetrics({
      errorRate: [
        { t: 1000, value: 1.0 },
        { t: 2000, value: 0.9 },
      ],
    });

    expect(panel.isEmpty()).toBe(false);
    expect(panel.level()).toBe("error");
  });

  it("renders the sparkline when all error-rate values are identical (range=0 → 1)", () => {
    // Covers the `max - min || 1` branch in buildSparkline when all values are equal.
    const panel = mount(ErrorRatePanel, {
      admin: {
        metrics: {
          errorRate: [
            { t: 1000, value: 0.5 },
            { t: 2000, value: 0.5 },
          ],
        },
      },
    });

    // Sparkline should render (not "NO DATA") because there are 2+ points.
    expect(panel.isEmpty()).toBe(false);
    // Both values equal → latest = peak = 0.5, fraction = 1.0 → error (top third)
    expect(panel.level()).toBe("error");
  });
});
