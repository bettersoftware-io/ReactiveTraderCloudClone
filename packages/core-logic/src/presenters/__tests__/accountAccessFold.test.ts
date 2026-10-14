import { describe, expect, it } from "vitest";

import type {
  AccountAccessState,
  CodeInput,
  RegistrationInput,
  Stream,
} from "@rtc/core-api";
import type { AccountFlowOutcome, AccountFlowPort } from "@rtc/domain";

import {
  CODE_INPUT_ERROR,
  DISPLAY_NAME_INPUT_ERROR,
  describeAccountAccessTitle,
  describeAccountFailure,
  describePasswordRule,
  EMAIL_INPUT_ERROR,
  PASSWORD_REQUIRED_ERROR,
} from "#/presenters/accountAccessCopy";
import {
  ACCOUNT_ACCESS_IDLE,
  type AccountAccessEvent,
  type AccountAccessHeld,
  type AccountRequest,
  callAccountFlow,
  checkCodeInput,
  checkDisplayNameInput,
  checkEmailInput,
  checkPasswordInput,
  NOTHING_HELD,
  stepAccountAccess,
} from "#/presenters/accountAccessFold";

const STRONG = "Correct-Horse-9x";
const UNAVAILABLE_TEXT =
  "The live desk is unavailable right now. Try again shortly";

describe("account input checks", () => {
  it("checkEmailInput trims and lowercases a valid address and refuses a malformed one", () => {
    expect(checkEmailInput("  Ann@Desk.io ")).toEqual({
      ok: true,
      value: "ann@desk.io",
    });
    expect(checkEmailInput("not an address")).toEqual({
      ok: false,
      error: EMAIL_INPUT_ERROR,
    });
  });

  it("checkDisplayNameInput collapses whitespace and refuses a name that is too short", () => {
    expect(checkDisplayNameInput("  Ann   Stark ")).toEqual({
      ok: true,
      value: "Ann Stark",
    });
    expect(checkDisplayNameInput(" A ")).toEqual({
      ok: false,
      error: DISPLAY_NAME_INPUT_ERROR,
    });
  });

  it("checkCodeInput trims eight digits and refuses any other shape", () => {
    expect(checkCodeInput(" 12345678 ")).toEqual({
      ok: true,
      value: "12345678",
    });
    expect(checkCodeInput("1234567")).toEqual({
      ok: false,
      error: CODE_INPUT_ERROR,
    });
    expect(checkCodeInput("1234567a")).toEqual({
      ok: false,
      error: CODE_INPUT_ERROR,
    });
  });

  it("checkPasswordInput keeps the password as typed, asks for an empty one, and names the first broken rule", () => {
    expect(checkPasswordInput(` ${STRONG}`)).toEqual({
      ok: true,
      value: ` ${STRONG}`,
    });
    expect(checkPasswordInput("")).toEqual({
      ok: false,
      error: PASSWORD_REQUIRED_ERROR,
    });
    expect(checkPasswordInput("short")).toEqual({
      ok: false,
      error: MIN_LENGTH_ERROR,
    });
    expect(checkPasswordInput("correct-horse-9x")).toEqual({
      ok: false,
      error: "Password: one uppercase letter",
    });
  });
});

describe("callAccountFlow", () => {
  it.each<[AccountRequest, string, readonly string[]]>([
    [
      { kind: "register", email: "a@b.co", displayName: "Ann" },
      "register",
      ["a@b.co", "Ann"],
    ],
    [{ kind: "resendCode", email: "a@b.co" }, "resendCode", ["a@b.co"]],
    [
      {
        kind: "confirmEmail",
        email: "a@b.co",
        code: "12345678",
        password: STRONG,
      },
      "confirmEmail",
      ["a@b.co", "12345678", STRONG],
    ],
    [
      { kind: "requestPasswordReset", email: "a@b.co" },
      "requestPasswordReset",
      ["a@b.co"],
    ],
    [
      {
        kind: "resetPassword",
        email: "a@b.co",
        code: "12345678",
        password: STRONG,
      },
      "resetPassword",
      ["a@b.co", "12345678", STRONG],
    ],
  ])(
    "%o calls the port's %s with its arguments and returns the port's stream",
    (request, method, args) => {
      const recording = createRecordingPort();

      const stream = callAccountFlow(recording.port, request);

      expect(recording.calls).toEqual([[method, ...args]]);
      expect(stream).toBe(recording.answer);
    },
  );
});

