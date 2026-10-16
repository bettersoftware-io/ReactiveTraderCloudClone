import type { LoginScreenPO } from "../page-objects/contracts/LoginScreen.ts";
import type { TestContext } from "../testContext.ts";

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

/** Assert the inline error under `field` (`email`, `display-name`, `code`)
 *  reads `expected` within 5s, and that the form-level error line is absent:
 *  a local refusal shows once, under its field. */
export async function expectFieldError(
  ctx: TestContext,
  field: string,
  expected: string,
): Promise<void> {
  await login(ctx).waitFieldError(field, expected, 5_000);

  if (await login(ctx).hasLoginError()) {
    throw new Error(
      `a local refusal of the ${field} field also shows at form level`,
    );
  }
}

/** Assert the login screen is gone (AuthGate let the app through) within 5s. */
export async function expectLoginScreenGone(ctx: TestContext): Promise<void> {
  await login(ctx).waitGone(5_000);
}

/** Assert the app shell (header chrome) is visible within 10s. */
export async function expectAppShellVisible(ctx: TestContext): Promise<void> {
  await login(ctx).waitAppShell(10_000);
}

/** Finds a captured page error mentioning `VITE_CORE_IMPL` — the fail-closed
 *  message `coreSelection.ts`'s `resolveCoreChoice` throws synchronously at
 *  boot on an unrecognized build default — or `undefined` when boot
 *  succeeded. Shared by any scenario that waits on the booted core, so a real
 *  boot failure surfaces as ITS message instead of an opaque locator timeout
 *  (`coreSwitch.ts`'s `expectBootedCoreImpl` reuses this rather than
 *  duplicating the scan). */
export function findBootFailure(ctx: TestContext): string | undefined {
  return ctx.pageErrors.find((message) => {
    return message.includes("VITE_CORE_IMPL");
  });
}

/** Assert the app booted on the core this run selected — `RTC_CORE_IMPL`
 *  (default `rxjs`; an explicitly EMPTY value collapses to `rxjs`, as
 *  `clientServer.ts` → vite's `|| "rxjs"` does), forwarded to the dev server as
 *  `VITE_CORE_IMPL` (`coreSelection.ts`'s build default) and published by
 *  `startWebClient` as `<html data-core-impl>` once `bootApp.ts`'s `bootCore`
 *  resolves. A page error that mentions VITE_CORE_IMPL is the fail-closed
 *  message from `coreSelection.ts`'s `resolveCoreChoice` — surfaced verbatim
 *  instead of being waited out as a locator timeout. */
export async function expectSelectedCoreImpl(ctx: TestContext): Promise<void> {
  const expected = process.env.RTC_CORE_IMPL || "rxjs";

  try {
    await login(ctx).waitCoreImpl(expected, 5_000);
  } catch (error) {
    const boot = findBootFailure(ctx);

    if (boot !== undefined) {
      throw new Error(`the app failed to boot: ${boot}`, { cause: error });
    }

    throw error;
  }
}

/** Assert the sign-in form offers no account links (simulator mode has no
 *  server to hold accounts). */
export async function expectAccountLinksAbsent(
  ctx: TestContext,
): Promise<void> {
  await login(ctx).waitVisible(10_000);

  if (await login(ctx).hasCreateAccountLink()) {
    throw new Error("the create-account link is offered without a server");
  }
}

/** Click the create-account link. */
export async function openCreateAccount(ctx: TestContext): Promise<void> {
  await login(ctx).openCreateAccount();
}

/** Click the forgot-password link. */
export async function openForgotPassword(ctx: TestContext): Promise<void> {
  await login(ctx).openForgotPassword();
}

/** Type into the email field. */
export async function typeEmail(
  ctx: TestContext,
  value: string,
): Promise<void> {
  await login(ctx).typeEmail(value);
}

/** Type into the display-name field. */
async function typeDisplayName(ctx: TestContext, value: string): Promise<void> {
  await login(ctx).typeDisplayName(value);
}

/** Type into the new-password field. */
export async function typeNewPassword(
  ctx: TestContext,
  value: string,
): Promise<void> {
  await login(ctx).typeNewPassword(value);
}

/** Type into the 8-digit code field. */
export async function typeCode(ctx: TestContext, value: string): Promise<void> {
  await login(ctx).typeCode(value);
}

/** Assert the screen's account-access phase reads `expected` within 5s. */
export async function expectLoginPhase(
  ctx: TestContext,
  expected: string,
): Promise<void> {
  await login(ctx).waitPhase(expected, 5_000);
}

/** Assert the code step reads "Code sent to <email>" within 10s. */
export async function expectCodeSentTo(
  ctx: TestContext,
  email: string,
): Promise<void> {
  await login(ctx).waitCodeSentTo(email, 10_000);
}

/** Assert the notice contains `containsText` within 10s. */
export async function expectNotice(
  ctx: TestContext,
  containsText: string,
): Promise<void> {
  await login(ctx).waitNotice(containsText, 10_000);
}

/** Click the notice's action button. */
export async function takeNoticeAction(ctx: TestContext): Promise<void> {
  await login(ctx).takeNoticeAction();
}

/** Assert the login page has made no request whose path ends with `path`. */
export function expectNoRequestsTo(ctx: TestContext, path: string): void {
  const count = login(ctx).countRequestsTo(path);

  if (count !== 0) {
    throw new Error(`expected no request to ${path}, saw ${count}`);
  }
}

/** The whole create-account ride: register, confirm with the dev code, land on
 *  the awaiting-approval notice, and return to the sign-in form. */
export async function registerAndConfirm(
  ctx: TestContext,
  email: string,
  displayName: string,
  password: string,
): Promise<void> {
  await openCreateAccount(ctx);
  await expectLoginTitle(ctx, "REACTIVE TRADER OS · CREATE ACCOUNT");
  await typeEmail(ctx, email);
  await typeDisplayName(ctx, displayName);
  await typeNewPassword(ctx, password);
  await submitLogin(ctx);
  await expectCodeSentTo(ctx, email);
  await typeCode(ctx, "00000000");
  await submitLogin(ctx);
  await expectNotice(ctx, "administrator");
  await takeNoticeAction(ctx);
}

/** Click the browser's Back button. */
export async function pressBrowserBack(ctx: TestContext): Promise<void> {
  await login(ctx).browserBack();
}

/** Click the browser's Forward button. */
export async function pressBrowserForward(ctx: TestContext): Promise<void> {
  await login(ctx).browserForward();
}

/** Assert the URL hash reads `expected` within 5s. */
export async function expectUrlHash(
  ctx: TestContext,
  expected: string,
): Promise<void> {
  await login(ctx).waitUrlHash(expected, 5_000);
}
