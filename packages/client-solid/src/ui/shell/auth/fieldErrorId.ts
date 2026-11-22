import type { AccountField } from "@rtc/core-logic";

/** The id of `field`'s inline error (FieldError), for its input's
 * `aria-describedby`. */
export function fieldErrorId(field: AccountField): string {
  return `login-field-error-${field}`;
}

/** The accessibility pair a checked input carries. `aria-invalid` is the
 * attribute's own string: Solid 2 writes a boolean attribute value as
 * presence/absence, so `false` would drop the attribute rather than say
 * "false". */
export interface FieldAriaProps {
  readonly "aria-invalid": "true" | "false";
  readonly "aria-describedby": string | undefined;
}

/** Marks `field`'s input invalid and points it at its inline error while
 * it shows one; neither otherwise. */
export function fieldAriaProps(
  field: AccountField,
  error: string | null,
): FieldAriaProps {
  return {
    "aria-invalid": error === null ? "false" : "true",
    "aria-describedby": error === null ? undefined : fieldErrorId(field),
  };
}
