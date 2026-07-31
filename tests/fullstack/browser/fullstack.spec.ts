import { expect, test } from "@playwright/test";

import {
  E2E_SESSION_KEY,
  seedSessionLocalStorage,
} from "#/browser/authSeed.js";

import { loginForToken } from "../loginForToken.js";

// The server's HTTP base (forwarded by fullstack/browser-smoke.ts as
// FULLSTACK_PORT — the SAME real server the client under test connects its
// WsReal adapters to, not the client's own Vite port).
const SERVER_PORT = Number(process.env.FULLSTACK_PORT ?? 4124);
const SERVER_BASE = `http://127.0.0.1:${SERVER_PORT}`;

// AuthGate now gates the app on a real signed session: before any spec here
// loads the app, do a genuine POST /login round-trip against the real server
// (WS-real mode — the WS upgrade itself is token-gated, "no
// open-when-empty fallback", see packages/server/src/http/loginHandler.ts)
// and seed the resulting token into localStorage via addInitScript, so it's
// present before the app's own scripts run on the FIRST navigation.
test.beforeEach(async ({ page }) => {
  const login = await loginForToken(SERVER_BASE);
  const session = {
    token: login.token,
    username: "demo",
    user: login.user,
    exp: login.exp,
  };
  await page.addInitScript(seedSessionLocalStorage, {
    key: E2E_SESSION_KEY,
    value: JSON.stringify(session),
  });
});

/**
 * Full-stack browser happy path.
 *
 * The client under test is the real built app connected to the real backend
 * (VITE_SERVER_URL is set, so its composition root wires the WsReal adapters,
 * not the simulators). FX is the default workspace. A price tile shows
 * "Loading..." until a live price arrives over the socket, then renders the
 * SELL/BUY rate (a decimal number). So a tile whose text contains a decimal
 * proves the whole chain end to end: browser → React → presenter → WsReal
 * adapter → WebSocket → server → domain.
 */
test.describe("full-stack: live pricing renders from the real server", () => {
  test("a price tile shows a live rate streamed from the backend", async ({
    page,
  }) => {
    await page.goto("/");

    const firstTile = page.locator("[data-testid^='tile-']").first();
    await expect(firstTile).toBeVisible({ timeout: 20_000 });

    // The rate (e.g. 1.53816, split across spans) only renders after a real
    // tick arrives; before that the tile reads "Loading...".
    await expect(firstTile).toContainText(/\d+\.\d+/, { timeout: 20_000 });
    await expect(firstTile).not.toContainText("Loading...");
  });
});

/**
 * Regression test for the equities-over-WS gap closed in Tasks 12-13: before
 * those tasks, the server had no equities effects, so the watchlist's
 * `marketData.watchlist()` port call never resolved over WsReal and the panel
 * stayed empty. A watchlist row rendering here proves the full chain: browser
 * → React → presenter → WsReal adapter → WebSocket → server watchlist$
 * effect → EquityMarketDataSimulator.
 */
test.describe("full-stack: equities data renders from the real server", () => {
  test("the equities watchlist shows a live quote streamed from the backend", async ({
    page,
  }) => {
    await page.goto("/");

    await page.locator("[data-testid='tab-equities']").click();

    const firstRow = page.locator("[data-testid^='watch-row-']").first();
    await expect(firstRow).toBeVisible({ timeout: 20_000 });

    // The LAST column reads "—" until a real quote tick arrives over the
    // socket, then renders a decimal price (e.g. 142.37).
    await expect(firstRow).toContainText(/\d+\.\d+/, { timeout: 20_000 });
  });
});

/**
 * Full-stack Jarvis smoke: browser → WsJarvisAdapter → WebSocket →
 * server-side ScriptedAgentLoop (RTC_JARVIS_FAKE=1, see
 * tests/fullstack/_orchestration.ts) → real execution → wire → UI, in one
 * spec. Same testids as the P1 browser-tier page object
 * (tests/browser/page-objects/playwright/Jarvis.ts) and scenario
 * (tests/browser/scenarios/jarvis.ts), inlined here since this spec file
 * doesn't use the browser-tier page objects.
 *
 * Replies stream (server paces deltas ~26ms apart after ~1s reference-data
 * delay + snapshot reads) and the EURUSD fill can take up to ~2s after
 * approve, so every assertion below is a generous toContainText poll —
 * never a fixed sleep (see the flake postmortem banning sleep-vs-random-delay
 * races).
 */
test.describe("full-stack: jarvis chat + confirm-gated execution over the real wire", () => {
  test("answers a live-desk quote, then executes a confirm-gated trade onto the blotter", async ({
    page,
  }) => {
    await page.goto("/");

    await page.getByTestId("jarvis-orb").click();
    await expect(page.getByTestId("jarvis-overlay")).toBeVisible();

    const input = page.getByTestId("jarvis-input");
    const send = page.getByTestId("jarvis-send");
    const lastJarvisEntry = page
      .locator("[data-testid='jarvis-entry'][data-role='jarvis']")
      .last();

    // Turn 1: a live-desk quote question, answered from real server-side
    // price state.
    await input.fill("Where is EURUSD?");
    await send.click();
    await expect(lastJarvisEntry).toContainText("EURUSD is trading at", {
      timeout: 20_000,
    });
    // toContainText above can resolve mid-stream (the full reply keeps
    // revealing after this fragment lands), and the input stays disabled
    // while speaking — wait for the reply to actually finish (mirrors
    // waitForReplyDone() in tests/browser/page-objects/playwright/Jarvis.ts)
    // before driving turn 2, rather than leaning on Playwright's implicit
    // actionability retry against the disabled input.
    await expect(lastJarvisEntry).toHaveAttribute("data-done", "true", {
      timeout: 20_000,
    });

    // Turn 2: a confirm-gated trade — approve, then assert the fill reply
    // (not just any terminal reply: the rejected/timeout copy also flips
    // data-done, so pinning this exact fragment catches a reported failure
    // that still happens to move a blotter row, or vice versa).
    await input.fill("Buy 5M EURUSD");
    await send.click();

    const confirmCard = page.getByTestId("jarvis-confirm-card");
    await expect(confirmCard).toBeVisible({ timeout: 20_000 });
    await page.getByTestId("jarvis-confirm-approve").click();

    await expect(lastJarvisEntry).toContainText(
      "the trade is on your blotter",
      { timeout: 20_000 },
    );
  });
});
