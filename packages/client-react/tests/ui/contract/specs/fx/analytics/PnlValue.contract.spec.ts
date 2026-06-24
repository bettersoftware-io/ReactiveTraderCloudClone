import { PnlValue } from "@ui-contract/components";
import { mount } from "@ui-contract/mount";
import { describe, expect, it } from "vitest";

describe("PnlValue", () => {
  it("shows a positive value with a USD prefix and + sign", () => {
    expect(mount(PnlValue, { props: { value: 500 } }).text()).toBe(
      "USD +500",
    );
  });

  it("shows a negative value with a USD prefix and - sign", () => {
    expect(mount(PnlValue, { props: { value: -500 } }).text()).toBe(
      "USD -500",
    );
  });

  it("treats zero as positive", () => {
    expect(mount(PnlValue, { props: { value: 0 } }).text()).toBe("USD +0");
  });

  it("formats thousands as a whole number with comma grouping", () => {
    expect(mount(PnlValue, { props: { value: 12_345 } }).text()).toBe(
      "USD +12,345",
    );
    expect(mount(PnlValue, { props: { value: -12_345 } }).text()).toBe(
      "USD -12,345",
    );
  });

  it("formats millions as a whole number with comma grouping", () => {
    expect(mount(PnlValue, { props: { value: 1_500_000 } }).text()).toBe(
      "USD +1,500,000",
    );
  });

  it("re-renders when its value prop changes", () => {
    const pnl = mount(PnlValue, { props: { value: 100 } });
    expect(pnl.text()).toBe("USD +100");
    pnl.setProps({ value: 12_345 });
    expect(pnl.text()).toBe("USD +12,345");
  });
});
