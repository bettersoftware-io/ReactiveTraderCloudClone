/**
 * Live field validation on the account forms (spec §7): the address, the
 * display name and the code each show their check's error under the field —
 * nothing while the field is first typed into, then from the first time it
 * is left, live as the value changes. A submit reveals every field and,
 * when one fails, sends nothing and focuses the first failing field. The
 * checks and their copy are `@rtc/core-logic`'s; a server refusal stays at
 * form level. Resend code checks a typed address the same way, on that
 * field alone. A pointer press on a button or link keeps the focus where it
 * is, so the press does not blur a field, reveal its error and move the
 * control away before the click lands.
 */

import { LoginScreen } from "@ui-contract/components";
import { cleanupMounted, mount } from "@ui-contract/mount";
import type { LoginScreenPage } from "@ui-contract/pages/shell/auth/LoginScreenPage";
import { afterEach, describe, expect, it } from "vitest";

import type { AccountAccessState } from "@rtc/core-api";
import {
  CODE_INPUT_ERROR,
  DISPLAY_NAME_INPUT_ERROR,
  EMAIL_INPUT_ERROR,
} from "@rtc/core-logic";

afterEach(() => {
  cleanupMounted();
});

describe("LoginScreen field validation — when an error shows", () => {
  it("shows no address error while the field still has focus", async () => {
    const page = mountAt(createRegisterState());

    await page.typeEmail("not-an-email");

    expect(page.focusedControl()).toBe("login-email");
    expect(page.fieldError("email")).toBeNull();
    expect(page.isMarkedInvalid("login-email")).toBe(false);
    expect(page.describedBy("login-email")).toBeNull();
  });

  it("shows the address error under the field once it is left, and points the field at it", async () => {
    const page = mountAt(createRegisterState());

    await page.typeEmail("not-an-email");
    await page.blur("login-email");

    expect(page.fieldError("email")).toBe(EMAIL_INPUT_ERROR);
    expect(page.fieldErrorFields()).toEqual(["email"]);
    expect(page.isMarkedInvalid("login-email")).toBe(true);
    expect(page.describedBy("login-email")).toBe(EMAIL_INPUT_ERROR);
    expect(page.error()).toBe("");
  });

  it("shows nothing on leaving a field whose value passes", async () => {
    const page = mountAt(createRegisterState());

    await page.typeEmail("ann@desk.io");
    await page.blur("login-email");

    expect(page.fieldErrorFields()).toEqual([]);
    expect(page.isMarkedInvalid("login-email")).toBe(false);
  });

  it("removes the error as the value is fixed, with no second blur", async () => {
    const page = mountAt(createRegisterState());

    await page.typeEmail("ann");
    await page.blur("login-email");

    expect(page.fieldError("email")).toBe(EMAIL_INPUT_ERROR);

    await page.typeEmail("@desk.io");

    expect(page.focusedControl()).toBe("login-email");
    expect(page.fieldError("email")).toBeNull();
    expect(page.isMarkedInvalid("login-email")).toBe(false);
    expect(page.describedBy("login-email")).toBeNull();
  });

  it("brings the error back as soon as a fixed value breaks again", async () => {
    const page = mountAt(createRegisterState());

    await page.typeEmail("ann@desk.io");
    await page.blur("login-email");
    await page.typeEmail("@");

    expect(page.fieldError("email")).toBe(EMAIL_INPUT_ERROR);
  });

  it("reveals only the field that was left, not an empty one never visited", async () => {
    const page = mountAt(createRegisterState());

    await page.typeDisplayName("x");
    await page.blur("login-display-name");

    expect(page.fieldErrorFields()).toEqual(["display-name"]);
    expect(page.fieldError("display-name")).toBe(DISPLAY_NAME_INPUT_ERROR);
    expect(page.describedBy("login-display-name")).toBe(
      DISPLAY_NAME_INPUT_ERROR,
    );
  });

  it("gives the password no field error: its checklist is its feedback", async () => {
    const page = mountAt(createRegisterState());

    await page.typeNewPassword("x");
    await page.blur("login-new-password");

    expect(page.fieldErrorFields()).toEqual([]);
  });

  it("leaves the sign-in form unchecked: its identifier may be a username", async () => {
    const page = mount(LoginScreen, {
      auth: { status: "unauthenticated" },
      registrationAvailable: true,
    });

    await page.typeUsername("astark");
    await page.blur("login-username");

    expect(page.phase()).toBe("signIn");
    expect(page.fieldErrorFields()).toEqual([]);
  });
});

