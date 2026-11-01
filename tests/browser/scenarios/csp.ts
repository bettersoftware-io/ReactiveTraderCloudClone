import type { TestContext } from "../testContext.ts";
import { assertEquals } from "./assert.ts";
import * as devtools from "./devtools.ts";
import * as layout from "./layout.ts";
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

/** The paths the deployed site serves: the app, the inspector, the pop-out
 *  page and a deep SPA path (the rewrite to index.html). */
const POLICY_PATHS = ["/", "/devtools/", "/popout.html", "/credit"] as const;

function cspOf(ctx: TestContext): NonNullable<TestContext["po"]["csp"]> {
  if (ctx.po.csp === undefined) {
    throw new Error(
      "csp page object is not available under this driver (Playwright-only)",
    );
  }

  return ctx.po.csp;
}

/** Assert every served path carries a policy whose default and script sources
 *  are our own origin. */
export async function expectPolicyOnEveryPath(ctx: TestContext): Promise<void> {
  for (const path of POLICY_PATHS) {
    const policy = await cspOf(ctx).policyHeader(path);

    assertEquals(
      policy?.includes("default-src 'self'; script-src 'self';"),
      true,
      `${path} did not send the Content-Security-Policy (got ${policy ?? "no header"})`,
    );
  }
}

/** Open the app, then try to run an inline script and load a third-party
 *  script. Assert neither ran and the browser logged a violation for each. */
export async function expectInjectedScriptsBlocked(
  ctx: TestContext,
): Promise<void> {
  const foreign = "https://scripts.example.test/analytics.js";
  await ctx.po.workspace.open();

  const { inlineRan } = await cspOf(ctx).injectScripts(foreign);

  assertEquals(inlineRan, false, "an injected inline script ran");
  assertEquals(
    ctx.cspViolations.some((message) => {
      return message.includes("inline script");
    }),
    true,
    `no inline-script violation was logged:\n${ctx.cspViolations.join("\n")}`,
  );
  assertEquals(
    ctx.cspViolations.some((message) => {
      return message.includes(foreign);
    }),
    true,
    `no violation was logged for ${foreign}:\n${ctx.cspViolations.join("\n")}`,
  );
}

/** Pop the blotter out into its own window and back; return the violations
 *  any page of the context logged on the way. */
export async function popOutAndDockBack(ctx: TestContext): Promise<string[]> {
  await ctx.po.workspace.open();
  await layout.popoutBlotterShowsLiveContentAndDocksHomeOnClose(ctx);

  return [...ctx.cspViolations];
}
