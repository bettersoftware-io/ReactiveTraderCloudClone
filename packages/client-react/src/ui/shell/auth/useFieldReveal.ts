import { useState } from "react";

import {
  type AccountField,
  describeFieldError,
  findFirstFailingField,
  type InputCheck,
} from "@rtc/core-logic";

/** A form's checked fields with their checks, in form order. */
type FieldChecks = readonly (readonly [AccountField, InputCheck])[];

export interface FieldReveal {
  /** `field`'s error as the form shows it now: nothing until the field is
   * revealed, then its check's error for as long as the value fails. */
  describeError(field: AccountField, check: InputCheck): string | null;
  /** Reveals one field's error: the field was left, or an action gated on
   * it alone was refused. */
  reveal(field: AccountField): void;
  /** A submit's gate: reveals every field, then names the first of
   * `checks` that fails — null when the form may send. */
  revealAll(checks: FieldChecks): AccountField | null;
}

/** Which of an account form's fields show their errors: none at first, a
 * field once it is left, every one once a submit is tried. */
export function useFieldReveal(): FieldReveal {
  const [revealed, setRevealed] =
    useState<ReadonlySet<AccountField>>(NOTHING_REVEALED);

  return {
    describeError: (field: AccountField, check: InputCheck): string | null => {
      return describeFieldError(check, revealed.has(field));
    },
    reveal: (field: AccountField): void => {
      setRevealed((shown) => {
        return new Set(shown).add(field);
      });
    },
    revealAll: (checks: FieldChecks): AccountField | null => {
      setRevealed(EVERY_FIELD_REVEALED);

      return findFirstFailingField(checks);
    },
  };
}

const NOTHING_REVEALED: ReadonlySet<AccountField> = new Set();

/** Every field there is: a form shows errors only for the fields it has. */
const EVERY_FIELD_REVEALED: ReadonlySet<AccountField> = new Set([
  "email",
  "display-name",
  "code",
  "password",
]);
