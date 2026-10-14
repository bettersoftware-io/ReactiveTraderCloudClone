import type {
  AccountAccessFlow,
  AccountAccessState,
  CodeInput,
  RegistrationInput,
  Stream,
} from "@rtc/core-api";
import {
  type AccountFlowOutcome,
  type AccountFlowPort,
  type AccountInputRule,
  findPasswordViolation,
  isConfirmationCode,
  isValidDisplayName,
  isValidEmail,
  normalizeDisplayName,
  normalizeEmail,
  PASSWORD_RULES,
} from "@rtc/domain";

import {
  CODE_INPUT_ERROR,
  DISPLAY_NAME_INPUT_ERROR,
  describeAccountFailure,
  describePasswordRule,
  EMAIL_INPUT_ERROR,
  PASSWORD_REQUIRED_ERROR,
} from "#/presenters/accountAccessCopy";

export const ACCOUNT_ACCESS_IDLE: AccountAccessState = { phase: "signIn" };

/** Tags for `Extract`: a named shape, not an inline literal. */
interface RefusedTag {
  readonly ok: false;
}

interface CodePhaseTag {
  readonly phase: "code";
}

export type AccountFlowRefusal = Extract<AccountFlowOutcome, RefusedTag>;

/** What the machine holds across steps and never emits: the address a code
 * went to, and the password chosen on the create-account form, which
 * travels with the code (spec §5.3). */
export interface AccountAccessHeld {
  readonly email: string | null;
  readonly password: string | null;
}

export const NOTHING_HELD: AccountAccessHeld = { email: null, password: null };

/** One call for the machine to make on its port's account flows. Transient:
 * it carries the password to the port and is never emitted. */
export type AccountRequest =
  | {
      readonly kind: "register";
      readonly email: string;
      readonly displayName: string;
    }
  | { readonly kind: "resendCode"; readonly email: string }
  | {
      readonly kind: "confirmEmail";
      readonly email: string;
      readonly code: string;
      readonly password: string;
    }
  | { readonly kind: "requestPasswordReset"; readonly email: string }
  | {
      readonly kind: "resetPassword";
      readonly email: string;
      readonly code: string;
      readonly password: string;
    };

export type AccountRequestKind = AccountRequest["kind"];

export type AccountAccessEvent =
  | { readonly kind: "startRegistration" }
  | { readonly kind: "startReset" }
  | { readonly kind: "startCodeEntry" }
  | { readonly kind: "returnToSignIn" }
  | { readonly kind: "register"; readonly input: RegistrationInput }
  | { readonly kind: "requestReset"; readonly email: string }
  | { readonly kind: "submitCode"; readonly input: CodeInput }
  | { readonly kind: "resendCode"; readonly email: string | undefined }
  | {
      readonly kind: "settled";
      readonly request: AccountRequest;
      readonly outcome: AccountFlowOutcome;
    };

/** What a core does with one event: store `state` (emitting it when it is
 * a new value), keep `held`, then — in this order — drop the request in
 * flight when `cancelsInFlight`, and make `request` when it is not null. */
export interface AccountAccessStep {
  readonly state: AccountAccessState;
  readonly held: AccountAccessHeld;
  /** The port call this event asks for, or null. A `settled` event never asks for one. */
  readonly request: AccountRequest | null;
  /** True when the event was acted on: it moved the phase, refused its
   * input locally or asks for a new request, so whatever request is in
   * flight no longer belongs to the state. False for an event the phase
   * ignores (the state and its `busy` are unchanged, so the request it
   * reports must stay in flight) and for a `settled` event (its request is
   * the one that just answered). A step with a `request` always cancels. */
  readonly cancelsInFlight: boolean;
}

export type InputCheck =
  | { readonly ok: true; readonly value: string }
  | { readonly ok: false; readonly error: string };

type CodePhase = Extract<AccountAccessState, CodePhaseTag>;

export function checkEmailInput(raw: string): InputCheck {
  const email = normalizeEmail(raw);

  return isValidEmail(email)
    ? { ok: true, value: email }
    : { ok: false, error: EMAIL_INPUT_ERROR };
}

export function checkDisplayNameInput(raw: string): InputCheck {
  const name = normalizeDisplayName(raw);

  return isValidDisplayName(name)
    ? { ok: true, value: name }
    : { ok: false, error: DISPLAY_NAME_INPUT_ERROR };
}

export function checkCodeInput(raw: string): InputCheck {
  const code = raw.trim();

  return isConfirmationCode(code)
    ? { ok: true, value: code }
    : { ok: false, error: CODE_INPUT_ERROR };
}

/** The password is sent as typed (no trimming: a leading space is part of
 * it); an empty one is "choose a password", not a rule. */
export function checkPasswordInput(raw: string): InputCheck {
  if (raw.length === 0) {
    return { ok: false, error: PASSWORD_REQUIRED_ERROR };
  }

  const violation = findPasswordViolation(raw);

  return violation === null
    ? { ok: true, value: raw }
    : { ok: false, error: describePasswordRule(violation.id) };
}

