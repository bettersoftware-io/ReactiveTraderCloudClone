import { describe, expect, it } from "vitest";

import {
  initialsOf,
  isConfirmationCode,
  isValidDisplayName,
  isValidEmail,
  normalizeDisplayName,
  normalizeEmail,
} from "./accountInput.js";

describe("normalizeEmail", () => {
  it("trims and lowercases, so one person has one spelling", () => {
    expect(normalizeEmail("  Ann@Desk.IO ")).toBe("ann@desk.io");
  });
});

describe("isValidEmail", () => {
  it.each(["ann@desk.io", "a.b+tag@sub.desk.io"])("accepts %s", (email) => {
    expect(isValidEmail(email)).toBe(true);
  });

  it.each([
    "astark",
    "ann@desk",
    "@desk.io",
    "ann@",
    "ann @desk.io",
    "ann@@desk.io",
    `${"a".repeat(250)}@d.io`,
  ])("rejects %s", (email) => {
    expect(isValidEmail(email)).toBe(false);
  });
});

describe("display names", () => {
  it("collapses inner whitespace, newlines included", () => {
    expect(normalizeDisplayName("  Ann \n  Lee ")).toBe("Ann Lee");
  });

  it("accepts 2 to 40 characters and nothing else", () => {
    expect(isValidDisplayName("Al")).toBe(true);
    expect(isValidDisplayName("A")).toBe(false);
    expect(isValidDisplayName("x".repeat(40))).toBe(true);
    expect(isValidDisplayName("x".repeat(41))).toBe(false);
  });

  it("rejects a control character", () => {
    expect(isValidDisplayName("Ann\u0007Lee")).toBe(false);
  });

  it("derives initials from the first and last word, or two letters of one", () => {
    expect(initialsOf("Ann Lee")).toBe("AL");
    expect(initialsOf("ann marie lee")).toBe("AL");
    expect(initialsOf("Cher")).toBe("CH");
  });
});

describe("isConfirmationCode", () => {
  it("accepts exactly six digits", () => {
    expect(isConfirmationCode("000000")).toBe(true);
    expect(isConfirmationCode("12345")).toBe(false);
    expect(isConfirmationCode("1234567")).toBe(false);
    expect(isConfirmationCode("12345a")).toBe(false);
  });
});
