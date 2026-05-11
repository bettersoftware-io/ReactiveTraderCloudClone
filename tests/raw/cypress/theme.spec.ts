// tests/raw/cypress/theme.spec.ts
import { getCtx } from "./_context";
import { withWorkspaceOpen } from "./_openWorkspace";
import * as theme from "../../scenarios/theme";

describe("Theme (smoke — Task 1)", () => {
  withWorkspaceOpen();

  it("theme toggle button is visible", () => {
    const ctx = getCtx();
    theme.expectThemeToggleVisible(ctx);
  });
});
