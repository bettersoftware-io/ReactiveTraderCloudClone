import type { ReactElement } from "react";

import type { AccountField } from "@rtc/core-logic";

import { fieldErrorId } from "./fieldErrorId";

import styles from "./LoginScreen.module.css";

/** One field's live error, under the field; renders nothing when null. */
export function FieldError({
  field,
  error,
}: FieldErrorProps): ReactElement | null {
  if (error === null) {
    return null;
  }

  return (
    <div
      id={fieldErrorId(field)}
      data-testid="login-field-error"
      data-field={field}
      className={styles.fieldError}
    >
      {error}
    </div>
  );
}

interface FieldErrorProps {
  readonly field: AccountField;
  readonly error: string | null;
}
