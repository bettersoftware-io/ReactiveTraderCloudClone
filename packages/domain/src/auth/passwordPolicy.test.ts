import { describe, expect, it } from "vitest";

import { findPasswordViolation, PASSWORD_RULES } from "./passwordPolicy.js";

describe("findPasswordViolation", () => {
  it("accepts a password that meets every rule", () => {
    expect(findPasswordViolation("Mcdc2026!desk")).toBeNull();
  });

  it.each([
    ["Short1!a", "min-length"],
    ["alllowercase1!", "uppercase"],
    ["ALLUPPERCASE1!", "lowercase"],
    ["NoDigitsHere!!", "digit"],
    ["NoSpecials1234", "special"],
  ])("rejects %s for the %s rule", (password: string, rule: string) => {
    expect(findPasswordViolation(password)?.id).toBe(rule);
  });

  it("counts BYTES against the ceiling, not characters", () => {
    // 4 + 35 × 2 = 74 bytes in 39 characters.
    const multibyte = `Aa1!${"é".repeat(35)}`;
    // 4 + 68 = 72 bytes exactly.
    const atLimit = `Aa1!${"x".repeat(68)}`;

    expect(findPasswordViolation(multibyte)?.id).toBe("max-length");
    expect(findPasswordViolation(atLimit)).toBeNull();
  });

  it("draws the length line at exactly 12 characters", () => {
    // Each satisfies every other rule.
    expect(findPasswordViolation("Abcdefgh12!x")).toBeNull();
    expect(findPasswordViolation("Abcdefgh12!")?.id).toBe("min-length");
  });

  it("reports the first broken rule in display order", () => {
    expect(findPasswordViolation("a")?.id).toBe("min-length");
  });

  it("returns the earlier of two broken rules, not the alphabetically first", () => {
    // Breaks both "uppercase" and "digit"; uppercase comes first in the list
    // though "digit" sorts first alphabetically.
    const password = "alllowercase!!!";

    expect(findPasswordViolation(password)?.id).toBe("uppercase");
    expect(
      PASSWORD_RULES.map((rule) => {
        return rule.id;
      }).indexOf("uppercase"),
    ).toBeLessThan(
      PASSWORD_RULES.map((rule) => {
        return rule.id;
      }).indexOf("digit"),
    );
  });
});
