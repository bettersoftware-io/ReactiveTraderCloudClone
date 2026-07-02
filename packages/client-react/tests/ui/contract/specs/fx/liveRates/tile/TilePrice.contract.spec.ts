import { SpreadDisplay, TilePrice } from "@ui-contract/components";
import { mount } from "@ui-contract/mount";
import type { TilePriceProps } from "@ui-contract/pages/fx/liveRates/tile/TilePricePage";
import { describe, expect, it } from "vitest";

import { Direction, type Price, PriceMovementType } from "@rtc/domain";

describe("TilePrice", () => {
  it("labels the two sides SELL (bid) and BUY (ask)", () => {
    const tp = mount(TilePrice, { props: tileProps() });
    expect(tp.labels()).toEqual(["SELL", "BUY"]);
  });

  it("renders the formatted bid and ask digits", () => {
    const tp = mount(TilePrice, { props: tileProps() });
    expect(tp.digits("SELL")).toContain("1.53816");
    expect(tp.digits("BUY")).toContain("1.53834");
  });

  it("colours the pips green when the price ticked up", () => {
    const tp = mount(TilePrice, {
      props: tileProps({
        price: price({ movementType: PriceMovementType.UP }),
      }),
    });
    expect(tp.pipsColor("BUY")).toBe("var(--accent-positive)");
  });

  it("colours the pips red when the price ticked down", () => {
    const tp = mount(TilePrice, {
      props: tileProps({
        price: price({ movementType: PriceMovementType.DOWN }),
      }),
    });
    expect(tp.pipsColor("SELL")).toBe("var(--accent-negative)");
  });

  it("uses the neutral colour when there is no movement", () => {
    const tp = mount(TilePrice, { props: tileProps() });
    expect(tp.pipsColor("BUY")).toBe("var(--text-primary)");
  });

  it("handles a precision with no fractional sub-pip digits (JPY)", () => {
    // USDJPY: ratePrecision=3, pipsPosition=2 → fractionalDigits=1.
    const tp = mount(TilePrice, {
      props: tileProps({
        price: price({ symbol: "USDJPY", bid: 156.123, ask: 156.135 }),
        ratePrecision: 3,
        pipsPosition: 2,
      }),
    });
    expect(tp.digits("SELL")).toContain("156.123");
  });

  it("renders no fractional sub-pip digits when precision equals pips position", () => {
    // ratePrecision === pipsPosition → fractionalDigits = 0 → fractional = "".
    const tp = mount(TilePrice, {
      props: tileProps({
        price: price({ bid: 1.5381, ask: 1.5383 }),
        ratePrecision: 4,
        pipsPosition: 4,
      }),
    });
    expect(tp.digits("SELL")).toBe("1.5381");
  });

  it("updates the digits when a fresh price arrives", () => {
    const tp = mount(TilePrice, { props: tileProps() });
    tp.setProps({ price: price({ bid: 1.6, ask: 1.61 }) });
    expect(tp.digits("SELL")).toContain("1.60000");
  });

  it("renders the spread between the two price boxes", () => {
    const tp = mount(TilePrice, { props: tileProps({ spread: "1.8" }) });
    expect(tp.spreadText()).toBe("1.8");
  });

  it("fires onExecute with Sell when the sell price box is clicked", async () => {
    const calls: Direction[] = [];
    const tp = mount(TilePrice, {
      props: tileProps({
        onExecute: (d: Direction) => {
          calls.push(d);
        },
      }),
    });
    await tp.click("SELL");
    expect(calls).toEqual([Direction.Sell]);
  });

  it("fires onExecute with Buy when the buy price box is clicked", async () => {
    const calls: Direction[] = [];
    const tp = mount(TilePrice, {
      props: tileProps({
        onExecute: (d: Direction) => {
          calls.push(d);
        },
      }),
    });
    await tp.click("BUY");
    expect(calls).toEqual([Direction.Buy]);
  });

  it("disables both price boxes when disabled", () => {
    const tp = mount(TilePrice, { props: tileProps({ disabled: true }) });
    expect(tp.isDisabled("SELL")).toBe(true);
    expect(tp.isDisabled("BUY")).toBe(true);
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

function price(over: Partial<Price> = {}): Price {
  return {
    symbol: "EURUSD",
    bid: 1.53816,
    ask: 1.53834,
    mid: 1.53825,
    valueDate: "2026-06-15",
    creationTimestamp: 1_700_000_000_000,
    movementType: PriceMovementType.NONE,
    spread: "1.8",
    ...over,
  };
}

function tileProps(over: Partial<TilePriceProps> = {}): TilePriceProps {
  return {
    price: price(),
    ratePrecision: 5,
    pipsPosition: 4,
    spread: "1.8",
    onExecute: () => {},
    disabled: false,
    ...over,
  };
}
