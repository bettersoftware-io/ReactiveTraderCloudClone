import type { ReactElement } from "react";

import {
  describePasswordChecklist,
  type PasswordRuleStatus,
} from "@rtc/core-logic";

import styles from "./LoginScreen.module.css";

/**
 * The live password checklist under a new-password field: one row per rule
 * `describePasswordChecklist` shows, neutral until something is typed, then
 * green when met and red when not. The same rule list feeds the server's
 * enforcement, so the two cannot disagree. Only a rule's status reaches the
 * DOM's data (`data-status`) — never the password.
 */
export function PasswordChecklist({
  password,
}: PasswordChecklistProps): ReactElement {
  return (
    <ul data-testid="login-password-checklist" className={styles.checklist}>
      {describePasswordChecklist(password).map((row) => {
        return (
          <li
            key={row.id}
            data-testid="login-password-rule"
            data-rule={row.id}
            data-status={row.status}
            className={RULE_CLASS[row.status]}
          >
            <span aria-hidden="true">{RULE_MARK[row.status]}</span> {row.label}
          </li>
        );
      })}
    </ul>
  );
}

const RULE_CLASS: Readonly<Record<PasswordRuleStatus, string | undefined>> = {
  pending: styles.rule,
  met: styles.ruleMet,
  unmet: styles.ruleUnmet,
};

const RULE_MARK: Readonly<Record<PasswordRuleStatus, string>> = {
  pending: "·",
  met: "✓",
  unmet: "✗",
};

interface PasswordChecklistProps {
  readonly password: string;
}
