import { SpreadDisplay, TilePrice } from "@ui-contract/components";
import { mount } from "@ui-contract/mount";
import { describe, expect, it } from "vitest";

import { type Price, PriceMovementType } from "@rtc/domain";

const price = (over: Partial<Price> = {}): Price => ({
  symbol: "EURUSD",
  bid: 1.53816,
  ask: 1.53834,
  mid: 1.53825,
  valueDate: "2026-06-15",
  creationTimestamp: 1_700_000_000_000,
  movementType: PriceMovementType.NONE,
  spread: "1.8",
  ...over,
});

describe("TilePrice", () => {
  it("labels the two sides SELL (bid) and BUY (ask)", () => {
    const tp = mount(TilePrice, {
      props: { price: price(), ratePrecision: 5, pipsPosition: 4 },
    });
    expect(tp.labels()).toEqual(["SELL", "BUY"]);
  });

  it("renders the formatted bid and ask digits", () => {
    const tp = mount(TilePrice, {
      props: { price: price(), ratePrecision: 5, pipsPosition: 4 },
    });
    expect(tp.digits("SELL")).toContain("1.53816");
    expect(tp.digits("BUY")).toContain("1.53834");
  });

  it("colours the pips green when the price ticked up", () => {
    const tp = mount(TilePrice, {
      props: {
        price: price({ movementType: PriceMovementType.UP }),
        ratePrecision: 5,
        pipsPosition: 4,
      },
    });
    expect(tp.pipsColor("BUY")).toBe("var(--accent-positive)");
  });

  it("colours the pips red when the price ticked down", () => {
    const tp = mount(TilePrice, {
      props: {
        price: price({ movementType: PriceMovementType.DOWN }),
        ratePrecision: 5,
        pipsPosition: 4,
      },
    });
    expect(tp.pipsColor("SELL")).toBe("var(--accent-negative)");
  });

  it("uses the neutral colour when there is no movement", () => {
    const tp = mount(TilePrice, {
      props: { price: price(), ratePrecision: 5, pipsPosition: 4 },
    });
    expect(tp.pipsColor("BUY")).toBe("var(--text-primary)");
  });

  it("handles a precision with no fractional sub-pip digits (JPY)", () => {
    // USDJPY: ratePrecision=3, pipsPosition=2 → fractionalDigits=1.
    const tp = mount(TilePrice, {
      props: {
        price: price({ symbol: "USDJPY", bid: 156.123, ask: 156.135 }),
        ratePrecision: 3,
        pipsPosition: 2,
      },
    });
    expect(tp.digits("SELL")).toContain("156.123");
  });

  it("renders no fractional sub-pip digits when precision equals pips position", () => {
    // ratePrecision === pipsPosition → fractionalDigits = 0 → fractional = "".
    const tp = mount(TilePrice, {
      props: {
        price: price({ bid: 1.5381, ask: 1.5383 }),
        ratePrecision: 4,
        pipsPosition: 4,
      },
    });
    expect(tp.digits("SELL")).toBe("1.5381");
  });

  it("updates the digits when a fresh price arrives", () => {
    const tp = mount(TilePrice, {
      props: { price: price(), ratePrecision: 5, pipsPosition: 4 },
    });
    tp.setProps({ price: price({ bid: 1.6, ask: 1.61 }) });
    expect(tp.digits("SELL")).toContain("1.60000");
  });
});

describe("SpreadDisplay", () => {
  it("renders the spread string", () => {
    const sd = mount(SpreadDisplay, { props: { spread: "1.8" } });
    expect(sd.text()).toBe("1.8");
  });

  it("updates when the spread changes", () => {
    const sd = mount(SpreadDisplay, { props: { spread: "1.8" } });
    sd.setProps({ spread: "2.4" });
    expect(sd.text()).toBe("2.4");
  });
});
