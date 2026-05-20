import type { TestContext } from "../support/testContext";

export async function openWorkspace(ctx: TestContext): Promise<void> {
  await ctx.po.workspace.open();
}

export async function openFxWorkspace(ctx: TestContext): Promise<void> {
  await ctx.po.workspace.openFx();
}

export async function openCreditWorkspace(ctx: TestContext): Promise<void> {
  await ctx.po.workspace.openCredit();
}

export async function clickTab(
  ctx: TestContext,
  tab: string,
): Promise<void> {
  if (tab !== "fx" && tab !== "credit" && tab !== "admin") {
    throw new Error(`unsupported tab: ${tab}`);
  }
  await ctx.po.workspace.clickTab(tab);
}

export async function reloadPage(ctx: TestContext): Promise<void> {
  await ctx.po.workspace.reload();
}

export async function waitSeconds(ctx: TestContext, seconds: number): Promise<void> {
  await ctx.po.workspace.wait(seconds * 1_000);
}
