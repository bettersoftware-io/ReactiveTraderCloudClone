import { LayoutEngine } from "@ui-contract/components";
import { cleanupMounted, mount } from "@ui-contract/mount";
import { afterEach, describe, expect, it } from "vitest";

afterEach(() => {
  cleanupMounted();
});

describe("InhouseLayoutEngine", () => {
  it("renders the fx arrangement: rates + analytics fill, blotter pinned", () => {
    const page = mount(LayoutEngine, {});
    expect(page.bodyText("fx-rates")).toBe("RATES");
    expect(page.bodyText("fx-analytics")).toBe("ANALYTICS");
    expect(page.bodyText("fx-blotter")).toBe("BLOTTER");
    expect(page.isPinned("fx-blotter")).toBe(true);
  });

  it("shows a resize handle between the two content panes", () => {
    const page = mount(LayoutEngine, {});
    // content row is child 0 of the root column split → pathKey "0"
    expect(page.handleExists("0", 0)).toBe(true);
  });

  it("maximize collapses the other panels to strips; restore brings them back", () => {
    const page = mount(LayoutEngine, {});
    page.maximize("fx-rates");
    expect(page.isStrip("fx-analytics")).toBe(true);
    expect(page.isStrip("fx-blotter")).toBe(true);
    page.maximize("fx-rates"); // button toggles to restore when maximized
    expect(page.isStrip("fx-analytics")).toBe(false);
  });

  it("collapse hides a panel body and marks it a strip; expand restores it", () => {
    const page = mount(LayoutEngine, {});
    page.collapse("fx-analytics");
    expect(page.isStrip("fx-analytics")).toBe(true);
    expect(page.bodyText("fx-analytics")).toBeNull();
    page.expand("fx-analytics");
    expect(page.isStrip("fx-analytics")).toBe(false);
    expect(page.bodyText("fx-analytics")).toBe("ANALYTICS");
  });
});
