import * as connection from "../scenarios/connection";
import { test } from "./_context";
import { withWorkspaceOpen } from "./_openWorkspace";

// The @presenter "gateway disconnect ... reconnecting" scenario in
// specs/connection.feature is intentionally NOT mirrored here: a gateway
// drop/reconnect cannot be injected through the browser DOM (it originates in
// WsAdapter / the test ConnectionEventsPort), so it lives only in the
// presenter peers.
test.describe("Connection status", () => {
  withWorkspaceOpen();

  test("connected status is shown in the footer", async ({ ctx }) => {
    await connection.expectConnectionStatusFooterVisible(ctx);
    await connection.expectConnectionStatusFooterShows(ctx, "Connected");
  });

  test("connection overlay is hidden when connected", async ({ ctx }) => {
    await connection.expectConnectionOverlayHidden(ctx);
  });

  test("going offline shows the overlay with an offline message", async ({
    ctx,
  }) => {
    await connection.setBrowserOffline(ctx, true);
    await connection.expectConnectionOverlayVisibleWithin(ctx, 3);
    await connection.expectConnectionOverlayTextMatches(ctx, "/offline/i");
    await connection.expectConnectionStatusFooterShows(ctx, "Offline");
  });

  test("coming back online dismisses the overlay", async ({ ctx }) => {
    await connection.setBrowserOffline(ctx, true);
    await connection.expectConnectionOverlayVisibleWithin(ctx, 3);
    await connection.setBrowserOffline(ctx, false);
    await connection.expectConnectionOverlayHiddenWithin(ctx, 5);
    await connection.expectConnectionStatusFooterShows(ctx, "Connected");
  });
});
