import { type JSX, Show } from "solid-js";

import type { AccountField } from "@rtc/core-logic";

import { fieldErrorId } from "./fieldErrorId";

import styles from "./LoginScreen.module.css";

/** One field's live error, under the field; renders nothing when null. */
export function FieldError(props: FieldErrorProps): JSX.Element {
  return (
    <Show when={props.error}>
      {(error: () => string) => {
        return (
          <div
            id={fieldErrorId(props.field)}
            data-testid="login-field-error"
            data-field={props.field}
            class={styles.fieldError}
          >
            {error()}
          </div>
        );
      }}
    </Show>
  );
}

interface FieldErrorProps {
  readonly field: AccountField;
  readonly error: string | null;
}
