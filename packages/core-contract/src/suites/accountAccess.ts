import { describe, expect, it } from "vitest";

import type {
  AccountAccessIntents,
  AccountAccessState,
  Machine,
  RegistrationInput,
} from "@rtc/core-api";
import type { AccountFlowOutcome } from "@rtc/domain";

import { collect } from "#/harness/collect";
import type { MakeHarness } from "#/harness/harness";
import type { ScriptedDriver } from "#/harness/scriptedPorts";
import { settle } from "#/harness/settle";

// The copy is spelled out here, not imported: this package may not depend
// on @rtc/core-logic, and a suite that read the strings from the code under
// test would not notice them change.
const EMAIL_INPUT_ERROR = "Enter a valid email address";
const DISPLAY_NAME_INPUT_ERROR =
  "Display name: 2 to 40 characters, with at least one letter or digit";
const CODE_INPUT_ERROR = "Enter the 8-digit code from the email";
const MIN_LENGTH_ERROR = "Password: at least 12 characters";
const SEND_THROTTLED =
  "Too many codes requested. The last code you received still works";
const UNAVAILABLE = "The live desk is unavailable right now. Try again shortly";

const STRONG = "Correct-Horse-9x";
const WEAK = "short";
const CODE = " 12345678 ";
const EMAIL = "ann@desk.io";

const SIGN_IN: AccountAccessState = { phase: "signIn" };
const CODE_SENT: AccountFlowOutcome = { ok: true, status: "code_sent" };

type AccountAccessMachine = Machine<AccountAccessState, AccountAccessIntents>;

