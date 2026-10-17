import { PASSWORD_RULES, type PasswordRuleId } from "@rtc/domain";

/** A rule before anything is typed, or met or unmet by what is typed. */
export type PasswordRuleStatus = "pending" | "met" | "unmet";

/** One row of the live checklist under a new-password field. */
export interface PasswordChecklistRow {
  readonly id: PasswordRuleId;
  readonly label: string;
  readonly status: PasswordRuleStatus;
}

/**
 * The checklist under a new-password field, in policy order. Every row is
 * pending until something is typed, then met or unmet: an unmet rule is a
 * failure to show, not a hint. The byte ceiling is a row only once it is
 * broken — every shorter password meets it, so a tick there from the first
 * keystroke would only make the list look further along than it is.
 */
export function describePasswordChecklist(
  password: string,
): readonly PasswordChecklistRow[] {
  return PASSWORD_RULES.flatMap((rule) => {
    const met = rule.test(password);

    if (rule.id === "max-length" && met) {
      return [];
    }

    return [
      { id: rule.id, label: rule.label, status: statusOf(password, met) },
    ];
  });
}

function statusOf(password: string, met: boolean): PasswordRuleStatus {
  if (password.length === 0) {
    return "pending";
  }

  return met ? "met" : "unmet";
}
