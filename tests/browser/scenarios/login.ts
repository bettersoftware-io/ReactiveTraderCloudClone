import type { LoginScreenPO } from "../page-objects/contracts/LoginScreen";
import type { TestContext } from "../testContext";

/** Narrow `ctx.po.login` (optional on the shared contract — Playwright-only)
 *  to a present PO, failing loudly under a driver that does not provide it. */
function login(ctx: TestContext): LoginScreenPO {
  if (ctx.po.login === undefined) {
    throw new Error(
      "login page object is not available under this driver (Playwright-only)",
    );
  }

  return ctx.po.login;
}

/** Open a fresh, unauthenticated view of the app so AuthGate renders the real
 *  LoginScreen. */
export async function openLoginScreen(ctx: TestContext): Promise<void> {
  await login(ctx).open();
}

/** Assert the login form is visible within 10s. */
export async function expectLoginScreenVisible(
  ctx: TestContext,
): Promise<void> {
  await login(ctx).waitVisible(10_000);
}

/** Assert the sign-in title reads `expected` within 5s. */
export async function expectLoginTitle(
  ctx: TestContext,
  expected: string,
): Promise<void> {
  await login(ctx).waitTitle(expected, 5_000);
}

/** Type into the username field. */
export async function typeUsername(
  ctx: TestContext,
  value: string,
): Promise<void> {
  await login(ctx).typeUsername(value);
}

/** Type into the password field. */
export async function typePassword(
  ctx: TestContext,
  value: string,
): Promise<void> {
  await login(ctx).typePassword(value);
}

/** Click AUTHENTICATE → submit the form. */
export async function submitLogin(ctx: TestContext): Promise<void> {
  await login(ctx).submit();
}

/** Assert the rendered error text reads `expected` within 5s. */
export async function expectLoginError(
  ctx: TestContext,
  expected: string,
): Promise<void> {
  await login(ctx).waitErrorText(expected, 5_000);
}

/** Assert the login screen is gone (AuthGate let the app through) within 5s. */
export async function expectLoginScreenGone(ctx: TestContext): Promise<void> {
  await login(ctx).waitGone(5_000);
}

/** Assert the app shell (header chrome) is visible within 10s. */
export async function expectAppShellVisible(ctx: TestContext): Promise<void> {
  await login(ctx).waitAppShell(10_000);
}

/** Assert the app booted on the core this run selected — `RTC_CORE_IMPL`
 *  (default `rxjs`; an explicitly EMPTY value collapses to `rxjs`, as
 *  `devServer.ts` → vite's `|| "rxjs"` does), forwarded to the dev server as
 *  `VITE_CORE_IMPL` and published by `selectCore.ts` as `<html
 *  data-core-impl>`. A page error that mentions VITE_CORE_IMPL is the
 *  fail-closed message from `selectCore.ts` — surfaced verbatim instead of
 *  being waited out as a locator timeout. */
export async function expectSelectedCoreImpl(ctx: TestContext): Promise<void> {
  const expected = process.env.RTC_CORE_IMPL || "rxjs";

  try {
    await login(ctx).waitCoreImpl(expected, 5_000);
  } catch (error) {
    const boot = ctx.pageErrors.find((message) => {
      return message.includes("VITE_CORE_IMPL");
    });

    if (boot !== undefined) {
      throw new Error(`the app failed to boot: ${boot}`, { cause: error });
    }

    throw error;
  }
}
