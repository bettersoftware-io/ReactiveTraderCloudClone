// tests/browser/playwright/opsIncident.spec.ts
//
// Browser-tier E2E for the Ops incident injection flow.
// Navigates to the Ops tab, triggers a serviceDown incident, asserts the
// connection overlay appears, clears it, asserts the overlay disappears.
//
// All assertions delegate to scenario helpers — gates 10 and 11 compliant.
import * as opsIncident from "../scenarios/opsIncident.ts";
import { test } from "./_context.ts";
import { withWorkspaceOpen } from "./_openWorkspace.ts";

test.describe("Ops incident injection", () => {
  withWorkspaceOpen();

  test("injecting serviceDown breaks the connection and clearing restores it", async ({
    ctx,
  }) => {
    await opsIncident.navigateToOps(ctx);
    await opsIncident.injectIncident(ctx, "serviceDown");
    await opsIncident.expectConnectionBannerVisible(ctx, 5);
    await opsIncident.clearIncident(ctx);
    await opsIncident.expectConnectionRestored(ctx, 5);
  });
});
