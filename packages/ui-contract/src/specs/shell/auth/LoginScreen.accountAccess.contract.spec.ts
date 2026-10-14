import { LoginScreen } from "@ui-contract/components";
import { cleanupMounted, mount } from "@ui-contract/mount";
import type {
  LoginScreenPage,
  PasswordChecklistRow,
} from "@ui-contract/pages/shell/auth/LoginScreenPage";
import { afterEach, describe, expect, it } from "vitest";

import type { AccountAccessFlow, AccountAccessState } from "@rtc/core-api";
import {
  ACCOUNT_ACCESS_COPY,
  describeAccountAccessTitle,
  PRIVACY_NOTICE_URL,
} from "@rtc/core-logic";
import { type DemoAccount, PASSWORD_RULES } from "@rtc/domain";

afterEach(() => {
  cleanupMounted();
});

// The two absence pins — no account links without registration, no demo
// hint outside the sign-in form — live in LoginScreen.contract.spec.ts.
describe("LoginScreen account access — sign-in phase", () => {
  it("offers both account links beside the demo hint when registration is available", () => {
    const page = mount(LoginScreen, {
      auth: { status: "unauthenticated" },
      registrationAvailable: true,
      demoAccounts: createDemoAccounts(),
    });

    expect(page.hasCreateAccountLink()).toBe(true);
    expect(page.hasForgotPasswordLink()).toBe(true);
    expect(page.hasDemoAccounts()).toBe(true);
  });

  it("opens the create-account form from Create account", async () => {
    const page = mount(LoginScreen, {
      auth: { status: "unauthenticated" },
      registrationAvailable: true,
    });

    await page.openCreateAccount();

    expect(page.navigations()).toEqual(["startRegistration"]);
    expect(page.phase()).toBe("register");
    expect(page.title()).toBe(
      describeAccountAccessTitle({
        phase: "register",
        busy: false,
        error: null,
      }),
    );
  });

  it("opens the reset request from Forgot password?", async () => {
    const page = mount(LoginScreen, {
      auth: { status: "unauthenticated" },
      registrationAvailable: true,
    });

    await page.openForgotPassword();

    expect(page.navigations()).toEqual(["startReset"]);
    expect(page.phase()).toBe("requestReset");
    expect(page.title()).toBe(
      describeAccountAccessTitle({
        phase: "requestReset",
        busy: false,
        error: null,
      }),
    );
  });

  it("offers to enter a code after an unconfirmed sign-in, and opens the code step", async () => {
    const page = mount(LoginScreen, {
      auth: {
        status: "unauthenticated",
        error: "Email not confirmed",
        failure: "unconfirmed",
      },
      registrationAvailable: true,
    });

    expect(page.error()).toBe("Email not confirmed");
    expect(page.errorRole()).toBe("alert");
    expect(page.hasEnterCodeOffer()).toBe(true);

    await page.openCodeEntry();

    expect(page.navigations()).toEqual(["startCodeEntry"]);
    expect(page.phase()).toBe("code");
  });

  it.each([
    { failure: "pending" as const, error: "Awaiting approval" },
    { failure: "blocked" as const, error: "This account is blocked" },
  ])("shows the $failure error without a code offer", ({ failure, error }) => {
    const page = mount(LoginScreen, {
      auth: { status: "unauthenticated", error, failure },
      registrationAvailable: true,
    });

    expect(page.phase()).toBe("signIn");
    expect(page.error()).toBe(error);
    expect(page.hasEnterCodeOffer()).toBe(false);
  });

  it("makes no code offer after an unconfirmed sign-in when registration is unavailable", () => {
    const page = mount(LoginScreen, {
      auth: {
        status: "unauthenticated",
        error: "Email not confirmed",
        failure: "unconfirmed",
      },
    });

    expect(page.phase()).toBe("signIn");
    expect(page.error()).toBe("Email not confirmed");
    expect(page.hasEnterCodeOffer()).toBe(false);
  });
});

