import * as common from "#/browser/scenarios/common.js";
import * as login from "#/browser/scenarios/login.js";

import { unseededTest as test } from "./_context.js";

test.describe
  .serial("full-stack: the account journey", () => {
    test("register, confirm, awaiting approval, then refused at sign-in", async ({
      ctx,
    }) => {
      const email = `e2e-${Date.now()}@rtc.test`;
      const password = "Correct-Horse-9x";

      await login.openLoginScreen(ctx);
      await login.expectLoginTitle(ctx, `${TITLE}SIGN IN`);
      await login.registerAndConfirm(ctx, email, "E2E Guest", password);
      await login.typeUsername(ctx, email);
      await login.typePassword(ctx, password);
      await login.submitLogin(ctx);
      await login.expectLoginError(ctx, "Account awaiting approval");
    });

    test("a blocked seed is refused", async ({ ctx }) => {
      await login.openLoginScreen(ctx);
      await login.typeUsername(ctx, "blocked@rtc.test");
      await login.typePassword(ctx, SEED_PASSWORD);
      await login.submitLogin(ctx);
      await login.expectLoginError(ctx, "Account blocked");
    });

    test("an active seed signs in", async ({ ctx }) => {
      await login.openLoginScreen(ctx);
      await login.typeUsername(ctx, "trader@rtc.test");
      await login.typePassword(ctx, SEED_PASSWORD);
      await login.submitLogin(ctx);
      await login.expectAppShellVisible(ctx);
      await login.expectLoginScreenGone(ctx);
    });

    test("forgot password changes a seed's password", async ({ ctx }) => {
      await login.openLoginScreen(ctx);
      await login.openForgotPassword(ctx);
      await login.typeEmail(ctx, "pending@rtc.test");
      await login.submitLogin(ctx);
      await login.expectCodeSentTo(ctx, "pending@rtc.test");
      await login.typeCode(ctx, "00000000");
      await login.typeNewPassword(ctx, "Reset-Horse-7y");
      await login.submitLogin(ctx);
      await login.expectNotice(ctx, "changed");
      await login.takeNoticeAction(ctx);
      await login.typeUsername(ctx, "pending@rtc.test");
      await login.typePassword(ctx, "Reset-Horse-7y");
      await login.submitLogin(ctx);
      await login.expectLoginError(ctx, "Account awaiting approval");
    });
  });

// The account forms skip native validation (Ruling R13) and check each field
// themselves with the fold's own checks (spec §7): a malformed input stops at
// the form, before the fold, and shows the fold's copy under its field — not
// at form level — with no request sent.
test.describe("full-stack: malformed account input is refused locally", () => {
  test("a non-numeric code shows the code field's error and sends no request", async ({
    ctx,
  }) => {
    await login.openLoginScreen(ctx);
    await login.openForgotPassword(ctx);
    await login.typeEmail(ctx, "pending@rtc.test");
    await login.submitLogin(ctx);
    await login.expectLoginPhase(ctx, "code");
    await login.typeCode(ctx, "12ab");
    await login.typeNewPassword(ctx, "Reset-Horse-7y");
    await login.submitLogin(ctx);
    await login.expectFieldError(
      ctx,
      "code",
      "Enter the 8-digit code from the email",
    );
    await login.expectLoginPhase(ctx, "code");
    // The step was opened from Forgot password, so a sent code would post to
    // /reset-password; /confirm-email is the sign-up flow's path.
    login.expectNoRequestsTo(ctx, "/reset-password");
    login.expectNoRequestsTo(ctx, "/confirm-email");
  });

  test("a malformed email on the reset form shows the address field's error", async ({
    ctx,
  }) => {
    await login.openLoginScreen(ctx);
    await login.openForgotPassword(ctx);
    await login.typeEmail(ctx, "not-an-email");
    await login.submitLogin(ctx);
    await login.expectFieldError(ctx, "email", "Enter a valid email address");
    await login.expectLoginPhase(ctx, "requestReset");
    login.expectNoRequestsTo(ctx, "/request-reset");
  });
});

// Leaving a field reveals its error, which moves the controls below it on
// the vertically centred panel. A pointer press on a link keeps the field's
// focus, so nothing moves between the press and the release and one real
// click lands (Ruling 7).
test.describe("full-stack: a link under a focused field takes one click", () => {
  test("Back to sign in leaves Create account on the first click", async ({
    ctx,
  }) => {
    await login.openLoginScreen(ctx);
    await login.openCreateAccount(ctx);
    await login.expectLoginPhase(ctx, "register");
    await login.typeEmail(ctx, "ann@");
    await login.returnToSignIn(ctx);
    await login.expectLoginPhase(ctx, "signIn");
  });
});

// Browser Back/Forward through the login modes (spec §5): a mode link pushes
// a history entry, Back/Forward drive the screen, the hash names the mode.
test.describe("full-stack: browser history through the login modes", () => {
  test("Back and Forward walk create-account and forgot-password", async ({
    ctx,
  }) => {
    await login.openLoginScreen(ctx);
    await login.expectUrlHash(ctx, "#/sign-in");

    await login.openCreateAccount(ctx);
    await login.expectUrlHash(ctx, "#/create-account");
    await login.expectLoginTitle(ctx, `${TITLE}CREATE ACCOUNT`);

    await common.pressBrowserBack(ctx, "login");
    await login.expectUrlHash(ctx, "#/sign-in");
    await login.expectLoginTitle(ctx, `${TITLE}SIGN IN`);

    await common.pressBrowserForward(ctx, "login");
    await login.expectUrlHash(ctx, "#/create-account");
    await login.expectLoginTitle(ctx, `${TITLE}CREATE ACCOUNT`);

    await common.pressBrowserBack(ctx, "login");
    await login.openForgotPassword(ctx);
    await login.expectUrlHash(ctx, "#/forgot-password");
    await login.expectLoginPhase(ctx, "requestReset");

    await common.pressBrowserBack(ctx, "login");
    await login.expectUrlHash(ctx, "#/sign-in");
    await login.expectLoginTitle(ctx, `${TITLE}SIGN IN`);
  });
});

// The account journey over the real server (RTC_DEV_ACCOUNTS=1 in-memory
// directory, seeded admin@ / trader@ / pending@ / blocked@rtc.test with
// password "Mcdc2026!desk" and dev code 00000000). Every assertion delegates
// to scenario helpers. Request budget for one IP: 1 register, 1 confirm,
// 1 reset request, 1 reset confirm, 4 logins — inside every limit. The
// local-refusal cases send nothing, so they add no server request.
//
// Copy strings mirror @rtc/core-logic's accountAccessCopy.ts / shellFolds.ts
// (the tests workspace does not depend on core-logic).
const TITLE = "REACTIVE TRADER OS · ";

const SEED_PASSWORD = "Mcdc2026!desk";
