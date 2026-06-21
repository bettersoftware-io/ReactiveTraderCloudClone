import { describe, it, expect } from "vitest";
import { Direction } from "@rtc/domain";
import { mount } from "@ui-contract/mount";
import { TileExecution } from "@ui-contract/components";

describe("TileExecution", () => {
  it("renders Sell and Buy buttons", () => {
    const ex = mount(TileExecution, { props: { onExecute: () => {}, disabled: false } });
    expect(ex.sellLabel()).toBe("Sell");
    expect(ex.buyLabel()).toBe("Buy");
  });

  it("fires onExecute with Sell when the sell button is clicked", async () => {
    const calls: Direction[] = [];
    const ex = mount(TileExecution, {
      props: { onExecute: (d) => calls.push(d), disabled: false },
    });
    await ex.clickSell();
    expect(calls).toEqual([Direction.Sell]);
  });

  it("fires onExecute with Buy when the buy button is clicked", async () => {
    const calls: Direction[] = [];
    const ex = mount(TileExecution, {
      props: { onExecute: (d) => calls.push(d), disabled: false },
    });
    await ex.clickBuy();
    expect(calls).toEqual([Direction.Buy]);
  });

  it("disables both buttons when disabled", () => {
    const ex = mount(TileExecution, { props: { onExecute: () => {}, disabled: true } });
    expect(ex.isSellDisabled()).toBe(true);
    expect(ex.isBuyDisabled()).toBe(true);
  });

  it("re-enables the buttons when the disabled prop clears", () => {
    const ex = mount(TileExecution, { props: { onExecute: () => {}, disabled: true } });
    expect(ex.isSellDisabled()).toBe(true);
    ex.setProps({ disabled: false });
    expect(ex.isSellDisabled()).toBe(false);
  });
});
