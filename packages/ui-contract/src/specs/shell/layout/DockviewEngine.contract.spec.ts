import { DockviewEngine } from "@ui-contract/components";
import { cleanupMounted, mount } from "@ui-contract/mount";
import { afterEach, describe, expect, it } from "vitest";

afterEach(() => {
  cleanupMounted();
});

describe("DockviewLayoutEngine (shared harness)", () => {
  it("renders a dockview group per seed leaf with panel content mounted through the registry", () => {
    const page = mount(DockviewEngine, { props: {} });
    expect(page.engineAttr()).toBe("dockview");
    expect(page.groupsAttr()).toBe("4"); // fx default tree: 4 leaves
    expect(page.bodyVisible("fx-rates-body")).toBe(true);
    expect(page.bodyVisible("fx-blotter-body")).toBe(true);
    expect(page.tabTitles()).toEqual(
      expect.arrayContaining([
        "Live Rates",
        "Blotter",
        "Analytics",
        "Positions",
      ]),
    );
  });

  it("falls back to the seed on a corrupt persisted blob", () => {
    const page = mount(DockviewEngine, { props: { seedBlob: "{corrupt" } });
    expect(page.groupsAttr()).toBe("4");
  });

  it("persists layout changes through the injected store", async () => {
    const page = mount(DockviewEngine, { props: { maximized: "fx-rates" } });
    await page.waitForSave(); // host exposes a data-saved counter; see host
    expect(page.savedBlobParses()).toBe(true);
  });

  it("renders the head strip inside the panel when the head registry provides one", () => {
    const page = mount(DockviewEngine, { props: { withHeads: true } });
    expect(page.bodyVisible("custom-head")).toBe(true);
  });
});
