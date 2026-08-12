import { AppShell, LayoutEngine } from "@ui-contract/components";
import type { HookValues, World } from "@ui-contract/harness/world";
import {
  cleanupMounted,
  createWorld,
  mount,
  mountWith,
} from "@ui-contract/mount";
import { afterEach, describe, expect, it } from "vitest";

import type { UNSUPPORTED_SENTINEL_SPEC } from "@rtc/client-core";

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
    expect(page.resizeHandleExists("0", 0)).toBe(true);
  });

  it("shows a resize handle between analytics and positions inside the right rail", () => {
    const page = mount(LayoutEngine, {});
    // the right rail is child 1 of the root row split → pathKey "1"
    expect(page.resizeHandleExists("1", 0)).toBe(true);
  });

  it("shows a resize handle between the left column and the right rail", () => {
    const page = mount(LayoutEngine, {});
    // root path is [] → pathKey ""
    expect(page.resizeHandleExists("", 0)).toBe(true);
  });

  it("renders split handles as siblings between cells, not inside them", () => {
    const page = mount(LayoutEngine, {});
    // the analytics/positions rail is a column split at pathKey "1"
    const handle = page.resizeHandleElement("1", 0);
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
    expect(page.resizeHandleExists("1", 0)).toBe(false);
  });

  it("suppresses resize handles beside cells stripped as a side effect of another panel's maximize", () => {
    const page = mount(LayoutEngine, {});
    page.maximize("fx-rates");
    // left-column/rail handle at root path "", index 0 — the rail
    // (analytics+positions) is an all-strip subtree.
    expect(page.resizeHandleExists("", 0)).toBe(false);
    // rates/blotter handle within the left column at pathKey "0", index 0 —
    // the blotter is stripped.
    expect(page.resizeHandleExists("0", 0)).toBe(false);
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

  // The rail panels (fx-analytics/fx-positions in PANEL_SPECS) carry
  // maximizeScope: "nearest-column" — the standalone design's rail
  // semantics: the maximize is bounded by the analytics/positions column, so
  // only the column sibling strips and everything outside stays untouched.
  describe("nearest-column maximize (rail panels)", () => {
    it("maximizing analytics strips ONLY positions — a horizontal bar inside the rail; rates and blotter render normally", () => {
      const page = mount(LayoutEngine, {});
      page.maximize("fx-analytics");
      expect(page.isStrip("fx-positions")).toBe(true);
      expect(page.stripOrientation("fx-positions")).toBe("horizontal");
      expect(page.isStripFillCell("1", 1)).toBe(false);
      // outside the boundary: untouched.
      expect(page.isStrip("fx-rates")).toBe(false);
      expect(page.isStrip("fx-blotter")).toBe(false);
      expect(page.bodyText("fx-rates")).toBe("RATES");
      expect(page.bodyText("fx-blotter")).toBe("BLOTTER");
    });

    it("marks only the stripped sibling's cell a strip cell — never the rates cell, the left column, or the rail itself", () => {
      const page = mount(LayoutEngine, {});
      page.maximize("fx-analytics");
      expect(page.isStripCell("1", 1)).toBe(true);
      expect(page.isStripCell("1", 0)).toBe(false);
      expect(page.isStripCell("", 0)).toBe(false);
      expect(page.isStripCell("", 1)).toBe(false);
      expect(page.isStripCell("0", 0)).toBe(false);
      expect(page.isStripCell("0", 1)).toBe(false);
    });

    it("keeps the main column|rail handle and the rates/blotter handle; only the rail-internal handle disappears", () => {
      const page = mount(LayoutEngine, {});
      page.maximize("fx-analytics");
      expect(page.resizeHandleExists("", 0)).toBe(true);
      expect(page.resizeHandleExists("0", 0)).toBe(true);
      expect(page.resizeHandleExists("1", 0)).toBe(false);
    });

    it("keeps the rail's 360px initialPx design width (the rail cell sits at the boundary, not inside it)", () => {
      const page = mount(LayoutEngine, {});
      expect(page.isInitialCell("", 1)).toBe(true);
      page.maximize("fx-analytics");
      expect(page.isInitialCell("", 1)).toBe(true);
      // contrast: a root-scope maximize drops it so the dock can flow.
      page.maximize("fx-analytics"); // restore
      page.maximize("fx-rates");
      expect(page.isInitialCell("", 1)).toBe(false);
    });

    it("restores from the stripped sibling's bar: clicking positions' restore bar un-maximizes analytics", () => {
      const page = mount(LayoutEngine, {});
      page.maximize("fx-analytics");
      expect(page.stripRestoreLabel("fx-positions")).toBe("Restore Positions");
      page.expandStrip("fx-positions");
      expect(page.isStrip("fx-positions")).toBe(false);
      expect(page.bodyText("fx-positions")).toBe("POSITIONS");
      expect(page.maximizeGlyph("fx-analytics")).toBe("⛶");
    });

    it("maximizing positions mirrors it: analytics strips horizontally, the main column untouched", () => {
      const page = mount(LayoutEngine, {});
      page.maximize("fx-positions");
      expect(page.isStrip("fx-analytics")).toBe(true);
      expect(page.stripOrientation("fx-analytics")).toBe("horizontal");
      expect(page.isStrip("fx-rates")).toBe(false);
      expect(page.isStrip("fx-blotter")).toBe(false);
      expect(page.resizeHandleExists("", 0)).toBe(true);
    });
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
      expect(page.resizeHandleExists("", 0)).toBe(false);
    });

    it("suppresses the resize handle beside a fixedPx cell", () => {
      const page = mount(LayoutEngine, { props: { pinnedFixture: true } });
      // content row is child 0 of the root column split → pathKey "0"
      expect(page.resizeHandleExists("0", 0)).toBe(false);
    });
  });
});