describe("describeAccountFailure", () => {
  it.each([
    ["register", "Too many sign-up attempts. Try again later"],
    [
      "resendCode",
      "Too many codes requested. The last code you received still works",
    ],
    [
      "requestPasswordReset",
      "Too many codes requested. The last code you received still works",
    ],
    ["confirmEmail", "Too many attempts. Wait a few minutes and try again"],
    ["resetPassword", "Too many attempts. Wait a few minutes and try again"],
  ] as const)("rate_limited at %s → %s", (request, text) => {
    expect(
      describeAccountFailure({ ok: false, reason: "rate_limited" }, request),
    ).toBe(text);
  });

  it.each([
    ["invalid_code", "That code is not valid or has expired"],
    ["registration_closed", "Sign-up is paused for now"],
    ["unavailable", UNAVAILABLE_TEXT],
  ] as const)("%s → %s whichever request it refused", (reason, text) => {
    expect(describeAccountFailure({ ok: false, reason }, "register")).toBe(
      text,
    );
    expect(describeAccountFailure({ ok: false, reason }, "confirmEmail")).toBe(
      text,
    );
  });

  it("invalid_input names the rule it carries", () => {
    expect(
      describeAccountFailure(
        { ok: false, reason: "invalid_input" },
        "register",
      ),
    ).toBe("The request was refused");
    expect(
      describeAccountFailure(
        { ok: false, reason: "invalid_input", rule: "email" },
        "register",
      ),
    ).toBe(EMAIL_INPUT_ERROR);
    expect(
      describeAccountFailure(
        { ok: false, reason: "invalid_input", rule: "display-name" },
        "register",
      ),
    ).toBe(DISPLAY_NAME_INPUT_ERROR);
    expect(
      describeAccountFailure(
        { ok: false, reason: "invalid_input", rule: "digit" },
        "confirmEmail",
      ),
    ).toBe("Password: one number");
  });

  it("a refused password is a spent code at a reset, and a store refusal at a confirmation", () => {
    expect(
      describeAccountFailure(
        { ok: false, reason: "invalid_input", rule: "password" },
        "resetPassword",
      ),
    ).toBe(
      "That code has been used. Request a new one and choose a different password",
    );
    expect(
      describeAccountFailure(
        { ok: false, reason: "invalid_input", rule: "password" },
        "confirmEmail",
      ),
    ).toBe("That password was refused. Request a reset code to set one");
  });

  it("describePasswordRule lowercases the checklist label", () => {
    expect(describePasswordRule("min-length")).toBe(MIN_LENGTH_ERROR);
    expect(describePasswordRule("special")).toBe(
      "Password: one special character",
    );
  });
});

describe("describeAccountAccessTitle", () => {
  it.each<[AccountAccessState, string]>([
    [ACCOUNT_ACCESS_IDLE, "REACTIVE TRADER OS · SIGN IN"],
    [
      { phase: "register", busy: false, error: null },
      "REACTIVE TRADER OS · CREATE ACCOUNT",
    ],
    [createCodePhase("signup"), "REACTIVE TRADER OS · CONFIRM EMAIL"],
    [createCodePhase("reset"), "REACTIVE TRADER OS · RESET PASSWORD"],
    [
      { phase: "requestReset", busy: false, error: null },
      "REACTIVE TRADER OS · RESET PASSWORD",
    ],
    [
      { phase: "pendingApproval", email: "a@b.co" },
      "REACTIVE TRADER OS · AWAITING APPROVAL",
    ],
    [
      { phase: "passwordUnset", email: "a@b.co" },
      "REACTIVE TRADER OS · SET A PASSWORD",
    ],
    [
      { phase: "passwordChanged", email: "a@b.co" },
      "REACTIVE TRADER OS · PASSWORD CHANGED",
    ],
  ])("%o → %s", (state, title) => {
    expect(describeAccountAccessTitle(state)).toBe(title);
  });
});

