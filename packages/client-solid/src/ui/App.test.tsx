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

  it("renders the header nav, status bar, and a placeholder for the not-yet-ported workspace", () => {
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
    expect(screen.getByTestId("pending-panel")).toBeTruthy();
  });
});
