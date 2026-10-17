import { describe, expect, it } from "vitest";

import { PASSWORD_RULES } from "@rtc/domain";

import {
  describePasswordChecklist,
  type PasswordChecklistRow,
} from "#/presenters/passwordChecklist";

describe("password checklist", () => {
  it("shows every rule but the byte ceiling as pending before anything is typed", () => {
    expect(summarize(describePasswordChecklist(""))).toEqual([
      "min-length:pending",
      "uppercase:pending",
      "lowercase:pending",
      "digit:pending",
      "special:pending",
    ]);
  });

  it("marks each rule met or unmet as soon as anything is typed", () => {
    expect(summarize(describePasswordChecklist("Abc123!!"))).toEqual([
      "min-length:unmet",
      "uppercase:met",
      "lowercase:met",
      "digit:met",
      "special:met",
    ]);
  });

  it("marks a single character against every rule, not as pending", () => {
    expect(summarize(describePasswordChecklist("x"))).toEqual([
      "min-length:unmet",
      "uppercase:unmet",
      "lowercase:met",
      "digit:unmet",
      "special:unmet",
    ]);
  });

  it("meets every shown rule for a strong password", () => {
    expect(summarize(describePasswordChecklist(STRONG))).toEqual([
      "min-length:met",
      "uppercase:met",
      "lowercase:met",
      "digit:met",
      "special:met",
    ]);
  });

  it("shows the byte ceiling, in its policy place, only once it is broken", () => {
    // 73 bytes: one past bcrypt's limit, and every other rule still met.
    const tooLong = `${STRONG}${"a".repeat(61)}`;

    expect(summarize(describePasswordChecklist(tooLong))).toEqual([
      "min-length:met",
      "max-length:unmet",
      "uppercase:met",
      "lowercase:met",
      "digit:met",
      "special:met",
    ]);
  });

  it("labels each row with its policy rule's own label", () => {
    const rows = describePasswordChecklist("x");

    for (const row of rows) {
      const rule = PASSWORD_RULES.find((candidate) => {
        return candidate.id === row.id;
      });

      expect(row.label).toBe(rule?.label);
    }
  });
});

/** Meets every rule. */
const STRONG = "Abcdefgh123!";

/** Each shown row as `id:status`, top to bottom. */
function summarize(rows: readonly PasswordChecklistRow[]): string[] {
  return rows.map((row) => {
    return `${row.id}:${row.status}`;
  });
}
