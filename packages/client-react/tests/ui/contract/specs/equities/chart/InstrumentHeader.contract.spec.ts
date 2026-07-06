import { InstrumentHeader } from "@ui-contract/components";
import { cleanupMounted, mount } from "@ui-contract/mount";
import { afterEach, describe, expect, it } from "vitest";

import type { Candle, EquityQuote } from "@rtc/domain";

afterEach(() => {
  cleanupMounted();
});

const CANDLES: readonly Candle[] = [
  { time: 0, open: 100, high: 105, low: 98, close: 102 },
  { time: 60, open: 102, high: 108, low: 101, close: 104 },
];

describe("InstrumentHeader", () => {
  it("shows dashes when there is no quote or candle data yet", () => {
    const header = mount(InstrumentHeader, {
      props: {
        symbol: "AAPL",
        quote: null,
        candles: [],
        flashOn: false,
        flashDir: "up",
      },
    });

    expect(header.last()).toBe("—");
    expect(header.change()).toBe("—");
    expect(header.bid()).toBe("—");
    expect(header.ask()).toBe("—");
    expect(header.dayRange()).toBe("—");
  });

  it("renders the real quote's last/bid/ask verbatim (not the ±0.03 prototype offset)", () => {
    const header = mount(InstrumentHeader, {
      props: {
        symbol: "AAPL",
        quote: quote(),
        candles: CANDLES,
        flashOn: false,
        flashDir: "up",
      },
    });

    expect(header.last()).toBe("104.00");
    expect(header.bid()).toBe("103.90");
    expect(header.ask()).toBe("104.10");
  });

  it("derives the abs+pct change from quote.changePct", () => {
    const header = mount(InstrumentHeader, {
      props: {
        symbol: "AAPL",
        quote: quote({ last: 104, changePct: 2 }),
        candles: [],
        flashOn: false,
        flashDir: "up",
      },
    });

    // prev = 104 / 1.02 = 101.9608 -> chgAbs = 2.0392 -> "2.04"
    expect(header.change()).toBe("+2.04 (+2.00%)");
  });

  it("shows a negative change without the leading '+'", () => {
    const header = mount(InstrumentHeader, {
      props: {
        symbol: "AAPL",
        quote: quote({ last: 98, changePct: -2 }),
        candles: [],
        flashOn: false,
        flashDir: "down",
      },
    });

    expect(header.change()).toBe("-2.00 (-2.00%)");
  });

  it("computes DAY RANGE from the candle series stretched to include the live last", () => {
    const header = mount(InstrumentHeader, {
      props: {
        symbol: "AAPL",
        quote: quote({ last: 110 }),
        candles: CANDLES,
        flashOn: false,
        flashDir: "up",
      },
    });

    // series low/high = 98/108; live last 110 stretches the high to 110.
    expect(header.dayRange()).toBe("98.00 – 110.00");
  });

  it("reflects flashOn/flashDir via data-flash/data-dir on the last price", () => {
    const header = mount(InstrumentHeader, {
      props: {
        symbol: "AAPL",
        quote: quote(),
        candles: [],
        flashOn: true,
        flashDir: "down",
      },
    });

    expect(header.flashOn()).toBe(true);
    expect(header.flashDir()).toBe("down");

    header.setProps({ flashOn: false });

    expect(header.flashOn()).toBe(false);
  });

  it("derives a deterministic VOL string from the candle series (same input -> same output)", () => {
    const a = mount(InstrumentHeader, {
      props: {
        symbol: "AAPL",
        quote: quote(),
        candles: CANDLES,
        flashOn: false,
        flashDir: "up",
      },
    });
    const first = a.vol();

    const b = mount(InstrumentHeader, {
      props: {
        symbol: "AAPL",
        quote: quote(),
        candles: CANDLES,
        flashOn: false,
        flashDir: "up",
      },
    });

    expect(b.vol()).toBe(first);
    expect(first).toMatch(/^\d\.\dM$/);
  });
});

function quote(overrides: Partial<EquityQuote> = {}): EquityQuote {
  return {
    symbol: "AAPL",
    bid: 103.9,
    ask: 104.1,
    last: 104,
    changePct: 2,
    timestamp: 0,
    ...overrides,
  };
}
