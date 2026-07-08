import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createDefaultLayoutPort, type LayoutState } from "@rtc/client-core";

import { InhouseLayoutEngine } from "../InhouseLayoutEngine";
import type { PanelRegistry } from "../panelRegistry";
import { ThrowingPanel } from "./panelErrorFixtures";

afterEach(cleanup);

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
    renderEngine();
    expect(screen.getByTestId("layout-engine")).toBeTruthy();
    expect(screen.getByTestId("rates-body").textContent).toBe("RATES");
    expect(screen.getByTestId("analytics-body").textContent).toBe("ANALYTICS");
  });

  it("renders one drag handle between two split children", () => {
    renderEngine();
    expect(screen.getByTestId("handle--0")).toBeTruthy();
  });

  it("collapses a panel to a strip and hides its body", () => {
    renderEngine({ ...state, collapsed: ["fx-analytics"] });
    expect(
      screen.getByTestId("panel-fx-analytics").getAttribute("data-strip"),
    ).toBe("true");
    expect(screen.queryByTestId("analytics-body")).toBeNull();
  });

  it("calls onMaximize when a panel's maximize button is pressed", () => {
    const onMaximize = vi.fn();
    render(
      <InhouseLayoutEngine
        state={state}
        registry={registry}
        onMaximize={onMaximize}
        onRestore={noop}
        onCollapse={noop}
        onExpand={noop}
        onResize={noop}
      />,
    );
    screen.getByTestId("panel-fx-rates-maximize").click();
    expect(onMaximize).toHaveBeenCalledWith("fx-rates");
  });

  it("drives a row-split resize drag (pointerdown→move) and calls onResize with two new fractions", () => {
    const onResize = vi.fn();
    render(
      <InhouseLayoutEngine
        state={state}
        registry={registry}
        onMaximize={noop}
        onRestore={noop}
        onCollapse={noop}
        onExpand={noop}
        onResize={onResize}
      />,
    );
    const handle = screen.getByTestId("handle--0");
    fireEvent.pointerDown(handle, { pointerId: 1, clientX: 60, clientY: 0 });
    fireEvent.pointerMove(handle, { clientX: 90, clientY: 0 });
    expect(onResize).toHaveBeenCalled();
    const [path, sizes] = onResize.mock.calls[0] as [number[], number[]];
    expect(path).toEqual([]);
    // two adjacent fractions that still sum to the original pair (0.6 + 0.4)
    expect(sizes).toHaveLength(2);
    expect(sizes[0] + sizes[1]).toBeCloseTo(1, 5);

    // pointerup removes the move/up listeners: a later move must NOT fire onResize
    fireEvent.pointerUp(handle, { pointerId: 1, clientX: 90, clientY: 0 });
    onResize.mockClear();
    fireEvent.pointerMove(handle, { clientX: 120, clientY: 0 });
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
    render(
      <InhouseLayoutEngine
        state={fixedState}
        registry={fixedRegistry}
        onMaximize={noop}
        onRestore={noop}
        onCollapse={noop}
        onExpand={noop}
        onResize={noop}
      />,
    );
    const fixedCell = screen
      .getByTestId("panel-b")
      .closest("[data-fixed-cell]");
    expect(fixedCell?.getAttribute("data-fixed-cell")).toBe("true");
    // root pathKey is "" (root path = []), so the suppressed handle would be handle--0
    expect(screen.queryByTestId("handle--0")).toBeNull();
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
      renderEngine(initialPxState, abRegistry);
      const cell = screen.getByTestId("panel-b").closest("[data-initial-cell]");
      expect(cell?.getAttribute("data-initial-cell")).toBe("true");
      expect(cell?.getAttribute("data-fixed-cell")).toBe("false");
      // root pathKey is "" — the handle fixedPx would have suppressed
      expect(screen.getByTestId("handle--0")).toBeTruthy();
    });

    it("dragging the handle dispatches plain fractions via onResize (the machine then clears initialPx)", () => {
      const onResize = vi.fn();
      render(
        <InhouseLayoutEngine
          state={initialPxState}
          registry={abRegistry}
          onMaximize={noop}
          onRestore={noop}
          onCollapse={noop}
          onExpand={noop}
          onResize={onResize}
        />,
      );
      const handle = screen.getByTestId("handle--0");
      fireEvent.pointerDown(handle, { pointerId: 3, clientX: 60, clientY: 0 });
      fireEvent.pointerMove(handle, { clientX: 90, clientY: 0 });
      expect(onResize).toHaveBeenCalled();
      const [path, sizes] = onResize.mock.calls[0] as [number[], number[]];
      expect(path).toEqual([]);
      expect(sizes).toHaveLength(2);
      // effective fractions: two adjacent values still summing to 1, with no
      // NaN leaking from the px measurement (jsdom rects are zero-size, so
      // the handler falls back to node.sizes as the baseline).
      expect(sizes[0] + sizes[1]).toBeCloseTo(1, 5);
      fireEvent.pointerUp(handle, { pointerId: 3, clientX: 90, clientY: 0 });
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
      const boundingRect = vi
        .spyOn(Element.prototype, "getBoundingClientRect")
        .mockImplementation(function stubbedRect(this: Element): DOMRect {
          const width =
            cellPx[this.getAttribute("data-testid") ?? ""] ?? containerPx;
          return new DOMRect(0, 0, width, 600);
        });
      const onResize = vi.fn();

      try {
        render(
          <InhouseLayoutEngine
            state={measuredState}
            registry={measuredRegistry}
            onMaximize={noop}
            onRestore={noop}
            onCollapse={noop}
            onExpand={noop}
            onResize={onResize}
          />,
        );
        const handle = screen.getByTestId("handle--1");
        fireEvent.pointerDown(handle, {
          pointerId: 4,
          clientX: 807,
          clientY: 0,
        });
        fireEvent.pointerMove(handle, { clientX: 850, clientY: 0 });
        fireEvent.pointerUp(handle, { pointerId: 4, clientX: 850, clientY: 0 });
      } finally {
        boundingRect.mockRestore();
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
      renderEngine({ ...initialPxState, maximized: "b" }, abRegistry);
      const cell = screen.getByTestId("panel-b").closest("[data-initial-cell]");
      expect(cell?.getAttribute("data-initial-cell")).toBe("false");
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
      renderEngine(state, throwingRegistry);
    } finally {
      consoleError.mockRestore();
    }

    // The throwing panel shows a scoped error state...
    const analyticsPanel = screen.getByTestId("panel-fx-analytics");
    expect(
      within(analyticsPanel).getByTestId("panel-error").textContent,
    ).toContain("Analytics");
    // ...while its sibling panel, and the engine root itself, render fine.
    expect(screen.getByTestId("layout-engine")).toBeTruthy();
    expect(screen.getByTestId("rates-body").textContent).toBe("RATES");
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
      renderEngine(
        { ...creditShapedState, maximized: "b" },
        creditShapedRegistry,
      );
      // rail is a direct child of the root row → narrow full-height strip.
      const rail = screen.getByTestId("panel-rail");
      expect(rail.getAttribute("data-strip")).toBe("true");
      expect(rail.getAttribute("data-strip-orientation")).toBe("vertical");
      // c shares its column with the maximized b → short full-width strip.
      const c = screen.getByTestId("panel-c");
      expect(c.getAttribute("data-strip")).toBe("true");
      expect(c.getAttribute("data-strip-orientation")).toBe("horizontal");
      expect(
        screen.getByTestId("cell-1-1").getAttribute("data-strip-fill"),
      ).toBe("false");
    });

    it("inherits the row axis through a fully-stripped column: maximizing the rail turns both column panels into vertical, rail-filling strips", () => {
      renderEngine(
        { ...creditShapedState, maximized: "rail" },
        creditShapedRegistry,
      );

      for (const id of ["b", "c"]) {
        const panel = screen.getByTestId(`panel-${id}`);
        expect(panel.getAttribute("data-strip")).toBe("true");
        expect(panel.getAttribute("data-strip-orientation")).toBe("vertical");
      }

      // Their cells share the freed rail's height instead of hugging.
      expect(
        screen.getByTestId("cell-1-0").getAttribute("data-strip-fill"),
      ).toBe("true");
      expect(
        screen.getByTestId("cell-1-1").getAttribute("data-strip-fill"),
      ).toBe("true");
      // The fully-stripped column's own cell hugs along the row (no fill).
      expect(
        screen.getByTestId("cell--1").getAttribute("data-strip-fill"),
      ).toBe("false");
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
      renderEngine(creditState, creditRegistry);
      expect(screen.queryByTestId("panel-credit-new-rfq-maximize")).toBeNull();
      expect(screen.getByTestId("panel-credit-new-rfq-collapse")).toBeTruthy();
      expect(screen.getByTestId("panel-credit-rfqs-maximize")).toBeTruthy();
    });

    it("still strips the opted-out panel when a sibling maximizes (not-maximizable is not never-stripped)", () => {
      renderEngine(
        { ...creditState, maximized: "credit-rfqs" },
        creditRegistry,
      );
      expect(
        screen.getByTestId("panel-credit-new-rfq").getAttribute("data-strip"),
      ).toBe("true");
      expect(screen.queryByTestId("new-rfq-body")).toBeNull();
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
      renderEngine({ ...eqState, maximized: "eq-ticket" }, eqRegistry);
      const watchlist = screen.getByTestId("panel-eq-watchlist");
      expect(watchlist.getAttribute("data-strip")).toBe("true");
      expect(watchlist.getAttribute("data-strip-orientation")).toBe(
        "horizontal",
      );
      // outside the boundary: chart and blotter render their bodies.
      expect(screen.getByTestId("chart-body")).toBeTruthy();
      expect(screen.getByTestId("eq-blotter-body")).toBeTruthy();
      expect(
        screen.getByTestId("panel-eq-chart").getAttribute("data-strip"),
      ).toBe("false");
    });

    it("keeps the rail's 290px initialPx design width and the main handle; only the rail-internal handle disappears", () => {
      renderEngine({ ...eqState, maximized: "eq-ticket" }, eqRegistry);
      const railCell = screen.getByTestId("cell--1");
      expect(railCell.getAttribute("data-initial-cell")).toBe("true");
      expect(railCell.getAttribute("data-strip-cell")).toBe("false");
      expect(screen.getByTestId("handle--0")).toBeTruthy();
      expect(screen.getByTestId("handle-0-0")).toBeTruthy();
      expect(screen.queryByTestId("handle-1-0")).toBeNull();
    });

    it("maximizing eq-watchlist mirrors it: eq-ticket strips horizontally; the main column and rail width stay put", () => {
      renderEngine({ ...eqState, maximized: "eq-watchlist" }, eqRegistry);
      const ticket = screen.getByTestId("panel-eq-ticket");
      expect(ticket.getAttribute("data-strip")).toBe("true");
      expect(ticket.getAttribute("data-strip-orientation")).toBe("horizontal");
      expect(
        screen.getByTestId("panel-eq-chart").getAttribute("data-strip"),
      ).toBe("false");
      expect(
        screen.getByTestId("cell--1").getAttribute("data-initial-cell"),
      ).toBe("true");
    });

    it("root-scope maximize is unchanged: eq-chart still strips the whole dock, dropping the rail's design width", () => {
      renderEngine({ ...eqState, maximized: "eq-chart" }, eqRegistry);

      for (const id of ["eq-blotter", "eq-ticket", "eq-watchlist"]) {
        expect(
          screen.getByTestId(`panel-${id}`).getAttribute("data-strip"),
        ).toBe("true");
      }

      const railCell = screen.getByTestId("cell--1");
      expect(railCell.getAttribute("data-initial-cell")).toBe("false");
      expect(railCell.getAttribute("data-strip-cell")).toBe("true");
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
    render(
      <InhouseLayoutEngine
        state={columnState}
        registry={registry}
        onMaximize={noop}
        onRestore={noop}
        onCollapse={noop}
        onExpand={noop}
        onResize={onResize}
      />,
    );
    const handle = screen.getByTestId("handle--0");
    fireEvent.pointerDown(handle, { pointerId: 2, clientX: 0, clientY: 40 });
    fireEvent.pointerMove(handle, { clientX: 0, clientY: 70 });
    expect(onResize).toHaveBeenCalled();
    fireEvent.pointerUp(handle, { pointerId: 2, clientX: 0, clientY: 70 });
  });
});

function noop(): void {}

function renderEngine(
  s: LayoutState = state,
  r: PanelRegistry = registry,
): void {
  render(
    <InhouseLayoutEngine
      state={s}
      registry={r}
      onMaximize={noop}
      onRestore={noop}
      onCollapse={noop}
      onExpand={noop}
      onResize={noop}
    />,
  );
}