describe("LoginScreen field validation — create account submit", () => {
  it("sends nothing for a bad display name, shows its error and focuses it", async () => {
    const page = mountAt(createRegisterState());

    await page.typeEmail("ann@desk.io");
    await page.typeDisplayName("x");
    await page.typeNewPassword(STRONG);
    await page.submit();

    expect(page.registerArgs()).toEqual([]);
    expect(page.fieldErrorFields()).toEqual(["display-name"]);
    expect(page.fieldError("display-name")).toBe(DISPLAY_NAME_INPUT_ERROR);
    expect(page.focusedControl()).toBe("login-display-name");
    expect(page.error()).toBe("");
  });

  it("reveals every failing field and focuses the first in form order", async () => {
    const page = mountAt(createRegisterState());

    await page.submit();

    expect(page.registerArgs()).toEqual([]);
    expect(page.fieldErrorFields()).toEqual(["email", "display-name"]);
    expect(page.fieldError("email")).toBe(EMAIL_INPUT_ERROR);
    expect(page.focusedControl()).toBe("login-email");
    expect(page.error()).toBe("");
  });

  it("registers once with what was typed when every field passes", async () => {
    const page = mountAt(createRegisterState());

    await page.typeEmail("Ann@Desk.io");
    await page.typeDisplayName("Ann Stark");
    await page.typeNewPassword(STRONG);
    await page.submit();

    expect(page.registerArgs()).toStrictEqual([
      { email: "Ann@Desk.io", displayName: "Ann Stark", password: STRONG },
    ]);
    expect(page.fieldErrorFields()).toEqual([]);
  });
});

describe("LoginScreen field validation — code step", () => {
  it("checks only the code when the address is held", async () => {
    const page = mountAt(createCodeState());

    await page.typeCode("12ab");
    await page.submit();

    expect(page.codeArgs()).toEqual([]);
    expect(page.hasEmailField()).toBe(false);
    expect(page.fieldErrorFields()).toEqual(["code"]);
    expect(page.fieldError("code")).toBe(CODE_INPUT_ERROR);
    expect(page.focusedControl()).toBe("login-code");
    expect(page.error()).toBe("");
  });

  it("submits a good code when the address is held, with no address typed", async () => {
    const page = mountAt(createCodeState());

    await page.typeCode(CODE);
    await page.submit();

    expect(page.codeArgs()).toStrictEqual([{ code: CODE }]);
    expect(page.fieldErrorFields()).toEqual([]);
  });

  it("shows the code error once the code field is left", async () => {
    const page = mountAt(createCodeState());

    await page.typeCode("12");

    expect(page.fieldError("code")).toBeNull();

    await page.blur("login-code");

    expect(page.fieldError("code")).toBe(CODE_INPUT_ERROR);
    expect(page.isMarkedInvalid("login-code")).toBe(true);
    expect(page.describedBy("login-code")).toBe(CODE_INPUT_ERROR);
  });

  it("puts an empty address first when no address is held", async () => {
    const page = mountAt(createCodeState({ email: null, passwordHeld: false }));

    await page.typeNewPassword(STRONG);
    await page.submit();

    expect(page.codeArgs()).toEqual([]);
    expect(page.fieldErrorFields()).toEqual(["email", "code"]);
    expect(page.fieldError("email")).toBe(EMAIL_INPUT_ERROR);
    expect(page.focusedControl()).toBe("login-email");
  });

  it("focuses the code when only the code fails and the address is typed", async () => {
    const page = mountAt(createCodeState({ email: null, passwordHeld: false }));

    await page.typeEmail("ann@desk.io");
    await page.typeCode("12ab");
    await page.typeNewPassword(STRONG);
    await page.submit();

    expect(page.codeArgs()).toEqual([]);
    expect(page.fieldErrorFields()).toEqual(["code"]);
    expect(page.focusedControl()).toBe("login-code");
  });

  it("shows the typed address's error once that field is left", async () => {
    const page = mountAt(createCodeState({ email: null, passwordHeld: false }));

    await page.typeEmail("ann");

    expect(page.fieldError("email")).toBeNull();

    await page.blur("login-email");

    expect(page.fieldErrorFields()).toEqual(["email"]);
    expect(page.describedBy("login-email")).toBe(EMAIL_INPUT_ERROR);
  });
});

