import { describe, expect, it } from "vitest";

import {
  initialsOf,
  isAccountInputRule,
  isConfirmationCode,
  isValidDisplayName,
  isValidEmail,
  normalizeDisplayName,
  normalizeEmail,
} from "./accountInput.js";
import { PASSWORD_RULES } from "./passwordPolicy.js";

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

  it("accepts a Burmese word, whose vowel signs are spacing marks", () => {
    // မွှေး: four consecutive marks, two of them spacing (Mc) — a real
    // word, not "Zalgo" stacking.
    const word = "\u1019\u103d\u103e\u1031\u1038";

    expect(isValidDisplayName(word)).toBe(true);
  });

  it("refuses a zero-width joiner, a deliberate trade-off: a Persian name spelled with U+200C is refused", () => {
    // ZWNJ is default-ignorable, so it can hide inside a name; the price is
    // that a name which needs one must be typed without it.
    expect(isValidDisplayName("\u0645\u06cc\u200c\u0631\u0627")).toBe(false);
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
  it("accepts exactly eight digits", () => {
    expect(isConfirmationCode("00000000")).toBe(true);
    expect(isConfirmationCode("1234567")).toBe(false);
    expect(isConfirmationCode("123456789")).toBe(false);
    expect(isConfirmationCode("1234567a")).toBe(false);
  });

  it("refuses the six-digit code a misconfigured project would send", () => {
    expect(isConfirmationCode("123456")).toBe(false);
  });
});

describe("isAccountInputRule", () => {
  it("accepts every password rule id and the three other rules", () => {
    for (const rule of PASSWORD_RULES) {
      expect(isAccountInputRule(rule.id)).toBe(true);
    }

    expect(isAccountInputRule("email")).toBe(true);
    expect(isAccountInputRule("display-name")).toBe(true);
    expect(isAccountInputRule("password")).toBe(true);
  });

  it("rejects an unknown word, a non-string and the server's error words", () => {
    expect(isAccountInputRule("invalid_code")).toBe(false);
    expect(isAccountInputRule("")).toBe(false);
    expect(isAccountInputRule(12)).toBe(false);
    expect(isAccountInputRule(undefined)).toBe(false);
  });
});
