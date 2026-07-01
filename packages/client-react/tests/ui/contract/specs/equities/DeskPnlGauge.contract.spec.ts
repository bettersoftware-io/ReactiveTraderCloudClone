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
});

function position(symbol: string, unrealisedPnl: number): EquityPosition {
  return { symbol, qty: 100, avgPrice: 100, markPrice: 100, unrealisedPnl };
}
