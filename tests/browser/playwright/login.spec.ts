// tests/browser/playwright/login.spec.ts
//
// Coverage for the real LoginScreen form, end to end through AuthGate.
//
// Every other spec in this suite runs through `./_context.ts`, whose `test`
// seeds an authenticated session via `context.addInitScript` so scenarios can
// skip straight to the app. This spec is the one exception: `login.spec.ts`'s
// scenarios open a SECOND, unseeded browser context (see
// `PlaywrightLoginScreen.open()`) so the app boots into LoginScreen, then
// drive the real username/password form — the dev-server child process is
// started with `VITE_DEV_AUTH='{"demo":"demo"}'` (see
// tests/scripts/devServer.ts) so `demo`/`demo` is a valid simulator-mode
// credential, matching the `demo` roster identity.
//
// All assertions delegate to scenario helpers — gates 9-11 compliant.
import * as login from "../scenarios/login";
import { test } from "./_context";

test.describe("Login form", () => {
  test("signs in with demo/demo and reaches the app shell", async ({ ctx }) => {
    await login.openLoginScreen(ctx);
    await login.expectLoginScreenVisible(ctx);
    await login.expectLoginTitle(ctx, "REACTIVE TRADER OS · SIGN IN");

    await login.typeUsername(ctx, "demo");
    await login.typePassword(ctx, "demo");
    await login.submitLogin(ctx);

    await login.expectAppShellVisible(ctx);
    await login.expectLoginScreenGone(ctx);
  });

  test("shows an error and stays on the login screen for wrong credentials", async ({
    ctx,
  }) => {
    await login.openLoginScreen(ctx);

    await login.typeUsername(ctx, "demo");
    await login.typePassword(ctx, "wrong-password");
    await login.submitLogin(ctx);

    await login.expectLoginError(ctx, "Invalid credentials");
    await login.expectLoginScreenVisible(ctx);
  });
});