describe("LoginScreen account access — register phase", () => {
  it("offers neither account link away from the sign-in form", () => {
    const page = mount(LoginScreen, {
      auth: { status: "unauthenticated" },
      registrationAvailable: true,
      accountAccess: createRegisterState(),
    });

    expect(page.phase()).toBe("register");
    expect(page.hasCreateAccountLink()).toBe(false);
    expect(page.hasForgotPasswordLink()).toBe(false);
  });

  it("renders the create-account fields and a checklist row per password rule", () => {
    const page = mountAt(createRegisterState());

    expect(page.phase()).toBe("register");
    expect(page.hasEmailField()).toBe(true);
    expect(page.hasNewPasswordField()).toBe(true);
    expect(page.submitLabel()).toBe(ACCOUNT_ACCESS_COPY.registerSubmit);
    expect(
      page.checklist().map((row) => {
        return row.label;
      }),
    ).toEqual(
      PASSWORD_RULES.map((rule) => {
        return rule.label;
      }),
    );
  });

  it("meets no rule but the byte ceiling before anything is typed", () => {
    const page = mountAt(createRegisterState());

    expect(metRules(page.checklist())).toEqual(["max-length"]);
  });

  it("meets every rule for a strong password", async () => {
    const page = mountAt(createRegisterState());

    await page.typeNewPassword(STRONG);

    expect(metRules(page.checklist())).toEqual(
      PASSWORD_RULES.map((rule) => {
        return rule.id;
      }),
    );
  });

  it("meets only the lowercase rule and the byte ceiling for a short lowercase password", async () => {
    const page = mountAt(createRegisterState());

    await page.typeNewPassword("short");

    expect(metRules(page.checklist())).toEqual(["max-length", "lowercase"]);
  });

  it("registers with exactly what was typed, leaving normalization to the machine", async () => {
    const page = mountAt(createRegisterState());

    await page.typeEmail("Ann@Desk.io");
    await page.typeDisplayName("  Ann  Stark ");
    await page.typeNewPassword(STRONG);
    await page.submit();

    expect(page.registerArgs()).toStrictEqual([
      { email: "Ann@Desk.io", displayName: "  Ann  Stark ", password: STRONG },
    ]);
  });

  it("disables the submit control and reads SENDING while busy", () => {
    const page = mountAt(createRegisterState({ busy: true }));

    expect(page.isSubmitDisabled()).toBe(true);
    expect(page.submitLabel()).toBe(ACCOUNT_ACCESS_COPY.busySubmit);
  });

  it("renders the machine's error in the error line", () => {
    const page = mountAt(
      createRegisterState({ error: "Sign-up is paused for now" }),
    );

    expect(page.error()).toBe("Sign-up is paused for now");
    expect(page.errorRole()).toBe("alert");
  });

  it("links the privacy notice", () => {
    const page = mountAt(createRegisterState());

    expect(page.privacyHref()).toBe(PRIVACY_NOTICE_URL);
  });

  it("opens the code step from I already have a code", async () => {
    const page = mountAt(createRegisterState());

    await page.openCodeEntry();

    expect(page.navigations()).toEqual(["startCodeEntry"]);
    expect(page.phase()).toBe("code");
  });

  it("returns to sign-in from Back to sign in", async () => {
    const page = mountAt(createRegisterState());

    await page.goBack();

    expect(page.navigations()).toEqual(["returnToSignIn"]);
    expect(page.phase()).toBe("signIn");
  });
});

