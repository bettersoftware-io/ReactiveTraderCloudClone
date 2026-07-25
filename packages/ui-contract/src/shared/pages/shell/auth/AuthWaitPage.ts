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

  if (scope.queryByTestId("auth-wait-handshake") !== null) {
    return "handshake";
  }

  if (scope.queryByTestId("auth-wait-reactor") !== null) {
    return "reactor";
  }

  return null;
}