describe("stepAccountAccess — navigation", () => {
  it("each start intent opens its idle phase, drops whatever was held and asks for no call", () => {
    const held: AccountAccessHeld = { email: "a@b.co", password: STRONG };
    const code = createCodePhase("signup", {
      email: "a@b.co",
      passwordHeld: true,
    });

    expect(
      stepAccountAccess(code, held, { kind: "startRegistration" }),
    ).toEqual({
      state: { phase: "register", busy: false, error: null },
      held: NOTHING_HELD,
      request: null,
      cancelsInFlight: true,
    });
    expect(stepAccountAccess(code, held, { kind: "startReset" })).toEqual({
      state: { phase: "requestReset", busy: false, error: null },
      held: NOTHING_HELD,
      request: null,
      cancelsInFlight: true,
    });
    expect(stepAccountAccess(code, held, { kind: "startCodeEntry" })).toEqual({
      state: createCodePhase("signup"),
      held: NOTHING_HELD,
      request: null,
      cancelsInFlight: true,
    });
    expect(stepAccountAccess(code, held, { kind: "returnToSignIn" })).toEqual({
      state: ACCOUNT_ACCESS_IDLE,
      held: NOTHING_HELD,
      request: null,
      cancelsInFlight: true,
    });
  });

  it("an intent for another phase leaves the state and what is held untouched", () => {
    const held: AccountAccessHeld = { email: "a@b.co", password: STRONG };
    const code = createCodePhase("signup", {
      email: "a@b.co",
      passwordHeld: true,
    });

    for (const [state, event] of [
      [ACCOUNT_ACCESS_IDLE, { kind: "register", input: createRegistration() }],
      [code, { kind: "requestReset", email: "a@b.co" }],
      [
        ACCOUNT_ACCESS_IDLE,
        { kind: "submitCode", input: { code: "12345678" } },
      ],
      [ACCOUNT_ACCESS_IDLE, { kind: "resendCode", email: undefined }],
    ] as const) {
      const step = stepAccountAccess(state, held, event);
      expect(step.state).toBe(state);
      expect(step.held).toBe(held);
      expect(step.request).toBeNull();
      expect(step.cancelsInFlight).toBe(false);
    }
  });
});

