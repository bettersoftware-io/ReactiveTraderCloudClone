import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { LayoutState } from "#/app/layout/layoutPort";

import { InhouseLayoutEngine } from "../InhouseLayoutEngine";
import type { PanelRegistry } from "../panelRegistry";

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

function noop(): void {}

function renderEngine(s: LayoutState = state): void {
  render(
    <InhouseLayoutEngine
      state={s}
      registry={registry}
      onMaximize={noop}
      onRestore={noop}
      onCollapse={noop}
      onExpand={noop}
      onResize={noop}
    />,
  );
}

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
});
