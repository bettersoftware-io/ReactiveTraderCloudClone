import { For, type JSX } from "solid-js";

import { PASSWORD_RULES, type PasswordRule } from "@rtc/domain";

import styles from "./LoginScreen.module.css";

/**
 * The live password checklist under a new-password field: one row per
 * `PASSWORD_RULES` entry, marked met as the user types. The same rule list
 * feeds the server's enforcement, so the two cannot disagree. Only a boolean
 * reaches the DOM's data (`data-met`) — never the password.
 */
export function PasswordChecklist(props: PasswordChecklistProps): JSX.Element {
  return (
    <ul data-testid="login-password-checklist" class={styles.checklist}>
      <For each={PASSWORD_RULES}>
        {(rule: PasswordRule) => {
          function met(): boolean {
            return rule.test(props.password);
          }

          return (
            <li
              data-testid="login-password-rule"
              data-rule={rule.id}
              data-met={String(met())}
              class={met() ? styles.ruleMet : styles.rule}
            >
              <span aria-hidden="true">{met() ? "✓" : "·"}</span> {rule.label}
            </li>
          );
        }}
      </For>
    </ul>
  );
}

interface PasswordChecklistProps {
  readonly password: string;
}
