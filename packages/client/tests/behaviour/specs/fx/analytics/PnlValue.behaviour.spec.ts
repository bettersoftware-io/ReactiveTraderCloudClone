import { describe, it, expect } from "vitest";
import { mount } from "@behaviour/mount";
import { PnlValue } from "@behaviour/components";

describe("PnlValue", () => {
  it("shows a positive value with a + sign", () => {
    expect(mount(PnlValue, { props: { value: 500 } }).text()).toBe("+500");
  });

  it("shows a negative value with a - sign", () => {
    expect(mount(PnlValue, { props: { value: -500 } }).text()).toBe("-500");
  });

  it("treats zero as positive", () => {
    expect(mount(PnlValue, { props: { value: 0 } }).text()).toBe("+0");
  });

  it("abbreviates thousands with one decimal and a k suffix", () => {
    expect(mount(PnlValue, { props: { value: 12_500 } }).text()).toBe("+12.5k");
    expect(mount(PnlValue, { props: { value: -2_500 } }).text()).toBe("-2.5k");
  });

  it("abbreviates millions with two decimals and an m suffix", () => {
    expect(mount(PnlValue, { props: { value: 1_500_000 } }).text()).toBe("+1.50m");
  });

  it("re-renders when its value prop changes", () => {
    const pnl = mount(PnlValue, { props: { value: 100 } });
    expect(pnl.text()).toBe("+100");
    pnl.setProps({ value: 12_500 });
    expect(pnl.text()).toBe("+12.5k");
  });
});
