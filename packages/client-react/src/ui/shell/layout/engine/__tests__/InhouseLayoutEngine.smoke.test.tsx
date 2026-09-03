import { afterEach, describe, expect, it, vi } from "vitest";

import { createDefaultLayoutPort, type LayoutState } from "@rtc/client-core";

import { inhouseLayoutEnginePage } from "#tests/ui/pages/InhouseLayoutEnginePage";

import type { PanelRegistry } from "../panelRegistry";
import { ThrowingPanel } from "./panelErrorFixtures";

const page = inhouseLayoutEnginePage();

afterEach(() => {
  page.unmountAll();
});

const state: LayoutState = {
  root: {
    kind: "split",
    dir: "row",
    sizes: [0.6, 0.4],
    children: [
      { kind: "panel", panelId: "fx-rates" },
      { kind: "panel", panelId: "fx-analytics" },
    ],
  },
  maximized: null,
  collapsed: [],
};

const registry: PanelRegistry = {
  "fx-rates": () => {
    return <div data-testid="rates-body">RATES</div>;
  },
  "fx-analytics": () => {
    return <div data-testid="analytics-body">ANALYTICS</div>;
  },
};

describe("InhouseLayoutEngine", () => {
  it("renders each panel's registry body inside a split", () => {
    page.mount(state, registry);
    expect(page.exists("layout-engine")).toBe(true);
    expect(page.text("rates-body")).toBe("RATES");
    expect(page.text("analytics-body")).toBe("ANALYTICS");
  });

  it("renders one drag handle between two split children", () => {
    page.mount(state, registry);
    expect(page.exists("handle--0")).toBe(true);
  });

  it("collapses a panel to a strip and hides its body", () => {
    page.mount({ ...state, collapsed: ["fx-analytics"] }, registry);
    expect(page.attribute("panel-fx-analytics", "data-strip")).toBe("true");
    expect(page.exists("analytics-body")).toBe(false);
  });

  it("calls onMaximize when a panel's maximize button is pressed", () => {
    const onMaximize = vi.fn();
    page.mount(state, registry, { onMaximize });
    page.click("panel-fx-rates-maximize");
    expect(onMaximize).toHaveBeenCalledWith("fx-rates");
  });

  it("drives a row-split resize drag (pointerdown→move) and calls onResize with two new fractions", () => {
    const onResize = vi.fn();
    page.mount(state, registry, { onResize });
    page.pointerDown("handle--0", { pointerId: 1, clientX: 60, clientY: 0 });
    page.pointerMove("handle--0", { clientX: 90, clientY: 0 });
    expect(onResize).toHaveBeenCalled();
    const [path, sizes] = onResize.mock.calls[0] as [number[], number[]];
    expect(path).toEqual([]);
    // two adjacent fractions that still sum to the original pair (0.6 + 0.4)
    expect(sizes).toHaveLength(2);
    expect(sizes[0] + sizes[1]).toBeCloseTo(1, 5);

    // pointerup removes the move/up listeners: a later move must NOT fire onResize
    page.pointerUp("handle--0", { pointerId: 1, clientX: 90, clientY: 0 });
    onResize.mockClear();
    page.pointerMove("handle--0", { clientX: 120, clientY: 0 });
    expect(onResize).not.toHaveBeenCalled();
  });

  it("renders a fixed-width cell for fixedPx split children and no resize handle", () => {
    const fixedState: LayoutState = {
      root: {
        kind: "split",
        dir: "row",
        sizes: [0.7, 0.3],
        fixedPx: [undefined, 360],
        children: [
          { kind: "panel", panelId: "a" },
          { kind: "panel", panelId: "b" },
        ],
      },
      maximized: null,
      collapsed: [],
    };

    const fixedRegistry: PanelRegistry = {
      a: () => {
        return <div data-testid="a-body">A</div>;
      },
      b: () => {
        return <div data-testid="b-body">B</div>;
      },
    };
    page.mount(fixedState, fixedRegistry);
    expect(
      page.closestAttribute("panel-b", "[data-fixed-cell]", "data-fixed-cell"),
    ).toBe("true");
    // root pathKey is "" (root path = []), so the suppressed handle would be handle--0
    expect(page.exists("handle--0")).toBe(false);
  });

  describe("initialPx (design-value default rail width, still draggable)", () => {
    const initialPxState: LayoutState = {
      root: {
        kind: "split",
        dir: "row",
        sizes: [0.73, 0.27],
        initialPx: [undefined, 360],
        children: [
          { kind: "panel", panelId: "a" },
          { kind: "panel", panelId: "b" },
        ],
      },
      maximized: null,
      collapsed: [],
    };

    const abRegistry: PanelRegistry = {
      a: () => {
        return <div data-testid="a-body">A</div>;
      },
      b: () => {
        return <div data-testid="b-body">B</div>;
      },
    };

    it("renders a px-fixed cell that KEEPS its resize handle (unlike fixedPx)", () => {
      page.mount(initialPxState, abRegistry);
      expect(
        page.closestAttribute(
          "panel-b",
          "[data-initial-cell]",
          "data-initial-cell",
        ),
      ).toBe("true");
      expect(
        page.closestAttribute(
          "panel-b",
          "[data-initial-cell]",
          "data-fixed-cell",
        ),
      ).toBe("false");
      // root pathKey is "" — the handle fixedPx would have suppressed
      expect(page.exists("handle--0")).toBe(true);
    });

    it("dragging the handle dispatches plain fractions via onResize (the machine then clears initialPx)", () => {
      const onResize = vi.fn();
      page.mount(initialPxState, abRegistry, { onResize });
      page.pointerDown("handle--0", { pointerId: 3, clientX: 60, clientY: 0 });
      page.pointerMove("handle--0", { clientX: 90, clientY: 0 });
      expect(onResize).toHaveBeenCalled();
      const [path, sizes] = onResize.mock.calls[0] as [number[], number[]];
      expect(path).toEqual([]);
      expect(sizes).toHaveLength(2);
      // effective fractions: two adjacent values still summing to 1, with no
      // NaN leaking from the px measurement (jsdom rects are zero-size, so
      // the handler falls back to node.sizes as the baseline).
      expect(sizes[0] + sizes[1]).toBeCloseTo(1, 5);
      page.pointerUp("handle--0", { pointerId: 3, clientX: 90, clientY: 0 });
    });

    it("first drag converts the cells' MEASURED px to fractions and dispatches those, not the stored sizes", () => {
      // Three children make the measurement observable through onResize: the
      // untouched first fraction and the dragged pair's sum come straight
      // from the measured baseline, whereas a two-child split renormalises
      // to 1 from either baseline. The measured cell px (500/300/200 in a
      // 1014px container with two 7px handles) deliberately disagree with
      // the stored sizes below — a fallback to node.sizes would dispatch
      // 0.6 for the untouched first child instead of the measured 0.5.
      const cellPx: Record<string, number> = {
        "cell--0": 500,
        "cell--1": 300,
        "cell--2": 200,
      };
      const containerPx = 1014;
      const measuredState: LayoutState = {
        root: {
          kind: "split",
          dir: "row",
          sizes: [0.6, 0.25, 0.15],
          initialPx: [undefined, undefined, 200],
          children: [
            { kind: "panel", panelId: "a" },
            { kind: "panel", panelId: "b" },
            { kind: "panel", panelId: "c" },
          ],
        },
        maximized: null,
        collapsed: [],
      };

      const measuredRegistry: PanelRegistry = {
        ...abRegistry,
        c: () => {
          return <div data-testid="c-body">C</div>;
        },
      };

      // jsdom's real rects are zero-size (which is exactly why every other
      // drag test falls back to node.sizes) — stub them so the split
      // container and its cells report the widths above.
      const stub = page.stubBoundingRectByTestId(cellPx, containerPx);
      const onResize = vi.fn();

      try {
        page.mount(measuredState, measuredRegistry, { onResize });
        page.pointerDown("handle--1", {
          pointerId: 4,
          clientX: 807,
          clientY: 0,
        });
        page.pointerMove("handle--1", { clientX: 850, clientY: 0 });
        page.pointerUp("handle--1", { pointerId: 4, clientX: 850, clientY: 0 });
      } finally {
        stub.restore();
      }

      expect(onResize).toHaveBeenCalled();
      const [path, sizes] = onResize.mock.calls[0] as [number[], number[]];
      expect(path).toEqual([]);
      expect(sizes).toHaveLength(3);
      // Measured fractions are cell px over the 1000px cell total (handles
      // excluded): the untouched first child keeps its measured 500/1000.
      expect(sizes[0]).toBeCloseTo(0.5, 5);
      // The dragged pair rebalances around the pointer: fracA is the pointer
      // position over the FULL 1014px container, minus the measured 0.5
      // sitting before the pair; the pair conserves the measured 0.3 + 0.2.
      const fracA = 850 / containerPx - 0.5;
      expect(sizes[1]).toBeCloseTo(fracA, 5);
      expect(sizes[2]).toBeCloseTo(0.5 - fracA, 5);
      expect(sizes[0] + sizes[1] + sizes[2]).toBeCloseTo(1, 5);
      // The machine side — resize() clearing initialPx so the split is a
      // plain ratio split thereafter — is covered by LayoutMachine.test.ts
      // in @rtc/client-core.
    });

    it("drops the px-fixed treatment while a panel is maximized, so the maximized panel can fill the dock", () => {
      page.mount({ ...initialPxState, maximized: "b" }, abRegistry);
      expect(
        page.closestAttribute(
          "panel-b",
          "[data-initial-cell]",
          "data-initial-cell",
        ),
      ).toBe("false");
    });
  });

  it("confines a panel that throws during render to a scoped panel-error fallback, leaving sibling panels intact (no app-wide white screen)", () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});

    // Registry entries are always `() => <RealComponent />` (see
    // appPanelRegistry.tsx) — a JSX element descriptor, not an eagerly-invoked
    // plain function. The crash this guards against happens when REACT
    // itself later renders that returned element as a child fiber (e.g.
    // ChartPanel's own body throwing), not when the registry function is
    // called. So the fake here must throw from within an actual rendered
    // component, matching that real shape — a registry entry that throws
    // directly, as a plain function call, would throw one call frame too
    // early to exercise the boundary at all.
    const throwingRegistry: PanelRegistry = {
      ...registry,
      "fx-analytics": () => {
        return <ThrowingPanel />;
      },
    };

    try {
      page.mount(state, throwingRegistry);
    } finally {
      consoleError.mockRestore();
    }

    // The throwing panel shows a scoped error state...
    expect(page.errorTextWithin("panel-fx-analytics")).toContain("Analytics");
    // ...while its sibling panel, and the engine root itself, render fine.
    expect(page.exists("layout-engine")).toBe(true);
    expect(page.text("rates-body")).toBe("RATES");
  });

  describe("strip orientation follows the reclaim axis (credit-shaped tree: rail | column[b, c])", () => {
    const creditShapedState: LayoutState = {
      root: {
        kind: "split",
        dir: "row",
        sizes: [0.25, 0.75],
        children: [
          { kind: "panel", panelId: "rail" },
          {
            kind: "split",
            dir: "column",
            sizes: [0.6, 0.4],
            children: [
              { kind: "panel", panelId: "b" },
              { kind: "panel", panelId: "c" },
            ],
          },
        ],
      },
      maximized: null,
      collapsed: [],
    };

    const creditShapedRegistry: PanelRegistry = {
      rail: () => {
        return <div data-testid="rail-body">RAIL</div>;
      },
      b: () => {
        return <div data-testid="b-body">B</div>;
      },
      c: () => {
        return <div data-testid="c-body">C</div>;
      },
    };

    it("keeps a direct row-split child vertical and a column sibling of the maximized panel horizontal", () => {
      page.mount(
        { ...creditShapedState, maximized: "b" },
        creditShapedRegistry,
      );
      // rail is a direct child of the root row → narrow full-height strip.
      expect(page.attribute("panel-rail", "data-strip")).toBe("true");
      expect(page.attribute("panel-rail", "data-strip-orientation")).toBe(
        "vertical",
      );
      // c shares its column with the maximized b → short full-width strip.
      expect(page.attribute("panel-c", "data-strip")).toBe("true");
      expect(page.attribute("panel-c", "data-strip-orientation")).toBe(
        "horizontal",
      );
      expect(page.attribute("cell-1-1", "data-strip-fill")).toBe("false");
    });

    it("inherits the row axis through a fully-stripped column: maximizing the rail turns both column panels into vertical, rail-filling strips", () => {
      page.mount(
        { ...creditShapedState, maximized: "rail" },
        creditShapedRegistry,
      );

      for (const id of ["b", "c"]) {
        expect(page.attribute(`panel-${id}`, "data-strip")).toBe("true");
        expect(page.attribute(`panel-${id}`, "data-strip-orientation")).toBe(
          "vertical",
        );
      }

      // Their cells share the freed rail's height instead of hugging.
      expect(page.attribute("cell-1-0", "data-strip-fill")).toBe("true");
      expect(page.attribute("cell-1-1", "data-strip-fill")).toBe("true");
      // The fully-stripped column's own cell hugs along the row (no fill).
      expect(page.attribute("cell--1", "data-strip-fill")).toBe("false");
    });
  });

  describe("maximizable: false (spec-gated maximize control — default PANEL_SPECS marks credit-new-rfq)", () => {
    const creditState: LayoutState = {
      root: {
        kind: "split",
        dir: "row",
        sizes: [0.25, 0.75],
        children: [
          { kind: "panel", panelId: "credit-new-rfq" },
          { kind: "panel", panelId: "credit-rfqs" },
        ],
      },
      maximized: null,
      collapsed: [],
    };

    const creditRegistry: PanelRegistry = {
      "credit-new-rfq": () => {
        return <div data-testid="new-rfq-body">NEW RFQ</div>;
      },
      "credit-rfqs": () => {
        return <div data-testid="rfqs-body">RFQS</div>;
      },
    };

    it("renders no maximize control for the opted-out panel, keeping its collapse control and its sibling's maximize", () => {
      page.mount(creditState, creditRegistry);
      expect(page.exists("panel-credit-new-rfq-maximize")).toBe(false);
      expect(page.exists("panel-credit-new-rfq-collapse")).toBe(true);
      expect(page.exists("panel-credit-rfqs-maximize")).toBe(true);
    });

    it("still strips the opted-out panel when a sibling maximizes (not-maximizable is not never-stripped)", () => {
      page.mount({ ...creditState, maximized: "credit-rfqs" }, creditRegistry);
      expect(page.attribute("panel-credit-new-rfq", "data-strip")).toBe("true");
      expect(page.exists("new-rfq-body")).toBe(false);
    });
  });

  describe("nearest-column maximize scope (default PANEL_SPECS rail panels, equities tree)", () => {
    const eqState = createDefaultLayoutPort("equities").initial;
    const eqRegistry: PanelRegistry = {
      "eq-chart": () => {
        return <div data-testid="chart-body">CHART</div>;
      },
      "eq-blotter": () => {
        return <div data-testid="eq-blotter-body">EQ BLOTTER</div>;
      },
      "eq-ticket": () => {
        return <div data-testid="ticket-body">TICKET</div>;
      },
      "eq-watchlist": () => {
        return <div data-testid="watchlist-body">WATCHLIST</div>;
      },
    };

    it("maximizing eq-ticket strips only its column sibling — a horizontal bar inside the rail — leaving the main column untouched", () => {
      page.mount({ ...eqState, maximized: "eq-ticket" }, eqRegistry);
      expect(page.attribute("panel-eq-watchlist", "data-strip")).toBe("true");
      expect(
        page.attribute("panel-eq-watchlist", "data-strip-orientation"),
      ).toBe("horizontal");
      // outside the boundary: chart and blotter render their bodies.
      expect(page.exists("chart-body")).toBe(true);
      expect(page.exists("eq-blotter-body")).toBe(true);
      expect(page.attribute("panel-eq-chart", "data-strip")).toBe("false");
    });

    it("keeps the rail's 290px initialPx design width and the main handle; only the rail-internal handle disappears", () => {
      page.mount({ ...eqState, maximized: "eq-ticket" }, eqRegistry);
      expect(page.attribute("cell--1", "data-initial-cell")).toBe("true");
      expect(page.attribute("cell--1", "data-strip-cell")).toBe("false");
      expect(page.exists("handle--0")).toBe(true);
      expect(page.exists("handle-0-0")).toBe(true);
      expect(page.exists("handle-1-0")).toBe(false);
    });

    it("maximizing eq-watchlist mirrors it: eq-ticket strips horizontally; the main column and rail width stay put", () => {
      page.mount({ ...eqState, maximized: "eq-watchlist" }, eqRegistry);
      expect(page.attribute("panel-eq-ticket", "data-strip")).toBe("true");
      expect(page.attribute("panel-eq-ticket", "data-strip-orientation")).toBe(
        "horizontal",
      );
      expect(page.attribute("panel-eq-chart", "data-strip")).toBe("false");
      expect(page.attribute("cell--1", "data-initial-cell")).toBe("true");
    });

    it("root-scope maximize is unchanged: eq-chart still strips the whole dock, dropping the rail's design width", () => {
      page.mount({ ...eqState, maximized: "eq-chart" }, eqRegistry);

      for (const id of ["eq-blotter", "eq-ticket", "eq-watchlist"]) {
        expect(page.attribute(`panel-${id}`, "data-strip")).toBe("true");
      }

      expect(page.attribute("cell--1", "data-initial-cell")).toBe("false");
      expect(page.attribute("cell--1", "data-strip-cell")).toBe("true");
    });
  });

  it("drives a column-split resize drag (vertical) and calls onResize", () => {
    const columnState: LayoutState = {
      root: {
        kind: "split",
        dir: "column",
        sizes: [0.5, 0.5],
        children: [
          { kind: "panel", panelId: "fx-rates" },
          { kind: "panel", panelId: "fx-analytics" },
        ],
      },
      maximized: null,
      collapsed: [],
    };
    const onResize = vi.fn();
    page.mount(columnState, registry, { onResize });
    page.pointerDown("handle--0", { pointerId: 2, clientX: 0, clientY: 40 });
    page.pointerMove("handle--0", { clientX: 0, clientY: 70 });
    expect(onResize).toHaveBeenCalled();
    page.pointerUp("handle--0", { pointerId: 2, clientX: 0, clientY: 70 });
  });
});
