import { describe, it, expect } from "vitest";
import { mount } from "@ui-contract/mount";
import { RfqFilterTabs } from "@ui-contract/components";
import type { RfqFilter } from "@ui-contract/components";

describe("RfqFilterTabs", () => {
  it("renders the five filter tabs", () => {
    const tabs = mount(RfqFilterTabs, { props: { selected: "Live", onChange: () => {} } });
    expect(tabs.tabLabels()).toEqual(["Live", "All", "Done", "Expired", "Cancelled"]);
  });

  it("highlights the selected tab", () => {
    const tabs = mount(RfqFilterTabs, { props: { selected: "Done", onChange: () => {} } });
    expect(tabs.isActive("Done")).toBe(true);
    expect(tabs.isActive("Live")).toBe(false);
  });

  it("fires onChange with the clicked filter", async () => {
    const picks: RfqFilter[] = [];
    const tabs = mount(RfqFilterTabs, {
      props: { selected: "Live", onChange: (f) => picks.push(f) },
    });
    await tabs.clickTab("Expired");
    await tabs.clickTab("All");
    expect(picks).toEqual(["Expired", "All"]);
  });

  it("moves the highlight when the selected prop changes", () => {
    const tabs = mount(RfqFilterTabs, { props: { selected: "Live", onChange: () => {} } });
    expect(tabs.isActive("Live")).toBe(true);
    tabs.setProps({ selected: "Cancelled" });
    expect(tabs.isActive("Cancelled")).toBe(true);
    expect(tabs.isActive("Live")).toBe(false);
  });
});
