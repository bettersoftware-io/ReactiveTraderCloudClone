import { describe, it, expect } from "vitest";
import { mount } from "@ui-contract/mount";
import { ViewToggle } from "@ui-contract/components";

type ViewMode = "chart" | "price";

describe("ViewToggle", () => {
  it("offers the price view when currently in chart mode", () => {
    const toggle = mount(ViewToggle, { props: { mode: "chart", onChange: () => {} } });
    expect(toggle.label()).toMatch(/price/i);
    expect(toggle.title()).toMatch(/switch to price view/i);
  });

  it("offers the chart view when currently in price mode", () => {
    const toggle = mount(ViewToggle, { props: { mode: "price", onChange: () => {} } });
    expect(toggle.label()).toMatch(/chart/i);
    expect(toggle.title()).toMatch(/switch to chart view/i);
  });

  it("requests the opposite mode when clicked from chart", async () => {
    const modes: ViewMode[] = [];
    const toggle = mount(ViewToggle, {
      props: { mode: "chart", onChange: (m) => modes.push(m) },
    });
    await toggle.toggle();
    expect(modes).toEqual(["price"]);
  });

  it("requests the opposite mode when clicked from price", async () => {
    const modes: ViewMode[] = [];
    const toggle = mount(ViewToggle, {
      props: { mode: "price", onChange: (m) => modes.push(m) },
    });
    await toggle.toggle();
    expect(modes).toEqual(["chart"]);
  });

  it("relabels itself when the mode prop changes", () => {
    const toggle = mount(ViewToggle, { props: { mode: "chart", onChange: () => {} } });
    expect(toggle.label()).toMatch(/price/i);
    toggle.setProps({ mode: "price" });
    expect(toggle.label()).toMatch(/chart/i);
  });
});
