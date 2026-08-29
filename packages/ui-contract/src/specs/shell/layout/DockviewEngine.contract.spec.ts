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

  it("renders the registered head slot INSIDE dockview's tab — the drag surface", () => {
    const page = mount(DockviewEngine, { props: { withHeads: true } });
    expect(page.bodyVisible("custom-head")).toBe(true);
    expect(page.insideDockTab("custom-head")).toBe(true);
    // The header is dockview's tab bar now — never a second head strip
    // stacked above the panel body.
    expect(page.tabTitles()).toContain("Custom head");
  });

  it("renders the title as the in-house accent tab inside dockview's tab when no head is registered", () => {
    const page = mount(DockviewEngine, { props: {} });
    expect(page.bodyVisible("panel-fx-blotter-title")).toBe(true);
    expect(page.insideDockTab("panel-fx-blotter-title")).toBe(true);
  });

  it("renders the in-house collapse / maximize controls in the group header and dispatches the LayoutMachine intents", () => {
    const page = mount(DockviewEngine, { props: {} });
    expect(page.bodyVisible("panel-fx-rates-collapse")).toBe(true);
    expect(page.bodyVisible("panel-fx-rates-maximize")).toBe(true);
    expect(page.intents()).toEqual([]);

    page.clickCollapse("fx-rates");
    page.clickMaximize("fx-rates");
    expect(page.intents()).toEqual(["collapse:fx-rates", "maximize:fx-rates"]);
  });

  it("offers restore (not maximize) on the maximized panel's control", () => {
    const page = mount(DockviewEngine, { props: { maximized: "fx-rates" } });
    page.clickMaximize("fx-rates");
    expect(page.intents()).toEqual(["restore"]);
  });

  it("renders a collapsed panel as the in-house restore strip, header hidden, and dispatches expand from it", () => {
    const page = mount(DockviewEngine, {
      props: { collapsed: ["fx-analytics"] },
    });
    // fx-analytics sits in the rail COLUMN (over positions): its space
    // reclaims along that column, so the strip is the horizontal bar —
    // the same orientation the in-house engine picks for it.
    expect(page.stripOrientation("fx-analytics")).toBe("horizontal");
    expect(page.stripMarked("fx-analytics")).toBe(true);
    expect(page.stripMarked("fx-rates")).toBe(false);
    expect(page.stripOrientation("fx-rates")).toBeNull();

    page.clickCollapse("fx-analytics"); // the strip carries the collapse testid
    expect(page.intents()).toEqual(["expand:fx-analytics"]);
  });

  it("threads the LayoutMachine's collapse set into the bridge", () => {
    const page = mount(DockviewEngine, {
      props: { collapsed: ["fx-analytics"] },
    });
    expect(page.collapsedIds()).toEqual(["fx-analytics"]);
    // Collapse must not cost a group — the bridge strips a panel in place
    // rather than removing it, so every seed leaf is still mounted.
    expect(page.groupsAttr()).toBe("4");
    expect(page.bodyVisible("fx-rates-body")).toBe(true);
  });

  it("expanding a collapsed panel brings its header and body back, and collapsing again strips it", () => {
    const page = mount(DockviewEngine, {
      props: { interactive: true, collapsed: ["fx-analytics"] },
    });
    expect(page.stripOrientation("fx-analytics")).toBe("horizontal");
    expect(page.bodyVisible("fx-analytics-body")).toBe(false);

    page.toggleAnalyticsCollapsed();
    expect(page.stripOrientation("fx-analytics")).toBeNull();
    expect(page.stripMarked("fx-analytics")).toBe(false);
    expect(page.bodyVisible("fx-analytics-body")).toBe(true);
    expect(page.bodyVisible("panel-fx-analytics-maximize")).toBe(true);

    page.toggleAnalyticsCollapsed();
    expect(page.stripOrientation("fx-analytics")).toBe("horizontal");
    expect(page.bodyVisible("fx-analytics-body")).toBe(false);
  });

  it("glides an intent-driven collapse and nothing else — the in-house 0.34s panel transition, gated on the engine's glide marker", () => {
    const page = mount(DockviewEngine, { props: { interactive: true } });
    // A freshly mounted dock is not gliding: mounts, drags and resizes land
    // instantly, as in-house.
    expect(page.gliding()).toBe(false);

    page.toggleAnalyticsCollapsed();
    // The marker is on while the collapse's geometry change transitions.
    expect(page.gliding()).toBe(true);
  });

  it("ignores a collapse-set id the engine has no group for", () => {
    const page = mount(DockviewEngine, { props: { collapsed: ["nope"] } });
    expect(page.collapsedIds()).toEqual(["nope"]);
    expect(page.groupsAttr()).toBe("4");
    expect(page.stripMarked("fx-rates")).toBe(false);
    expect(page.bodyVisible("fx-rates-body")).toBe(true);
  });

  it("withholds the maximize control for maximizable:false and falls back to the id as title", () => {
    const page = mount(DockviewEngine, {
      props: { specsVariant: "no-maximize" },
    });
    expect(page.bodyVisible("panel-fx-blotter-collapse")).toBe(true);
    expect(page.bodyVisible("panel-fx-blotter-maximize")).toBe(false);
    expect(page.bodyVisible("panel-fx-rates-maximize")).toBe(true);
    expect(page.tabTitles()).toContain("fx-positions");
  });

  it("carries an empty collapse set when nothing is collapsed", () => {
    const page = mount(DockviewEngine, { props: {} });
    expect(page.collapsedIds()).toEqual([]);
  });
});
