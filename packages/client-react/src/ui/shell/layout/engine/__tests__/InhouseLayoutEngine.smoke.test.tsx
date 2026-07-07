import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { LayoutState } from "@rtc/client-core";

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
