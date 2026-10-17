import { Index, type JSX } from "solid-js";

import {
  describePasswordChecklist,
  type PasswordChecklistRow,
  type PasswordRuleStatus,
} from "@rtc/core-logic";

import styles from "./LoginScreen.module.css";

/**
 * The live password checklist under a new-password field: one row per rule
 * `describePasswordChecklist` shows, neutral until something is typed, then
 * green when met and red when not. The same rule list feeds the server's
 * enforcement, so the two cannot disagree. Only a rule's status reaches the
 * DOM's data (`data-status`) — never the password. `Index`, not `For`: every
 * keystroke yields fresh row objects, and a row's slot should update in
 * place rather than be rebuilt.
 */
export function PasswordChecklist(props: PasswordChecklistProps): JSX.Element {
  function rows(): readonly PasswordChecklistRow[] {
    return describePasswordChecklist(props.password);
  }

  return (
    <ul data-testid="login-password-checklist" class={styles.checklist}>
      <Index each={rows()}>
        {(row: () => PasswordChecklistRow) => {
          return (
            <li
              data-testid="login-password-rule"
              data-rule={row().id}
              data-status={row().status}
              class={RULE_CLASS[row().status]}
            >
              <span aria-hidden="true">{RULE_MARK[row().status]}</span>{" "}
              {row().label}
            </li>
          );
        }}
      </Index>
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