export function describeAccountAccessContract(
  label: string,
  makeHarness: MakeHarness,
): void {
  describe(label, () => {
    it("starts at signIn synchronously; each start intent moves to its idle phase and back without a port call", async () => {
      const h = makeHarness();
      const m = h.machines.accountAccess();

      try {
        const c = collect(m.state$);
        expect(c.values).toEqual([SIGN_IN]);
        m.intents.startRegistration();
        await settle();
        expect(c.values.at(-1)).toEqual({
          phase: "register",
          busy: false,
          error: null,
        });
        m.intents.startReset();
        await settle();
        expect(c.values.at(-1)).toEqual({
          phase: "requestReset",
          busy: false,
          error: null,
        });
        m.intents.startCodeEntry();
        await settle();
        expect(c.values.at(-1)).toEqual(createCodeStep("signup", null, false));
        m.intents.returnToSignIn();
        await settle();
        expect(c.values.at(-1)).toEqual(SIGN_IN);
        expect(h.driver.pendingAccountCalls()).toEqual([]);
        c.unsubscribe();
      } finally {
        m.dispose();
        await h.teardown();
      }
    });

    it("register refuses a bad address, a bad display name and a weak password locally, in that order, with no port call", async () => {
      const h = makeHarness();
      const m = h.machines.accountAccess();

      try {
        const c = collect(m.state$);
        m.intents.startRegistration();
        await settle();
        m.intents.register({
          email: "not an address",
          displayName: "x",
          password: WEAK,
        });
        await settle();
        expect(c.values.at(-1)).toEqual({
          phase: "register",
          busy: false,
          error: EMAIL_INPUT_ERROR,
        });
        m.intents.register({ ...createRegistration(), displayName: "x" });
        await settle();
        expect(c.values.at(-1)).toEqual({
          phase: "register",
          busy: false,
          error: DISPLAY_NAME_INPUT_ERROR,
        });
        m.intents.register({ ...createRegistration(), password: WEAK });
        await settle();
        expect(c.values.at(-1)).toEqual({
          phase: "register",
          busy: false,
          error: MIN_LENGTH_ERROR,
        });
        expect(h.driver.pendingAccountCalls()).toEqual([]);
        expect(h.driver.portCalls("auth.register")).toBe(0);
        c.unsubscribe();
      } finally {
        m.dispose();
        await h.teardown();
      }
    });

    it("a valid register is busy, sends the NORMALIZED address and display name, and lands on the code step holding the password", async () => {
      const h = makeHarness();
      const m = h.machines.accountAccess();

      try {
        const c = collect(m.state$);
        m.intents.startRegistration();
        await settle();
        m.intents.register(createRegistration());
        await settle();
        expect(c.values.at(-1)).toEqual({
          phase: "register",
          busy: true,
          error: null,
        });
        expect(h.driver.pendingAccountCalls()).toEqual([
          { kind: "register", email: EMAIL, displayName: "Ann Stark" },
        ]);
        h.driver.resolveAccountCall(CODE_SENT);
        await settle();
        expect(c.values.at(-1)).toEqual(createCodeStep("signup", EMAIL, true));
        expect(h.driver.pendingAccountCalls()).toEqual([]);
        c.unsubscribe();
      } finally {
        m.dispose();
        await h.teardown();
      }
    });

    it("the held password travels with the code; pending_approval ends the flow", async () => {
      const h = makeHarness();
      const m = h.machines.accountAccess();

      try {
        const c = collect(m.state$);
        await reachSignupCodeStep(h.driver, m);
        m.intents.submitCode({ code: CODE });
        await settle();
        expect(c.values.at(-1)).toMatchObject({ phase: "code", busy: true });
        expect(h.driver.pendingAccountCalls()).toEqual([
          {
            kind: "confirmEmail",
            email: EMAIL,
            code: "12345678",
            password: STRONG,
          },
        ]);
        h.driver.resolveAccountCall({ ok: true, status: "pending_approval" });
        await settle();
        expect(c.values.at(-1)).toEqual({
          phase: "pendingApproval",
          email: EMAIL,
        });
        c.unsubscribe();
      } finally {
        m.dispose();
        await h.teardown();
      }
    });

    it("neither the password nor the code appears in any emitted state, refusals included", async () => {
      const h = makeHarness();
      const m = h.machines.accountAccess();

      try {
        const c = collect(m.state$);
        await reachSignupCodeStep(h.driver, m);
        m.intents.submitCode({ code: "1234567" });
        await settle();
        expect(c.values.at(-1)).toMatchObject({ error: CODE_INPUT_ERROR });
        m.intents.submitCode({ code: CODE });
        await settle();
        h.driver.resolveAccountCall({ ok: false, reason: "invalid_code" });
        await settle();
        expect(c.values.at(-1)).toMatchObject({
          error: "That code is not valid or has expired",
        });
        m.intents.submitCode({ code: CODE });
        await settle();
        h.driver.resolveAccountCall({ ok: true, status: "pending_approval" });
        await settle();
        expect(c.values.at(-1)?.phase).toBe("pendingApproval");
        const emitted = JSON.stringify(c.values);
        expect(emitted).not.toContain(STRONG);
        expect(emitted).not.toContain("12345678");
        expect(emitted).not.toContain("1234567");
        c.unsubscribe();
      } finally {
        m.dispose();
        await h.teardown();
      }
    });

    it("password_unset ends on its notice, and requestReset from there sends a reset code", async () => {
      const h = makeHarness();
      const m = h.machines.accountAccess();

      try {
        const c = collect(m.state$);
        await reachSignupCodeStep(h.driver, m);
        m.intents.submitCode({ code: CODE });
        await settle();
        h.driver.resolveAccountCall({ ok: true, status: "password_unset" });
        await settle();
        expect(c.values.at(-1)).toEqual({
          phase: "passwordUnset",
          email: EMAIL,
        });
        m.intents.requestReset(EMAIL);
        await settle();
        expect(h.driver.pendingAccountCalls()).toEqual([
          { kind: "requestPasswordReset", email: EMAIL },
        ]);
        h.driver.resolveAccountCall(CODE_SENT);
        await settle();
        expect(c.values.at(-1)).toEqual(createCodeStep("reset", EMAIL, false));
        m.intents.submitCode({ code: CODE, password: "Reset-Horse-7y" });
        await settle();
        expect(h.driver.pendingAccountCalls()).toEqual([
          {
            kind: "resetPassword",
            email: EMAIL,
            code: "12345678",
            password: "Reset-Horse-7y",
          },
        ]);
        h.driver.resolveAccountCall({ ok: true, status: "password_changed" });
        await settle();
        expect(c.values.at(-1)).toEqual({
          phase: "passwordChanged",
          email: EMAIL,
        });
        c.unsubscribe();
      } finally {
        m.dispose();
        await h.teardown();
      }
    });

    it("a password rule refusal at the confirmation drops the held password and keeps the code retryable", async () => {
      const h = makeHarness();
      const m = h.machines.accountAccess();

      try {
        const c = collect(m.state$);
        await reachSignupCodeStep(h.driver, m);
        m.intents.submitCode({ code: CODE });
        await settle();
        h.driver.resolveAccountCall({
          ok: false,
          reason: "invalid_input",
          rule: "min-length",
        });
        await settle();
        expect(c.values.at(-1)).toEqual({
          ...createCodeStep("signup", EMAIL, false),
          error: MIN_LENGTH_ERROR,
        });
        m.intents.submitCode({ code: CODE });
        await settle();
        expect(c.values.at(-1)).toMatchObject({ error: "Choose a password" });
        expect(h.driver.pendingAccountCalls()).toEqual([]);
        m.intents.submitCode({ code: CODE, password: "Another-Horse-3z" });
        await settle();
        expect(h.driver.pendingAccountCalls()).toEqual([
          {
            kind: "confirmEmail",
            email: EMAIL,
            code: "12345678",
            password: "Another-Horse-3z",
          },
        ]);
        c.unsubscribe();
      } finally {
        m.dispose();
        await h.teardown();
      }
    });

    it("a wrong code keeps the held password: the next submit needs the code only", async () => {
      const h = makeHarness();
      const m = h.machines.accountAccess();

      try {
        const c = collect(m.state$);
        await reachSignupCodeStep(h.driver, m);
        m.intents.submitCode({ code: CODE });
        await settle();
        h.driver.resolveAccountCall({ ok: false, reason: "invalid_code" });
        await settle();
        expect(c.values.at(-1)).toEqual({
          ...createCodeStep("signup", EMAIL, true),
          error: "That code is not valid or has expired",
        });
        m.intents.submitCode({ code: "87654321" });
        await settle();
        expect(h.driver.pendingAccountCalls()).toEqual([
          {
            kind: "confirmEmail",
            email: EMAIL,
            code: "87654321",
            password: STRONG,
          },
        ]);
        c.unsubscribe();
      } finally {
        m.dispose();
        await h.teardown();
      }
    });

    it("a code of the wrong shape and a bad typed address never leave", async () => {
      const h = makeHarness();
      const m = h.machines.accountAccess();

      try {
        const c = collect(m.state$);
        m.intents.startCodeEntry();
        await settle();
        m.intents.submitCode({
          code: "1234567",
          email: "a@b.co",
          password: STRONG,
        });
        await settle();
        expect(c.values.at(-1)).toMatchObject({ error: CODE_INPUT_ERROR });
        expect(h.driver.portCalls("auth.confirmEmail")).toBe(0);
        m.intents.submitCode({
          email: "not an address",
          code: CODE,
          password: STRONG,
        });
        await settle();
        expect(c.values.at(-1)).toMatchObject({ error: EMAIL_INPUT_ERROR });
        expect(h.driver.portCalls("auth.confirmEmail")).toBe(0);
        m.intents.submitCode({
          email: " A@B.co ",
          code: CODE,
          password: STRONG,
        });
        await settle();
        expect(h.driver.pendingAccountCalls()).toEqual([
          {
            kind: "confirmEmail",
            email: "a@b.co",
            code: "12345678",
            password: STRONG,
          },
        ]);
        expect(c.values.at(-1)).toMatchObject({
          phase: "code",
          email: null,
          busy: true,
        });
        c.unsubscribe();
      } finally {
        m.dispose();
        await h.teardown();
      }
    });

    it("resend sends to the held address and reports it; a throttled resend says the last code still works; in the reset flow a resend is a reset request", async () => {
      const h = makeHarness();
      const m = h.machines.accountAccess();
      const reset = h.machines.accountAccess();

      try {
        const c = collect(m.state$);
        await reachSignupCodeStep(h.driver, m);
        m.intents.resendCode();
        await settle();
        expect(h.driver.pendingAccountCalls()).toEqual([
          { kind: "resendCode", email: EMAIL },
        ]);
        h.driver.resolveAccountCall(CODE_SENT);
        await settle();
        expect(c.values.at(-1)).toEqual({
          ...createCodeStep("signup", EMAIL, true),
          resent: true,
        });
        m.intents.resendCode();
        await settle();
        h.driver.resolveAccountCall({ ok: false, reason: "rate_limited" });
        await settle();
        expect(c.values.at(-1)).toEqual({
          ...createCodeStep("signup", EMAIL, true),
          error: SEND_THROTTLED,
        });

        const r = collect(reset.state$);
        reset.intents.startReset();
        await settle();
        reset.intents.requestReset(EMAIL);
        await settle();
        h.driver.resolveAccountCall(CODE_SENT);
        await settle();
        expect(r.values.at(-1)).toEqual(createCodeStep("reset", EMAIL, false));
        reset.intents.resendCode();
        await settle();
        expect(h.driver.pendingAccountCalls()).toEqual([
          { kind: "requestPasswordReset", email: EMAIL },
        ]);
        c.unsubscribe();
        r.unsubscribe();
      } finally {
        m.dispose();
        reset.dispose();
        await h.teardown();
      }
    });

    it.each<[string, (driver: ScriptedDriver) => void, string]>([
      [
        "registration_closed",
        (driver: ScriptedDriver): void => {
          driver.resolveAccountCall({
            ok: false,
            reason: "registration_closed",
          });
        },
        "Sign-up is paused for now",
      ],
      [
        "rate_limited",
        (driver: ScriptedDriver): void => {
          driver.resolveAccountCall({ ok: false, reason: "rate_limited" });
        },
        SEND_THROTTLED,
      ],
      [
        "unavailable",
        (driver: ScriptedDriver): void => {
          driver.resolveAccountCall({ ok: false, reason: "unavailable" });
        },
        UNAVAILABLE,
      ],
      [
        "an erroring port stream",
        (driver: ScriptedDriver): void => {
          driver.failAccountCall(new Error("boom"));
        },
        UNAVAILABLE,
      ],
    ])("a refused registration says why: %s", async (_name, refuse, text) => {
      const h = makeHarness();
      const m = h.machines.accountAccess();

      try {
        const c = collect(m.state$);
        m.intents.startRegistration();
        await settle();
        m.intents.register(createRegistration());
        await settle();
        refuse(h.driver);
        await settle();
        expect(c.values.at(-1)).toEqual({
          phase: "register",
          busy: false,
          error: text,
        });
        expect(c.errors).toEqual([]);
        c.unsubscribe();
      } finally {
        m.dispose();
        await h.teardown();
      }
    });

    it("a spent code at the reset says so", async () => {
      const h = makeHarness();
      const m = h.machines.accountAccess();

      try {
        const c = collect(m.state$);
        m.intents.startReset();
        await settle();
        m.intents.requestReset(EMAIL);
        await settle();
        h.driver.resolveAccountCall(CODE_SENT);
        await settle();
        m.intents.submitCode({ code: CODE, password: "Reset-Horse-7y" });
        await settle();
        h.driver.resolveAccountCall({
          ok: false,
          reason: "invalid_input",
          rule: "password",
        });
        await settle();
        expect(c.values.at(-1)).toEqual({
          ...createCodeStep("reset", EMAIL, false),
          error:
            "That code has been used. Request a new one and choose a different password",
        });
        c.unsubscribe();
      } finally {
        m.dispose();
        await h.teardown();
      }
    });

    it("returnToSignIn while a request is in flight drops the late answer", async () => {
      const h = makeHarness();
      const m = h.machines.accountAccess();

      try {
        const c = collect(m.state$);
        m.intents.startRegistration();
        await settle();
        m.intents.register(createRegistration());
        await settle();
        m.intents.returnToSignIn();
        await settle();
        expect(c.values.at(-1)).toEqual(SIGN_IN);
        expect(h.driver.pendingAccountCalls()).toEqual([]);
        const emitted = c.values.length;
        // Nothing is pending, so this resolve settles nothing; the length
        // check then pins that no late answer reaches the state by any
        // other path either.
        h.driver.resolveAccountCall(CODE_SENT);
        await settle();
        expect(c.values).toHaveLength(emitted);
        c.unsubscribe();
      } finally {
        m.dispose();
        await h.teardown();
      }
    });

    it("an intent the phase ignores leaves the request in flight, so a busy form is never stranded", async () => {
      const h = makeHarness();
      const m = h.machines.accountAccess();

      try {
        const c = collect(m.state$);
        m.intents.startRegistration();
        await settle();
        m.intents.register(createRegistration());
        await settle();
        const emitted = c.values.length;
        m.intents.submitCode({ code: CODE });
        m.intents.resendCode();
        m.intents.requestReset(EMAIL);
        await settle();
        expect(c.values).toHaveLength(emitted);
        expect(h.driver.pendingAccountCalls()).toEqual([
          { kind: "register", email: EMAIL, displayName: "Ann Stark" },
        ]);
        h.driver.resolveAccountCall(CODE_SENT);
        await settle();
        expect(c.values.at(-1)).toEqual(createCodeStep("signup", EMAIL, true));
        c.unsubscribe();
      } finally {
        m.dispose();
        await h.teardown();
      }
    });

    it("dispose cancels a request in flight, and its answer lands nowhere", async () => {
      const h = makeHarness();
      const m = h.machines.accountAccess();

      try {
        const c = collect(m.state$);
        m.intents.startRegistration();
        await settle();
        m.intents.register(createRegistration());
        await settle();
        expect(h.driver.pendingAccountCalls()).toHaveLength(1);
        const emitted = c.values.length;
        m.dispose();
        await settle();
        expect(h.driver.pendingAccountCalls()).toEqual([]);
        h.driver.resolveAccountCall(CODE_SENT);
        await settle();
        expect(c.values).toHaveLength(emitted);
        c.unsubscribe();
      } finally {
        await h.teardown();
      }
    });

    it("dispose makes the intents inert and a fresh subscription yields the current value synchronously", async () => {
      const h = makeHarness();
      const m = h.machines.accountAccess();

      try {
        const c = collect(m.state$);
        m.intents.startRegistration();
        await settle();
        // Mirrors real usage: useMachine disposes after the component's own
        // subscription has unmounted.
        c.unsubscribe();
        m.dispose();
        m.intents.startReset();
        m.intents.register(createRegistration());
        await settle();
        expect(h.driver.pendingAccountCalls()).toEqual([]);
        const fresh = collect(m.state$);
        expect(fresh.values).toEqual([
          { phase: "register", busy: false, error: null },
        ]);
        fresh.unsubscribe();
      } finally {
        await h.teardown();
      }
    });
  });
}

/** Drives a fresh machine through a valid registration the server accepts:
 * the sign-up code step, holding EMAIL and STRONG. */
async function reachSignupCodeStep(
  driver: ScriptedDriver,
  m: AccountAccessMachine,
): Promise<void> {
  m.intents.startRegistration();
  await settle();
  m.intents.register(createRegistration());
  await settle();
  driver.resolveAccountCall(CODE_SENT);
  await settle();
}

function createRegistration(): RegistrationInput {
  return {
    email: "  Ann@Desk.io ",
    displayName: "  Ann   Stark ",
    password: STRONG,
  };
}

function createCodeStep(
  flow: "signup" | "reset",
  email: string | null,
  passwordHeld: boolean,
): AccountAccessState {
  return {
    phase: "code",
    flow,
    email,
    passwordHeld,
    resent: false,
    busy: false,
    error: null,
  };
}
