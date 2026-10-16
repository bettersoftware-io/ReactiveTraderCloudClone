// tests/browser/playwright/navigation.spec.ts
//
// Browser Back/Forward through the workspace tabs (spec
// 2026-10-16-browser-history-and-live-validation §5): the active tab is the
// URL hash, a tab click pushes a history entry, Back/Forward drive the tab,
// and a reload lands on the tab the URL names. Runs through `./_context.ts`,
// whose seeded session survives the reload.
import * as common from "../scenarios/common.ts";
import * as navigation from "../scenarios/navigation.ts";
import { test } from "./_context.ts";

test.describe("Browser history through workspace tabs", () => {
  test("Back and Forward drive the tab, and a reload keeps it", async ({
    ctx,
  }) => {
    await common.openWorkspace(ctx);
    await navigation.expectTabRouted(ctx, "fx");
    await navigation.expectFxWorkspaceVisible(ctx);

    await common.clickTab(ctx, "credit");
    await navigation.expectTabRouted(ctx, "credit");
    await navigation.expectCreditWorkspaceVisible(ctx);

    await navigation.pressBrowserBack(ctx);
    await navigation.expectTabRouted(ctx, "fx");
    await navigation.expectFxWorkspaceVisible(ctx);

    await navigation.pressBrowserForward(ctx);
    await navigation.expectTabRouted(ctx, "credit");
    await navigation.expectCreditWorkspaceVisible(ctx);

    await common.reloadPage(ctx);
    await navigation.expectTabRouted(ctx, "credit");
    await navigation.expectCreditWorkspaceVisible(ctx);
  });
});
