import { describe, it, expect, afterEach } from "vitest";
import { mount, cleanupMounted } from "@ui-contract/mount";
import { Header } from "@ui-contract/components";
import type { WorkspaceTab } from "../../../shared/pages/shell/layout/HeaderPage";

afterEach(() => cleanupMounted());

describe("Header", () => {
  it("renders the title and the three workspace tabs", () => {
    const header = mount(Header, { props: { activeTab: "fx", onTabChange: () => {} } });
    expect(header.title()).toBe("Reactive Trader");
    expect(header.tabLabels()).toEqual(["FX", "Credit", "Admin"]);
  });

  it("highlights the active tab", () => {
    const header = mount(Header, { props: { activeTab: "credit", onTabChange: () => {} } });
    expect(header.isActive("credit")).toBe(true);
    expect(header.isActive("fx")).toBe(false);
    expect(header.isActive("admin")).toBe(false);
  });

  it("reports the clicked tab through onTabChange", async () => {
    const changes: WorkspaceTab[] = [];
    const header = mount(Header, {
      props: { activeTab: "fx", onTabChange: (tab) => changes.push(tab) },
    });
    await header.clickTab("credit");
    await header.clickTab("admin");
    expect(changes).toEqual(["credit", "admin"]);
  });

  it("moves the highlight when the active tab prop changes", () => {
    const header = mount(Header, { props: { activeTab: "fx", onTabChange: () => {} } });
    expect(header.isActive("fx")).toBe(true);
    header.setProps({ activeTab: "admin" });
    expect(header.isActive("admin")).toBe(true);
    expect(header.isActive("fx")).toBe(false);
  });
});