describe("stepAccountAccess — register", () => {
  it("refuses the address first, then the display name, then the password, with no call", () => {
    const register = { phase: "register", busy: false, error: null } as const;

    expect(
      stepAccountAccess(register, NOTHING_HELD, {
        kind: "register",
        input: { email: "nope", displayName: "x", password: "short" },
      }),
    ).toEqual({
      state: { phase: "register", busy: false, error: EMAIL_INPUT_ERROR },
      held: NOTHING_HELD,
      request: null,
      cancelsInFlight: true,
    });
    expect(
      stepAccountAccess(register, NOTHING_HELD, {
        kind: "register",
        input: { email: "a@b.co", displayName: "x", password: "short" },
      }).state,
    ).toEqual({
      phase: "register",
      busy: false,
      error: DISPLAY_NAME_INPUT_ERROR,
    });
    expect(
      stepAccountAccess(register, NOTHING_HELD, {
        kind: "register",
        input: { email: "a@b.co", displayName: "Ann", password: "short" },
      }).state,
    ).toEqual({ phase: "register", busy: false, error: MIN_LENGTH_ERROR });
  });

  it("a valid form is busy, holds the normalized address and the password, and asks to register without the password", () => {
    const step = stepAccountAccess(
      { phase: "register", busy: false, error: "old" },
      NOTHING_HELD,
      { kind: "register", input: createRegistration() },
    );

    expect(step).toEqual({
      state: { phase: "register", busy: true, error: null },
      held: { email: "ann@desk.io", password: STRONG },
      request: {
        kind: "register",
        email: "ann@desk.io",
        displayName: "Ann Stark",
      },
      cancelsInFlight: true,
    });
  });

  it("code_sent lands on the sign-up code step with the password held", () => {
    const held: AccountAccessHeld = { email: "ann@desk.io", password: STRONG };

    expect(
      stepAccountAccess({ phase: "register", busy: true, error: null }, held, {
        kind: "settled",
        request: { kind: "register", email: "ann@desk.io", displayName: "Ann" },
        outcome: SENT,
      }),
    ).toEqual({
      state: createCodePhase("signup", {
        email: "ann@desk.io",
        passwordHeld: true,
      }),
      held,
      request: null,
      cancelsInFlight: false,
    });
  });

  it("a refusal says why and drops what was held", () => {
    expect(
      stepAccountAccess(
        { phase: "register", busy: true, error: null },
        { email: "ann@desk.io", password: STRONG },
        {
          kind: "settled",
          request: {
            kind: "register",
            email: "ann@desk.io",
            displayName: "Ann",
          },
          outcome: { ok: false, reason: "registration_closed" },
        },
      ),
    ).toEqual({
      state: {
        phase: "register",
        busy: false,
        error: "Sign-up is paused for now",
      },
      held: NOTHING_HELD,
      request: null,
      cancelsInFlight: false,
    });
  });
});

describe("stepAccountAccess — reset request", () => {
  it("is accepted from the reset form and from the password-unset notice, and refuses a bad address", () => {
    for (const state of [
      { phase: "requestReset", busy: false, error: null },
      { phase: "passwordUnset", email: "ann@desk.io" },
    ] as const) {
      expect(
        stepAccountAccess(state, NOTHING_HELD, {
          kind: "requestReset",
          email: " Ann@Desk.io",
        }),
      ).toEqual({
        state: { phase: "requestReset", busy: true, error: null },
        held: { email: "ann@desk.io", password: null },
        request: { kind: "requestPasswordReset", email: "ann@desk.io" },
        cancelsInFlight: true,
      });
    }

    expect(
      stepAccountAccess(ACCOUNT_ACCESS_IDLE, NOTHING_HELD, {
        kind: "startReset",
      }).state,
    ).toEqual({ phase: "requestReset", busy: false, error: null });
    expect(
      stepAccountAccess(
        { phase: "requestReset", busy: false, error: null },
        NOTHING_HELD,
        { kind: "requestReset", email: "nope" },
      ).state,
    ).toEqual({ phase: "requestReset", busy: false, error: EMAIL_INPUT_ERROR });
  });

  it("code_sent lands on the reset code step holding the address only; a refusal says why", () => {
    const held: AccountAccessHeld = { email: "ann@desk.io", password: null };
    const request: AccountRequest = {
      kind: "requestPasswordReset",
      email: "ann@desk.io",
    };
    const busy = { phase: "requestReset", busy: true, error: null } as const;

    expect(
      stepAccountAccess(busy, held, {
        kind: "settled",
        request,
        outcome: SENT,
      }),
    ).toEqual({
      state: createCodePhase("reset", { email: "ann@desk.io" }),
      held,
      request: null,
      cancelsInFlight: false,
    });
    expect(
      stepAccountAccess(busy, held, {
        kind: "settled",
        request,
        outcome: { ok: false, reason: "unavailable" },
      }),
    ).toEqual({
      state: { phase: "requestReset", busy: false, error: UNAVAILABLE_TEXT },
      held: NOTHING_HELD,
      request: null,
      cancelsInFlight: false,
    });
  });
});

