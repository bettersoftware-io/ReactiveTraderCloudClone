import type { TestContext } from "../testContext";
import { assertContains, assertEquals, assertNotEqual, assertTrue } from "./assert";

export async function toggleAndCaptureBackgrounds(ctx: TestContext): Promise<void> {
  ctx.scratch.theme.backgroundBefore = await ctx.po.workspace.rootBackgroundColor();
  await ctx.po.themeToggle.click();
  ctx.scratch.theme.backgroundAfter = await ctx.po.workspace.rootBackgroundColor();
}

export async function expectThemeToggleVisible(ctx: TestContext): Promise<void> {
  assertTrue(await ctx.po.themeToggle.isVisible(), "theme toggle not visible");
}

export async function expectBackgroundChanged(ctx: TestContext): Promise<void> {
  assertNotEqual(
    ctx.scratch.theme.backgroundAfter,
    ctx.scratch.theme.backgroundBefore,
    "expected background colour to change after theme toggle",
  );
}

export async function expectBackgroundMatchesToggled(ctx: TestContext): Promise<void> {
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

export async function expectFirstPriceTileVisible(ctx: TestContext, timeoutMs: number): Promise<void> {
  await ctx.po.liveRatesTile.waitForFirstTile(timeoutMs);
}

export async function expectCreditNavVisible(ctx: TestContext): Promise<void> {
  assertTrue(await ctx.po.creditRfqPanel.navIsVisible(), "credit nav not visible");
}
