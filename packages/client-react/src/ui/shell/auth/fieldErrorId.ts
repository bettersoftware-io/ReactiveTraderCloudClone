import type { AccountField } from "@rtc/core-logic";

/** The id of `field`'s inline error (FieldError), for its input's
 * `aria-describedby`. */
export function fieldErrorId(field: AccountField): string {
  return `login-field-error-${field}`;
}

/** The accessibility pair a checked input carries. */
export interface FieldAriaProps {
  readonly "aria-invalid": boolean;
  readonly "aria-describedby": string | undefined;
}

/** Marks `field`'s input invalid and points it at its inline error while
 * it shows one; neither otherwise. */
export function fieldAriaProps(
  field: AccountField,
  error: string | null,
): FieldAriaProps {
  return {
    "aria-invalid": error !== null,
    "aria-describedby": error === null ? undefined : fieldErrorId(field),
  };
}