describe("stepAccountAccess — the code step", () => {
  it("submits the held address and password with the trimmed code", () => {
    const held: AccountAccessHeld = { email: "ann@desk.io", password: STRONG };
    const code = createCodePhase("signup", {
      email: "ann@desk.io",
      passwordHeld: true,
      resent: true,
      error: "old",
    });

    expect(
      stepAccountAccess(code, held, {
        kind: "submitCode",
        input: {
          code: " 12345678 ",
          email: "x@y.co",
          password: "Ignored-Horse-1",
        },
      }),
    ).toEqual({
      state: { ...code, busy: true, error: null, resent: false },
      held,
      request: {
        kind: "confirmEmail",
        email: "ann@desk.io",
        code: "12345678",
        password: STRONG,
      },
      cancelsInFlight: true,
    });
  });

  it("with nothing held reads the typed address and password, which do not become held; a reset flow asks to reset", () => {
    const code = createCodePhase("reset");

    expect(
      stepAccountAccess(code, NOTHING_HELD, {
        kind: "submitCode",
        input: { code: "12345678", email: " A@B.co ", password: STRONG },
      }),
    ).toEqual({
      state: { ...code, busy: true },
      held: NOTHING_HELD,
      request: {
        kind: "resetPassword",
        email: "a@b.co",
        code: "12345678",
        password: STRONG,
      },
      cancelsInFlight: true,
    });
  });

  it("refuses the address, then the code, then the password, keeping what is held", () => {
    const code = createCodePhase("signup");

    function submit(input: CodeInput): AccountAccessState {
      return stepAccountAccess(code, NOTHING_HELD, {
        kind: "submitCode",
        input,
      }).state;
    }

    expect(submit({ code: "1234567" })).toEqual({
      ...code,
      error: EMAIL_INPUT_ERROR,
    });
    expect(submit({ email: "a@b.co", code: "1234567" })).toEqual({
      ...code,
      error: CODE_INPUT_ERROR,
    });
    expect(submit({ email: "a@b.co", code: "12345678" })).toEqual({
      ...code,
      error: PASSWORD_REQUIRED_ERROR,
    });
    expect(
      submit({ email: "a@b.co", code: "12345678", password: "short" }),
    ).toEqual({ ...code, error: MIN_LENGTH_ERROR });
  });

  it("resend goes to the held address, or the typed one; at a reset it is a reset request; a bad typed address never leaves", () => {
    const held: AccountAccessHeld = { email: "ann@desk.io", password: STRONG };
    const signup = createCodePhase("signup", {
      email: "ann@desk.io",
      passwordHeld: true,
      resent: true,
    });

    expect(
      stepAccountAccess(signup, held, { kind: "resendCode", email: "x@y.co" }),
    ).toEqual({
      state: { ...signup, busy: true, resent: false },
      held,
      request: { kind: "resendCode", email: "ann@desk.io" },
      cancelsInFlight: true,
    });
    expect(
      stepAccountAccess(createCodePhase("reset"), NOTHING_HELD, {
        kind: "resendCode",
        email: " A@B.co",
      }).request,
    ).toEqual({ kind: "requestPasswordReset", email: "a@b.co" });
    expect(
      stepAccountAccess(createCodePhase("signup"), NOTHING_HELD, {
        kind: "resendCode",
        email: undefined,
      }),
    ).toEqual({
      state: createCodePhase("signup", { error: EMAIL_INPUT_ERROR }),
      held: NOTHING_HELD,
      request: null,
      cancelsInFlight: true,
    });
  });

  it("an accepted resend reports it; a refused one says why, at a sign-up and at a reset", () => {
    const busy = createCodePhase("signup", { email: "a@b.co", busy: true });
    const held: AccountAccessHeld = { email: "a@b.co", password: null };
    const resend: AccountRequest = { kind: "resendCode", email: "a@b.co" };

    expect(
      stepAccountAccess(busy, held, {
        kind: "settled",
        request: resend,
        outcome: SENT,
      }),
    ).toEqual({
      state: { ...busy, busy: false, resent: true },
      held,
      request: null,
      cancelsInFlight: false,
    });
    expect(
      stepAccountAccess(busy, held, {
        kind: "settled",
        request: resend,
        outcome: { ok: false, reason: "rate_limited" },
      }).state,
    ).toEqual({
      ...busy,
      busy: false,
      error: "Too many codes requested. The last code you received still works",
    });

    const resetBusy = createCodePhase("reset", { email: "a@b.co", busy: true });

    expect(
      stepAccountAccess(resetBusy, held, {
        kind: "settled",
        request: { kind: "requestPasswordReset", email: "a@b.co" },
        outcome: SENT,
      }).state,
    ).toEqual({ ...resetBusy, busy: false, resent: true });
  });

  it("a confirmation ends on pending_approval or password_unset and drops what was held", () => {
    const busy = createCodePhase("signup", {
      email: "a@b.co",
      passwordHeld: true,
      busy: true,
    });
    const held: AccountAccessHeld = { email: "a@b.co", password: STRONG };
    const request = createConfirmation();

    expect(
      stepAccountAccess(busy, held, {
        kind: "settled",
        request,
        outcome: { ok: true, status: "pending_approval" },
      }),
    ).toEqual({
      state: { phase: "pendingApproval", email: "a@b.co" },
      held: NOTHING_HELD,
      request: null,
      cancelsInFlight: false,
    });
    expect(
      stepAccountAccess(busy, held, {
        kind: "settled",
        request,
        outcome: { ok: true, status: "password_unset" },
      }),
    ).toEqual({
      state: { phase: "passwordUnset", email: "a@b.co" },
      held: NOTHING_HELD,
      request: null,
      cancelsInFlight: false,
    });
  });

  it("a password rule refusal drops the held password but keeps the address; any other refusal keeps both", () => {
    const busy = createCodePhase("signup", {
      email: "a@b.co",
      passwordHeld: true,
      busy: true,
    });
    const held: AccountAccessHeld = { email: "a@b.co", password: STRONG };
    const request = createConfirmation();

    expect(
      stepAccountAccess(busy, held, {
        kind: "settled",
        request,
        outcome: { ok: false, reason: "invalid_input", rule: "min-length" },
      }),
    ).toEqual({
      state: {
        ...busy,
        busy: false,
        passwordHeld: false,
        error: MIN_LENGTH_ERROR,
      },
      held: { email: "a@b.co", password: null },
      request: null,
      cancelsInFlight: false,
    });

    for (const outcome of [
      { ok: false, reason: "invalid_code" },
      { ok: false, reason: "invalid_input", rule: "password" },
      { ok: false, reason: "invalid_input", rule: "email" },
      { ok: false, reason: "invalid_input" },
    ] as const) {
      const step = stepAccountAccess(busy, held, {
        kind: "settled",
        request,
        outcome,
      });
      expect(step.held).toBe(held);
      expect(step.state).toMatchObject({ busy: false, passwordHeld: true });
    }
  });

  it("a reset ends on password_changed; a refusal says why and keeps what is held", () => {
    const busy = createCodePhase("reset", { email: "a@b.co", busy: true });
    const held: AccountAccessHeld = { email: "a@b.co", password: null };
    const request: AccountRequest = {
      kind: "resetPassword",
      email: "a@b.co",
      code: "12345678",
      password: STRONG,
    };

    expect(
      stepAccountAccess(busy, held, {
        kind: "settled",
        request,
        outcome: { ok: true, status: "password_changed" },
      }),
    ).toEqual({
      state: { phase: "passwordChanged", email: "a@b.co" },
      held: NOTHING_HELD,
      request: null,
      cancelsInFlight: false,
    });
    expect(
      stepAccountAccess(busy, held, {
        kind: "settled",
        request,
        outcome: { ok: false, reason: "invalid_input", rule: "password" },
      }),
    ).toEqual({
      state: {
        ...busy,
        busy: false,
        error:
          "That code has been used. Request a new one and choose a different password",
      },
      held,
      request: null,
      cancelsInFlight: false,
    });
  });
});

