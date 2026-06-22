import { expect, test } from "@playwright/test";

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
