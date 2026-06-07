// tests/browser/cypress/scenarios/theme.ts
// Cypress fork of tests/browser/scenarios/theme.ts — synchronous bodies, queue-aware.
// See Phase 5A.4 spec §3.3.
import type { TestContext } from "../../testContext";
import { assertContains, assertEquals, assertNotEqual, assertTrue } from "../../scenarios/assert";
import { chainable } from "./_chainable";

export function toggleAndCaptureBackgrounds(ctx: TestContext): void {
  chainable(ctx.po.workspace.rootBackgroundColor())
    .then((c) => { ctx.scratch.theme.backgroundBefore = c; });
  void ctx.po.themeToggle.click();
  chainable(ctx.po.workspace.rootBackgroundColor())
    .then((c) => { ctx.scratch.theme.backgroundAfter = c; });
}

export function expectThemeToggleVisible(ctx: TestContext): void {
  chainable(ctx.po.themeToggle.isVisible())
    .then((v) => assertTrue(v, "theme toggle not visible"));
}

export function expectBackgroundChanged(ctx: TestContext): void {
  cy.then(() => {
    assertNotEqual(
      ctx.scratch.theme.backgroundAfter,
      ctx.scratch.theme.backgroundBefore,
      "expected background colour to change after theme toggle",
    );
  });
}

export function expectBackgroundMatchesToggled(ctx: TestContext): void {
  chainable(ctx.po.workspace.rootBackgroundColor())
    .then((current) => {
      assertEquals(
        current,
        ctx.scratch.theme.backgroundAfter,
        `expected current bg ${current} to equal recorded post-toggle ${ctx.scratch.theme.backgroundAfter}`,
      );
    });
}

export function expectThemeToggleAriaLabelMentions(ctx: TestContext, term: string): void {
  chainable(ctx.po.themeToggle.ariaLabel())
    .then((label) => assertContains(label, term));
}

export function expectFirstPriceTileVisible(ctx: TestContext, timeoutMs: number): void {
  void ctx.po.liveRatesTile.waitForFirstTile(timeoutMs);
}

export function expectCreditNavVisible(ctx: TestContext): void {
  chainable(ctx.po.creditRfqPanel.navIsVisible())
    .then((v) => assertTrue(v, "credit nav not visible"));
}