/** Dispatches a request to the port. Pure wiring: no rxjs value here. */
export function callAccountFlow(
  port: AccountFlowPort,
  request: AccountRequest,
): Stream<AccountFlowOutcome> {
  switch (request.kind) {
    case "register":
      return port.register(request.email, request.displayName);
    case "resendCode":
      return port.resendCode(request.email);
    case "confirmEmail":
      return port.confirmEmail(request.email, request.code, request.password);
    case "requestPasswordReset":
      return port.requestPasswordReset(request.email);
    case "resetPassword":
      return port.resetPassword(request.email, request.code, request.password);
  }
}

/** One step of the login screen's account flows: the next state, what the
 * machine now holds, whether the request in flight is dropped, and the port
 * call to make (if any). The one fold all three cores run, so a core is a
 * store, a request slot and this. An event the phase ignores returns the
 * SAME `state` and `held` objects with `cancelsInFlight: false`. */
export function stepAccountAccess(
  state: AccountAccessState,
  held: AccountAccessHeld,
  event: AccountAccessEvent,
): AccountAccessStep {
  switch (event.kind) {
    case "startRegistration":
      return go({ phase: "register", busy: false, error: null }, NOTHING_HELD);
    case "startReset":
      return go(
        { phase: "requestReset", busy: false, error: null },
        NOTHING_HELD,
      );
    case "startCodeEntry":
      return go(codeStep("signup", null, false), NOTHING_HELD);
    case "returnToSignIn":
      return go(ACCOUNT_ACCESS_IDLE, NOTHING_HELD);
    case "register":
      return state.phase === "register"
        ? beginRegistration(event.input)
        : stay(state, held);
    case "requestReset":
      return state.phase === "requestReset" || state.phase === "passwordUnset"
        ? beginResetRequest(event.email)
        : stay(state, held);
    case "submitCode":
      return state.phase === "code"
        ? beginCode(state, held, event.input)
        : stay(state, held);
    case "resendCode":
      return state.phase === "code"
        ? beginResend(state, held, event.email)
        : stay(state, held);
    case "settled":
      return {
        ...settle(state, held, event.request, event.outcome),
        cancelsInFlight: false,
      };
  }
}

/** The event is ignored: nothing changes and nothing is cancelled. */
function stay(
  state: AccountAccessState,
  held: AccountAccessHeld,
): AccountAccessStep {
  return { state, held, request: null, cancelsInFlight: false };
}

/** The event is acted on (a `settled` event's result is re-marked as not
 * cancelling in `stepAccountAccess`). */
function go(
  state: AccountAccessState,
  held: AccountAccessHeld,
  request: AccountRequest | null = null,
): AccountAccessStep {
  return { state, held, request, cancelsInFlight: true };
}

