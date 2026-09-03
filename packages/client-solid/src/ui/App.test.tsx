import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SESSION_STORAGE_KEY } from "#/app/adapters/LocalStorageSessionStore";
import { appPage } from "#tests/ui/pages/AppPage";

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
  const page = appPage();

  // The session store is now localStorage-backed (parity with client-react), so
  // it persists across renders within a file. Clear it between tests so each one
  // starts from the LoginScreen rather than resuming a prior test's session.
  beforeEach(() => {
    localStorage.clear();
    vi.stubEnv("VITE_DEV_AUTH", '{"demo":"mcdc2026"}');
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    page.unmountAll();
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

    page.mount();

    // Shell chrome appears with no sign-in interaction; the LoginScreen never
    // renders because AuthPresenter.resume() picked up the seeded session.
    await page.waitFor(() => {
      expect(page.exists("header")).toBe(true);
    });
    expect(page.exists("login-screen")).toBe(false);
  });

  it("mounts and renders the live connection status from the simulator ports", async () => {
    page.mount();
    page.signIn();
    await page.waitFor(() => {
      expect(page.exists("login-screen")).toBe(false);
    });

    await page.waitFor(() => {
      expect(page.exists("connection-status")).toBe(true);
    });

    // The simulator's ConnectionEventsSimulator emits `gatewayConnected`
    // synchronously, so the status settles to CONNECTED almost immediately —
    // waitFor absorbs the one microtask hop through toSignal's subscription.
    // Plain DOM property assertions (not jest-dom matchers): no test here
    // needs the matcher-typings wiring, so it's kept out of this program.
    await page.waitFor(() => {
      expect(page.text("connection-status")).toBe("Connected");
    });
    // ConnectionStatusBar carries data-status on its dot/label children, not
    // the data-testid host div itself — assert on the label span.
    expect(page.connectionStatusDataStatus()).toBe("CONNECTED");
  });

  it("renders the header nav, status bar, and the live FX layout engine with real FX panel bodies", async () => {
    page.mount();
    page.signIn();
    await page.waitFor(() => {
      expect(page.exists("login-screen")).toBe(false);
    });

    expect(page.exists("header")).toBe(true);
    expect(page.isActiveTab("tab-fx")).toBe(true);
    // The FX tab is fully live (Task 13): the layout-engine grid renders with
    // all four FX panels present, and their bodies are the REAL FX subtree
    // (liveRates/analytics/positions/blotter) — no more `pending-panel`
    // placeholders anywhere in the FX tab.
    expect(page.exists("layout-engine")).toBe(true);
    expect(page.exists("panel-fx-rates")).toBe(true);
    expect(page.exists("panel-fx-analytics")).toBe(true);
    expect(page.exists("panel-fx-positions")).toBe(true);
    expect(page.exists("panel-fx-blotter")).toBe(true);
    expect(page.pendingPanelCount()).toBe(0);
    // Spot-check one stable element per panel body — these render
    // unconditionally regardless of how much simulator data has arrived yet.
    expect(page.exists("currency-filter")).toBe(true);
    expect(page.exists("blotter-table")).toBe(true);
  });

  it("switches to the admin tab and shows the live layout engine with the real admin dashboard", async () => {
    page.mount();
    page.signIn();
    await page.waitFor(() => {
      expect(page.exists("login-screen")).toBe(false);
    });

    page.click("tab-admin");

    expect(page.isActiveTab("tab-admin")).toBe(true);
    // The admin tab is fully live (Task 16): the layout engine renders with
    // the single admin-dashboard panel, whose body is the REAL admin subtree —
    // no more `pending-panel` placeholders anywhere in the app (all four
    // domains are ported as of Phase 3).
    expect(page.exists("layout-engine")).toBe(true);
    expect(page.exists("panel-admin-dashboard")).toBe(true);
    expect(page.pendingPanelCount()).toBe(0);
  });

  it("switches to the credit tab and shows the live layout engine with real credit panel bodies", async () => {
    page.mount();
    page.signIn();
    await page.waitFor(() => {
      expect(page.exists("login-screen")).toBe(false);
    });

    page.click("tab-credit");

    expect(page.isActiveTab("tab-credit")).toBe(true);
    // The credit tab is fully live (Task 14): the layout-engine grid renders
    // with the three default credit panels present (credit-sell-side is
    // registered but not part of the default three-panel tree — mirrors
    // eq-depth/eq-sectors, see defaultLayoutPort.ts), and their bodies are
    // the REAL credit subtree (newRfq/rfqs/blotter) — no more
    // `pending-panel` placeholders anywhere in the credit tab.
    expect(page.exists("layout-engine")).toBe(true);
    expect(page.exists("panel-credit-new-rfq")).toBe(true);
    expect(page.exists("panel-credit-rfqs")).toBe(true);
    expect(page.exists("panel-credit-blotter")).toBe(true);
    expect(page.pendingPanelCount()).toBe(0);
    // Spot-check one stable element per panel body — these render
    // unconditionally regardless of how much simulator data has arrived yet.
    expect(page.exists("new-rfq-send")).toBe(true);
    expect(page.exists("blotter-table")).toBe(true);
  });
});
