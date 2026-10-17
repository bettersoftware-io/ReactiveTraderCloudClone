import type { TestContext } from "../testContext.ts";
import { loginScreenOf } from "./login.ts";

/** Whose history a browser button steps: the app page's, or the login
 *  screen's own page (`LoginScreenPO.open` opens it in a fresh context). */
export type HistoryPage = "app" | "login";

export async function openWorkspace(ctx: TestContext): Promise<void> {
  await ctx.po.workspace.open();
}

export async function openFxWorkspace(ctx: TestContext): Promise<void> {
  await ctx.po.workspace.openFx();
}

export async function openCreditWorkspace(ctx: TestContext): Promise<void> {
  await ctx.po.workspace.openCredit();
}

/** Open the app at `path` (e.g. `/credit`) — a cold load of a deep path. */
export async function openWorkspaceAt(
  ctx: TestContext,
  path: string,
): Promise<void> {
  await ctx.po.workspace.openAt(path);
}

export async function clickTab(ctx: TestContext, tab: string): Promise<void> {
  if (
    tab !== "fx" &&
    tab !== "credit" &&
    tab !== "admin" &&
    tab !== "equities"
  ) {
    throw new Error(`unsupported tab: ${tab}`);
  }

  await ctx.po.workspace.clickTab(tab);
}

export async function reloadPage(ctx: TestContext): Promise<void> {
  await ctx.po.workspace.reload();
}

export async function waitSeconds(
  ctx: TestContext,
  seconds: number,
): Promise<void> {
  await ctx.po.workspace.wait(seconds * 1_000);
}

/** Click the browser's Back button on `page`. */
export async function pressBrowserBack(
  ctx: TestContext,
  page: HistoryPage,
): Promise<void> {
  await historyOf(ctx, page).browserBack();
}

/** Click the browser's Forward button on `page`. */
export async function pressBrowserForward(
  ctx: TestContext,
  page: HistoryPage,
): Promise<void> {
  await historyOf(ctx, page).browserForward();
}

interface BrowserHistoryButtons {
  browserBack(): Promise<void>;
  browserForward(): Promise<void>;
}

function historyOf(ctx: TestContext, page: HistoryPage): BrowserHistoryButtons {
  if (page === "app") {
    return ctx.po.workspace;
  }

  return loginScreenOf(ctx);
}