function codeStep(
  flow: AccountAccessFlow,
  email: string | null,
  passwordHeld: boolean,
): CodePhase {
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

/** Checked in form order — address, display name, password — so the error
 * shown is the first field that needs fixing. Nothing is held until all
 * three pass. */
function beginRegistration(input: RegistrationInput): AccountAccessStep {
  const email = checkEmailInput(input.email);

  if (!email.ok) {
    return refuseRegistration(email.error);
  }

  const displayName = checkDisplayNameInput(input.displayName);

  if (!displayName.ok) {
    return refuseRegistration(displayName.error);
  }

  const password = checkPasswordInput(input.password);

  if (!password.ok) {
    return refuseRegistration(password.error);
  }

  return go(
    { phase: "register", busy: true, error: null },
    { email: email.value, password: password.value },
    { kind: "register", email: email.value, displayName: displayName.value },
  );
}

function refuseRegistration(error: string): AccountAccessStep {
  return go({ phase: "register", busy: false, error }, NOTHING_HELD);
}

function beginResetRequest(raw: string): AccountAccessStep {
  const email = checkEmailInput(raw);

  if (!email.ok) {
    return go(
      { phase: "requestReset", busy: false, error: email.error },
      NOTHING_HELD,
    );
  }

  return go(
    { phase: "requestReset", busy: true, error: null },
    { email: email.value, password: null },
    { kind: "requestPasswordReset", email: email.value },
  );
}

/** The address and the password come from what is held when held, else
 * from the form, checked in form order — address, code, password. Neither
 * typed value becomes held: the field stays on the form, so a typo can be
 * fixed after a refusal. */
function beginCode(
  state: CodePhase,
  held: AccountAccessHeld,
  input: CodeInput,
): AccountAccessStep {
  const email =
    held.email !== null
      ? accept(held.email)
      : checkEmailInput(input.email ?? "");

  if (!email.ok) {
    return refuseCode(state, held, email.error);
  }

  const code = checkCodeInput(input.code);

  if (!code.ok) {
    return refuseCode(state, held, code.error);
  }

  const password =
    held.password !== null
      ? accept(held.password)
      : checkPasswordInput(input.password ?? "");

  if (!password.ok) {
    return refuseCode(state, held, password.error);
  }

  const request: AccountRequest =
    state.flow === "signup"
      ? {
          kind: "confirmEmail",
          email: email.value,
          code: code.value,
          password: password.value,
        }
      : {
          kind: "resetPassword",
          email: email.value,
          code: code.value,
          password: password.value,
        };

  return go(
    { ...state, busy: true, error: null, resent: false },
    held,
    request,
  );
}

function refuseCode(
  state: CodePhase,
  held: AccountAccessHeld,
  error: string,
): AccountAccessStep {
  return go({ ...state, busy: false, error }, held);
}

function beginResend(
  state: CodePhase,
  held: AccountAccessHeld,
  raw: string | undefined,
): AccountAccessStep {
  const email =
    held.email !== null ? accept(held.email) : checkEmailInput(raw ?? "");

  if (!email.ok) {
    return refuseCode(state, held, email.error);
  }

  const request: AccountRequest =
    state.flow === "signup"
      ? { kind: "resendCode", email: email.value }
      : { kind: "requestPasswordReset", email: email.value };

  return go(
    { ...state, busy: true, error: null, resent: false },
    held,
    request,
  );
}

function accept(value: string): InputCheck {
  return { ok: true, value };
}

/** A settled request lands only on a state that is still waiting for it —
 * busy, in the phase (and, at the code step, the flow) that made it. A
 * request the user navigated away from changes nothing, even when the user
 * has since come back to an idle form of the same phase (the slot cancels
 * it, but belt and braces). */
function settle(
  state: AccountAccessState,
  held: AccountAccessHeld,
  request: AccountRequest,
  outcome: AccountFlowOutcome,
): AccountAccessStep {
  switch (request.kind) {
    case "register":
      if (state.phase !== "register" || !state.busy) {
        return stay(state, held);
      }

      return outcome.ok
        ? go(codeStep("signup", request.email, true), held)
        : refuseRegistration(describeAccountFailure(outcome, request.kind));
    case "requestPasswordReset":
      if (state.phase === "requestReset") {
        if (!state.busy) {
          return stay(state, held);
        }

        return outcome.ok
          ? go(codeStep("reset", request.email, false), held)
          : go(
              {
                phase: "requestReset",
                busy: false,
                error: describeAccountFailure(outcome, request.kind),
              },
              NOTHING_HELD,
            );
      }

      return isAwaitingCodeStep(state, "reset")
        ? settleResend(state, held, request.kind, outcome)
        : stay(state, held);
    case "resendCode":
      return isAwaitingCodeStep(state, "signup")
        ? settleResend(state, held, request.kind, outcome)
        : stay(state, held);
    case "confirmEmail":
      return isAwaitingCodeStep(state, "signup")
        ? settleConfirmation(state, held, request.email, outcome)
        : stay(state, held);
    case "resetPassword":
      return isAwaitingCodeStep(state, "reset")
        ? settleReset(state, held, request.email, outcome)
        : stay(state, held);
  }
}

/** A code step of this flow with a request of its own in flight. */
function isAwaitingCodeStep(
  state: AccountAccessState,
  flow: AccountAccessFlow,
): state is CodePhase {
  return state.phase === "code" && state.busy && state.flow === flow;
}

function settleResend(
  state: CodePhase,
  held: AccountAccessHeld,
  kind: AccountRequestKind,
  outcome: AccountFlowOutcome,
): AccountAccessStep {
  return outcome.ok
    ? go({ ...state, busy: false, error: null, resent: true }, held)
    : go(
        {
          ...state,
          busy: false,
          resent: false,
          error: describeAccountFailure(outcome, kind),
        },
        held,
      );
}

/** `pending_approval` and `password_unset` end the flow. A password RULE
 * refusal did not spend the code (spec §5.3): the held password is dropped
 * and the form shows the field, so the same code is retried with another
 * password. Any other refusal keeps what is held. */
function settleConfirmation(
  state: CodePhase,
  held: AccountAccessHeld,
  email: string,
  outcome: AccountFlowOutcome,
): AccountAccessStep {
  if (outcome.ok) {
    return outcome.status === "password_unset"
      ? go({ phase: "passwordUnset", email }, NOTHING_HELD)
      : go({ phase: "pendingApproval", email }, NOTHING_HELD);
  }

  const error = describeAccountFailure(outcome, "confirmEmail");
  const passwordRefused =
    outcome.reason === "invalid_input" && isPasswordRule(outcome.rule);

  return passwordRefused
    ? go(
        { ...state, busy: false, error, passwordHeld: false },
        { email: held.email, password: null },
      )
    : go({ ...state, busy: false, error }, held);
}

function settleReset(
  state: CodePhase,
  held: AccountAccessHeld,
  email: string,
  outcome: AccountFlowOutcome,
): AccountAccessStep {
  return outcome.ok
    ? go({ phase: "passwordChanged", email }, NOTHING_HELD)
    : go(
        {
          ...state,
          busy: false,
          error: describeAccountFailure(outcome, "resetPassword"),
        },
        held,
      );
}

/** One of the password policy's own rules (`min-length` …), checked
 * against the policy itself: a field rule, the store's `password` refusal
 * and any rule added later are not, so they never drop the held password. */
function isPasswordRule(rule: AccountInputRule | undefined): boolean {
  return PASSWORD_RULES.some((candidate) => {
    return candidate.id === rule;
  });
}
