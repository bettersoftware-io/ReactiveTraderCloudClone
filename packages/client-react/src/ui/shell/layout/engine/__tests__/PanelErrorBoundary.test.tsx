import { afterEach, describe, expect, it, vi } from "vitest";

import { panelErrorBoundaryPage } from "#tests/ui/pages/PanelErrorBoundaryPage";

import { ThrowingPanel } from "./panelErrorFixtures";

const page = panelErrorBoundaryPage();

afterEach(() => {
  page.unmountAll();
});

describe("PanelErrorBoundary", () => {
  it("renders children normally when nothing throws", () => {
    page.mount("Chart", <div data-testid="ok-body">OK</div>);

    expect(page.text("ok-body")).toBe("OK");
    expect(page.exists("panel-error")).toBe(false);
  });

  it("catches a render-phase throw from a descendant and shows a scoped panel-error fallback with the panel's title", () => {
    // A throwing child aborts React's render for this subtree even inside a
    // boundary; suppress the expected console.error noise React logs for it.
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});

    try {
      page.mount("Chart", <ThrowingPanel />);
    } finally {
      consoleError.mockRestore();
    }

    expect(page.text("panel-error")).toContain("Chart");
  });
});
