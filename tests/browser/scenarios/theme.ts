import type { TestContext } from "../testContext";
import {
  assertContains,
  assertEquals,
  assertNotEqual,
  assertTrue,
} from "./assert";

export async function toggleAndCaptureBackgrounds(
  ctx: TestContext,
): Promise<void> {
  ctx.scratch.theme.backgroundBefore =
    await ctx.po.workspace.rootBackgroundColor();
  await ctx.po.themeToggle.click();
  ctx.scratch.theme.backgroundAfter =
    await ctx.po.workspace.rootBackgroundColor();
}

export async function expectThemeToggleVisible(
  ctx: TestContext,
): Promise<void> {
  assertTrue(await ctx.po.themeToggle.isVisible(), "theme toggle not visible");
}

export async function expectBackgroundChanged(ctx: TestContext): Promise<void> {
  assertNotEqual(
    ctx.scratch.theme.backgroundAfter,
    ctx.scratch.theme.backgroundBefore,
    "expected background colour to change after theme toggle",
  );
}

export async function expectBackgroundMatchesToggled(
  ctx: TestContext,
): Promise<void> {
  const current = await ctx.po.workspace.rootBackgroundColor();
  assertEquals(
    current,
    ctx.scratch.theme.backgroundAfter,
    `expected current bg ${current} to equal recorded post-toggle ${ctx.scratch.theme.backgroundAfter}`,
  );
}

export async function expectThemeToggleAriaLabelMentions(
  ctx: TestContext,
  term: string,
): Promise<void> {
  const label = await ctx.po.themeToggle.ariaLabel();
  assertContains(label, term);
}

export async function expectFirstPriceTileVisible(
  ctx: TestContext,
  timeoutMs: number,
): Promise<void> {
  await ctx.po.liveRatesTile.waitForFirstTile(timeoutMs);
}

/** "Credit screen fully loaded" signal for cross-cutting smoke checks (e.g.
 * the theme-toggle-then-switch-tabs regression) that don't otherwise care
 * about credit internals — the dock's three panels (New RFQ, RFQs, Credit
 * Blotter) all render simultaneously, replacing the old tabbed
 * CreditWorkspace's single nav bar as the "did it load" anchor. */
export async function expectCreditDockVisible(ctx: TestContext): Promise<void> {
  assertTrue(
    await ctx.po.creditRfqPanel.dockIsVisible(),
    "credit dock not visible",
  );
}
