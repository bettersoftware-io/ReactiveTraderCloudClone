import { PnlValue } from "@ui-contract/components";
import { mount } from "@ui-contract/mount";
import { describe, expect, it } from "vitest";

describe("PnlValue", () => {
  it("shows a positive value in +$X.Xk headline format", () => {
    expect(mount(PnlValue, { props: { value: 500 } }).text()).toBe("+$0.5k");
  });

  it("shows a negative value in -$X.Xk headline format", () => {
    expect(mount(PnlValue, { props: { value: -500 } }).text()).toBe("-$0.5k");
  });

  it("treats zero as positive", () => {
    expect(mount(PnlValue, { props: { value: 0 } }).text()).toBe("+$0.0k");
  });

  it("matches the PROTO headline format", () => {
    expect(mount(PnlValue, { props: { value: 12_345 } }).text()).toMatch(
      /^[+-]\$\d+\.\dk$/,
    );
    expect(mount(PnlValue, { props: { value: -12_345 } }).text()).toBe(
      "-$12.3k",
    );
  });

  it("formats millions in the same k-scale headline", () => {
    expect(mount(PnlValue, { props: { value: 1_500_000 } }).text()).toBe(
      "+$1500.0k",
    );
  });

  it("re-renders when its value prop changes", () => {
    const pnl = mount(PnlValue, { props: { value: 100 } });
    expect(pnl.text()).toBe("+$0.1k");
    pnl.setProps({ value: 12_345 });
    expect(pnl.text()).toBe("+$12.3k");
  });
});
