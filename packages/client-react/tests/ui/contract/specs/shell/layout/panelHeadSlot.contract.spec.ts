import { LayoutEngine } from "@ui-contract/components";
import { cleanupMounted, mount } from "@ui-contract/mount";
import { afterEach, describe, expect, it } from "vitest";

afterEach(() => {
  cleanupMounted();
});

describe("InhouseLayoutEngine panel head slot", () => {
  it("renders the registered head content in place of the title span", () => {
    const page = mount(LayoutEngine, {
      props: { customHeadPanelIds: ["fx-rates"] },
    });
    expect(page.hasCustomHead("fx-rates")).toBe(true);
    expect(page.titleText("fx-rates")).toBeNull();
  });

  it("still round-trips collapse/expand (to the strip restore bar and back) when a custom head is registered", () => {
    const page = mount(LayoutEngine, {
      props: { customHeadPanelIds: ["fx-rates"] },
    });
    page.collapse("fx-rates");
    expect(page.isStrip("fx-rates")).toBe(true);
    page.expand("fx-rates");
    expect(page.isStrip("fx-rates")).toBe(false);
  });

  it("leaves panels without a registered head on the default title", () => {
    const page = mount(LayoutEngine, {
      props: { customHeadPanelIds: ["fx-rates"] },
    });
    expect(page.hasCustomHead("fx-analytics")).toBe(false);
    expect(page.titleText("fx-analytics")).toBe("Analytics");
  });

  it("renders the default title for every panel when no headRegistry is set", () => {
    const page = mount(LayoutEngine, {});
    expect(page.hasCustomHead("fx-rates")).toBe(false);
    expect(page.titleText("fx-rates")).toBe("Live Rates");
  });
});