describe("LoginScreen field validation — Resend code checks a typed address", () => {
  it("refuses a malformed address: shows its error, focuses it and sends nothing", async () => {
    const page = mountAt(createCodeState({ email: null, passwordHeld: false }));

    await page.typeEmail("ann");
    await page.resend();

    expect(page.resendArgs()).toEqual([]);
    expect(page.fieldErrorFields()).toEqual(["email"]);
    expect(page.fieldError("email")).toBe(EMAIL_INPUT_ERROR);
    expect(page.focusedControl()).toBe("login-email");
    expect(page.error()).toBe("");
  });

  it("refuses an empty address the same way, moving the focus to it", async () => {
    const page = mountAt(createCodeState({ email: null, passwordHeld: false }));

    expect(page.focusedControl()).toBe("");

    await page.resend();

    expect(page.resendArgs()).toEqual([]);
    expect(page.fieldError("email")).toBe(EMAIL_INPUT_ERROR);
    expect(page.focusedControl()).toBe("login-email");
  });

  it("checks nothing when the address is held", async () => {
    const page = mountAt(createCodeState());

    await page.resend();

    expect(page.resendArgs()).toEqual([undefined]);
    expect(page.fieldErrorFields()).toEqual([]);
  });
});

describe("LoginScreen field validation — a press on a button or link keeps the field's focus", () => {
  it("cancels the press on every control of the create-account form, not on its inputs", () => {
    const page = mountAt(createRegisterState());

    expect(readPressesKeepingFocus(page, REGISTER_CONTROLS)).toEqual(
      everyTestId(REGISTER_CONTROLS, true),
    );
    expect(readPressesKeepingFocus(page, REGISTER_INPUTS)).toEqual(
      everyTestId(REGISTER_INPUTS, false),
    );
  });

  it("cancels the press on every control of the reset request, not on its input", () => {
    const page = mountAt(createRequestResetState());

    expect(readPressesKeepingFocus(page, RESET_CONTROLS)).toEqual(
      everyTestId(RESET_CONTROLS, true),
    );
    expect(page.pressKeepsFocus("login-email")).toBe(false);
  });

  it("cancels the press on every control of the code step, not on its inputs", () => {
    const page = mountAt(createCodeState({ email: null, passwordHeld: false }));

    expect(readPressesKeepingFocus(page, CODE_CONTROLS)).toEqual(
      everyTestId(CODE_CONTROLS, true),
    );
    expect(readPressesKeepingFocus(page, CODE_INPUTS)).toEqual(
      everyTestId(CODE_INPUTS, false),
    );
  });

  it("still runs the click: a typed address leaves on Resend, and the field keeps the focus", async () => {
    const page = mountAt(createCodeState({ email: null, passwordHeld: false }));

    await page.typeEmail("ann@desk.io");
    await page.resend();

    expect(page.resendArgs()).toEqual(["ann@desk.io"]);
    expect(page.focusedControl()).toBe("login-email");
    expect(page.fieldErrorFields()).toEqual([]);
  });
});

