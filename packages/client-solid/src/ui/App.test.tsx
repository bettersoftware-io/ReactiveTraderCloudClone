import { render, screen, waitFor } from "@solidjs/testing-library";
import { describe, expect, it } from "vitest";

import { AppRoot } from "#/AppRoot";
import { App } from "#/ui/App";

// Walking-skeleton smoke test: mounts the REAL composition root (AppRoot →
// createApp(buildBrowserPorts()) → simulator ports, no fakes on the seam)
// and asserts the live connection status renders — the Solid↔ViewModel
// bridge, end to end, exactly as a user would see it in `pnpm dev:solid`.
describe("App (walking skeleton)", () => {
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
    expect(status.getAttribute("data-status")).toBe("CONNECTED");
  });
});