describe("LoginScreen account access — code phase", () => {
  it("names the address the code went to and asks only for the code when both are held", async () => {
    const page = mountAt(createCodeState());

    expect(page.phase()).toBe("code");
    expect(page.codeSentTo()).toContain("ann@desk.io");
    expect(page.hasEmailField()).toBe(false);
    expect(page.hasNewPasswordField()).toBe(false);
    expect(page.checklist()).toEqual([]);
    expect(page.submitLabel()).toBe(ACCOUNT_ACCESS_COPY.confirmSubmit);

    await page.typeCode(CODE);
    await page.submit();

    expect(page.codeArgs()).toStrictEqual([{ code: CODE }]);
  });

  it("asks for a password with its checklist when none is held", async () => {
    const page = mountAt(createCodeState({ passwordHeld: false }));

    expect(page.phase()).toBe("code");
    expect(page.hasNewPasswordField()).toBe(true);
    expect(page.newPasswordLabel()).toBe(ACCOUNT_ACCESS_COPY.passwordLabel);
    expect(page.checklist()).toHaveLength(PASSWORD_RULES.length);

    await page.typeCode(CODE);
    await page.typeNewPassword(STRONG);
    await page.submit();

    expect(page.codeArgs()).toStrictEqual([{ code: CODE, password: STRONG }]);
  });

  it("asks for the address too when none is held", async () => {
    const page = mountAt(createCodeState({ email: null, passwordHeld: false }));

    expect(page.phase()).toBe("code");
    expect(page.hasEmailField()).toBe(true);
    expect(page.codeSentTo()).toBe("");

    await page.typeEmail("ann@desk.io");
    await page.typeCode(CODE);
    await page.typeNewPassword(STRONG);
    await page.submit();

    expect(page.codeArgs()).toStrictEqual([
      { email: "ann@desk.io", code: CODE, password: STRONG },
    ]);
  });

  it("shows the resent hint after a resend", () => {
    const page = mountAt(createCodeState({ resent: true }));

    expect(page.phase()).toBe("code");
    expect(page.hasResent()).toBe(true);
  });

  it("shows no resent hint before a resend", () => {
    const page = mountAt(createCodeState());

    expect(page.phase()).toBe("code");
    expect(page.hasResent()).toBe(false);
  });

  it("resends to the held address without naming it", async () => {
    const page = mountAt(createCodeState());

    await page.resend();

    expect(page.resendArgs()).toEqual([undefined]);
  });

  it("resends to the typed address when none is held", async () => {
    const page = mountAt(createCodeState({ email: null, passwordHeld: false }));

    await page.typeEmail("ann@desk.io");
    await page.resend();

    expect(page.resendArgs()).toEqual(["ann@desk.io"]);
  });

  it("returns to sign-in from Back to sign in", async () => {
    const page = mountAt(createCodeState());

    await page.goBack();

    expect(page.navigations()).toEqual(["returnToSignIn"]);
    expect(page.phase()).toBe("signIn");
  });

  it("reads as a password reset in the reset flow", () => {
    const state = createCodeState({ flow: "reset", passwordHeld: false });
    const page = mountAt(state);

    expect(page.phase()).toBe("code");
    expect(page.title()).toBe(describeAccountAccessTitle(state));
    expect(page.newPasswordLabel()).toBe(ACCOUNT_ACCESS_COPY.newPasswordLabel);
    expect(page.submitLabel()).toBe(ACCOUNT_ACCESS_COPY.setPasswordSubmit);
  });

  it("takes the code as a numeric one-time code", () => {
    const page = mountAt(createCodeState());

    expect(page.phase()).toBe("code");
    expect(page.codeAttribute("inputmode")).toBe("numeric");
    expect(page.codeAttribute("autocomplete")).toBe("one-time-code");
  });

  it("passes a space-padded code on in full, leaving the trim to the machine", async () => {
    const page = mountAt(createCodeState());

    await page.typeCode(` ${CODE} `);
    await page.submit();

    expect(page.codeArgs()).toStrictEqual([{ code: ` ${CODE} ` }]);
  });

  it("disables the submit control and reads SENDING while busy", () => {
    const page = mountAt(createCodeState({ busy: true }));

    expect(page.phase()).toBe("code");
    expect(page.isSubmitDisabled()).toBe(true);
    expect(page.submitLabel()).toBe(ACCOUNT_ACCESS_COPY.busySubmit);
  });

  it("disables Resend code while busy, so a click sends nothing", async () => {
    const page = mountAt(createCodeState({ busy: true }));

    expect(page.phase()).toBe("code");
    expect(page.isResendDisabled()).toBe(true);

    await page.resend();

    expect(page.resendArgs()).toEqual([]);
  });

  it("enables Resend code when idle", () => {
    const page = mountAt(createCodeState());

    expect(page.isResendDisabled()).toBe(false);
  });

  it("renders the machine's error in the error line", () => {
    const page = mountAt(
      createCodeState({ error: "That code is not valid or has expired" }),
    );

    expect(page.phase()).toBe("code");
    expect(page.error()).toBe("That code is not valid or has expired");
    expect(page.errorRole()).toBe("alert");
  });
});

describe("LoginScreen account access — request-reset phase", () => {
  it("asks for the address and requests a reset code for it", async () => {
    const page = mountAt(createRequestResetState());

    expect(page.phase()).toBe("requestReset");
    expect(page.hasEmailField()).toBe(true);
    expect(page.submitLabel()).toBe(ACCOUNT_ACCESS_COPY.requestResetSubmit);

    await page.typeEmail("ann@desk.io");
    await page.submit();

    expect(page.resetRequestArgs()).toEqual(["ann@desk.io"]);
  });

  it("disables the submit control while busy", () => {
    const page = mountAt(createRequestResetState({ busy: true }));

    expect(page.phase()).toBe("requestReset");
    expect(page.isSubmitDisabled()).toBe(true);
  });

  it("renders the machine's error in the error line", () => {
    const page = mountAt(
      createRequestResetState({ error: "Enter a valid email address" }),
    );

    expect(page.phase()).toBe("requestReset");
    expect(page.error()).toBe("Enter a valid email address");
    expect(page.errorRole()).toBe("alert");
  });

  it("returns to sign-in from Back to sign in", async () => {
    const page = mountAt(createRequestResetState());

    await page.goBack();

    expect(page.navigations()).toEqual(["returnToSignIn"]);
    expect(page.phase()).toBe("signIn");
  });
});

