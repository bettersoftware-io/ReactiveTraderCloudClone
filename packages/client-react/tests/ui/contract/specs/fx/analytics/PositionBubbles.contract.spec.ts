import { PositionBubbles } from "@ui-contract/components";
import { cleanupMounted, mount } from "@ui-contract/mount";
import { afterEach, describe, expect, it } from "vitest";

import type { CurrencyPairPosition } from "@rtc/domain";

afterEach(() => {
  return cleanupMounted();
});

const pair = (
  symbol: string,
  baseTradedAmount: number,
  counterTradedAmount: number,
): CurrencyPairPosition => {
  return { symbol, basePnl: 0, baseTradedAmount, counterTradedAmount };
};

describe("PositionBubbles", () => {
  it("renders one bubble per non-zero currency, base+counter aggregated", () => {
    const bubbles = mount(PositionBubbles, {
      props: {
        positions: [
          pair("EURUSD", -2_000_000, 2_726_570),
          pair("USDJPY", -1_000_000, 102_144_000),
          pair("GBPJPY", 0, 0),
        ],
      },
    });
    // EUR (base of EURUSD), USD (base USDJPY + counter EURUSD),
    // JPY (counter USDJPY). GBPJPY is all-zero -> dropped.
    expect(bubbles.currencyLabels()).toEqual(["EUR", "JPY", "USD"]);
  });

  it("colours bubbles by the sign of the aggregated traded amount", () => {
    const bubbles = mount(PositionBubbles, {
      props: { positions: [pair("EURUSD", -2_000_000, 2_726_570)] },
    });
    expect(bubbles.signFor("EUR")).toBe("neg"); // -2,000,000
    expect(bubbles.signFor("USD")).toBe("pos"); // +2,726,570
  });

  it("scales radii within [15, 60]", () => {
    const bubbles = mount(PositionBubbles, {
      props: {
        positions: [
          pair("EURUSD", 1_000_000, 0),
          pair("USDJPY", -3_000_000, 0),
        ],
      },
    });
    for (const ccy of ["EUR", "USD"]) {
      expect(bubbles.radiusFor(ccy)).toBeGreaterThanOrEqual(15);
      expect(bubbles.radiusFor(ccy)).toBeLessThanOrEqual(60);
    }
  });

  it("shows a tooltip of '{currency} {whole-number amount}' on hover", () => {
    const bubbles = mount(PositionBubbles, {
      props: { positions: [pair("EURUSD", -2_000_000, 2_726_570)] },
    });
    expect(bubbles.tooltipAfterHover("EUR")).toBe("EUR -2,000,000");
  });
});
