import type { AccountAccessState } from "@rtc/core-api";
import {
  type AccountInputRule,
  PASSWORD_RULES,
  type PasswordRuleId,
} from "@rtc/domain";

import type {
  AccountFlowRefusal,
  AccountRequestKind,
} from "#/presenters/accountAccessFold";

/** Every line the login screen's account flows show, once: both web
 * clients read their copy from here, so the two cannot drift. */

export const PRIVACY_NOTICE_URL =
  "https://github.com/bettersoftware-io/ReactiveTraderCloudClone/blob/main/docs/privacy.md";

export const TITLE_PREFIX = "REACTIVE TRADER OS · ";

/** The login panel's title for a phase (the sign-in title is unchanged). */
export function describeAccountAccessTitle(state: AccountAccessState): string {
  switch (state.phase) {
    case "signIn":
      return `${TITLE_PREFIX}SIGN IN`;
    case "register":
      return `${TITLE_PREFIX}CREATE ACCOUNT`;
    case "code":
      return state.flow === "reset"
        ? `${TITLE_PREFIX}RESET PASSWORD`
        : `${TITLE_PREFIX}CONFIRM EMAIL`;
    case "requestReset":
      return `${TITLE_PREFIX}RESET PASSWORD`;
    case "pendingApproval":
      return `${TITLE_PREFIX}AWAITING APPROVAL`;
    case "passwordUnset":
      return `${TITLE_PREFIX}SET A PASSWORD`;
    case "passwordChanged":
      return `${TITLE_PREFIX}PASSWORD CHANGED`;
  }
}

export const ACCOUNT_ACCESS_COPY = {
  createAccountLink: "Create account ▸",
  forgotPasswordLink: "Forgot password?",
  haveCodeLink: "I already have a code",
  backToSignInLink: "Back to sign in",
  resendLink: "Resend code",
  enterCodeAfterUnconfirmed: "Enter confirmation code ▸",
  emailLabel: "Email",
  displayNameLabel: "Display name",
  passwordLabel: "Password",
  newPasswordLabel: "New password",
  codeLabel: "8-digit code",
  registerSubmit: "CREATE ACCOUNT ▸",
  confirmSubmit: "CONFIRM ▸",
  setPasswordSubmit: "SET PASSWORD ▸",
  requestResetSubmit: "SEND RESET CODE ▸",
  busySubmit: "SENDING",
  codeSentTo: "Code sent to",
  codeResent: "A new code is on its way",
  privacyLead: "By creating an account you agree to the",
  privacyLink: "privacy notice",
  pendingApprovalNotice:
    "Your email is confirmed. An administrator approves each account by hand; sign in once you have been approved.",
  passwordUnsetNotice:
    "Your email is confirmed, but no password could be stored. Request a reset code to set one.",
  passwordChangedNotice: "Your password has been changed. Sign in with it.",
  requestResetAction: "SEND RESET CODE ▸",
  signInAction: "SIGN IN ▸",
} as const;

export const EMAIL_INPUT_ERROR = "Enter a valid email address";
export const DISPLAY_NAME_INPUT_ERROR =
  "Display name: 2 to 40 characters, with at least one letter or digit";
export const CODE_INPUT_ERROR = "Enter the 8-digit code from the email";
export const PASSWORD_REQUIRED_ERROR = "Choose a password";

/** "Password: at least 12 characters" — the checklist label, lowercased. */
export function describePasswordRule(rule: PasswordRuleId): string {
  const found = PASSWORD_RULES.find((candidate) => {
    return candidate.id === rule;
  });

  return `Password: ${(found?.label ?? rule).toLowerCase()}`;
}

/** The error line for a refused account flow. Which request it refused
 * matters twice: a spent code (`password` at a reset) and a throttled SEND
 * (the last code still works — except at a first registration, which never
 * received one). */
export function describeAccountFailure(
  refusal: AccountFlowRefusal,
  request: AccountRequestKind,
): string {
  switch (refusal.reason) {
    case "invalid_input":
      return describeInputRule(refusal.rule, request);
    case "invalid_code":
      return "That code is not valid or has expired";
    case "registration_closed":
      return "Sign-up is paused for now";
    case "rate_limited":
      return describeRateLimit(request);
    case "unavailable":
      return "The live desk is unavailable right now. Try again shortly";
  }
}

function describeInputRule(
  rule: AccountInputRule | undefined,
  request: AccountRequestKind,
): string {
  if (rule === undefined) {
    return "The request was refused";
  }

  if (rule === "email") {
    return EMAIL_INPUT_ERROR;
  }

  if (rule === "display-name") {
    return DISPLAY_NAME_INPUT_ERROR;
  }

  if (rule === "password") {
    return request === "resetPassword"
      ? "That code has been used. Request a new one and choose a different password"
      : "That password was refused. Request a reset code to set one";
  }

  return describePasswordRule(rule);
}

function describeRateLimit(request: AccountRequestKind): string {
  switch (request) {
    case "register":
      return "Too many sign-up attempts. Try again later";
    case "resendCode":
    case "requestPasswordReset":
      return "Too many codes requested. The last code you received still works";
    case "confirmEmail":
    case "resetPassword":
      return "Too many attempts. Wait a few minutes and try again";
  }
}