describe("LoginScreen field validation — reset request", () => {
  it("shows the address error once the field is left", async () => {
    const page = mountAt(createRequestResetState());

    await page.typeEmail("not-an-email");

    expect(page.fieldError("email")).toBeNull();

    await page.blur("login-email");

    expect(page.fieldError("email")).toBe(EMAIL_INPUT_ERROR);
    expect(page.isMarkedInvalid("login-email")).toBe(true);
    expect(page.describedBy("login-email")).toBe(EMAIL_INPUT_ERROR);
  });

  it("sends nothing for a bad address, shows its error and focuses it", async () => {
    const page = mountAt(createRequestResetState());

    await page.typeEmail("not-an-email");
    await page.submit();

    expect(page.resetRequestArgs()).toEqual([]);
    expect(page.fieldError("email")).toBe(EMAIL_INPUT_ERROR);
    expect(page.focusedControl()).toBe("login-email");
    expect(page.error()).toBe("");
  });

  it("requests a reset for a good address", async () => {
    const page = mountAt(createRequestResetState());

    await page.typeEmail("ann@desk.io");
    await page.submit();

    expect(page.resetRequestArgs()).toEqual(["ann@desk.io"]);
    expect(page.fieldErrorFields()).toEqual([]);
  });
});

describe("LoginScreen field validation — the server stays at form level", () => {
  it("shows a refusal in the error line, under no field", async () => {
    const page = mountAt(
      createRegisterState({ error: "Sign-up is paused for now" }),
    );

    await page.typeEmail("ann@desk.io");
    await page.typeDisplayName("Ann Stark");
    await page.typeNewPassword(STRONG);
    await page.submit();

    expect(page.registerArgs()).toHaveLength(1);
    expect(page.error()).toBe("Sign-up is paused for now");
    expect(page.fieldErrorFields()).toEqual([]);
  });
});

/** Each control's test id paired with whether a press on it keeps the
 * focus, in the order given. */
function readPressesKeepingFocus(
  page: LoginScreenPage,
  testIds: readonly string[],
): Array<[string, boolean]> {
  return testIds.map((testId): [string, boolean] => {
    return [testId, page.pressKeepsFocus(testId)];
  });
}

/** Every test id paired with the same expected answer. */
function everyTestId(
  testIds: readonly string[],
  keepsFocus: boolean,
): Array<[string, boolean]> {
  return testIds.map((testId): [string, boolean] => {
    return [testId, keepsFocus];
  });
}

/** Mounts LoginScreen signed out, in one account-access phase. */
function mountAt(accountAccess: AccountAccessState): LoginScreenPage {
  return mount(LoginScreen, {
    auth: { status: "unauthenticated" },
    accountAccess,
  });
}

interface PhaseSeed {
  readonly error?: string | null;
}

function createRegisterState(seed: PhaseSeed = {}): AccountAccessState {
  return { phase: "register", busy: false, error: null, ...seed };
}

function createRequestResetState(): AccountAccessState {
  return { phase: "requestReset", busy: false, error: null };
}

interface CodeSeed {
  readonly email?: string | null;
  readonly passwordHeld?: boolean;
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

const REGISTER_CONTROLS = [
  "login-submit",
  "login-privacy",
  "login-have-code",
  "login-back",
] as const;

const REGISTER_INPUTS = [
  "login-email",
  "login-display-name",
  "login-new-password",
] as const;

const RESET_CONTROLS = ["login-submit", "login-back"] as const;

const CODE_CONTROLS = ["login-submit", "login-resend", "login-back"] as const;

const CODE_INPUTS = [
  "login-email",
  "login-code",
  "login-new-password",
] as const;

/** Meets every password rule. */
const STRONG = "Correct-Horse-9x";

const CODE = "12345678";
