// tests/browser/playwright/navigation.spec.ts
//
// Browser Back/Forward through the workspace tabs (spec
// 2026-10-16-browser-history-and-live-validation §5): the active tab is the
// URL path, a tab click pushes a history entry, Back/Forward drive the tab,
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

    await common.pressBrowserBack(ctx, "app");
    await navigation.expectTabRouted(ctx, "fx");
    await navigation.expectFxWorkspaceVisible(ctx);

    await common.pressBrowserForward(ctx, "app");
    await navigation.expectTabRouted(ctx, "credit");
    await navigation.expectCreditWorkspaceVisible(ctx);

    await common.reloadPage(ctx);
    await navigation.expectTabRouted(ctx, "credit");
    await navigation.expectCreditWorkspaceVisible(ctx);
  });

  // Spec 2026-10-17-real-path-routes §3.4: a path route asks the server for
  // the page, so a cold load and a reload on one need its index.html fallback.
  test("a deep path loads cold and survives a reload", async ({ ctx }) => {
    await common.openWorkspaceAt(ctx, "/credit");
    await navigation.expectTabRouted(ctx, "credit");
    await navigation.expectCreditWorkspaceVisible(ctx);

    await common.clickTab(ctx, "equities");
    await navigation.expectTabRouted(ctx, "equities");

    await common.reloadPage(ctx);
    await navigation.expectTabRouted(ctx, "equities");
  });

  test("an unknown path is answered by the app and lands on /fx", async ({
    ctx,
  }) => {
    await common.openWorkspaceAt(ctx, "/nowhere-known");
    await navigation.expectTabRouted(ctx, "fx");
    await navigation.expectFxWorkspaceVisible(ctx);
  });
});
