import { LayoutEngine } from "@ui-contract/components";
import { cleanupMounted, mount } from "@ui-contract/mount";
import { afterEach, describe, expect, it } from "vitest";

afterEach(() => {
  cleanupMounted();
});

describe("InhouseLayoutEngine", () => {
  it("renders the fx arrangement: rates + a resizable right column (analytics over positions), blotter resizable (not pinned)", () => {
    const page = mount(LayoutEngine, {});
    expect(page.bodyText("fx-rates")).toBe("RATES");
    expect(page.bodyText("fx-analytics")).toBe("ANALYTICS");
    expect(page.bodyText("fx-positions")).toBe("POSITIONS");
    expect(page.bodyText("fx-blotter")).toBe("BLOTTER");
    expect(page.isPinned("fx-blotter")).toBe(false);
  });

  it("shows a resize handle between rates and the right column (no fixedPx suppressing it)", () => {
    const page = mount(LayoutEngine, {});
    // content row is child 0 of the root column split → pathKey "0"
    expect(page.handleExists("0", 0)).toBe(true);
  });

  it("shows a resize handle between analytics and positions inside the right column", () => {
    const page = mount(LayoutEngine, {});
    // the right column is child 1 of the content row → pathKey "0.1"
    expect(page.handleExists("0.1", 0)).toBe(true);
  });

  it("shows a resize handle between the content row and the blotter (blotter is no longer pinned)", () => {
    const page = mount(LayoutEngine, {});
    // root path is [] → pathKey ""
    expect(page.handleExists("", 0)).toBe(true);
  });

  it("renders split handles as siblings between cells, not inside them", () => {
    const page = mount(LayoutEngine, {});
    // the analytics/positions rail is a column split at pathKey "0.1"
    const handle = page.handleElement("0.1", 0);
    expect(handle.parentElement?.getAttribute("data-dir")).toBe("column");
    expect(handle.previousElementSibling?.getAttribute("data-testid")).toBe(
      "cell-0.1-0",
    );
  });

  it("shows the maximize glyph, swapping to the restore glyph once maximized, with matching aria-labels", () => {
    const page = mount(LayoutEngine, {});
    expect(page.maximizeGlyph("fx-rates")).toBe("⛶");
    expect(page.maximizeAriaLabel("fx-rates")).toBe("Maximize Live Rates");
    page.maximize("fx-rates");
    expect(page.maximizeGlyph("fx-rates")).toBe("⧉");
    expect(page.maximizeAriaLabel("fx-rates")).toBe("Restore Live Rates");
  });

  it("maximize collapses the other panels to strips; restore brings them back", () => {
    const page = mount(LayoutEngine, {});
    page.maximize("fx-rates");
    expect(page.isStrip("fx-analytics")).toBe(true);
    expect(page.isStrip("fx-positions")).toBe(true);
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

  it("a collapsed panel renders a single restore control labelled with its title and no body; clicking it expands", () => {
    const page = mount(LayoutEngine, {});
    page.collapse("fx-analytics");
    expect(page.stripRestoreLabel("fx-analytics")).toBe("Restore Analytics");
    expect(page.bodyText("fx-analytics")).toBeNull();
    page.expand("fx-analytics");
    // no longer a strip: the same testid now belongs to the small collapse
    // icon in the header, not the restore bar.
    expect(page.stripRestoreLabel("fx-analytics")).toBe("Collapse Analytics");
    expect(page.bodyText("fx-analytics")).toBe("ANALYTICS");
  });

  it("clicking the restore bar of a panel stripped by another panel's maximize restores (un-maximizes)", () => {
    const page = mount(LayoutEngine, {});
    page.maximize("fx-rates");
    expect(page.stripRestoreLabel("fx-analytics")).toBe("Restore Analytics");
    page.expandStrip("fx-analytics");
    expect(page.isStrip("fx-analytics")).toBe(false);
    expect(page.isStrip("fx-positions")).toBe(false);
    expect(page.isStrip("fx-blotter")).toBe(false);
  });

  it("orients the restore bar vertically when the strip's cell is a child of a row split, horizontally otherwise", () => {
    const page = mount(LayoutEngine, {});
    page.maximize("fx-analytics");
    // fx-rates sits in the content row (a row split) → narrow/tall strip
    expect(page.stripOrientation("fx-rates")).toBe("vertical");
    // fx-blotter sits under the root column split → short/wide strip
    expect(page.stripOrientation("fx-blotter")).toBe("horizontal");
  });

  // The default FX tree is fully resizable (Task 2), so nothing shipped
  // exercises the engine's pinned/fixedPx render branches anymore. The engine
  // keeps that machinery for a future panel that opts out of resizing; this
  // fixture (see react/pinnedFixtureLayoutPort.ts) mounts it directly so the
  // branches stay covered instead of rotting unexercised.
  describe("pinned + fixedPx machinery (kept for a future non-resizable panel)", () => {
    it("renders a pinned panel with data-pinned and no resize handle beside it", () => {
      const page = mount(LayoutEngine, { props: { pinnedFixture: true } });
      expect(page.isPinned("fx-blotter")).toBe(true);
      // root path is [] → pathKey ""; the pinned tail suppresses the handle
      expect(page.handleExists("", 0)).toBe(false);
    });

    it("suppresses the resize handle beside a fixedPx cell", () => {
      const page = mount(LayoutEngine, { props: { pinnedFixture: true } });
      // content row is child 0 of the root column split → pathKey "0"
      expect(page.handleExists("0", 0)).toBe(false);
    });
  });
});
