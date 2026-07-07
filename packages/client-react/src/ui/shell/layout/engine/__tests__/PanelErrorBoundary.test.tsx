import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PanelErrorBoundary } from "../PanelErrorBoundary";
import { ThrowingPanel } from "./panelErrorFixtures";

afterEach(cleanup);

describe("PanelErrorBoundary", () => {
  it("renders children normally when nothing throws", () => {
    render(
      <PanelErrorBoundary title="Chart">
        <div data-testid="ok-body">OK</div>
      </PanelErrorBoundary>,
    );
    expect(screen.getByTestId("ok-body").textContent).toBe("OK");
    expect(screen.queryByTestId("panel-error")).toBeNull();
  });

  it("catches a render-phase throw from a descendant and shows a scoped panel-error fallback with the panel's title", () => {
    // A throwing child aborts React's render for this subtree even inside a
    // boundary; suppress the expected console.error noise React logs for it.
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});

    try {
      render(
        <PanelErrorBoundary title="Chart">
          <ThrowingPanel />
        </PanelErrorBoundary>,
      );
    } finally {
      consoleError.mockRestore();
    }

    const fallback = screen.getByTestId("panel-error");
    expect(fallback.textContent).toContain("Chart");
  });
});
