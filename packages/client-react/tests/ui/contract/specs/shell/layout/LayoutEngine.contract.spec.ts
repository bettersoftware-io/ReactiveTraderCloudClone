import { LayoutEngine } from "@ui-contract/components";
import { cleanupMounted, mount } from "@ui-contract/mount";
import { afterEach, describe, expect, it } from "vitest";

afterEach(() => {
  cleanupMounted();
});

describe("InhouseLayoutEngine", () => {
  it("renders the fx arrangement: a tiles-over-blotter left column beside a full-height analytics/positions rail, blotter resizable (not pinned)", () => {
    const page = mount(LayoutEngine, {});
    expect(page.bodyText("fx-rates")).toBe("RATES");
    expect(page.bodyText("fx-analytics")).toBe("ANALYTICS");
    expect(page.bodyText("fx-positions")).toBe("POSITIONS");
    expect(page.bodyText("fx-blotter")).toBe("BLOTTER");
    expect(page.isPinned("fx-blotter")).toBe(false);
  });

  it("shows a resize handle between rates and the blotter inside the left column", () => {
    const page = mount(LayoutEngine, {});
    // the left column is child 0 of the root row split → pathKey "0"
    expect(page.handleExists("0", 0)).toBe(true);
  });

  it("shows a resize handle between analytics and positions inside the right rail", () => {
    const page = mount(LayoutEngine, {});
    // the right rail is child 1 of the root row split → pathKey "1"
    expect(page.handleExists("1", 0)).toBe(true);
  });

  it("shows a resize handle between the left column and the right rail", () => {
    const page = mount(LayoutEngine, {});
    // root path is [] → pathKey ""
    expect(page.handleExists("", 0)).toBe(true);
  });

  it("renders split handles as siblings between cells, not inside them", () => {
    const page = mount(LayoutEngine, {});
    // the analytics/positions rail is a column split at pathKey "1"
    const handle = page.handleElement("1", 0);
    expect(handle.parentElement?.getAttribute("data-dir")).toBe("column");
    expect(handle.previousElementSibling?.getAttribute("data-testid")).toBe(
      "cell-1-0",
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

  it("marks a collapsed panel's own cell as a strip cell (releasing its ratio-derived flex-grow) but leaves its growing sibling's cell alone", () => {
    const page = mount(LayoutEngine, {});
    // the analytics/positions rail is a column split at pathKey "1":
    // analytics is child 0, positions is child 1.
    page.collapse("fx-analytics");
    expect(page.isStripCell("1", 0)).toBe(true);
    expect(page.isStripCell("1", 1)).toBe(false);
  });

  it("marks every non-maximized cell a strip cell on maximize, including a nested split whose entire subtree stripped, but never the maximized panel's own cell chain", () => {
    const page = mount(LayoutEngine, {});
    page.maximize("fx-rates");
    // fx-rates is the maximized panel: its own cell (left column child 0)
    // must NOT strip, nor must its ancestor (root left-column cell).
    expect(page.isStripCell("0", 0)).toBe(false);
    expect(page.isStripCell("", 0)).toBe(false);
    // the right rail (root child 1) is an all-strip subtree: both the rail's
    // own cell and its two inner (analytics/positions) cells strip.
    expect(page.isStripCell("", 1)).toBe(true);
    expect(page.isStripCell("1", 0)).toBe(true);
    expect(page.isStripCell("1", 1)).toBe(true);
    // the blotter (left column child 1) strips too.
    expect(page.isStripCell("0", 1)).toBe(true);
  });

  it("suppresses the resize handle beside a cell that collapsed to a strip", () => {
    const page = mount(LayoutEngine, {});
    page.collapse("fx-analytics");
    // the analytics/positions handle sits at pathKey "1", index 0.
    expect(page.handleExists("1", 0)).toBe(false);
  });

  it("suppresses resize handles beside cells stripped as a side effect of another panel's maximize", () => {
    const page = mount(LayoutEngine, {});
    page.maximize("fx-rates");
    // left-column/rail handle at root path "", index 0 — the rail
    // (analytics+positions) is an all-strip subtree.
    expect(page.handleExists("", 0)).toBe(false);
    // rates/blotter handle within the left column at pathKey "0", index 0 —
    // the blotter is stripped.
    expect(page.handleExists("0", 0)).toBe(false);
  });

  it("orients strips by the reclaim axis: maximizing rates turns the fully-stripped right rail into vertical strips, while the blotter (whose column still hosts rates) stays horizontal", () => {
    const page = mount(LayoutEngine, {});
    page.maximize("fx-rates");
    // The right rail (analytics/positions column) is fully stripped: its
    // space reclaims sideways along the ROOT ROW, so both strips render as
    // narrow full-height columns despite their immediate parent being a
    // column split — and their cells share the rail's height (strip-fill).
    expect(page.stripOrientation("fx-analytics")).toBe("vertical");
    expect(page.stripOrientation("fx-positions")).toBe("vertical");
    expect(page.isStripFillCell("1", 0)).toBe(true);
    expect(page.isStripFillCell("1", 1)).toBe(true);
    // The blotter's parent column still hosts the maximized rates panel (not
    // fully stripped), so its space reclaims down that column → horizontal.
    expect(page.stripOrientation("fx-blotter")).toBe("horizontal");
    expect(page.isStripFillCell("0", 1)).toBe(false);
  });

  it("orients strips by the reclaim axis: maximizing analytics turns the fully-stripped left column (rates + blotter) into vertical strips, while positions stays horizontal", () => {
    const page = mount(LayoutEngine, {});
    page.maximize("fx-analytics");
    // The left column (rates over blotter) is fully stripped — space
    // reclaims along the root row → both go vertical, stacking down the rail.
    expect(page.stripOrientation("fx-rates")).toBe("vertical");
    expect(page.stripOrientation("fx-blotter")).toBe("vertical");
    expect(page.isStripFillCell("0", 0)).toBe(true);
    expect(page.isStripFillCell("0", 1)).toBe(true);
    // positions shares its column with the maximized analytics panel → its
    // space reclaims down that column → horizontal.
    expect(page.stripOrientation("fx-positions")).toBe("horizontal");
  });

  it("orients a plainly collapsed panel (no maximize) by its immediate parent split's dir", () => {
    const page = mount(LayoutEngine, {});
    page.collapse("fx-blotter");
    // Only the blotter collapsed — its column still hosts the live rates
    // panel, so the strip reclaims down the column → horizontal, as today.
    expect(page.stripOrientation("fx-blotter")).toBe("horizontal");
    expect(page.isStripFillCell("0", 1)).toBe(false);
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
