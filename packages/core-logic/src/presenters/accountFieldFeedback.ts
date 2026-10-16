import type { InputCheck } from "#/presenters/accountAccessFold";

/** A login-form field checked as the user types; the value is its
 * `data-field` attribute. */
export type AccountField = "email" | "display-name" | "code";

/** A field's error as the form shows it: nothing until the field is
 * revealed (left once, or a submit was tried), then its check's error for
 * as long as the value fails. */
export function describeFieldError(
  check: InputCheck,
  revealed: boolean,
): string | null {
  return revealed && !check.ok ? check.error : null;
}

/** The first field, in the order given (form order), whose check fails. */
export function findFirstFailingField(
  checks: readonly (readonly [AccountField, InputCheck])[],
): AccountField | null {
  const failing = checks.find(([, check]) => {
    return !check.ok;
  });

  return failing === undefined ? null : failing[0];
}