/**
 * Docked desk panels + workspace persistence (GenUI L3). These mount the real
 * `App` shell rather than this file's standalone `LayoutEngine`: a docked
 * panel's leaf is inserted by the dock BRIDGE (panels roster + the active
 * tab's layout machine + the persistence writer, all composed above the
 * engine), and the engine itself stays as dumb as the block above proves it
 * is. `app.layout` is this same `LayoutEnginePage`, pointed at the shell's
 * active-tab engine.
 *
 * REHYDRATION IS NOT A REMOUNT. Unmounting and re-mounting on the SAME World
 * reuses the identical layout/panels machines (they are cached in
 * `WeakMap<World, …>` in each framework's driver and survive
 * `cleanupMounted()`), so such a test passes with no persistence whatsoever.
 * The scenario below therefore reads the string the writer actually stored on
 * World A and boots a genuinely SEPARATE World B from it.
 */
describe("InhouseLayoutEngine docked desk panels", () => {
  it("renders a docked panel as a leaf — head controls AND a live body — beside the tab's untouched static panels", async () => {
    const world = createWorld({ useAnalytics: ANALYTICS_SEED });
    const app = mountWith(world, AppShell);

    await app.overlay.pressHotkey();
    await app.overlay.send("show me desk positions");
    app.overlay.emitEvents([
      { type: "panel", panelId: DOCKED_PANEL_ID, spec: DESK_POSITIONS_SPEC },
      { type: "done" },
    ]);
    await app.panels.dockPanel(DOCKED_PANEL_ID);

    expect(app.layout.isDocked(DOCKED_PANEL_ID)).toBe(true);
    // The BODY, not just the head. Every other docked witness on this page
    // reads `JarvisDockedPanelHead` (the unpin control, the title parsed off
    // its aria-label), so a leaf that rendered head-only would satisfy them
    // all — this is the assertion that proves the registry's body half is
    // wired and its `panelData$` subscription is live. The World's seeded
    // analytics make the table deterministic rather than the "Connecting…"
    // pending fallback.
    expect(app.layout.dockedRendererTestId(DOCKED_PANEL_ID)).toBe(
      "jarvis-panel-table",
    );
    // The fx default tree is intact around it — the dock column is added
    // beside the static panels, never in place of them.
    expect(app.layout.maximizeAriaLabel("fx-rates")).toBe(
      "Maximize Live Rates",
    );
    expect(app.layout.isDocked("fx-rates")).toBe(false);
    // …and the docked leaf is a full engine panel: it maximizes like any
    // other, addressed by its own panel id.
    app.layout.maximize(DOCKED_PANEL_ID);
    expect(app.maximizedPanelId()).toBe(DOCKED_PANEL_ID);
  });

  it("a FRESH world seeded with the persisted payload boots with the panel already docked", async () => {
    const first = createWorld({ useAnalytics: ANALYTICS_SEED });
    const firstApp = mountWith(first, AppShell);

    await firstApp.overlay.pressHotkey();
    await firstApp.overlay.send("show me desk positions");
    firstApp.overlay.emitEvents([
      { type: "panel", panelId: DOCKED_PANEL_ID, spec: DESK_POSITIONS_SPEC },
      { type: "done" },
    ]);
    await firstApp.panels.dockPanel(DOCKED_PANEL_ID);
    await flushWorkspacePersistence();

    const persisted = first.workspaceLayout.getValue();
    expect(persisted).not.toBeNull();

    // A SECOND World — new machines, new presenter, nothing shared with the
    // first but this string. This is the whole point (see the block doc).
    const second = createWorldSeededWith(persisted, {
      useAnalytics: ANALYTICS_SEED,
    });
    const secondApp = mountWith(second, AppShell);

    expect(secondApp.layout.isDocked(DOCKED_PANEL_ID)).toBe(true);
    expect(secondApp.layout.dockedTitle(DOCKED_PANEL_ID)).toBe(
      "Desk Positions",
    );
    // The restored panel's BODY is live too — `restoreDockedPanel` re-admitted
    // the persisted SPEC, and the presenter re-established this panelId's
    // `panelData$` subscription over World B's own ports. Head-only witnesses
    // (isDocked/dockedTitle above) cannot tell that apart from a leaf whose
    // data stream was never rebuilt.
    expect(secondApp.layout.dockedRendererTestId(DOCKED_PANEL_ID)).toBe(
      "jarvis-panel-table",
    );
    // Restored DOCKED, not floating: the layer renders `floatingPanels` only.
    expect(secondApp.panels.isPresent()).toBe(false);
  });

  it("a corrupt persisted payload is discarded whole — the workspace boots on defaults", () => {
    // `parseWorkspaceLayout` is fail-closed on the WHOLE payload, so a
    // half-written / hand-edited string must not half-restore anything.
    const world = createWorldSeededWith('{"v":1,"tabs":{"fx":{"layout":');
    const app = mountWith(world, AppShell);

    expect(app.layout.maximizeAriaLabel("fx-rates")).toBe(
      "Maximize Live Rates",
    );
    expect(app.layout.isDocked(DOCKED_PANEL_ID)).toBe(false);
    expect(app.panels.isPresent()).toBe(false);
  });
});

