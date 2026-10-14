import type { ReactElement } from "react";

import { PASSWORD_RULES } from "@rtc/domain";

import styles from "./LoginScreen.module.css";

/**
 * The live password checklist under a new-password field: one row per
 * `PASSWORD_RULES` entry, marked met as the user types. The same rule list
 * feeds the server's enforcement, so the two cannot disagree. Only a boolean
 * reaches the DOM's data (`data-met`) — never the password.
 */
export function PasswordChecklist({
  password,
}: PasswordChecklistProps): ReactElement {
  return (
    <ul data-testid="login-password-checklist" className={styles.checklist}>
      {PASSWORD_RULES.map((rule) => {
        const met = rule.test(password);

        return (
          <li
            key={rule.id}
            data-testid="login-password-rule"
            data-rule={rule.id}
            data-met={String(met)}
            className={met ? styles.ruleMet : styles.rule}
          >
            <span aria-hidden="true">{met ? "✓" : "·"}</span> {rule.label}
          </li>
        );
      })}
    </ul>
  );
}

interface PasswordChecklistProps {
  readonly password: string;
}
