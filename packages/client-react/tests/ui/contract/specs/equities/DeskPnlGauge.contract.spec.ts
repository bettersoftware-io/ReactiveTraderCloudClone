import { DeskPnlGauge } from "@ui-contract/components";
import { cleanupMounted, mount } from "@ui-contract/mount";
import { afterEach, describe, expect, it } from "vitest";

import type { EquityPosition } from "@rtc/domain";

afterEach(() => {
  cleanupMounted();
});

describe("DeskPnlGauge", () => {
  it("reads positive aggregate P&L as a + sign with a fill arc", () => {
    const gauge = mount(DeskPnlGauge, {
      props: { positions: [position("AAPL", 5000), position("MSFT", 1000)] },
    });

    expect(gauge.sign()).toBe("pos");
    expect(gauge.value()).toBe("+6.0k");
    // Track + fill arc both drawn.
    expect(gauge.fillArcCount()).toBe(2);
  });

  it("reads negative aggregate P&L as a − sign", () => {
    const gauge = mount(DeskPnlGauge, {
      props: { positions: [position("AAPL", -300)] },
    });

    expect(gauge.sign()).toBe("neg");
    expect(gauge.value()).toBe("-300");
  });

  it("suppresses the fill arc when aggregate P&L is flat", () => {
    const gauge = mount(DeskPnlGauge, {
      props: { positions: [position("AAPL", 500), position("MSFT", -500)] },
    });

    expect(gauge.value()).toBe("+0");
    // Only the track path is drawn (degenerate zero arc suppressed).
    expect(gauge.fillArcCount()).toBe(1);
  });

  it("renders a flat track for an empty desk", () => {
    const gauge = mount(DeskPnlGauge, { props: { positions: [] } });

    expect(gauge.value()).toBe("+0");
    expect(gauge.fillArcCount()).toBe(1);
  });

  // buildGaugePaths' `maxAbsPnl > 0 ? maxAbsPnl : 1` guard is unreachable
  // through ordinary (even all-zero) positions: `Math.max(...abs, 1)` always
  // floors at 1, so `maxAbsPnl > 0` is already true before this ternary runs.
  // The only way to make `maxAbsPnl` fail that check — without touching
  // production code to export buildGaugePaths for a direct unit test — is a
  // row whose unrealisedPnl is NaN (`Math.abs(NaN)` poisons the whole
  // `Math.max` call to NaN, and `NaN > 0` is false): a defensive fallback
  // against corrupt upstream P&L data. It must still render without throwing
  // (the resulting NaN geometry is a separate, pre-existing display quirk —
  // not something this coverage pass is asked to fix).
  it("does not throw when a position's P&L is NaN (falls back the divisor, not the degenerate-arc check)", () => {
    expect(() => {
      mount(DeskPnlGauge, {
        props: { positions: [position("AAPL", Number.NaN)] },
      });
    }).not.toThrow();
  });
});

function position(symbol: string, unrealisedPnl: number): EquityPosition {
  return { symbol, qty: 100, avgPrice: 100, markPrice: 100, unrealisedPnl };
}
