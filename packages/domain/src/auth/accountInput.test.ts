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
  it("accepts the normal form of a messy spelling", () => {
    expect(isValidEmail(normalizeEmail("  Ann@Desk.IO "))).toBe(true);
  });

  it.each([
    "ann@desk.io",
    "a.b+tag@sub.desk.io",
    "ann.lee+rtc@desk.example.io",
    "o'neil@desk.io",
    "a@xn--dsk-bma.io",
  ])("accepts %s", (email) => {
    expect(isValidEmail(email)).toBe(true);
  });

  it.each([
    "astark",
    "ann@desk",
    "@desk.io",
    "ann@",
    "ann @desk.io",
    "ann@@desk.io",
    "Ann@Desk.io",
    "a@b.c<script>",
    "a b@desk.io",
    "ann@desk..io",
    '"ann"@desk.io',
    "\u0430nn@desk.io",
    "ann@d\u00ebsk.io",
    "\uff41nn@desk.io",
    "a\u0000b@desk.io",
    "a\u200bb@desk.io",
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

  it.each([
    ["a bidi override", "Ann\u202ennA"],
    ["a zero-width space inside", "A\u200bB"],
    ["only zero-width spaces", "\u200b\u200b"],
    ["only Hangul fillers", "\u3164\u3164"],
    ["a line separator", "Ann\u2028Lee"],
    ["outer spaces", "  Ann  "],
    ["a doubled space", "Ann  Lee"],
    ["an ideographic space", "Ann\u3000Lee"],
    ["a fullwidth letter", "\uff21nn"],
    ["a variation selector", "Ann\ufe0f"],
    ["a combining grapheme joiner", "An\u034fn"],
    ["only an emoji", "\u{1f680}\u{1f680}"],
    ["only punctuation", ".."],
    ["stacked combining acutes", "A\u0301\u0301\u0301\u0301nn"],
    ["an enclosing mark", "A\u20ddnn"],
    ["the braille blank", "Ann\u2800Lee"],
    ["a decomposed letter (not NFC)", "Zoe\u0308"],
  ])("rejects %s", (_label: string, name: string) => {
    expect(isValidDisplayName(name)).toBe(false);
  });

  it.each([
    "Zo\u00eb M\u00fcller",
    "\u674e \u96f7",
    "Ann \u{1f680}",
    "O'Neil-Smith Jr.",
    "Nguy\u1ec5n V\u0103n A",
  ])("accepts %s", (name: string) => {
    expect(isValidDisplayName(name)).toBe(true);
  });

  it("accepts the normal form of a decomposed name", () => {
    expect(isValidDisplayName(normalizeDisplayName("Zoe\u0308 Lee"))).toBe(
      true,
    );
  });

  it("counts code points, not UTF-16 units", () => {
    // U+20000: a letter, one code point, two UTF-16 units, stable under NFKC.
    const letter = "\u{20000}";

    expect(isValidDisplayName(letter.repeat(40))).toBe(true);
    expect(isValidDisplayName(letter.repeat(41))).toBe(false);
    expect(isValidDisplayName(letter)).toBe(false);
  });

  it("folds compatibility forms to one spelling", () => {
    expect(normalizeDisplayName("\uff21nn")).toBe("Ann");
    expect(normalizeDisplayName("Ann  Lee")).toBe("Ann Lee");
  });

  it("never splits a surrogate pair in initials", () => {
    expect(initialsOf("\u{1f680} Lee")).toBe("\u{1f680}L");
    expect(initialsOf("\u{1f680}\u{1f680}")).toBe("\u{1f680}\u{1f680}");
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
