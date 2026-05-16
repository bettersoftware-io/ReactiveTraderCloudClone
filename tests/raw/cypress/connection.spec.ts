// tests/raw/cypress/connection.spec.ts
import { getCtx } from "./_context";
import { withWorkspaceOpen } from "./_openWorkspace";
import * as connection from "../../scenarios/cypress/connection";

describe("Connection status", () => {
  withWorkspaceOpen();

  it("connected status is shown in the footer", () => {
    const ctx = getCtx();
    connection.expectConnectionStatusFooterVisible(ctx);
    connection.expectConnectionStatusFooterShows(ctx, "Connected");
  });

  it("connection overlay is hidden when connected", () => {
    const ctx = getCtx();
    connection.expectConnectionOverlayHidden(ctx);
  });

  it("going offline shows the overlay with an offline message", () => {
    const ctx = getCtx();
    connection.setBrowserOffline(ctx, true);
    connection.expectConnectionOverlayVisibleWithin(ctx, 3);
    connection.expectConnectionOverlayTextMatches(ctx, "/offline/i");
    connection.expectConnectionStatusFooterShows(ctx, "Offline");
  });

  it("coming back online dismisses the overlay", () => {
    const ctx = getCtx();
    connection.setBrowserOffline(ctx, true);
    connection.expectConnectionOverlayVisibleWithin(ctx, 3);
    connection.setBrowserOffline(ctx, false);
    connection.expectConnectionOverlayHiddenWithin(ctx, 5);
    connection.expectConnectionStatusFooterShows(ctx, "Connected");
  });
});