/** The panel this block docks — an `analytics`-sourced table. */
const DOCKED_PANEL_ID = "panel-desk-positions";

/** Desk analytics for the docked panel's BODY. `PanelTable` early-returns a
 * testid-less "No data yet" placeholder over zero rows, so a body assertion
 * needs the World's `useAnalytics` source seeded — `composePanelStream` reads
 * it through `World.panelStreamDeps`, the same route every other panel spec
 * seeds data by (mirrors `JarvisPanelLayer.contract.spec.ts`'s own seed). */
const ANALYTICS_SEED = {
  currentPositions: [
    {
      symbol: "EURUSD",
      basePnl: 12_000,
      baseTradedAmount: 1_000_000,
      counterTradedAmount: 1_080_000,
    },
  ],
  history: [],
};

/** No public export of `PanelSpecV1` reaches `@rtc/ui-contract`, so this
 * borrows the type off the one already-exported `PanelSpecV1`-typed const —
 * the identical trick `JarvisPanelLayer.contract.spec.ts` uses. */
type PanelSpecV1 = typeof UNSUPPORTED_SENTINEL_SPEC;

const DESK_POSITIONS_SPEC: PanelSpecV1 = {
  v: 1,
  title: "Desk Positions",
  source: { kind: "analytics" },
  transforms: [],
  viz: { kind: "table" },
};

/** `createWorld` with a seeded `workspaceLayoutV1` string — the 24th
 * positional parameter, reached past every earlier seed (see
 * `harness/world.ts`; `mount()`'s `MountOptions.workspaceLayout` is the same
 * seed for the single-mount case, but these scenarios need the World object
 * itself to read the persisted string back off). `hooks` is the FIRST
 * positional (nullary hook seeds), so a rehydrated World can carry the desk
 * data its restored panel's body renders from. */
function createWorldSeededWith(
  seed: string | null,
  hooks: Partial<HookValues> = {},
): World {
  return createWorld(
    hooks,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    seed,
  );
}

/** One macrotask — the whole window of the contract fixture's workspace
 * persistence writer. It is the REAL `createWorkspacePersistenceWriter`, wired
 * at `debounceMs: 0` (the tier asserts WHAT gets persisted, never the settle
 * window — coalescing has its own unit test), and a zero debounce still
 * schedules its emission on a macrotask. */
function flushWorkspacePersistence(): Promise<void> {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, 0);
  });
}
