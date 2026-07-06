import * as common from "../scenarios/common";
import * as theme from "../scenarios/theme";
import { test } from "./_context";
import { withWorkspaceOpen } from "./_openWorkspace";

test.describe("Theme", () => {
  withWorkspaceOpen();

  test("theme toggle button is visible", async ({ ctx }) => {
    await theme.expectThemeToggleVisible(ctx);
  });

  test("clicking theme toggle changes the theme", async ({ ctx }) => {
    await theme.toggleAndCaptureBackgrounds(ctx);
    await theme.expectBackgroundChanged(ctx);
  });

  test("theme persists across page reloads", async ({ ctx }) => {
    await theme.toggleAndCaptureBackgrounds(ctx);
    await common.reloadPage(ctx);
    await theme.expectBackgroundMatchesToggled(ctx);
  });

  test("toggle cycles dark → light → system → dark", async ({ ctx }) => {
    // aria-label always names the NEXT preference in the cycle.
    await theme.expectThemeToggleAriaLabelMentions(ctx, "light"); // on dark
    await theme.toggleAndCaptureBackgrounds(ctx);
    await theme.expectThemeToggleAriaLabelMentions(ctx, "system"); // on light
    await theme.toggleAndCaptureBackgrounds(ctx);
    await theme.expectThemeToggleAriaLabelMentions(ctx, "dark"); // on system
    await theme.toggleAndCaptureBackgrounds(ctx);
    await theme.expectThemeToggleAriaLabelMentions(ctx, "light"); // back on dark
  });

  test("workspace tabs work in both themes", async ({ ctx }) => {
    await common.clickTab(ctx, "fx");
    await theme.expectFirstPriceTileVisible(ctx, 5_000);
    await theme.toggleAndCaptureBackgrounds(ctx);
    await common.clickTab(ctx, "credit");
    await theme.expectCreditDockVisible(ctx);
    await common.clickTab(ctx, "admin");
    await common.clickTab(ctx, "fx");
    await theme.expectFirstPriceTileVisible(ctx, 5_000);
  });
});
