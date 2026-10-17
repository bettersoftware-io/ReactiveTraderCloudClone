import type { AccountField } from "@rtc/core-logic";

/** The id of `field`'s inline error (FieldError), for its input's
 * `aria-describedby`. */
export function fieldErrorId(field: AccountField): string {
  return `login-field-error-${field}`;
}
