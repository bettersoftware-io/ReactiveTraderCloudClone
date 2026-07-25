import { within } from "@testing-library/dom";

import type { LoginWaitVariant } from "@rtc/domain";

/**
 * Shared query logic for the login-wait treatment. Both `LoginScreenPage`
 * (keyed off `status === "authenticating"`) and `LockScreenPage` (keyed off
 * `unlocking === true`) mount exactly one of `HandshakeConsole` /
 * `ReactorWait` while their own in-flight signal is true, identified by the
 * `auth-wait-{handshake,reactor}` test ids the treatments carry. Factored out
 * here rather than duplicated so the two page objects can't drift on how the
 * variant is detected.
 */
export function waitVariantWithin(root: HTMLElement): LoginWaitVariant | null {
  const scope = within(root);

  const hasHandshake = scope.queryByTestId("auth-wait-handshake") !== null;
  const hasReactor = scope.queryByTestId("auth-wait-reactor") !== null;

  // Exactly one treatment is ever mounted at a time (see the module comment
  // above). If a regression rendered both simultaneously, silently returning
  // the first match would mask it — fail loudly instead.
  if (hasHandshake && hasReactor) {
    throw new Error(
      "waitVariantWithin: both auth-wait-handshake and auth-wait-reactor are present — exactly one login-wait treatment should be mounted at a time.",
    );
  }

  if (hasHandshake) {
    return "handshake";
  }

  if (hasReactor) {
    return "reactor";
  }

  return null;
}