describe("LoginScreen account access — secrets stay out of the DOM's data", () => {
  it("puts neither the password nor the code in any data-* attribute", async () => {
    const register = mountAt(createRegisterState());

    expect(register.phase()).toBe("register");

    await register.typeNewPassword(STRONG);

    expect(dataAttributesHolding(register, STRONG)).toEqual([]);

    cleanupMounted();
    const code = mountAt(createCodeState({ passwordHeld: false }));

    expect(code.phase()).toBe("code");

    await code.typeCode(CODE);

    expect(dataAttributesHolding(code, CODE)).toEqual([]);

    await code.typeNewPassword(STRONG);

    expect(dataAttributesHolding(code, CODE)).toEqual([]);
    expect(dataAttributesHolding(code, STRONG)).toEqual([]);
  });
});

describe("LoginScreen account access — notices", () => {
  it("tells a confirmed user an administrator approves the account, and returns to sign-in", async () => {
    const page = mountAt({ phase: "pendingApproval", email: "ann@desk.io" });

    expect(page.notice()).toContain(ACCOUNT_ACCESS_COPY.pendingApprovalNotice);
    expect(page.notice()).toContain("ann@desk.io");

    await page.takeNoticeAction();

    expect(page.navigations()).toEqual(["returnToSignIn"]);
  });

  it("requests a reset code for the held address when no password could be stored", async () => {
    const page = mountAt({ phase: "passwordUnset", email: "ann@desk.io" });

    expect(page.notice()).toContain(ACCOUNT_ACCESS_COPY.passwordUnsetNotice);

    await page.takeNoticeAction();

    expect(page.resetRequestArgs()).toEqual(["ann@desk.io"]);
    expect(page.navigations()).toEqual([]);
  });

  it("returns to sign-in after a password change", async () => {
    const page = mountAt({ phase: "passwordChanged", email: "ann@desk.io" });

    expect(page.notice()).toContain(ACCOUNT_ACCESS_COPY.passwordChangedNotice);

    await page.takeNoticeAction();

    expect(page.navigations()).toEqual(["returnToSignIn"]);
  });
});

/** Mounts LoginScreen signed out, in one account-access phase. */
function mountAt(accountAccess: AccountAccessState): LoginScreenPage {
  return mount(LoginScreen, {
    auth: { status: "unauthenticated" },
    accountAccess,
  });
}

/** Every `data-*` attribute on screen whose value contains `secret`, as
 * `name="value"` — read generically, so a `data-pw` is caught as surely
 * as a `data-password`. */
function dataAttributesHolding(
  page: LoginScreenPage,
  secret: string,
): string[] {
  return page.dataAttributes().flatMap(([name, value]) => {
    return value.includes(secret) ? [`${name}="${value}"`] : [];
  });
}

/** The ids of the checklist rows marked met, in display order. */
function metRules(rows: readonly PasswordChecklistRow[]): string[] {
  return PASSWORD_RULES.filter((_rule, index) => {
    return rows[index]?.met === true;
  }).map((rule) => {
    return rule.id;
  });
}

interface PhaseSeed {
  readonly busy?: boolean;
  readonly error?: string | null;
}

function createRegisterState(seed: PhaseSeed = {}): AccountAccessState {
  return { phase: "register", busy: false, error: null, ...seed };
}

function createRequestResetState(seed: PhaseSeed = {}): AccountAccessState {
  return { phase: "requestReset", busy: false, error: null, ...seed };
}

interface CodeSeed extends PhaseSeed {
  readonly flow?: AccountAccessFlow;
  readonly email?: string | null;
  readonly passwordHeld?: boolean;
  readonly resent?: boolean;
}

/** The sign-up code step this machine sent: address and password held. */
function createCodeState(seed: CodeSeed = {}): AccountAccessState {
  return {
    phase: "code",
    flow: "signup",
    email: "ann@desk.io",
    passwordHeld: true,
    resent: false,
    busy: false,
    error: null,
    ...seed,
  };
}

function createDemoAccounts(): DemoAccount[] {
  return [
    { username: "astark", password: "shared-pw", role: "Senior FX Trader" },
  ];
}

/** Meets every password rule. */
const STRONG = "Correct-Horse-9x";

const CODE = "12345678";
