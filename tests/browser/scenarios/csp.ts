import type { TestContext } from "../testContext.ts";
import { assertEquals } from "./assert.ts";
import * as devtools from "./devtools.ts";
import * as login from "./login.ts";

/** The demo account every simulator-mode build accepts (see login.spec.ts). */
const DEMO_ACCOUNT = "demo";

/** Load the app signed out, sign in with the demo account, and wait for the
 *  shell. Returns the CSP violations the login page logged on the way. */
export async function signInAsDemo(ctx: TestContext): Promise<string[]> {
  await login.openLoginScreen(ctx);
  await login.expectLoginScreenVisible(ctx);
  await login.typeUsername(ctx, DEMO_ACCOUNT);
  await login.typePassword(ctx, DEMO_ACCOUNT);
  await login.submitLogin(ctx);
  await login.expectAppShellVisible(ctx);

  return [...login.loginScreenOf(ctx).cspViolations()];
}

/** Open the FX workspace (a live tile and its dockview panels), then the
 *  `/devtools/` inspector, and wait until the inspector has paired. Returns
 *  the CSP violations any page of the seeded context logged. */
export async function openWorkspaceAndDevtools(
  ctx: TestContext,
): Promise<string[]> {
  await devtools.openAppOnFxWorkspace(ctx);
  await devtools.openInspector(ctx);
  await devtools.expectStreamRow(ctx, "blotter.trades$");

  return [...ctx.cspViolations];
}

/** Fail, quoting every message, when the browser blocked anything. */
export function expectNoViolations(violations: readonly string[]): void {
  assertEquals(
    violations.join("\n"),
    "",
    `the page logged ${violations.length} Content-Security-Policy violation(s):\n${violations.join("\n")}`,
  );
}
