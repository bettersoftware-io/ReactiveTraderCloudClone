// tests/browser/playwright/adminIncident.spec.ts
//
// Browser-tier E2E for the Admin incident injection flow.
// Navigates to the Admin tab, triggers a serviceDown incident, asserts the
// connection overlay appears, clears it, asserts the overlay disappears.
//
// All assertions delegate to scenario helpers — gates 10 and 11 compliant.
import * as adminIncident from "../scenarios/adminIncident";
import { test } from "./_context";
import { withWorkspaceOpen } from "./_openWorkspace";

test.describe("Admin incident injection", () => {
  withWorkspaceOpen();

  test("injecting serviceDown breaks the connection and clearing restores it", async ({
    ctx,
  }) => {
    await adminIncident.navigateToAdmin(ctx);
    await adminIncident.injectIncident(ctx, "serviceDown");
    await adminIncident.expectConnectionBannerVisible(ctx, 5);
    await adminIncident.clearIncident(ctx);
    await adminIncident.expectConnectionRestored(ctx, 5);
  });
});
