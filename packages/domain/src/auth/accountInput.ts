export const EMAIL_MAX_LENGTH = 254;
export const DISPLAY_NAME_MIN_LENGTH = 2;
export const DISPLAY_NAME_MAX_LENGTH = 40;

const EMAIL_SHAPE =
  /^[\x21-\x3f\x41-\x7e]+@[\x21-\x3f\x41-\x7e]+\.[\x21-\x3f\x41-\x7e]+$/;
const CONFIRMATION_CODE_SHAPE = /^\d{6}$/;
/** Control, format (zero-width, bidi), surrogate, private-use, unassigned,
 * and the line and paragraph separators. */
const UNPRINTABLE_CHARACTER = /[\p{C}\p{Zl}\p{Zp}]/u;
/** Letters that render blank: Hangul fillers and the braille blank. */
const BLANK_LOOKALIKE = /[\u115f\u1160\u2800\u3164\uffa0]/u;

/** One person, one spelling: every account lookup uses this form. */
export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

/** A pragmatic shape check on an already-normalized address, printable ASCII
 * only (an internationalized domain is typed in its punycode form). Whether
 * the mailbox exists is what the confirmation code proves. */
export function isValidEmail(email: string): boolean {
  return email.length <= EMAIL_MAX_LENGTH && EMAIL_SHAPE.test(email);
}

export function normalizeDisplayName(raw: string): string {
  return raw.normalize("NFKC").trim().replace(/\s+/g, " ");
}

export function isValidDisplayName(name: string): boolean {
  const length = Array.from(name).length;

  return (
    length >= DISPLAY_NAME_MIN_LENGTH &&
    length <= DISPLAY_NAME_MAX_LENGTH &&
    !UNPRINTABLE_CHARACTER.test(name) &&
    !BLANK_LOOKALIKE.test(name)
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
