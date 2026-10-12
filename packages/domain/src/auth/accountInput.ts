const EMAIL_MAX_LENGTH = 254;
const DISPLAY_NAME_MIN_LENGTH = 2;
const DISPLAY_NAME_MAX_LENGTH = 40;

const EMAIL_SHAPE = /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9-]+(\.[a-z0-9-]+)+$/;
/** Eight digits: at five tries per fifteen minutes per address, a guesser
 * gets about 5 in a million per address per day (six digits gave 0.05%).
 * The account store must be configured to send codes of this length. */
const CONFIRMATION_CODE_LENGTH = 8;
const CONFIRMATION_CODE_SHAPE = new RegExp(
  `^\\d{${CONFIRMATION_CODE_LENGTH}}$`,
);

/** Control, format (zero-width, bidi), surrogate, private-use, unassigned,
 * line and paragraph separators, and every code point Unicode marks as
 * invisible by default (fillers, variation selectors, joiners). */
const UNPRINTABLE_CHARACTER =
  /[\p{C}\p{Zl}\p{Zp}\p{Default_Ignorable_Code_Point}]/u;
/** Renders blank but is not default-ignorable: the braille blank. */
const BLANK_LOOKALIKE = /⠀/u;
const READABLE_CHARACTER = /[\p{L}\p{N}]/u;
/** An enclosing mark, or a run of four or more NON-SPACING marks ("Zalgo"
 * text). Spacing marks (`Mc`) are not counted: Burmese and other Brahmic
 * scripts write ordinary words with several in a row. */
const STACKED_MARKS = /\p{Me}|\p{Mn}{4,}/u;

/** One person, one spelling: every account lookup uses this form. */
export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

/** A pragmatic shape check: the address must already be in `normalizeEmail`
 * form (an uppercase letter fails), with an RFC "atext" local part and
 * hostname labels in the domain (an internationalized domain is typed in its
 * punycode form). Whether the mailbox exists is what the confirmation code
 * proves. */
export function isValidEmail(email: string): boolean {
  return email.length <= EMAIL_MAX_LENGTH && EMAIL_SHAPE.test(email);
}

export function normalizeDisplayName(raw: string): string {
  return raw.normalize("NFKC").trim().replace(/\s+/g, " ");
}

export function isValidDisplayName(name: string): boolean {
  const length = Array.from(name).length;

  return (
    name === normalizeDisplayName(name) &&
    length >= DISPLAY_NAME_MIN_LENGTH &&
    length <= DISPLAY_NAME_MAX_LENGTH &&
    !UNPRINTABLE_CHARACTER.test(name) &&
    !BLANK_LOOKALIKE.test(name) &&
    READABLE_CHARACTER.test(name) &&
    !STACKED_MARKS.test(name)
  );
}

export function isConfirmationCode(code: string): boolean {
  return CONFIRMATION_CODE_SHAPE.test(code);
}

/** First letters of the first and last word; two letters of a single word. */
export function initialsOf(displayName: string): string {
  const words = displayName.split(" ").filter((word) => {
    return word !== "";
  });
  const first = Array.from(words[0] ?? "");
  const last = Array.from(
    words.length > 1 ? (words[words.length - 1] ?? "") : "",
  );

  const letters =
    last.length === 0
      ? first.slice(0, 2).join("")
      : `${first[0] ?? ""}${last[0] ?? ""}`;

  return letters.toUpperCase();
}
