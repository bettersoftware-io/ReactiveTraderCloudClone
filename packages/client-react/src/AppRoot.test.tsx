import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { appRootPage } from "#tests/ui/pages/AppRootPage";

// The one place the composition root's own wiring is witnessed in this
// client: AppRoot → buildBrowserPorts()/readDemoAccounts() → createViewModel
// → AuthGate → LoginScreen, with no fake on the seam. The contract tier
// covers LoginScreen against a seeded World and so cannot see whether AppRoot
// hands the accounts over at all.
describe("AppRoot (login screen demo accounts)", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    page.unmountAll();
  });

  it("hints at the simulator's demo accounts, and a picked account signs in", async () => {
    vi.stubEnv("VITE_SERVER_URL", "");
    vi.stubEnv("VITE_DEV_AUTH", createDevAuth());
    page.mount();

    expect(page.demoAccountUsernames()).toEqual(["demo"]);

    page.pickDemoAccount("demo");
    page.submitLogin();

    await page.waitFor(() => {
      expect(page.exists("app-children")).toBe(true);
    });
    expect(page.exists("login-screen")).toBe(false);
  });

  it("shows no hint on a plain live build", () => {
    vi.stubEnv("VITE_SERVER_URL", "ws://localhost:4000");
    vi.stubEnv("VITE_DEV_AUTH", createDevAuth());
    page.mount();

    expect(page.exists("login-screen")).toBe(true);
    expect(page.demoAccountUsernames()).toEqual([]);
  });
});

// The one-shot "reopen Preferences" of a swapped-in composition, through the
// real AppRoot → createViewModel → HeaderChrome under StrictMode (as
// main.tsx mounts it): StrictMode's second call of the header's state
// initializer must not lose the signal the first call took.
//
// Nothing here waits on time. The simulator signs in synchronously, so the
// header (or the Suspense fallback) is committed when the sign-in click's
// `act` returns; a swapped-in composition plays no boot splash (asserted, as
// the witness for the page's seam); and the suspended data is delivered
// inside an awaited `act`, where React commits the retry at once. A
// `waitFor` here once raced a playing splash on CI: its progress updates
// starved React's Suspense retry for the whole splash.
describe("AppRoot (Preferences after a core swap)", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    page.unmountAll();
  });

  it("opens Preferences once the header mounts under StrictMode", () => {
    vi.stubEnv("VITE_SERVER_URL", "");
    vi.stubEnv("VITE_DEV_AUTH", createDevAuth());
    page.mountHeaderAfterCoreSwap();

    page.pickDemoAccount("demo");
    page.submitLogin();

    expect(page.exists("header")).toBe(true);
    expect(page.exists("boot-sequence")).toBe(false);
    expect(page.exists("prefs-modal")).toBe(true);
  });

  it("keeps the reopen when React throws the header's first render away (Suspense)", async () => {
    vi.stubEnv("VITE_SERVER_URL", "");
    vi.stubEnv("VITE_DEV_AUTH", createDevAuth());
    const deliver = page.mountHeaderAfterCoreSwapBesideSuspender();

    page.pickDemoAccount("demo");
    await page.submitLoginAwaitingSuspense();
    expect(page.exists("suspense-fallback")).toBe(true);
    expect(page.exists("header")).toBe(false);
    expect(page.exists("boot-sequence")).toBe(false);

    await deliver();

    expect(page.exists("suspender")).toBe(true);
    expect(page.exists("prefs-modal")).toBe(true);
  });
});

const page = appRootPage();

function createDevAuth(): string {
  return JSON.stringify({ demo: "mcdc2026" });
}
