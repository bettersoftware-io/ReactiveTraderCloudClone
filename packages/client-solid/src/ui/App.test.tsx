import { render, screen, waitFor } from "@solidjs/testing-library";
import { describe, expect, it } from "vitest";

import { AppRoot } from "#/AppRoot";
import { App } from "#/ui/App";

// Smoke test: mounts the REAL composition root (AppRoot →
// createApp(buildBrowserPorts()) → simulator ports, no fakes on the seam)
// and asserts the live connection status renders through the real shell
// chrome (StatusBar → ConnectionStatusBar) — the Solid↔ViewModel bridge,
// end to end, exactly as a user would see it in `pnpm dev:solid`.
describe("App (shell chrome)", () => {
  it("mounts and renders the live connection status from the simulator ports", async () => {
    render(() => {
      return (
        <AppRoot>
          <App />
        </AppRoot>
      );
    });

    const status = await screen.findByTestId("connection-status");

    // The simulator's ConnectionEventsSimulator emits `gatewayConnected`
    // synchronously, so the status settles to CONNECTED almost immediately —
    // waitFor absorbs the one microtask hop through toSignal's subscription.
    // Plain DOM property assertions (not jest-dom matchers): no test here
    // needs the matcher-typings wiring, so it's kept out of this program.
    await waitFor(() => {
      expect(status.textContent).toBe("Connected");
    });
    // ConnectionStatusBar carries data-status on its dot/label children, not
    // the data-testid host div itself — assert on the label span.
    const label = status.querySelector("span:last-child");
    expect(label?.getAttribute("data-status")).toBe("CONNECTED");
  });

  it("renders the header nav, status bar, and the live FX layout engine with real FX panel bodies", () => {
    render(() => {
      return (
        <AppRoot>
          <App />
        </AppRoot>
      );
    });

    expect(screen.getByTestId("header")).toBeTruthy();
    expect(screen.getByTestId("tab-fx").getAttribute("data-active")).toBe(
      "true",
    );
    // The FX tab is fully live (Task 13): the layout-engine grid renders with
    // all four FX panels present, and their bodies are the REAL FX subtree
    // (liveRates/analytics/positions/blotter) — no more `pending-panel`
    // placeholders anywhere in the FX tab.
    expect(screen.getByTestId("layout-engine")).toBeTruthy();
    expect(screen.getByTestId("panel-fx-rates")).toBeTruthy();
    expect(screen.getByTestId("panel-fx-analytics")).toBeTruthy();
    expect(screen.getByTestId("panel-fx-positions")).toBeTruthy();
    expect(screen.getByTestId("panel-fx-blotter")).toBeTruthy();
    expect(screen.queryAllByTestId("pending-panel")).toHaveLength(0);
    // Spot-check one stable element per panel body — these render
    // unconditionally regardless of how much simulator data has arrived yet.
    expect(screen.getByTestId("currency-filter")).toBeTruthy();
    expect(screen.getByTestId("blotter-table")).toBeTruthy();
  });

  it("switches to a not-yet-ported tab and shows the plain placeholder instead of the layout engine", () => {
    render(() => {
      return (
        <AppRoot>
          <App />
        </AppRoot>
      );
    });

    screen.getByTestId("tab-credit").click();

    expect(screen.getByTestId("tab-credit").getAttribute("data-active")).toBe(
      "true",
    );
    expect(screen.queryByTestId("layout-engine")).toBeNull();
    expect(screen.getAllByTestId("pending-panel")).toHaveLength(1);
  });
});