describe("stepAccountAccess — a send intent while busy", () => {
  it.each<[string, AccountAccessState, AccountAccessEvent]>([
    [
      "register on a busy create-account form",
      { phase: "register", busy: true, error: null },
      { kind: "register", input: createRegistration() },
    ],
    [
      "requestReset on a busy reset form",
      { phase: "requestReset", busy: true, error: null },
      { kind: "requestReset", email: "a@b.co" },
    ],
    [
      "submitCode on a busy sign-up code step",
      createCodePhase("signup", { email: "a@b.co", busy: true }),
      { kind: "submitCode", input: { code: "12345678", password: STRONG } },
    ],
    [
      "resendCode on a busy sign-up code step",
      createCodePhase("signup", { email: "a@b.co", busy: true }),
      { kind: "resendCode", email: undefined },
    ],
    [
      "submitCode on a busy reset code step",
      createCodePhase("reset", { email: "a@b.co", busy: true }),
      { kind: "submitCode", input: { code: "12345678", password: STRONG } },
    ],
    [
      "resendCode on a busy reset code step",
      createCodePhase("reset", { email: "a@b.co", busy: true }),
      { kind: "resendCode", email: "a@b.co" },
    ],
  ])(
    "%s is ignored: the request in flight stays, nothing is sent",
    (_name, state, event) => {
      const held: AccountAccessHeld = { email: "a@b.co", password: STRONG };

      const step = stepAccountAccess(state, held, event);

      expect(step.state).toBe(state);
      expect(step.held).toBe(held);
      expect(step.request).toBeNull();
      expect(step.cancelsInFlight).toBe(false);
    },
  );

  it("a navigation intent still supersedes the request in flight", () => {
    const busy = createCodePhase("signup", { email: "a@b.co", busy: true });
    const held: AccountAccessHeld = { email: "a@b.co", password: STRONG };

    for (const event of [
      { kind: "returnToSignIn" },
      { kind: "startCodeEntry" },
      { kind: "startRegistration" },
      { kind: "startReset" },
    ] as const) {
      expect(stepAccountAccess(busy, held, event).cancelsInFlight).toBe(true);
    }
  });
});

