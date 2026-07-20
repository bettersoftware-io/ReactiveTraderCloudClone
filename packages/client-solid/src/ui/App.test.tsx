import { fireEvent, render, screen, waitFor } from "@solidjs/testing-library";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AppRoot } from "#/AppRoot";
import { SESSION_STORAGE_KEY } from "#/app/adapters/LocalStorageSessionStore";
import { App } from "#/ui/App";

// Smoke test: mounts the REAL composition root (AppRoot →
// createApp(buildBrowserPorts()) → simulator ports, no fakes on the seam)
// and asserts the live connection status renders through the real shell
// chrome (StatusBar → ConnectionStatusBar) — the Solid↔ViewModel bridge,
// end to end, exactly as a user would see it in `pnpm dev:solid`.
//
// AppRoot now gates the shell behind the real AuthGate/LoginScreen (no more
// walking-skeleton auto-login), so every test signs in with the committed
// demo credentials before asserting on shell chrome.
describe("App (shell chrome)", () => {
  // The session store is now localStorage-backed (parity with client-react), so
  // it persists across renders within a file. Clear it between tests so each one
  // starts from the LoginScreen rather than resuming a prior test's session.
  beforeEach(() => {
    localStorage.clear();
    vi.stubEnv("VITE_DEV_AUTH", '{"demo":"mcdc2026"}');
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  // Regression (the SolidJS e2e outage): the browser e2e suites boot past the
  // AuthGate by seeding an authenticated session under `rtc-session` in
  // localStorage (tests/browser/authSeed.ts) — exactly this shape. When the
  // Solid client wired an InMemorySessionStore it ignored that seed and left
  // every e2e scenario stranded on LoginScreen. This asserts the composition
  // root now resumes the seeded session and renders the shell WITHOUT driving
  // the login form. It fails against an in-memory store and passes against the
  // localStorage-backed one.
  it("boots straight past the login screen when an authenticated session is seeded in localStorage", async () => {
    localStorage.setItem(
      SESSION_STORAGE_KEY,
      JSON.stringify({
        token: "seeded-token",
        username: "demo",
        user: {
          name: "Demo Operator",
          initials: "DO",
          role: "Read-Only Guest",
          id: "TRD-0000",
          email: "demo@reactivetrader.io",
          desk: "Demo · Cloud",
          clearance: "LEVEL 1 · VIEW",
        },
        // Year 2100 — never treated as expired during the test run.
        exp: 4_102_444_800_000,
      }),
    );

    render(() => {
      return (
        <AppRoot>
          <App />
        </AppRoot>
      );
    });

    // Shell chrome appears with no sign-in interaction; the LoginScreen never
    // renders because AuthPresenter.resume() picked up the seeded session.
    expect(await screen.findByTestId("header")).toBeTruthy();
    expect(screen.queryByTestId("login-screen")).toBeNull();
  });

  it("mounts and renders the live connection status from the simulator ports", async () => {
    render(() => {
      return (
        <AppRoot>
          <App />
        </AppRoot>
      );
    });
    await signIn();

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

  it("renders the header nav, status bar, and the live FX layout engine with real FX panel bodies", async () => {
    render(() => {
      return (
        <AppRoot>
          <App />
        </AppRoot>
      );
    });
    await signIn();

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

  it("switches to the admin tab and shows the live layout engine with the real admin dashboard", async () => {
    render(() => {
      return (
        <AppRoot>
          <App />
        </AppRoot>
      );
    });
    await signIn();

    screen.getByTestId("tab-admin").click();

    expect(screen.getByTestId("tab-admin").getAttribute("data-active")).toBe(
      "true",
    );
    // The admin tab is fully live (Task 16): the layout engine renders with
    // the single admin-dashboard panel, whose body is the REAL admin subtree —
    // no more `pending-panel` placeholders anywhere in the app (all four
    // domains are ported as of Phase 3).
    expect(screen.getByTestId("layout-engine")).toBeTruthy();
    expect(screen.getByTestId("panel-admin-dashboard")).toBeTruthy();
    expect(screen.queryAllByTestId("pending-panel")).toHaveLength(0);
  });

  it("switches to the credit tab and shows the live layout engine with real credit panel bodies", async () => {
    render(() => {
      return (
        <AppRoot>
          <App />
        </AppRoot>
      );
    });
    await signIn();

    screen.getByTestId("tab-credit").click();

    expect(screen.getByTestId("tab-credit").getAttribute("data-active")).toBe(
      "true",
    );
    // The credit tab is fully live (Task 14): the layout-engine grid renders
    // with the three default credit panels present (credit-sell-side is
    // registered but not part of the default three-panel tree — mirrors
    // eq-depth/eq-sectors, see defaultLayoutPort.ts), and their bodies are
    // the REAL credit subtree (newRfq/rfqs/blotter) — no more
    // `pending-panel` placeholders anywhere in the credit tab.
    expect(screen.getByTestId("layout-engine")).toBeTruthy();
    expect(screen.getByTestId("panel-credit-new-rfq")).toBeTruthy();
    expect(screen.getByTestId("panel-credit-rfqs")).toBeTruthy();
    expect(screen.getByTestId("panel-credit-blotter")).toBeTruthy();
    expect(screen.queryAllByTestId("pending-panel")).toHaveLength(0);
    // Spot-check one stable element per panel body — these render
    // unconditionally regardless of how much simulator data has arrived yet.
    expect(screen.getByTestId("new-rfq-send")).toBeTruthy();
    expect(screen.getByTestId("blotter-table")).toBeTruthy();
  });
});

async function signIn(): Promise<void> {
  fireEvent.input(screen.getByTestId("login-username"), {
    target: { value: "demo" },
  });
  fireEvent.input(screen.getByTestId("login-password"), {
    target: { value: "mcdc2026" },
  });
  fireEvent.click(screen.getByTestId("login-submit"));
  await waitFor(() => {
    expect(screen.queryByTestId("login-screen")).toBeNull();
  });
}
