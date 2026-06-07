// tests/browser/cypress/theme.spec.ts
import { getCtx } from "./_context";
import { withWorkspaceOpen } from "./_openWorkspace";
import * as theme from "./scenarios/theme";
import * as common from "./scenarios/common";

describe("Theme", () => {
  withWorkspaceOpen();

  it("theme toggle button is visible", () => {
    const ctx = getCtx();
    theme.expectThemeToggleVisible(ctx);
  });

  it("clicking theme toggle changes the theme", () => {
    const ctx = getCtx();
    theme.toggleAndCaptureBackgrounds(ctx);
    theme.expectBackgroundChanged(ctx);
  });

  it("theme persists across page reloads", () => {
    const ctx = getCtx();
    theme.toggleAndCaptureBackgrounds(ctx);
    common.reloadPage(ctx);
    theme.expectBackgroundMatchesToggled(ctx);
  });

  it("toggle button shows correct icon for current theme", () => {
    const ctx = getCtx();
    theme.expectThemeToggleAriaLabelMentions(ctx, "light");
    theme.toggleAndCaptureBackgrounds(ctx);
    theme.expectThemeToggleAriaLabelMentions(ctx, "dark");
  });

  it("workspace tabs work in both themes", () => {
    const ctx = getCtx();
    common.clickTab(ctx, "fx");
    theme.expectFirstPriceTileVisible(ctx, 5_000);
    theme.toggleAndCaptureBackgrounds(ctx);
    common.clickTab(ctx, "credit");
    theme.expectCreditNavVisible(ctx);
    common.clickTab(ctx, "admin");
    common.clickTab(ctx, "fx");
    theme.expectFirstPriceTileVisible(ctx, 5_000);
  });
});