describe("stepAccountAccess — a settled request no state is waiting for", () => {
  it("a stale register answer does not land on a register form opened again since", () => {
    let state: AccountAccessState = {
      phase: "register",
      busy: false,
      error: null,
    };
    let held: AccountAccessHeld = NOTHING_HELD;

    for (const event of [
      { kind: "register", input: createRegistration() },
      { kind: "returnToSignIn" },
      { kind: "startRegistration" },
    ] as const) {
      ({ state, held } = stepAccountAccess(state, held, event));
    }

    const step = stepAccountAccess(state, held, {
      kind: "settled",
      request: { kind: "register", email: "ann@desk.io", displayName: "Ann" },
      outcome: SENT,
    });

    expect(step.state).toEqual({ phase: "register", busy: false, error: null });
    expect(step.held).toBe(NOTHING_HELD);
  });

  it.each<[AccountRequest, AccountAccessState]>([
    [
      { kind: "register", email: "a@b.co", displayName: "Ann" },
      { phase: "register", busy: false, error: null },
    ],
    [
      { kind: "requestPasswordReset", email: "a@b.co" },
      { phase: "requestReset", busy: false, error: null },
    ],
    [
      { kind: "requestPasswordReset", email: "a@b.co" },
      createCodePhase("signup", { email: "a@b.co", busy: true }),
    ],
    [
      { kind: "resendCode", email: "a@b.co" },
      createCodePhase("reset", { email: "a@b.co", busy: true }),
    ],
    [createConfirmation(), createCodePhase("reset", { busy: true })],
    [createConfirmation(), createCodePhase("signup", { email: "a@b.co" })],
    [
      {
        kind: "resetPassword",
        email: "a@b.co",
        code: "12345678",
        password: STRONG,
      },
      createCodePhase("signup", { busy: true }),
    ],
  ])(
    "%o settling on an idle form or the other flow's %o changes nothing",
    (request, state) => {
      const held: AccountAccessHeld = { email: "a@b.co", password: STRONG };

      const step = stepAccountAccess(state, held, {
        kind: "settled",
        request,
        outcome: SENT,
      });

      expect(step.state).toBe(state);
      expect(step.held).toBe(held);
      expect(step.request).toBeNull();
      expect(step.cancelsInFlight).toBe(false);
    },
  );

  it.each<[AccountRequest, AccountAccessState]>([
    [
      { kind: "register", email: "a@b.co", displayName: "Ann" },
      ACCOUNT_ACCESS_IDLE,
    ],
    [{ kind: "requestPasswordReset", email: "a@b.co" }, ACCOUNT_ACCESS_IDLE],
    [{ kind: "resendCode", email: "a@b.co" }, ACCOUNT_ACCESS_IDLE],
    [createConfirmation(), { phase: "register", busy: false, error: null }],
    [
      {
        kind: "resetPassword",
        email: "a@b.co",
        code: "12345678",
        password: STRONG,
      },
      { phase: "requestReset", busy: false, error: null },
    ],
  ])("%o settling on %o changes nothing", (request, state) => {
    const held: AccountAccessHeld = { email: "a@b.co", password: STRONG };

    const step = stepAccountAccess(state, held, {
      kind: "settled",
      request,
      outcome: SENT,
    });

    expect(step.state).toBe(state);
    expect(step.held).toBe(held);
    expect(step.request).toBeNull();
    expect(step.cancelsInFlight).toBe(false);
  });
});

interface CodePhaseTag {
  readonly phase: "code";
}

type CodePhase = Extract<AccountAccessState, CodePhaseTag>;

function createCodePhase(
  flow: CodePhase["flow"],
  patch: Partial<Omit<CodePhase, "phase" | "flow">> = {},
): CodePhase {
  return {
    phase: "code",
    flow,
    email: null,
    passwordHeld: false,
    resent: false,
    busy: false,
    error: null,
    ...patch,
  };
}

function createRegistration(): RegistrationInput {
  return {
    email: "  Ann@Desk.io ",
    displayName: "  Ann   Stark ",
    password: STRONG,
  };
}

function createConfirmation(): AccountRequest {
  return {
    kind: "confirmEmail",
    email: "a@b.co",
    code: "12345678",
    password: STRONG,
  };
}

interface RecordingPort {
  readonly port: AccountFlowPort;
  readonly calls: (readonly string[])[];
  readonly answer: Stream<AccountFlowOutcome>;
}

/** Records each call by method name and arguments, and answers every call
 * with the one sentinel stream (core-logic cannot build an rxjs value: the
 * identity is what proves the port's stream is returned as is). */
function createRecordingPort(): RecordingPort {
  const calls: (readonly string[])[] = [];
  const answer = {} as Stream<AccountFlowOutcome>;

  function record(...call: string[]): Stream<AccountFlowOutcome> {
    calls.push(call);

    return answer;
  }

  return {
    calls,
    answer,
    port: {
      register: (email: string, displayName: string) => {
        return record("register", email, displayName);
      },
      resendCode: (email: string) => {
        return record("resendCode", email);
      },
      confirmEmail: (email: string, code: string, password: string) => {
        return record("confirmEmail", email, code, password);
      },
      requestPasswordReset: (email: string) => {
        return record("requestPasswordReset", email);
      },
      resetPassword: (email: string, code: string, password: string) => {
        return record("resetPassword", email, code, password);
      },
    },
  };
}

const MIN_LENGTH_ERROR = "Password: at least 12 characters";

const SENT: AccountFlowOutcome = { ok: true, status: "code_sent" };
